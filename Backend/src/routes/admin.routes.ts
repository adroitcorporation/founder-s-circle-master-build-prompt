import { Router } from "express";
import { z } from "zod";
import { db, transaction } from "../database.js";
import { admin } from "../middleware/auth.middleware.js";
import { assert } from "../utils.js";
import { getImage } from "../services/storage.js";
import { event } from "../services/policy.js";
export const adminRouter = Router();
adminRouter.use(admin);
adminRouter.patch("/event-publishers", async (req, res) => {
  const input = z
    .object({
      username: z.string().regex(/^[A-Za-z0-9_]{3,24}$/),
      approved: z.boolean(),
      reason: z.string().trim().min(5).max(500),
    })
    .strict()
    .parse(req.body);
  await transaction(async (tx) => {
    const p = await tx.profile.findUnique({
      where: { username: input.username },
      include: { user: true },
    });
    assert(
      p && p.user.status === "ACTIVE" && p.user.role !== "ADMIN",
      400,
      "Choose an active student account. Admins already have event access.",
    );
    await tx.user.update({
      where: { id: p.userId },
      data: { canPostEvents: input.approved },
    });
    await tx.adminAction.create({
      data: {
        adminId: req.user.id,
        targetId: p.userId,
        action: input.approved
          ? "EVENT_PUBLISHER_APPROVED"
          : "EVENT_PUBLISHER_REVOKED",
        reason: input.reason,
      },
    });
  });
  res.json({ ok: true });
});
adminRouter.get("/reports", async (_req, res) =>
  res.json(
    await db.report.findMany({
      include: {
        reportedUser: {
          select: {
            id: true,
            status: true,
            profile: { select: { name: true, username: true, bio: true } },
          },
        },
        message: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ),
);
adminRouter.patch("/reports/:id", async (req, res) => {
  const status = z
    .enum(["PENDING", "REVIEWED", "RESOLVED", "DISMISSED"])
    .parse(req.body.status);
  const id = z.string().parse(req.params.id);
  await transaction(async (tx) => {
    await tx.report.update({ where: { id }, data: { status } });
    await tx.adminAction.create({
      data: {
        adminId: req.user.id,
        targetId: id,
        action: "REPORT_STATUS",
        reason: status,
      },
    });
  });
  res.json({ ok: true });
});
adminRouter.patch("/users/:id", async (req, res) => {
  const id = z.string().parse(req.params.id);
  const input = z
    .object({
      status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]),
      reason: z.string().trim().min(5).max(1000),
    })
    .parse(req.body);
  assert(id !== req.user.id, 400, "You cannot moderate your own account.");
  await transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id } });
    assert(
      target && target.status !== "DELETED" && target.role !== "ADMIN",
      400,
      "This account cannot be changed here.",
    );
    await tx.user.update({ where: { id }, data: { status: input.status } });
    if (input.status !== "ACTIVE")
      await tx.userSession.deleteMany({ where: { userId: id } });
    if (input.status !== "ACTIVE")
      await tx.conversationParticipant.updateMany({
        where: { userId: id, conversation: { kind: "GROUP" } },
        data: { leftAt: new Date() },
      });
    await tx.adminAction.create({
      data: {
        adminId: req.user.id,
        targetId: id,
        action: input.status,
        reason: input.reason,
      },
    });
  });
  req.app.get("io")?.in(`user:${id}`).disconnectSockets(true);
  req.app.get("io")?.emit("safety-changed");
  res.json({ ok: true });
});
adminRouter.patch("/messages/:id", async (req, res) => {
  const id = z.string().parse(req.params.id);
  const reason = z.string().trim().min(5).max(1000).parse(req.body.reason);
  await transaction(async (tx) => {
    assert(
      await tx.report.findFirst({ where: { messageId: id } }),
      404,
      "Reported message not found.",
    );
    await tx.message.update({ where: { id }, data: { removed: true } });
    await tx.adminAction.create({
      data: {
        adminId: req.user.id,
        targetId: id,
        action: "REMOVE_MESSAGE",
        reason,
      },
    });
  });
  req.app.get("io")?.emit("safety-changed");
  res.json({ ok: true });
});
adminRouter.get("/verifications", async (_req, res) =>
  res.json(
    await db.verification.findMany({
      where: { status: "PENDING" },
      select: {
        id: true,
        userId: true,
        collegeId: true,
        method: true,
        createdAt: true,
        user: {
          select: {
            profile: {
              select: { name: true, college: { select: { name: true } } },
            },
          },
        },
      },
      take: 100,
    }),
  ),
);
adminRouter.get("/verifications/:id/image", async (req, res) => {
  const v = await db.verification.findUnique({
    where: { id: z.string().parse(req.params.id) },
  });
  assert(v?.privateKey && v.status === "PENDING", 404, "Document unavailable.");
  await db.adminAction.create({
    data: {
      adminId: req.user.id,
      targetId: v.id,
      action: "VIEW_VERIFICATION",
      reason: "Student verification review",
    },
  });
  res
    .set("Cache-Control", "no-store")
    .type("webp")
    .send(await getImage(v.privateKey));
});
adminRouter.patch("/verifications/:id", async (req, res) => {
  const id = z.string().parse(req.params.id);
  const approved = z.boolean().parse(req.body.approved);
  await transaction(async (tx) => {
    const v = await tx.verification.findUnique({
      where: { id },
      include: { user: { include: { profile: true } } },
    });
    assert(
      v &&
        v.status === "PENDING" &&
        v.user.status === "ACTIVE" &&
        v.user.profile?.collegeId === v.collegeId,
      400,
      "Verification is no longer valid.",
    );
    await tx.verification.update({
      where: { id },
      data: { status: approved ? "RESOLVED" : "DISMISSED", privateKey: null },
    });
    if (v.privateKey)
      await tx.storageDeletion.upsert({
        where: { key: v.privateKey },
        create: { key: v.privateKey },
        update: {},
      });
    if (approved) {
      await tx.user.update({
        where: { id: v.userId },
        data: { verified: true },
      });
      await event(tx, v.userId, "verification_completed");
    }
    await tx.adminAction.create({
      data: {
        adminId: req.user.id,
        targetId: id,
        action: "VERIFICATION_REVIEW",
        reason: approved ? "Approved" : "Rejected",
      },
    });
  });
  res.json({ ok: true });
});
