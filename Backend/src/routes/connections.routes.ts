import { Router } from "express";
import { z } from "zod";
import { db, transaction } from "../database.js";
import { allowed, event } from "../services/policy.js";
import { pair, assert } from "../utils.js";
import { notify } from "../services/notifications.js";
import { profileInclude, publicProfile } from "../services/profiles.js";
export const connectionsRouter = Router();
connectionsRouter.get("/", async (req, res) => {
  const rows = await db.connection.findMany({
    where: {
      OR: [{ senderId: req.user.id }, { recipientId: req.user.id }],
      status: { not: "DECLINED" },
      sender: {
        status: "ACTIVE",
        blocks: { none: { blockedId: req.user.id } },
        blockedBy: { none: { blockerId: req.user.id } },
      },
      recipient: {
        status: "ACTIVE",
        blocks: { none: { blockedId: req.user.id } },
        blockedBy: { none: { blockerId: req.user.id } },
      },
    },
    include: {
      sender: { include: { profile: { include: profileInclude } } },
      recipient: { include: { profile: { include: profileInclude } } },
      conversation: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    skip: z.coerce
      .number()
      .int()
      .min(0)
      .max(10000)
      .default(0)
      .parse(req.query.offset),
  });
  res.json(
    rows.map((c) => ({
      id: c.id,
      status: c.status,
      incoming: c.recipientId === req.user.id,
      conversationId: c.conversation?.id,
      profile: publicProfile(
        (c.senderId === req.user.id ? c.recipient : c.sender).profile!,
      ),
    })),
  );
});
connectionsRouter.post("/", async (req, res) => {
  const targetId = z.string().parse(req.body.targetId);
  const c = await transaction(async (tx) => {
    const [me, other] = await allowed(tx, req.user.id, targetId);
    assert(
      me.profile?.completed && me.verified,
      403,
      "Complete your profile and verify your student status to connect.",
    );
    assert(
      other.profile?.completed && other.profile.allowRequests,
      403,
      "This student is not accepting requests.",
    );
    const existing = await tx.connection.findUnique({
      where: { pairKey: pair(req.user.id, targetId) },
    });
    if (existing) {
      assert(
        existing.status !== "DECLINED",
        403,
        "This connection request is no longer available.",
      );
      return existing;
    }
    const connection = await tx.connection.create({
      data: {
        pairKey: pair(req.user.id, targetId),
        senderId: req.user.id,
        recipientId: targetId,
      },
    });
    await notify(
      tx,
      targetId,
      req.user.id,
      "CONNECTION_REQUEST",
      connection.id,
    );
    await event(tx, req.user.id, "connection_requested");
    return connection;
  });
  req.app.get("io")?.to(`user:${targetId}`).emit("refresh");
  res.status(201).json(c);
});
connectionsRouter.patch("/:id", async (req, res) => {
  const status = z.enum(["ACCEPTED", "DECLINED"]).parse(req.body.status);
  const c = await transaction(async (tx) => {
    const connection = await tx.connection.findUnique({
      where: { id: z.string().parse(req.params.id) },
    });
    assert(
      connection && connection.recipientId === req.user.id,
      404,
      "Request not found.",
    );
    await allowed(tx, req.user.id, connection.senderId);
    assert(
      connection.status === "PENDING" || connection.status === status,
      409,
      "Request already handled.",
    );
    if (connection.status === status) return connection;
    if (status === "ACCEPTED") {
      const me = await tx.user.findUniqueOrThrow({
        where: { id: req.user.id },
        include: { profile: true },
      });
      assert(
        me.verified && me.profile?.completed,
        403,
        "Complete your profile and verify your student status to connect.",
      );
      await tx.conversation.create({
        data: {
          connectionId: connection.id,
          participants: {
            create: [{ userId: req.user.id }, { userId: connection.senderId }],
          },
        },
      });
      await notify(
        tx,
        connection.senderId,
        req.user.id,
        "CONNECTION_ACCEPTED",
        connection.id,
      );
      await event(tx, req.user.id, "connection_accepted");
    }
    return tx.connection.update({
      where: { id: connection.id },
      data: { status },
    });
  });
  req.app.get("io")?.to(`user:${c.senderId}`).emit("refresh");
  res.json(c);
});
