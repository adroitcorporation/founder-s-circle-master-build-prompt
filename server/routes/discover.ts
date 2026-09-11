import { Router } from "express";
import { z } from "zod";
import { db } from "../database.js";
import { recommend } from "../services/recommendation.js";
import { allowed } from "../services/policy.js";
export const discoverRouter = Router();
discoverRouter.get("/", async (req, res) =>
  res.json(
    await recommend(
      req.user.id,
      z
        .object({
          q: z.string().max(100).optional(),
          college: z.string().optional(),
          year: z.coerce.number().int().min(1).max(8).optional(),
          interest: z.string().optional(),
          city: z.string().max(80).optional(),
          goal: z.string().max(60).optional(),
          page: z.coerce.number().int().min(0).max(16).default(0),
        })
        .parse(req.query),
    ),
  ),
);
discoverRouter.post("/:id/pass", async (req, res) => {
  const targetId = z.string().parse(req.params.id);
  await allowed(db, req.user.id, targetId);
  await db.pass.upsert({
    where: { userId_targetId: { userId: req.user.id, targetId } },
    create: { userId: req.user.id, targetId },
    update: { createdAt: new Date() },
  });
  res.json({ ok: true });
});
