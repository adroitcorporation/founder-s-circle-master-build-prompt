import { Router } from "express";
import { z } from "zod";
import { db } from "../database.js";
import { visibleProfile } from "../services/community.js";
export const notificationsRouter = Router();
notificationsRouter.get("/", async (req, res) => {
  const rows = await db.notification.findMany({
    where: { recipientId: req.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const items = await Promise.all(
    rows.map(async (n) => {
      let title =
        n.type === "MESSAGE"
          ? "You have a new message"
          : n.type === "CONNECTION_REQUEST"
            ? "A student wants to connect"
            : "Your connection request was accepted";
      let href =
        n.type === "MESSAGE" ? `messages/${n.entityId}` : "connections";
      if (n.type === "IDEA_RESONATED") {
        const idea = await db.idea.findFirst({
          where: { id: n.entityId, authorId: req.user.id },
        });
        const actor = await visibleProfile(db, req.user.id, n.actorId).catch(
          () => null,
        );
        title = idea
          ? `${actor?.name || "A student"} resonated with your idea${idea.title ? ` “${idea.title}”` : ""}.`
          : "This idea is no longer available.";
        href = idea ? `ideas/${idea.id}` : "ideas";
      }
      if (["IDEA_GROUP_INVITE", "IDEA_GROUP_CREATED"].includes(n.type)) {
        const group = await db.conversation.findFirst({
          where: {
            id: n.entityId,
            participants: { some: { userId: req.user.id, leftAt: null } },
          },
        });
        const actor = await visibleProfile(db, req.user.id, n.actorId).catch(
          () => null,
        );
        title = group
          ? n.type === "IDEA_GROUP_CREATED"
            ? `Your group “${group.name}” is ready.`
            : `${actor?.name || "The idea author"} added you to “${group.name}”.`
          : "This group is no longer available.";
        href = group ? `messages/${group.id}` : "messages";
      }
      return { ...n, title, href };
    }),
  );
  res.json({
    unread: await db.notification.count({
      where: { recipientId: req.user.id, read: false },
    }),
    items,
  });
});
notificationsRouter.patch("/read", async (req, res) => {
  const id = z.string().optional().parse(req.body.id);
  await db.notification.updateMany({
    where: { recipientId: req.user.id, ...(id ? { id } : {}) },
    data: { read: true },
  });
  res.json({ ok: true });
});
