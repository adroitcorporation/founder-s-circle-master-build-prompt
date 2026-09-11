import { Router } from "express";
import { z } from "zod";
import { db, transaction, type Tx } from "../database.js";
import { assert, hash } from "../utils.js";
import { active, allowed } from "../services/policy.js";
import {
  visibleUser,
  visibleProfile,
  connectionAction,
} from "../services/community.js";
import { profileInclude, publicProfile } from "../services/profiles.js";
import { notify } from "../services/notifications.js";
import {
  ideaInput,
  ideaCategories,
  pageInput,
} from "../validators/community.js";
export const ideasRouter = Router();
async function accessible(tx: Tx, viewer: string, id: string) {
  const idea = await tx.idea.findFirst({
    where: { id, author: visibleUser(viewer) },
  });
  assert(idea, 404, "Idea not found or no longer available.");
  return idea;
}
async function detail(tx: Tx, viewer: string, id: string) {
  const idea = await accessible(tx, viewer, id);
  const author = await visibleProfile(tx, viewer, idea.authorId);
  const count = await tx.ideaResonance.count({
    where: {
      ideaId: id,
      user: {
        status: "ACTIVE",
        blocks: { none: { blockedId: idea.authorId } },
        blockedBy: { none: { blockerId: idea.authorId } },
      },
    },
  });
  return {
    ...idea,
    author,
    resonanceCount: count,
    resonated: !!(await tx.ideaResonance.findUnique({
      where: { ideaId_userId: { ideaId: id, userId: viewer } },
    })),
  };
}
ideasRouter.get("/", async (req, res) => {
  const q = z
    .object({
      offset: pageInput,
      sort: z
        .enum(["recent", "popular", "mine", "resonated"])
        .default("recent"),
      category: z.enum(ideaCategories).optional(),
    })
    .parse(req.query);
  const rows = await db.idea.findMany({
    where: {
      author: visibleUser(req.user.id),
      ...(q.category ? { category: q.category } : {}),
      ...(q.sort === "mine" ? { authorId: req.user.id } : {}),
      ...(q.sort === "resonated"
        ? { resonances: { some: { userId: req.user.id } } }
        : {}),
    },
    orderBy:
      q.sort === "popular"
        ? [
            { resonances: { _count: "desc" } },
            { createdAt: "desc" },
            { id: "desc" },
          ]
        : [{ createdAt: "desc" }, { id: "desc" }],
    skip: q.offset,
    take: 13,
  });
  const items = await Promise.all(
    rows.slice(0, 12).map((i) => detail(db, req.user.id, i.id)),
  );
  res.json({ items, hasMore: rows.length > 12 });
});
ideasRouter.post("/", async (req, res) => {
  const input = ideaInput.parse(req.body);
  const idea = await transaction(async (tx) => {
    const u = await active(tx, req.user.id);
    assert(
      u.profile?.completed,
      403,
      "Complete your profile before posting an idea.",
    );
    return tx.idea.create({ data: { ...input, authorId: u.id } });
  });
  res.status(201).json(await detail(db, req.user.id, idea.id));
});
ideasRouter.get("/:id", async (req, res) =>
  res.json(await detail(db, req.user.id, z.string().parse(req.params.id))),
);
ideasRouter.put("/:id", async (req, res) => {
  const input = ideaInput.parse(req.body);
  const id = z.string().parse(req.params.id);
  await transaction(async (tx) => {
    const idea = await accessible(tx, req.user.id, id);
    assert(
      idea.authorId === req.user.id,
      403,
      "Only the author can edit this idea.",
    );
    await tx.idea.update({ where: { id }, data: input });
  });
  res.json(await detail(db, req.user.id, id));
});
ideasRouter.delete("/:id", async (req, res) => {
  const id = z.string().parse(req.params.id);
  await transaction(async (tx) => {
    const idea = await accessible(tx, req.user.id, id);
    assert(
      idea.authorId === req.user.id,
      403,
      "Only the author can delete this idea.",
    );
    await tx.notification.deleteMany({
      where: { entityId: id, type: "IDEA_RESONATED" },
    });
    await tx.idea.delete({ where: { id } });
  });
  res.json({ ok: true });
});
ideasRouter.put("/:id/resonance", async (req, res) => {
  const id = z.string().parse(req.params.id);
  const resonated = z.boolean().parse(req.body.resonated);
  const authorId = await transaction(async (tx) => {
    const idea = await accessible(tx, req.user.id, id);
    await allowed(tx, req.user.id, idea.authorId);
    const existing = await tx.ideaResonance.findUnique({
      where: { ideaId_userId: { ideaId: id, userId: req.user.id } },
    });
    if (resonated && !existing) {
      await tx.ideaResonance.create({
        data: { ideaId: id, userId: req.user.id },
      });
      await notify(tx, idea.authorId, req.user.id, "IDEA_RESONATED", id);
    }
    if (!resonated && existing) {
      await tx.ideaResonance.delete({
        where: { ideaId_userId: { ideaId: id, userId: req.user.id } },
      });
      await tx.notification.deleteMany({
        where: {
          actorId: req.user.id,
          recipientId: idea.authorId,
          type: "IDEA_RESONATED",
          entityId: id,
        },
      });
    }
    return idea.authorId;
  });
  req.app.get("io")?.to(`user:${authorId}`).emit("refresh");
  res.json(await detail(db, req.user.id, id));
});
ideasRouter.get("/:id/resonators", async (req, res) => {
  const id = z.string().parse(req.params.id);
  const idea = await accessible(db, req.user.id, id);
  assert(
    idea.authorId === req.user.id,
    403,
    "Only the author can view resonators.",
  );
  const rows = await db.ideaResonance.findMany({
    where: { ideaId: id, user: visibleUser(req.user.id) },
    include: { user: { include: { profile: { include: profileInclude } } } },
    orderBy: [{ createdAt: "desc" }, { userId: "asc" }],
    take: 31,
    skip: pageInput.parse(req.query.offset),
  });
  res.json({
    items: await Promise.all(
      rows
        .slice(0, 30)
        .map(async (r) => ({
          ...publicProfile(r.user.profile!),
          ...(await connectionAction(db, req.user.id, r.userId)),
        })),
    ),
    hasMore: rows.length > 30,
  });
});
ideasRouter.post("/:id/group", async (req, res) => {
  const id = z.string().parse(req.params.id);
  const input = z
    .object({
      userIds: z.array(z.string()).min(1).max(19),
      name: z.string().trim().min(2).max(160).optional(),
    })
    .strict()
    .parse(req.body);
  const result = await transaction(async (tx) => {
    const idea = await accessible(tx, req.user.id, id);
    assert(
      idea.authorId === req.user.id,
      403,
      "Only the author can create this group.",
    );
    const owner = await active(tx, req.user.id);
    assert(
      owner.verified,
      403,
      "Verify your student status before creating a group.",
    );
    const ids = [...new Set(input.userIds)].sort();
    assert(
      !ids.includes(req.user.id),
      400,
      "The idea author is included automatically.",
    );
    for (const userId of ids) {
      const [, u] = await allowed(tx, req.user.id, userId);
      assert(
        u.verified && u.profile?.completed && u.profile.allowRequests,
        403,
        "A selected student is not available for group invitations.",
      );
      await visibleProfile(tx, req.user.id, userId);
      assert(
        await tx.ideaResonance.findUnique({
          where: { ideaId_userId: { ideaId: id, userId } },
        }),
        400,
        "Select students who currently resonate with this idea.",
      );
    }
    // Do not create a group containing any blocked pair, even if the owner is not involved.
    assert(
      !(await tx.block.findFirst({
        where: { blockerId: { in: ids }, blockedId: { in: ids } },
      })),
      403,
      "These students cannot be placed in the same group.",
    );
    const groupKey = hash(`${id}:${[req.user.id, ...ids].sort().join(":")}`);
    const existing = await tx.conversation.findUnique({
      where: { groupKey },
      include: { participants: true },
    });
    if (existing) {
      assert(
        existing.participants.every((p) => !p.leftAt),
        409,
        "This group already exists and a member has left. Choose a different group of students.",
      );
      return { id: existing.id, ids: [] as string[] };
    }
    const c = await tx.conversation.create({
      data: {
        kind: "GROUP",
        ideaId: id,
        name: input.name || `${idea.title || "Untitled idea"} — Builders`,
        groupKey,
        participants: {
          create: [req.user.id, ...ids].map((userId) => ({ userId })),
        },
        messages: {
          create: {
            senderId: req.user.id,
            clientId: crypto.randomUUID(),
            system: true,
            body: `This group was created from the IdeaBoard idea:\n${idea.title ? idea.title + "\n" : ""}${idea.description}`,
          },
        },
      },
    });
    for (const userId of ids)
      await notify(tx, userId, req.user.id, "IDEA_GROUP_INVITE", c.id);
    await notify(tx, req.user.id, req.user.id, "IDEA_GROUP_CREATED", c.id);
    return { id: c.id, ids: [req.user.id, ...ids] };
  });
  for (const userId of result.ids)
    req.app.get("io")?.to(`user:${userId}`).emit("refresh");
  res.status(201).json({ conversationId: result.id });
});
