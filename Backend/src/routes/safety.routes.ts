import { Router } from "express";
import { z } from "zod";
import { db, transaction } from "../database.js";
import { assert, hash } from "../utils.js";
import { active, event } from "../services/policy.js";
export const safetyRouter = Router();
export const reasons = [
  "Harassment or bullying",
  "Spam",
  "Fake profile",
  "Inappropriate behavior",
  "Scam/fraud",
  "Hate or abusive behavior",
  "Impersonation",
  "Other",
] as const;
safetyRouter.get("/blocks", async (req, res) => {
  const blocks = await db.block.findMany({
    where: { blockerId: req.user.id },
    include: {
      blocked: { select: { id: true, profile: { select: { name: true } } } },
    },
    take: 100,
  });
  res.json(
    blocks.map((b) => ({
      id: b.blockedId,
      name: b.blocked.profile?.name ?? "Deleted User",
    })),
  );
});
safetyRouter.post("/blocks", async (req, res) => {
  const targetId = z.string().parse(req.body.targetId);
  assert(targetId !== req.user.id, 400, "You cannot block yourself.");
  const groupUsers = await transaction(async (tx) => {
    await active(tx, req.user.id);
    assert(
      await tx.user.findUnique({ where: { id: targetId } }),
      404,
      "User not found.",
    );
    await tx.block.upsert({
      where: {
        blockerId_blockedId: { blockerId: req.user.id, blockedId: targetId },
      },
      create: { blockerId: req.user.id, blockedId: targetId },
      update: {},
    });
    await tx.connection.updateMany({
      where: {
        status: "PENDING",
        OR: [
          { senderId: req.user.id, recipientId: targetId },
          { senderId: targetId, recipientId: req.user.id },
        ],
      },
      data: { status: "DECLINED" },
    });
    await tx.notification.deleteMany({
      where: {
        OR: [
          { recipientId: req.user.id, actorId: targetId },
          { recipientId: targetId, actorId: req.user.id },
        ],
      },
    });
    await event(tx, req.user.id, "user_blocked");
    const groups = await tx.conversation.findMany({
      where: {
        kind: "GROUP",
        AND: [
          { participants: { some: { userId: req.user.id, leftAt: null } } },
          { participants: { some: { userId: targetId, leftAt: null } } },
        ],
      },
      include: { participants: true },
    });
    await tx.conversationParticipant.updateMany({
      where: {
        userId: req.user.id,
        conversationId: { in: groups.map((g) => g.id) },
        leftAt: null,
      },
      data: { leftAt: new Date() },
    });
    await tx.ideaResonance.deleteMany({
      where: {
        OR: [
          { userId: req.user.id, idea: { authorId: targetId } },
          { userId: targetId, idea: { authorId: req.user.id } },
        ],
      },
    });
    return groups.flatMap((g) => g.participants.map((p) => p.userId));
  });
  for (const id of new Set([req.user.id, targetId, ...groupUsers]))
    req.app.get("io")?.to(`user:${id}`).emit("safety-changed");
  res.json({ ok: true });
});
safetyRouter.delete("/blocks/:id", async (req, res) => {
  await db.block.deleteMany({
    where: {
      blockerId: req.user.id,
      blockedId: z.string().parse(req.params.id),
    },
  });
  req.app.get("io")?.to(`user:${req.user.id}`).emit("safety-changed");
  res.json({ ok: true });
});
safetyRouter.get("/reports", async (req, res) =>
  res.json(
    await db.report.findMany({
      where: { reporterId: req.user.id },
      select: { id: true, reason: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ),
);
safetyRouter.post("/reports", async (req, res) => {
  const input = z
    .object({
      targetId: z.string(),
      messageId: z.string().optional(),
      reason: z.enum(reasons),
      description: z.string().trim().max(2000).default(""),
    })
    .parse(req.body);
  assert(input.targetId !== req.user.id, 400, "You cannot report yourself.");
  const report = await transaction(async (tx) => {
    await active(tx, req.user.id);
    assert(
      await tx.user.findUnique({ where: { id: input.targetId } }),
      404,
      "User not found.",
    );
    if (input.messageId) {
      const m = await tx.message.findFirst({
        where: {
          id: input.messageId,
          senderId: input.targetId,
          conversation: { participants: { some: { userId: req.user.id } } },
        },
      });
      assert(m, 404, "Message not found.");
    }
    const dedupeKey = hash(
      `${req.user.id}:${input.targetId}:${input.messageId ?? "profile"}:${input.reason}`,
    );
    const report = await tx.report.upsert({
      where: { dedupeKey },
      create: {
        reporterId: req.user.id,
        reportedUserId: input.targetId,
        messageId: input.messageId,
        reason: input.reason,
        description: input.description,
        dedupeKey,
      },
      update: {},
    });
    await event(tx, req.user.id, "user_reported");
    return { id: report.id, status: report.status };
  });
  res.status(201).json(report);
});
