import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { createServer as createVite } from "vite";
import { randomUUID, createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

assert.equal(new URL(process.env.DATABASE_URL).port, "55439", "Use run-group-check.mjs and the isolated database.");
const origin = "http://localhost:55441";
process.env.APP_ORIGIN = origin;
const { db } = await import("../src/database.ts");
const { createApp } = await import("../src/app.ts");
const { createSockets } = await import("../src/sockets.ts");
const app = createApp(), server = createServer(app), io = createSockets(server);
app.set("io", io);
await new Promise((r) => server.listen(55440, "127.0.0.1", r));
const vite = await createVite({ configFile: "Frontend/vite.config.ts", root: "Frontend", server: { port: 55441, strictPort: true,
  proxy: { "/api": "http://127.0.0.1:55440", "/socket.io": { target: "http://127.0.0.1:55440", ws: true } } } });
await vite.listen();
const browser = await chromium.launch({ channel: "msedge", headless: true });
const actors = [], errors = [];
await mkdir("work/qa/groups", { recursive: true });
async function actor(name) {
  const raw = randomUUID();
  const user = await db.user.create({ data: { email: `${randomUUID()}@example.test`, passwordHash: "qa-unused", verified: true,
    profile: { create: { name, username: `qa${randomUUID().replaceAll("-", "").slice(0, 20)}`, completed: true, degree: "B.Tech", bio: "Group browser regression fixture." } } } });
  await db.userSession.create({ data: { id: createHash("sha256").update(raw).digest("hex"), userId: user.id, expiresAt: new Date(Date.now() + 3600000) } });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: "fc_session", value: raw, url: origin }]);
  const page = await context.newPage();
  const a = { id: user.id, name, page }; actors.push(a);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await expect(page.locator(".sidebar")).toBeVisible();
  return a;
}
async function api(a, path, data, method = "POST") {
  const response = await a.page.request.fetch(`${origin}/api${path}`, { method, data, headers: { Origin: origin } });
  const body = await response.json();
  assert(response.ok(), JSON.stringify({ path, status: response.status(), body }));
  return body;
}
async function go(a, hash) { await a.page.goto(`${origin}/#${hash}`); }
async function connect(a, b) {
  const pending = await api(a, "/connections", { targetId: b.id });
  await api(b, `/connections/${pending.id}`, { status: "ACCEPTED" }, "PATCH");
}
async function send(a, body) {
  await a.page.getByLabel("Message", { exact: true }).fill(body);
  await a.page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(a.page.locator(".message-history").getByText(body, { exact: true })).toBeVisible();
}
try {
  const a = await actor("QA Founder"), b = await actor("QA Builder B"), c = await actor("QA Builder C"), d = await actor("QA Builder D");
  await api(a, "/connections", { targetId: b.id });
  await go(a, "connections"); await a.page.getByRole("tab", { name: "Sent", exact: true }).click();
  await go(b, "connections"); await b.page.getByRole("tab", { name: "Received", exact: true }).click();
  await expect(b.page.getByRole("button", { name: "Accept", exact: true })).toBeVisible();
  await a.page.getByRole("button", { name: "Cancel Request", exact: true }).click();
  await expect(a.page.getByRole("button", { name: "Cancel Request", exact: true })).toHaveCount(0);
  await expect(b.page.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0);
  await api(a, "/connections", { targetId: b.id });
  await b.page.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(b.page.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0);
  await connect(a, c); await connect(a, d);
  console.log("Browser: cancellation removes both pending views live; re-request and acceptance pass.");

  await go(a, "messages");
  await a.page.getByRole("button", { name: "Create group", exact: true }).click();
  await a.page.getByLabel("Group name", { exact: true }).fill("QA connected circle");
  await a.page.getByLabel(`Select ${b.name}`, { exact: true }).check();
  await a.page.getByLabel(`Select ${c.name}`, { exact: true }).check();
  await a.page.screenshot({ path: "work/qa/groups/create-group.png", fullPage: true });
  await a.page.getByRole("dialog").getByRole("button", { name: "Create group", exact: true }).click();
  await expect(a.page.locator(".chat-header")).toContainText("QA connected circle");
  const group = await db.conversation.findFirstOrThrow({ where: { ownerId: a.id, name: "QA connected circle" } });
  await go(b, `messages/${group.id}`); await go(c, `messages/${group.id}`);
  await send(a, "Our shared group history");
  for (const user of [b, c]) await expect(user.page.locator(".message-history")).toContainText("Our shared group history");
  await a.page.getByLabel("Conversation safety controls").click();
  await a.page.screenshot({ path: "work/qa/groups/creator-members.png", fullPage: true });
  await a.page.getByRole("dialog").locator(".community-person").filter({ hasText: c.name }).getByRole("button", { name: "Remove member" }).click();
  await expect(c.page.locator(".chat-header")).toHaveCount(0);
  await a.page.getByRole("button", { name: "Add members", exact: true }).click();
  await a.page.getByLabel(`Select ${d.name}`, { exact: true }).check();
  await a.page.getByRole("dialog").getByRole("button", { name: "Add members", exact: true }).click();
  await go(d, `messages/${group.id}`);
  await expect(d.page.locator(".message-history")).toContainText("Our shared group history");
  await b.page.getByLabel("Conversation safety controls").click();
  await expect(b.page.getByRole("button", { name: "Remove member", exact: true })).toHaveCount(0);
  await expect(b.page.getByRole("button", { name: "Add members", exact: true })).toHaveCount(0);
  await a.page.setViewportSize({ width: 390, height: 844 });
  await a.page.getByLabel("Conversation safety controls").click();
  await expect(a.page.getByRole("dialog")).toBeVisible();
  assert(await a.page.getByRole("dialog").evaluate((el) => el.scrollWidth <= el.clientWidth), "Member modal must not overflow on mobile");
  await a.page.screenshot({ path: "work/qa/groups/creator-members-mobile.png", fullPage: true });
  console.log("Browser: multi-select creation, live delivery, creator add/remove, normal-member controls, desktop/mobile passed.");

  const idea = await api(a, "/ideas", { title: "QA persistent idea", description: "A student collaboration idea for browser regression testing.", category: "Education", lookingFor: [], tags: [] });
  await go(b, "ideas");
  await b.page.locator(".idea-card").filter({ hasText: idea.title }).getByRole("button", { name: "Resonate", exact: true }).click();
  await expect(b.page.getByRole("button", { name: "Resonated", exact: true })).toBeVisible();
  await a.page.setViewportSize({ width: 1440, height: 1000 });
  await go(a, "ideas");
  await a.page.locator(".idea-card").filter({ hasText: idea.title }).getByRole("button", { name: "1 resonated", exact: true }).click();
  await a.page.getByLabel(`Select ${b.name}`, { exact: true }).check();
  await a.page.getByRole("button", { name: /Create group/ }).click();
  await send(a, "Keep this idea history");
  const ideaGroup = await db.conversation.findUniqueOrThrow({ where: { groupKey: `idea:${idea.id}` } });
  for (const user of [c, d]) {
    await go(user, "ideas");
    await user.page.locator(".idea-card").filter({ hasText: idea.title }).getByRole("button", { name: "Resonate", exact: true }).click();
    await expect(user.page.getByRole("button", { name: "Resonated", exact: true })).toBeVisible();
    await go(user, `messages/${ideaGroup.id}`);
    await expect(user.page.locator(".message-history")).toContainText("Keep this idea history");
  }
  assert.equal(await db.conversation.count({ where: { ideaId: idea.id } }), 1);
  assert.equal(await db.conversationParticipant.count({ where: { conversationId: ideaGroup.id } }), 4);
  await go(a, "ideas");
  await a.page.getByRole("button", { name: "3 resonated", exact: true }).click();
  await expect(a.page.getByRole("button", { name: "Open idea group", exact: true })).toBeVisible();
  await expect(a.page.getByLabel(`Select ${b.name}`, { exact: true })).toBeVisible();
  await a.page.screenshot({ path: "work/qa/groups/persistent-idea.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log("Browser: B creates idea group; later C and D join same history; one group and unique members; no page errors.");
} finally {
  await browser.close(); await vite.close(); io.close(); server.close();
  const ids = actors.map((a) => a.id);
  const groups = await db.conversation.findMany({ where: { participants: { some: { userId: { in: ids } } } }, select: { id: true } });
  const cids = groups.map((c) => c.id);
  await db.message.deleteMany({ where: { conversationId: { in: cids } } });
  await db.conversationParticipant.deleteMany({ where: { conversationId: { in: cids } } });
  await db.conversation.deleteMany({ where: { id: { in: cids } } });
  await db.connection.deleteMany({ where: { senderId: { in: ids } } });
  await db.idea.deleteMany({ where: { authorId: { in: ids } } });
  await db.analyticsEvent.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
}
