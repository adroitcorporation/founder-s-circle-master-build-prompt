import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import { db, transaction } from "../database.js";
import { hash, token, assert } from "../utils.js";
import { authenticated } from "../middleware/auth.middleware.js";
import { sendEmail } from "../services/email.js";
import { event } from "../services/policy.js";
export const authRouter = Router();
const password = z
  .string()
  .min(12)
  .max(72)
  .refine((x) => Buffer.byteLength(x) <= 72, "Password is too long.");
const credentials = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((x) => x.toLowerCase().trim()),
  password,
});
authRouter.use(
  rateLimit({
    windowMs: 15 * 60_000,
    limit: 50,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many attempts. Please try again later." },
  }),
);
authRouter.post("/signup", async (req, res) => {
  const input = credentials
    .extend({
      name: z.string().trim().min(2).max(70),
      username: z.string().regex(/^[a-z0-9_]{3,24}$/),
    })
    .parse(req.body);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await transaction(async (tx) => {
    assert(
      !(await tx.user.findUnique({ where: { email: input.email } })),
      409,
      "Unable to create this account. Try logging in or resetting your password.",
    );
    const u = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        profile: { create: { name: input.name, username: input.username } },
      },
    });
    await event(tx, u.id, "user_signed_up");
    return u;
  });
  const raw = token();
  await db.userSession.create({
    data: {
      id: hash(raw),
      userId: user.id,
      expiresAt: new Date(Date.now() + 30 * 86400_000),
    },
  });
  res.cookie("fc_session", raw, cookieOptions).status(201).json({ ok: true });
});
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 30 * 86400_000,
};
authRouter.post("/login", async (req, res) => {
  const input = credentials.parse(req.body);
  const user = await db.user.findUnique({ where: { email: input.email } });
  const valid = await bcrypt.compare(
    input.password,
    user?.passwordHash ||
      "$2b$12$QJOhKmBFpdZFRMpjCVRQxOfEpYyPlTNsLcpdEk23ZWRYoKTrfyA5y",
  );
  assert(
    user && valid && user.status === "ACTIVE",
    401,
    "Email or password is incorrect, or this account is unavailable.",
  );
  const raw = token();
  await transaction(async (tx) => {
    const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    assert(
      current.status === "ACTIVE",
      403,
      "This account is no longer available.",
    );
    await tx.userSession.create({
      data: {
        id: hash(raw),
        userId: user.id,
        expiresAt: new Date(Date.now() + 30 * 86400_000),
      },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });
  });
  res.cookie("fc_session", raw, cookieOptions).json({ ok: true });
});
authRouter.post("/logout", authenticated, async (req, res) => {
  await db.userSession.deleteMany({ where: { id: req.sessionId } });
  req.app.get("io")?.in(`session:${req.sessionId}`).disconnectSockets(true);
  res.clearCookie("fc_session", { path: "/" }).json({ ok: true });
});
authRouter.post("/forgot", async (req, res) => {
  const email = z
    .string()
    .email()
    .transform((s) => s.toLowerCase())
    .parse(req.body.email);
  const user = await db.user.findUnique({ where: { email } });
  if (user?.status === "ACTIVE") {
    const raw = token();
    await db.authToken.create({
      data: {
        id: hash(raw),
        userId: user.id,
        email,
        purpose: "RESET",
        expiresAt: new Date(Date.now() + 1800_000),
      },
    });
    await sendEmail(
      email,
      "Reset your Founder’s Circle password",
      `${process.env.APP_ORIGIN}/?reset=${raw}`,
    );
  }
  res.json({
    ok: true,
    message: "If an account exists, a password reset link has been sent.",
  });
});
authRouter.post("/reset", async (req, res) => {
  const input = z
    .object({ token: z.string().length(64), password })
    .parse(req.body);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const id = await transaction(async (tx) => {
    const t = await tx.authToken.findUnique({
      where: { id: hash(input.token) },
      include: { user: true },
    });
    assert(
      t &&
        t.purpose === "RESET" &&
        t.expiresAt > new Date() &&
        t.user.status === "ACTIVE",
      400,
      "This reset link is invalid or expired.",
    );
    await tx.user.update({ where: { id: t.userId }, data: { passwordHash } });
    await tx.authToken.deleteMany({
      where: { userId: t.userId, purpose: "RESET" },
    });
    await tx.userSession.deleteMany({ where: { userId: t.userId } });
    return t.userId;
  });
  req.app.get("io")?.in(`user:${id}`).disconnectSockets(true);
  res.json({ ok: true });
});
authRouter.post("/password", authenticated, async (req, res) => {
  const input = z
    .object({ currentPassword: z.string().max(72), password })
    .parse(req.body);
  assert(
    await bcrypt.compare(input.currentPassword, req.user.passwordHash),
    400,
    "Current password is incorrect.",
  );
  const passwordHash = await bcrypt.hash(input.password, 12);
  await transaction(async (tx) => {
    await tx.user.update({
      where: { id: req.user.id },
      data: { passwordHash },
    });
    await tx.userSession.deleteMany({
      where: { userId: req.user.id, id: { not: req.sessionId } },
    });
  });
  req.app.get("io")?.in(`user:${req.user.id}`).disconnectSockets(true);
  res.json({ ok: true });
});
