import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { db, transaction, type Tx } from "../database.js";
import { assert } from "../utils.js";
import { active } from "../services/policy.js";
import { visibleUser, eventPublisher } from "../services/community.js";
import { profileInclude, publicProfile } from "../services/profiles.js";
import { saveImage, getImage, removeImage } from "../services/storage.js";
import {
  eventInput,
  eventCategories,
  pageInput,
} from "../validation/community.js";
export const eventsRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
});
async function accessible(tx: Tx, viewer: string, id: string) {
  const e = await tx.campusEvent.findFirst({
    where: { id, creator: visibleUser(viewer) },
  });
  assert(e, 404, "Event not found or no longer available.");
  return e;
}
async function detail(tx: Tx, viewer: string, id: string) {
  const { imageKey, ...e } = await accessible(tx, viewer, id);
  return {
    ...e,
    image: imageKey
      ? `/api/events/${id}/image?v=${e.updatedAt.getTime()}`
      : null,
    attendeeCount: await tx.eventRSVP.count({ where: { eventId: id } }),
    going: !!(await tx.eventRSVP.findUnique({
      where: { eventId_userId: { eventId: id, userId: viewer } },
    })),
  };
}
eventsRouter.get("/", async (req, res) => {
  const q = z
    .object({
      offset: pageInput,
      category: z.enum(eventCategories).optional(),
      filter: z.enum(["upcoming", "mine", "going"]).default("upcoming"),
    })
    .parse(req.query);
  const rows = await db.campusEvent.findMany({
    where: {
      creator: visibleUser(req.user.id),
      ...(q.filter === "mine"
        ? { creatorId: req.user.id }
        : { endsAt: { gt: new Date() } }),
      ...(q.filter === "going"
        ? { rsvps: { some: { userId: req.user.id } } }
        : {}),
      ...(q.category ? { category: q.category } : {}),
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    skip: q.offset,
    take: 13,
  });
  res.json({
    items: await Promise.all(
      rows.slice(0, 12).map((e) => detail(db, req.user.id, e.id)),
    ),
    hasMore: rows.length > 12,
  });
});
eventsRouter.post("/", async (req, res) => {
  const input = eventInput.parse(req.body);
  assert(
    new Date(input.startsAt) > new Date(),
    400,
    "Choose a future start date and time.",
  );
  const e = await transaction(async (tx) => {
    await eventPublisher(tx, req.user.id);
    return tx.campusEvent.create({
      data: { ...input, creatorId: req.user.id },
    });
  });
  res.status(201).json(await detail(db, req.user.id, e.id));
});
eventsRouter.get("/:id", async (req, res) =>
  res.json(await detail(db, req.user.id, z.string().parse(req.params.id))),
);
eventsRouter.put("/:id", async (req, res) => {
  const id = z.string().parse(req.params.id);
  const input = eventInput.parse(req.body);
  await transaction(async (tx) => {
    await eventPublisher(tx, req.user.id);
    const e = await accessible(tx, req.user.id, id);
    assert(
      e.creatorId === req.user.id,
      403,
      "Only the event creator can edit this event.",
    );
    assert(
      input.capacity === null ||
        input.capacity >=
          (await tx.eventRSVP.count({ where: { eventId: id } })),
      409,
      "Capacity cannot be smaller than the current attendee count.",
    );
    await tx.campusEvent.update({ where: { id }, data: input });
  });
  res.json(await detail(db, req.user.id, id));
});
eventsRouter.delete("/:id", async (req, res) => {
  const id = z.string().parse(req.params.id);
  await transaction(async (tx) => {
    const e = await accessible(tx, req.user.id, id);
    assert(
      e.creatorId === req.user.id,
      403,
      "Only the event creator can delete this event.",
    );
    if (e.imageKey)
      await tx.storageDeletion.upsert({
        where: { key: e.imageKey },
        create: { key: e.imageKey },
        update: {},
      });
    await tx.campusEvent.delete({ where: { id } });
  });
  res.json({ ok: true });
});
eventsRouter.put("/:id/rsvp", async (req, res) => {
  const id = z.string().parse(req.params.id);
  const going = z.boolean().parse(req.body.going);
  await transaction(async (tx) => {
    await active(tx, req.user.id);
    const e = await accessible(tx, req.user.id, id);
    const existing = await tx.eventRSVP.findUnique({
      where: { eventId_userId: { eventId: id, userId: req.user.id } },
    });
    if (going && !existing) {
      assert(e.endsAt > new Date(), 400, "This event has already ended.");
      assert(
        e.capacity === null ||
          (await tx.eventRSVP.count({ where: { eventId: id } })) < e.capacity,
        409,
        "This event is full.",
      );
      await tx.eventRSVP.create({ data: { eventId: id, userId: req.user.id } });
    }
    if (!going && existing)
      await tx.eventRSVP.delete({
        where: { eventId_userId: { eventId: id, userId: req.user.id } },
      });
  });
  res.json(await detail(db, req.user.id, id));
});
eventsRouter.get("/:id/attendees", async (req, res) => {
  const id = z.string().parse(req.params.id);
  await accessible(db, req.user.id, id);
  const rows = await db.eventRSVP.findMany({
    where: { eventId: id, user: visibleUser(req.user.id) },
    include: { user: { include: { profile: { include: profileInclude } } } },
    orderBy: [{ createdAt: "asc" }, { userId: "asc" }],
    skip: pageInput.parse(req.query.offset),
    take: 31,
  });
  res.json({
    items: rows.slice(0, 30).map((r) => publicProfile(r.user.profile!)),
    hasMore: rows.length > 30,
  });
});
eventsRouter.post("/:id/image", upload.single("image"), async (req, res) => {
  const id = z.string().parse(req.params.id);
  await eventPublisher(db, req.user.id);
  const e = await accessible(db, req.user.id, id);
  assert(
    e.creatorId === req.user.id,
    403,
    "Only the event creator can update the image.",
  );
  const key = await saveImage(req.file, "event");
  try {
    await transaction(async (tx) => {
      await eventPublisher(tx, req.user.id);
      const current = await accessible(tx, req.user.id, id);
      assert(
        current.creatorId === req.user.id,
        403,
        "Only the event creator can update the image.",
      );
      await tx.campusEvent.update({ where: { id }, data: { imageKey: key } });
      if (current.imageKey)
        await tx.storageDeletion.upsert({
          where: { key: current.imageKey },
          create: { key: current.imageKey },
          update: {},
        });
    });
  } catch (error) {
    await removeImage(key);
    throw error;
  }
  res.json(await detail(db, req.user.id, id));
});
eventsRouter.delete("/:id/image", async (req, res) => {
  const id = z.string().parse(req.params.id);
  await transaction(async (tx) => {
    const e = await accessible(tx, req.user.id, id);
    assert(
      e.creatorId === req.user.id,
      403,
      "Only the event creator can delete the image.",
    );
    if (e.imageKey)
      await tx.storageDeletion.upsert({
        where: { key: e.imageKey },
        create: { key: e.imageKey },
        update: {},
      });
    await tx.campusEvent.update({ where: { id }, data: { imageKey: null } });
  });
  res.json(await detail(db, req.user.id, id));
});
eventsRouter.get("/:id/image", async (req, res) => {
  const e = await accessible(db, req.user.id, z.string().parse(req.params.id));
  assert(e.imageKey, 404, "Image not found.");
  res
    .set("Cache-Control", "private, no-store")
    .type("webp")
    .send(await getImage(e.imageKey));
});
