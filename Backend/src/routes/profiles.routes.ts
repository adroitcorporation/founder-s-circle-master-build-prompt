import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db, transaction } from "../database.js";
import { profileInclude, publicProfile } from "../services/profiles.js";
import { profileInput, settingsInput } from "../validators/profile.js";
import { assert, pair, token } from "../utils.js";
import { allowed, active, event } from "../services/policy.js";
export const profilesRouter = Router();
profilesRouter.get("/me", async (req, res) => {
  const p = await db.profile.findUniqueOrThrow({
    where: { userId: req.user.id },
    include: profileInclude,
  });
  const verifications = await db.verification.findMany({
    where: { userId: req.user.id },
    select: { id: true, method: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  res.json({
    ...publicProfile(p),
    email: req.user.email,
    role: req.user.role,
    canPostEvents: req.user.role === "ADMIN" || req.user.canPostEvents,
    completed: p.completed,
    city: p.city,
    socialLinks: p.socialLinks,
    settings: {
      showCity: p.showCity,
      showSocialLinks: p.showSocialLinks,
      discoverable: p.discoverable,
      allowRequests: p.allowRequests,
      profileVisibility: p.profileVisibility,
      notifyMessages: p.notifyMessages,
      notifyConnections: p.notifyConnections,
    },
    verifications,
  });
});
profilesRouter.get("/catalog", async (_req, res) =>
  res.json({
    colleges: await db.college.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    interests: await db.interest.findMany(),
    skills: await db.skill.findMany(),
  }),
);
profilesRouter.put("/me", async (req, res) => {
  const { interests, skills, ...input } = profileInput.parse(req.body);
  await transaction(async (tx) => {
    const u = await active(tx, req.user.id);
    const p = u.profile!;
    assert(
      p.photoKey,
      400,
      "Add a profile photo before completing your profile.",
    );
    assert(
      await tx.college.findUnique({ where: { id: input.collegeId } }),
      400,
      "Select a valid college.",
    );
    const changedCollege = p.collegeId !== input.collegeId;
    if (changedCollege) {
      await tx.user.update({ where: { id: u.id }, data: { verified: false } });
      await tx.authToken.deleteMany({
        where: { userId: u.id, purpose: "VERIFY" },
      });
      await tx.verification.updateMany({
        where: { userId: u.id, status: "PENDING" },
        data: { status: "DISMISSED" },
      });
    }
    await tx.userInterest.deleteMany({ where: { profileId: p.id } });
    await tx.userSkill.deleteMany({ where: { profileId: p.id } });
    await tx.profile.update({
      where: { userId: u.id },
      data: {
        ...input,
        completed: true,
        interests: {
          create: [...new Set(interests)].map((interestId) => ({ interestId })),
        },
        skills: {
          create: [...new Set(skills)].map((skillId) => ({ skillId })),
        },
      },
    });
    if (!p.completed) await event(tx, u.id, "profile_completed");
  });
  res.json({ ok: true });
});
profilesRouter.patch("/settings", async (req, res) => {
  await db.profile.update({
    where: { userId: req.user.id },
    data: settingsInput.parse(req.body),
  });
  res.json({ ok: true });
});
profilesRouter.get("/:id", async (req, res) => {
  const id = z.string().parse(req.params.id);
  if (id !== req.user.id) await allowed(db, req.user.id, id);
  const p = await db.profile.findUnique({
    where: { userId: id },
    include: profileInclude,
  });
  assert(p && p.completed, 404, "Profile not found.");
  if (id !== req.user.id && p.profileVisibility === "CONNECTIONS") {
    const c = await db.connection.findUnique({
      where: { pairKey: pair(req.user.id, id) },
    });
    assert(
      c?.status === "ACCEPTED",
      403,
      "This profile is visible to connections only.",
    );
  }
  await event(db, req.user.id, "profile_viewed");
  res.json(publicProfile(p));
});
profilesRouter.delete("/me", async (req, res) => {
  const password = z.string().max(72).parse(req.body.password);
  assert(
    await bcrypt.compare(password, req.user.passwordHash),
    400,
    "Password is incorrect.",
  );
  await transaction(async (tx) => {
    const profile = await tx.profile.findUnique({
      where: { userId: req.user.id },
    });
    const documents = await tx.verification.findMany({
      where: { userId: req.user.id, privateKey: { not: null } },
    });
    for (const key of [
      profile?.photoKey,
      ...documents.map((d) => d.privateKey),
    ].filter((key): key is string => !!key)) {
      await tx.storageDeletion.upsert({
        where: { key },
        create: { key },
        update: {},
      });
    }
    await tx.user.update({
      where: { id: req.user.id },
      data: {
        status: "DELETED",
        verified: false,
        email: `deleted-${token()}@invalid.example`,
        passwordHash: "",
      },
    });
    await tx.profile.delete({ where: { userId: req.user.id } });
    await tx.conversationParticipant.updateMany({
      where: { userId: req.user.id, conversation: { kind: "GROUP" } },
      data: { leftAt: new Date() },
    });
    await tx.ideaResonance.deleteMany({ where: { userId: req.user.id } });
    await tx.idea.deleteMany({ where: { authorId: req.user.id } });
    await tx.eventRSVP.deleteMany({ where: { userId: req.user.id } });
    const hostedEvents = await tx.campusEvent.findMany({
      where: { creatorId: req.user.id, imageKey: { not: null } },
    });
    for (const e of hostedEvents)
      await tx.storageDeletion.upsert({
        where: { key: e.imageKey! },
        create: { key: e.imageKey! },
        update: {},
      });
    await tx.campusEvent.deleteMany({ where: { creatorId: req.user.id } });
    await tx.userSession.deleteMany({ where: { userId: req.user.id } });
    await tx.authToken.deleteMany({ where: { userId: req.user.id } });
    await tx.notification.deleteMany({
      where: { OR: [{ recipientId: req.user.id }, { actorId: req.user.id }] },
    });
    await tx.analyticsEvent.deleteMany({ where: { userId: req.user.id } });
    await tx.verification.updateMany({
      where: { userId: req.user.id },
      data: { status: "DISMISSED", privateKey: null },
    });
    await tx.connection.updateMany({
      where: { OR: [{ senderId: req.user.id }, { recipientId: req.user.id }] },
      data: { status: "DECLINED" },
    });
  });
  req.app.get("io")?.in(`user:${req.user.id}`).disconnectSockets(true);
  req.app.get("io")?.emit("safety-changed");
  res.clearCookie("fc_session", { path: "/" }).json({ ok: true });
});
