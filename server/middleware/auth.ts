import type { Request, Response, NextFunction } from "express";
import type { User } from "@prisma/client";
import { db } from "../database.js";
import { assert, hash } from "../utils.js";
declare global {
  namespace Express {
    interface Request {
      user: User;
      sessionId: string;
    }
  }
}
export async function sessionUser(raw: string | undefined) {
  assert(raw, 401, "Please log in to continue.");
  const session = await db.userSession.findUnique({
    where: { id: hash(raw) },
    include: { user: true },
  });
  assert(
    session && session.expiresAt > new Date(),
    401,
    "Your session has expired. Please log in.",
  );
  assert(
    session.user.status === "ACTIVE",
    403,
    "This account is no longer available.",
  );
  return session;
}
export async function authenticated(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const s = await sessionUser(req.cookies.fc_session);
    req.user = s.user;
    req.sessionId = s.id;
    next();
  } catch (error) {
    next(error);
  }
}
export function admin(req: Request, _res: Response, next: NextFunction) {
  try {
    assert(req.user.role === "ADMIN", 403, "Administrator access required.");
    next();
  } catch (error) {
    next(error);
  }
}
