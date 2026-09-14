import { Router } from "express";
import { z } from "zod";
import { db, transaction } from "../database.js";
import { assert } from "../utils.js";
import { conversationAccess } from "../services/policy.js";
import { sendMessage } from "../services/messages.js";
import { profileInclude, publicProfile } from "../services/profiles.js";
import { visibleUser } from "../services/community.js";
import {
  groupInput,
  groupCreator,
  groupOwner,
  eligibleMember,
  addGroupMembers,
} from "../services/groups.js";
import { ApiError } from "../utils.js";
export const messagesRouter = Router();
messagesRouter.get("/group-candidates", async (req, res) => {
  const query = z
    .object({
      groupId: z.string().optional(),
      offset: z.coerce.number().int().min(0).default(0),
    })
    .parse(req.query);
  const result = await transaction(async (tx) => {
    const group = query.groupId
      ? await groupOwner(tx, req.user.id, query.groupId)
      : null;
    if (!group) await groupCreator(tx, req.user.id);
    const memberIds = group?.participants
      .filter((p) => !p.leftAt)
      .map((p) => p.userId) || [req.user.id];
    const users = await tx.user.findMany({
      where: {
        AND: [
          visibleUser(req.user.id),
          {
            id: { notIn: memberIds },
            verified: true,
            profile: { completed: true, allowRequests: true },
            ...(group?.ideaId
              ? { resonances: { some: { ideaId: group.ideaId } } }
              : {
                  OR: [
                    {
                      sent: {
                        some: { recipientId: req.user.id, status: "ACCEPTED" },
                      },
                    },
                    {
                      received: {
                        some: { senderId: req.user.id, status: "ACCEPTED" },
                      },
                    },
                  ],
                }),
          },
        ],
      },
      include: { profile: { include: profileInclude } },
      orderBy: { id: "asc" },
      skip: query.offset,
      take: 31,
    });
    const items = [];
    for (const user of users.slice(0, 30)) {
      try {
        await eligibleMember(
          tx,
          req.user.id,
          user.id,
          group?.ideaId || null,
          memberIds,
        );
        items.push(publicProfile(user.profile!));
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
      }
    }
    return { items, hasMore: users.length > 30, nextOffset: query.offset + 30 };
  });
  res.json(result);
});
messagesRouter.post("/groups", async (req, res) => {
  const input = groupInput.parse(req.body);
  const group = await transaction(async (tx) => {
    await groupCreator(tx, req.user.id);
    const ids = [...new Set(input.userIds)];
    assert(
      !ids.includes(req.user.id),
      400,
      "The creator is included automatically.",
    );
    for (const id of ids) await eligibleMember(tx, req.user.id, id, null, ids);
    return tx.conversation.create({
      data: {
        kind: "GROUP",
        groupKey: `circle:${crypto.randomUUID()}`,
        ownerId: req.user.id,
        name: input.name || "My circle",
        participants: {
          create: [req.user.id, ...ids].map((userId) => ({ userId })),
        },
      },
      include: { participants: true },
    });
  });
  for (const p of group.participants)
    req.app.get("io")?.to(`user:${p.userId}`).emit("refresh");
  res.status(201).json({ conversationId: group.id });
});
messagesRouter.post("/:id/members", async (req, res) => {
  const input = groupInput.pick({ userIds: true }).parse(req.body);
  const ids = await transaction((tx) =>
    addGroupMembers(
      tx,
      req.user.id,
      z.string().parse(req.params.id),
      input.userIds,
    ),
  );
  for (const id of ids) req.app.get("io")?.to(`user:${id}`).emit("refresh");
  res.json({ ok: true });
});
messagesRouter.delete("/:id/members/:userId", async (req, res) => {
  const id = z.string().parse(req.params.id),
    userId = z.string().parse(req.params.userId);
  const members = await transaction(async (tx) => {
    const group = await groupOwner(tx, req.user.id, id);
    assert(
      userId !== group.ownerId,
      409,
      "The group creator cannot be removed.",
    );
    assert(
      group.participants.some((p) => p.userId === userId && !p.leftAt),
      404,
      "Member not found.",
    );
    await tx.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: id, userId } },
      data: { leftAt: new Date() },
    });
    return group.participants.filter((p) => !p.leftAt).map((p) => p.userId);
  });
  for (const userId of members)
    req.app.get("io")?.to(`user:${userId}`).emit("refresh");
  res.json({ ok: true });
});
messagesRouter.get("/", async (req, res) => {
  const conversations = await db.conversation.findMany({
    where: { participants: { some: { userId: req.user.id, leftAt: null } } },
    include: {
      participants: {
        include: {
          user: { include: { profile: { include: profileInclude } } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  res.json(
    await Promise.all(
      conversations.map(async (c) => {
        if (c.kind === "GROUP") {
          const members = c.participants.filter((p) => !p.leftAt);
          let unavailable = false;
          try {
            await conversationAccess(db, req.user.id, c.id);
          } catch {
            unavailable = true;
          }
          const visible = await db.user.findMany({
            where: {
              AND: [
                { id: { in: members.map((p) => p.userId) } },
                visibleUser(req.user.id),
              ],
            },
            include: { profile: { include: profileInclude } },
          });
          const profiles = new Map(
            visible
              .filter((u) => u.profile)
              .map((u) => [u.id, publicProfile(u.profile!)]),
          );
          const me = members.find((p) => p.userId === req.user.id)!;
          const last = unavailable
            ? null
            : await db.message.findFirst({
                where: { conversationId: c.id },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              });
          return {
            id: c.id,
            kind: "GROUP",
            name: c.name,
            ideaId: c.ideaId,
            ownerId: c.ownerId,
            profile: {
              id: c.id,
              name: c.name || "Idea group",
              photo: null,
              college: `${members.length} members`,
            },
            members: members.map(
              (p) =>
                profiles.get(p.userId) || {
                  id: p.userId,
                  name: "Private member",
                  photo: null,
                  college: "",
                  skills: [],
                  interests: [],
                },
            ),
            blocked: false,
            blockedByMe: false,
            unavailable,
            lastMessage: last?.removed ? "Message removed" : last?.body,
            unread: unavailable
              ? 0
              : await db.message.count({
                  where: {
                    conversationId: c.id,
                    senderId: { not: req.user.id },
                    createdAt: { gt: me.lastReadAt },
                  },
                }),
          };
        }
        const other = c.participants.find((p) => p.userId !== req.user.id)!;
        const me = c.participants.find((p) => p.userId === req.user.id)!;
        const blocked = await db.block.findFirst({
          where: {
            OR: [
              { blockerId: req.user.id, blockedId: other.userId },
              { blockerId: other.userId, blockedId: req.user.id },
            ],
          },
        });
        const unavailable = !!blocked || other.user.status !== "ACTIVE";
        const last = unavailable
          ? null
          : await db.message.findFirst({
              where: { conversationId: c.id },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            });
        return {
          id: c.id,
          kind: "DIRECT",
          profile: unavailable
            ? {
                id: other.userId,
                name:
                  other.user.status === "DELETED"
                    ? "Deleted User"
                    : "Unavailable user",
                photo: null,
                college: "",
              }
            : publicProfile(other.user.profile!),
          blocked: !!blocked,
          blockedByMe: blocked?.blockerId === req.user.id,
          unavailable,
          lastMessage: last?.removed ? "Message removed" : last?.body,
          unread: unavailable
            ? 0
            : await db.message.count({
                where: {
                  conversationId: c.id,
                  senderId: { not: req.user.id },
                  createdAt: { gt: me.lastReadAt },
                },
              }),
        };
      }),
    ),
  );
});
messagesRouter.post("/:id/leave", async (req, res) => {
  const id = z.string().parse(req.params.id);
  const members = await transaction(async (tx) => {
    const c = await tx.conversation.findFirst({
      where: {
        id,
        kind: "GROUP",
        participants: { some: { userId: req.user.id, leftAt: null } },
      },
      include: { participants: true },
    });
    assert(c, 404, "Group not found.");
    assert(
      c.ownerId !== req.user.id,
      409,
      "The creator must remain in the group to preserve ownership.",
    );
    await tx.conversationParticipant.update({
      where: {
        conversationId_userId: { conversationId: id, userId: req.user.id },
      },
      data: { leftAt: new Date() },
    });
    return c.participants.map((p) => p.userId);
  });
  for (const userId of members)
    req.app.get("io")?.to(`user:${userId}`).emit("refresh");
  res.json({ ok: true });
});
messagesRouter.get("/:id", async (req, res) => {
  const id = z.string().parse(req.params.id);
  const query = z
    .object({ before: z.string().max(80).optional() })
    .parse(req.query);
  const messages = await transaction(async (tx) => {
    await conversationAccess(tx, req.user.id, id);
    if (query.before)
      assert(
        await tx.message.findFirst({
          where: { id: query.before, conversationId: id },
        }),
        400,
        "Invalid message cursor.",
      );
    return tx.message.findMany({
      where: { conversationId: id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 40,
      ...(query.before ? { cursor: { id: query.before }, skip: 1 } : {}),
    });
  });
  res.json({
    items: messages.reverse().map((m) => ({
      ...m,
      body: m.removed ? "Message removed by moderation" : m.body,
    })),
    hasMore: messages.length === 40,
  });
});
messagesRouter.post("/:id/read", async (req, res) => {
  const id = z.string().parse(req.params.id);
  await transaction(async (tx) => {
    await conversationAccess(tx, req.user.id, id);
    await tx.conversationParticipant.update({
      where: {
        conversationId_userId: { conversationId: id, userId: req.user.id },
      },
      data: { lastReadAt: new Date() },
    });
    await tx.notification.updateMany({
      where: { recipientId: req.user.id, type: "MESSAGE", entityId: id },
      data: { read: true },
    });
  });
  res.json({ ok: true });
});
messagesRouter.post("/", async (req, res) => {
  const result = await sendMessage(req.user.id, req.body);
  for (const id of [req.user.id, ...result.other])
    req.app.get("io")?.to(`user:${id}`).emit("message", result.message);
  res.status(201).json(result.message);
});
