import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { rateLimit } from "express-rate-limit";
import { db, transaction } from "../database.js";
import { token, hash, assert } from "../utils.js";
import { active, allowed, event } from "../services/policy.js";
import { sendEmail } from "../services/email.js";
import { saveImage, getImage, removeImage } from "../services/storage.js";
export const verificationRouter = Router();
export const uploadsRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1 },
});
verificationRouter.use(
  rateLimit({
    windowMs: 3600_000,
    limit: 12,
    message: {
      error: "Too many verification attempts. Please try again later.",
    },
  }),
);
verificationRouter.post("/email", async (req, res) => {
  const email = z
    .string()
    .email()
    .max(254)
    .transform((x) => x.toLowerCase())
    .parse(req.body.email);
  const p = await db.profile.findUniqueOrThrow({
    where: { userId: req.user.id },
    include: { college: true },
  });
  assert(p.college, 400, "Save your college information first.");
  assert(
    p.college.domains.includes(email.split("@")[1]),
    400,
    "Use an approved email domain for your selected college, or upload your college ID.",
  );
  // A verified college email can belong to only one account.
  assert(
    !(await db.authToken.findFirst({
      where: { email, purpose: "VERIFIED_EMAIL", userId: { not: req.user.id } },
    })),
    409,
    "This college email is already verified on another account.",
  );
  const raw = token();
  await db.authToken.create({
    data: {
      id: hash(raw),
      userId: req.user.id,
      purpose: "VERIFY",
      email,
      collegeId: p.collegeId,
      expiresAt: new Date(Date.now() + 1800_000),
    },
  });
  await sendEmail(
    email,
    "Verify your student email",
    `${process.env.APP_ORIGIN}/?verify=${raw}`,
  );
  res.json({ ok: true });
});
verificationRouter.post("/confirm", async (req, res) => {
  const raw = z.string().length(64).parse(req.body.token);
  await transaction(async (tx) => {
    const t = await tx.authToken.findUnique({ where: { id: hash(raw) } });
    assert(
      t &&
        t.userId === req.user.id &&
        t.purpose === "VERIFY" &&
        t.expiresAt > new Date(),
      400,
      "This verification link is invalid or expired.",
    );
    const u = await active(tx, req.user.id);
    assert(
      t.collegeId === u.profile?.collegeId,
      400,
      "College changed. Please request a new verification link.",
    );
    const claimId = hash(`college-email:${t.email}`);
    const existing = await tx.authToken.findUnique({ where: { id: claimId } });
    assert(
      !existing || existing.userId === req.user.id,
      409,
      "This college email is already in use.",
    );
    await tx.authToken.upsert({
      where: { id: claimId },
      create: {
        id: claimId,
        userId: req.user.id,
        purpose: "VERIFIED_EMAIL",
        email: t.email,
        collegeId: t.collegeId,
        expiresAt: new Date("9999-01-01"),
      },
      update: {},
    });
    await tx.authToken.delete({ where: { id: t.id } });
    await tx.user.update({
      where: { id: req.user.id },
      data: { verified: true },
    });
    await tx.verification.create({
      data: {
        userId: req.user.id,
        method: "COLLEGE_EMAIL",
        collegeId: t.collegeId!,
        status: "RESOLVED",
      },
    });
    await event(tx, req.user.id, "verification_completed");
  });
  res.json({ ok: true });
});
verificationRouter.post("/id", upload.single("image"), async (req, res) => {
  const p = await db.profile.findUniqueOrThrow({
    where: { userId: req.user.id },
  });
  assert(p.collegeId, 400, "Save your college information first.");
  assert(
    !(await db.verification.findFirst({
      where: { userId: req.user.id, status: "PENDING" },
    })),
    409,
    "Your student ID is already awaiting review.",
  );
  const key = await saveImage(req.file, "verification");
  try {
    await db.verification.create({
      data: {
        userId: req.user.id,
        method: "COLLEGE_ID",
        collegeId: p.collegeId,
        privateKey: key,
      },
    });
  } catch (error) {
    await removeImage(key);
    throw error;
  }
  res.status(201).json({ ok: true });
});
uploadsRouter.post("/photo", upload.single("image"), async (req, res) => {
  const key = await saveImage(req.file, "photo");
  try {
    await transaction(async (tx) => {
      await active(tx, req.user.id);
      const p = await tx.profile.findUniqueOrThrow({
        where: { userId: req.user.id },
      });
      await tx.profile.update({
        where: { userId: req.user.id },
        data: { photoKey: key },
      });
      if (p.photoKey)
        await tx.storageDeletion.upsert({
          where: { key: p.photoKey },
          create: { key: p.photoKey },
          update: {},
        });
    });
  } catch (error) {
    await removeImage(key);
    throw error;
  }
  res.json({ photo: `/api/uploads/photo/${req.user.id}?v=${Date.now()}` });
});
uploadsRouter.delete("/photo", async (req, res) => {
  await transaction(async (tx) => {
    const p = await tx.profile.findUniqueOrThrow({
      where: { userId: req.user.id },
    });
    await tx.profile.update({
      where: { userId: req.user.id },
      data: { photoKey: null, completed: false },
    });
    if (p.photoKey)
      await tx.storageDeletion.upsert({
        where: { key: p.photoKey },
        create: { key: p.photoKey },
        update: {},
      });
  });
  res.json({ ok: true });
});
uploadsRouter.get("/photo/:id", async (req, res) => {
  const id = z.string().parse(req.params.id);
  if (id !== req.user.id) await allowed(db, req.user.id, id);
  const p = await db.profile.findUnique({ where: { userId: id } });
  assert(p?.photoKey, 404, "Photo not found.");
  if (id !== req.user.id && p.profileVisibility === "CONNECTIONS")
    await allowed(db, req.user.id, id, true);
  res
    .set("Cache-Control", "private, no-store")
    .type("webp")
    .send(await getImage(p.photoKey));
});
