import "dotenv/config";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
if (process.env.NODE_ENV === "production") throw new Error("Development only");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
const pages = [];
const title = `QA learning circle ${Date.now()}`;
let ideaId, eventId, groupId;
await mkdir("work/qa", { recursive: true });
async function login(email) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const p = await context.newPage();
  pages.push(p);
  p.setDefaultTimeout(15000);
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("http://localhost:5173");
  await p.getByLabel("Email", { exact: true }).fill(email);
  await p
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_PASSWORD);
  await p.getByRole("button", { name: "Log in", exact: true }).click();
  await p.locator(".sidebar").waitFor();
  return p;
}
async function go(p, route) {
  await p.goto(`http://localhost:5173/#${route}`);
}
try {
  const a = await login("student@example.test"),
    b = await login("student2@example.test");
  await go(a, "ideas");
  await a.getByRole("button", { name: "Post Idea", exact: true }).click();
  await a.locator('[name="title"]').fill(title);
  await a
    .getByLabel("Your idea", { exact: true })
    .fill(
      "A personalized campus learning platform built by students together.",
    );
  const saved = a.waitForResponse(
    (r) => r.url().endsWith("/api/ideas") && r.request().method() === "POST",
  );
  await a
    .getByRole("dialog")
    .getByRole("button", { name: "Post idea", exact: true })
    .click();
  ideaId = (await (await saved).json()).id;
  await expect(
    a.locator(".idea-card").filter({ hasText: title }),
  ).toBeVisible();
  await go(b, "ideas");
  const card = b.locator(".idea-card").filter({ hasText: title });
  await card.getByRole("button", { name: "Resonate", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "Resonated", exact: true }),
  ).toBeVisible();
  await go(a, "notifications");
  await a
    .getByRole("button")
    .filter({ hasText: "Sam Test resonated with your idea" })
    .first()
    .click();
  await a.getByRole("dialog", { name: "People who resonated" }).waitFor();
  await a.getByLabel("Select Sam Test").check();
  await a.getByRole("button", { name: /Create group/ }).click();
  await a
    .getByLabel("Message", { exact: true })
    .fill("Ready to build our prototype?");
  await a.getByRole("button", { name: "Send message", exact: true }).click();
  const groupRoute = new URL(a.url()).hash.slice(1);
  groupId = groupRoute.split("/")[1];
  await go(b, groupRoute);
  await expect(
    b
      .locator(".message-history")
      .getByText("Ready to build our prototype?", { exact: true }),
  ).toBeVisible();
  await b
    .getByLabel("Message", { exact: true })
    .fill("Yes, let’s start with a student interview.");
  await b.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    a
      .locator(".message-history")
      .getByText("Yes, let’s start with a student interview.", { exact: true }),
  ).toBeVisible();
  await go(a, "events");
  await a.getByRole("button", { name: "Post Event", exact: true }).click();
  await a.getByLabel("Event title", { exact: true }).fill(title);
  await a.getByLabel("Organizer", { exact: true }).fill("QA Student Club");
  await a
    .getByLabel("Description", { exact: true })
    .fill(
      "A community test workshop for sharing student prototypes and feedback.",
    );
  const futureDay = new Date(Date.now() + 10 * 86400000)
    .toISOString()
    .slice(0, 10);
  await a.getByLabel("Start date and time").fill(`${futureDay}T18:00`);
  await a.getByLabel("End date and time").fill(`${futureDay}T20:00`);
  await a.getByLabel("Location", { exact: true }).fill("Test Campus Hall");
  const eventSaved = a.waitForResponse(
    (r) => r.url().endsWith("/api/events") && r.request().method() === "POST",
  );
  await a.getByRole("button", { name: "Publish event", exact: true }).click();
  eventId = (await (await eventSaved).json()).id;
  await go(b, `events/${eventId}`);
  const detail = b.getByRole("dialog", { name: "Event details" });
  await detail.getByRole("button", { name: "RSVP", exact: true }).click();
  await expect(
    detail.getByRole("button", { name: "Cancel RSVP", exact: true }),
  ).toBeVisible();
  await expect(
    detail.getByRole("button", { name: "1 going", exact: true }),
  ).toBeVisible();
  await detail
    .getByRole("button", { name: "Cancel RSVP", exact: true })
    .click();
  await expect(
    detail.getByRole("button", { name: "0 going", exact: true }),
  ).toBeVisible();
  await b.keyboard.press("Escape");
  const checks = [];
  for (const route of ["ideas", "events"]) {
    await go(a, route);
    await a
      .locator(route === "ideas" ? ".idea-card" : ".event-card")
      .first()
      .waitFor();
    for (const width of [360, 390, 414, 768, 1024, 1440]) {
      await a.setViewportSize({ width, height: 1000 });
      await a.waitForTimeout(100);
      assert.equal(
        await a.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `${route} overflow at ${width}`,
      );
      checks.push({ route, width, overflow: false });
      if ([360, 1440].includes(width))
        await a.screenshot({
          path: `work/qa/${route}-${width}.png`,
          fullPage: true,
        });
    }
  }
  await a.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(a.locator(".event-agenda")).toBeVisible();
  assert.deepEqual(errors, []);
  await writeFile(
    "work/qa/community-results.json",
    JSON.stringify(
      { ideaFlow: true, groupChat: true, eventFlow: true, checks, errors },
      null,
      2,
    ),
  );
  console.log(
    "Idea posting, resonance notification, group chat, event creation, RSVP/cancel and 12 responsive checks passed.",
  );
} finally {
  const a = pages[0];
  if (a) {
    for (const [kind, id] of [
      ["ideas", ideaId],
      ["events", eventId],
    ])
      if (id)
        await a
          .evaluate(
            async ({ kind, id }) =>
              fetch(`/api/${kind}/${id}`, { method: "DELETE" }),
            { kind, id },
          )
          .catch(() => {});
  }
  if (groupId) {
    const db = new PrismaClient();
    try {
      const g = await db.conversation.findFirst({
        where: { id: groupId, kind: "GROUP", name: title + " — Builders" },
      });
      if (g)
        await db.$transaction([
          db.notification.deleteMany({ where: { entityId: groupId } }),
          db.message.deleteMany({ where: { conversationId: groupId } }),
          db.conversationParticipant.deleteMany({
            where: { conversationId: groupId },
          }),
          db.conversation.delete({ where: { id: groupId } }),
        ]);
    } finally {
      await db.$disconnect();
    }
  }
  await browser.close();
}
