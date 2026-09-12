import "../src/config/runtime.js";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import request from "supertest";
import { io as socketClient } from "socket.io-client";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { db } from "../src/database.js";
import { createApp } from "../src/app.js";
import { createSockets } from "../src/sockets.js";
import { hash, token, pair } from "../src/utils.js";
import { sendMessage } from "../src/services/messages.js";
import { catalogFixture } from "./catalog-fixture.js";
if (process.env.NODE_ENV === "production")
  throw new Error("Integration tests require a development database.");
const app = createApp();
const server = createServer(app);
const io = createSockets(server);
app.set("io", io);
const origin = process.env.APP_ORIGIN!;
const prefix = `qa_${Date.now()}`;
type Actor = { id: string; cookie: string; email: string; password: string };
const actors: Actor[] = [];
const catalog = catalogFixture();
let url = "";
function call(
  actor: Actor,
  method: "get" | "post" | "patch" | "put" | "delete",
  path: string,
) {
  return request(app)
    [method](`/api${path}`)
    .set("Origin", origin)
    .set("Cookie", actor.cookie);
}
async function actor(
  role: "USER" | "ADMIN" = "USER",
  verified = true,
): Promise<Actor> {
  const index = actors.length;
  const raw = token();
  const password = `${randomUUID()}-safe`;
  const u = await db.user.create({
    data: {
      email: `${prefix}_${index}@example.test`,
      passwordHash: await bcrypt.hash(password, 4),
      role,
      verified,
      profile: {
        create: {
          name: `QA ${index}`,
          username: `${prefix}_${index}`,
          completed: true,
          collegeId: catalog.collegeId,
          bio: "A database integration test student.",
          degree: "B.Tech",
          interests: {
            create: catalog.interestIds.map((interestId) => ({ interestId })),
          },
        },
      },
    },
  });
  await db.userSession.create({
    data: {
      id: hash(raw),
      userId: u.id,
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  const a = { id: u.id, cookie: `fc_session=${raw}`, email: u.email, password };
  actors.push(a);
  return a;
}
async function connected(a: Actor, b: Actor) {
  const r = await call(a, "post", "/connections").send({ targetId: b.id });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const accepted = await call(b, "patch", `/connections/${r.body.id}`).send({
    status: "ACCEPTED",
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  return (
    await db.conversation.findUniqueOrThrow({
      where: { connectionId: r.body.id },
    })
  ).id;
}
before(async () => {
  await catalog.create();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  url = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  io.close();
  server.close();
  const ids = actors.map((a) => a.id);
  const conversations = await db.conversation.findMany({
    where: { participants: { some: { userId: { in: ids } } } },
    select: { id: true },
  });
  const cids = conversations.map((c) => c.id);
  await db.adminAction.deleteMany({ where: { adminId: { in: ids } } });
  await db.report.deleteMany({
    where: {
      OR: [{ reporterId: { in: ids } }, { reportedUserId: { in: ids } }],
    },
  });
  await db.message.deleteMany({ where: { conversationId: { in: cids } } });
  await db.conversationParticipant.deleteMany({
    where: { conversationId: { in: cids } },
  });
  await db.conversation.deleteMany({ where: { id: { in: cids } } });
  await db.connection.deleteMany({
    where: { OR: [{ senderId: { in: ids } }, { recipientId: { in: ids } }] },
  });
  await db.block.deleteMany({
    where: { OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }] },
  });
  await db.pass.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { targetId: { in: ids } }] },
  });
  await db.verification.deleteMany({ where: { userId: { in: ids } } });
  await db.analyticsEvent.deleteMany({ where: { userId: { in: ids } } });
  const photos = await db.profile.findMany({
    where: { userId: { in: ids }, photoKey: { not: null } },
    select: { photoKey: true },
  });
  for (const p of photos)
    await db.storageDeletion.upsert({
      where: { key: p.photoKey! },
      create: { key: p.photoKey! },
      update: {},
    });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await catalog.remove();
  await db.$disconnect();
});
test("authentication requires sessions, hashes passwords, persists login, prevents duplicate signup, and revokes logout", async () => {
  assert.equal((await request(app).get("/api/profiles/me")).status, 401);
  const password = `${randomUUID()}-A`;
  const email = `${prefix}_signup@example.test`;
  const username = `Qa_${Date.now()}_AbCdEfG`;
  const r = await request(app)
    .post("/api/auth/signup")
    .set("Origin", origin)
    .send({
      email,
      password,
      name: "Test Signup",
      username,
    });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const u = await db.user.findUniqueOrThrow({ where: { email } });
  assert.equal(
    (await db.profile.findUniqueOrThrow({ where: { userId: u.id } })).username,
    username,
  );
  assert.notEqual(u.passwordHash, password);
  assert(await bcrypt.compare(password, u.passwordHash));
  const a = {
    id: u.id,
    email,
    password,
    cookie: r.headers["set-cookie"][0].split(";")[0],
  };
  actors.push(a);
  assert.equal((await call(a, "get", "/profiles/me")).status, 200);
  assert.equal(
    (
      await request(app)
        .post("/api/auth/signup")
        .set("Origin", origin)
        .send({
          email,
          password,
          name: "Duplicate",
          username: `dup_${Date.now()}`,
        })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/auth/login")
        .set("Origin", origin)
        .send({ email, password })
    ).status,
    200,
  );
  await call(a, "post", "/auth/logout").send({});
  assert.equal((await call(a, "get", "/profiles/me")).status, 401);
});
test("origin validation rejects cross-site writes and weak passwords are rejected", async () => {
  assert.equal(
    (
      await request(app)
        .post("/api/auth/signup")
        .set("Origin", "https://evil.example")
        .send({})
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app).post("/api/auth/signup").set("Origin", origin).send({
        email: "a@b.com",
        password: "short",
        name: "Test",
        username: "qa_short",
      })
    ).status,
    400,
  );
});
test("only the recipient can accept; repeated and reverse requests never create duplicate relationships", async () => {
  const a = await actor(),
    b = await actor(),
    stranger = await actor();
  const first = await call(a, "post", "/connections").send({ targetId: b.id });
  assert.equal(
    (
      await call(a, "patch", `/connections/${first.body.id}`).send({
        status: "ACCEPTED",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call(stranger, "patch", `/connections/${first.body.id}`).send({
        status: "ACCEPTED",
      })
    ).status,
    404,
  );
  const duplicates = await Promise.all([
    call(a, "post", "/connections").send({ targetId: b.id }),
    call(b, "post", "/connections").send({ targetId: a.id }),
  ]);
  for (const duplicate of duplicates)
    assert.equal(duplicate.status, 201, JSON.stringify(duplicate.body));
  assert.equal(
    await db.connection.count({ where: { pairKey: pair(a.id, b.id) } }),
    1,
  );
  assert.equal(
    (
      await call(b, "patch", `/connections/${first.body.id}`).send({
        status: "ACCEPTED",
      })
    ).status,
    200,
  );
  assert.equal(
    await db.conversation.count({ where: { connectionId: first.body.id } }),
    1,
  );
});
test("unverified and incomplete profiles cannot connect", async () => {
  const a = await actor("USER", false),
    b = await actor();
  assert.equal(
    (await call(a, "post", "/connections").send({ targetId: b.id })).status,
    403,
  );
  await db.user.update({ where: { id: a.id }, data: { verified: true } });
  await db.profile.update({
    where: { userId: a.id },
    data: { completed: false },
  });
  assert.equal(
    (await call(a, "post", "/connections").send({ targetId: b.id })).status,
    403,
  );
});
test("connection privacy, self requests and nonexistent targets are enforced", async () => {
  const a = await actor(),
    b = await actor();
  await db.profile.update({
    where: { userId: b.id },
    data: { allowRequests: false },
  });
  assert.equal(
    (await call(a, "post", "/connections").send({ targetId: b.id })).status,
    403,
  );
  assert.equal(
    (await call(a, "post", "/connections").send({ targetId: a.id })).status,
    400,
  );
  assert.equal(
    (await call(a, "post", "/connections").send({ targetId: "missing" }))
      .status,
    403,
  );
});
test("messages persist, are connection-only, reject outsiders, and deduplicate retries", async () => {
  const a = await actor(),
    b = await actor(),
    c = await actor();
  const id = await connected(a, b);
  const input = {
    conversationId: id,
    clientId: randomUUID(),
    body: "A persisted test message",
  };
  assert.equal((await call(c, "post", "/messages").send(input)).status, 404);
  assert.equal((await call(c, "get", `/messages/${id}`)).status, 404);
  const first = await call(a, "post", "/messages").send(input);
  assert.equal(first.status, 201);
  const retry = await call(a, "post", "/messages").send(input);
  assert.equal(retry.body.id, first.body.id);
  assert.equal(
    await db.message.count({
      where: { senderId: a.id, clientId: input.clientId },
    }),
    1,
  );
  assert.equal(
    (
      await call(a, "post", "/messages").send({
        ...input,
        body: "Different retry",
      })
    ).status,
    409,
  );
  assert.equal(
    (await call(b, "get", `/messages/${id}`)).body.items[0].body,
    input.body,
  );
});
test("message size and per-user persisted rate limits are enforced", async () => {
  const a = await actor(),
    b = await actor();
  const id = await connected(a, b);
  assert.equal(
    (
      await call(a, "post", "/messages").send({
        conversationId: id,
        clientId: randomUUID(),
        body: "x".repeat(4001),
      })
    ).status,
    400,
  );
  await db.message.createMany({
    data: Array.from({ length: 30 }, () => ({
      conversationId: id,
      senderId: a.id,
      clientId: randomUUID(),
      body: "rate limit fixture",
    })),
  });
  assert.equal(
    (
      await call(a, "post", "/messages").send({
        conversationId: id,
        clientId: randomUUID(),
        body: "over limit",
      })
    ).status,
    429,
  );
});
test("blocking immediately prevents messages, requests, public profiles and discovery in both directions; unblock restores allowed chat", async () => {
  const a = await actor(),
    b = await actor();
  const id = await connected(a, b);
  assert.equal(
    (await call(a, "post", "/blocks").send({ targetId: b.id })).status,
    200,
  );
  await call(a, "post", "/blocks").send({ targetId: b.id });
  assert.equal(
    await db.block.count({ where: { blockerId: a.id, blockedId: b.id } }),
    1,
  );
  for (const [from, to] of [
    [a, b],
    [b, a],
  ]) {
    assert.equal(
      (
        await call(from, "post", "/messages").send({
          conversationId: id,
          clientId: randomUUID(),
          body: "blocked",
        })
      ).status,
      403,
    );
    assert.equal(
      (await call(from, "post", "/connections").send({ targetId: to.id }))
        .status,
      403,
    );
    assert.equal((await call(from, "get", `/profiles/${to.id}`)).status, 403);
    const feed = await call(from, "get", "/discover");
    assert.equal(feed.status, 200);
    assert(!feed.body.items.some((s: { id: string }) => s.id === to.id));
  }
  await call(a, "delete", `/blocks/${b.id}`);
  assert.equal(
    (
      await call(b, "post", "/messages").send({
        conversationId: id,
        clientId: randomUUID(),
        body: "allowed again",
      })
    ).status,
    201,
  );
});
test("a block racing a message serializes safely; every message after committed block is rejected", async () => {
  const a = await actor(),
    b = await actor();
  const id = await connected(a, b);
  await Promise.allSettled([
    sendMessage(b.id, {
      conversationId: id,
      clientId: randomUUID(),
      body: "race",
    }),
    call(a, "post", "/blocks").send({ targetId: b.id }),
  ]);
  await assert.rejects(
    sendMessage(b.id, {
      conversationId: id,
      clientId: randomUUID(),
      body: "after block",
    }),
    /unavailable/,
  );
});
test("self blocking/reporting are rejected; report evidence is private, preserved, and deduplicated", async () => {
  const a = await actor(),
    b = await actor(),
    c = await actor();
  const id = await connected(a, b);
  assert.equal(
    (await call(a, "post", "/blocks").send({ targetId: a.id })).status,
    400,
  );
  assert.equal(
    (await call(a, "post", "/reports").send({ targetId: a.id, reason: "Spam" }))
      .status,
    400,
  );
  const m = await sendMessage(b.id, {
    conversationId: id,
    clientId: randomUUID(),
    body: "evidence",
  });
  const input = {
    targetId: b.id,
    messageId: m.message.id,
    reason: "Spam",
    description: "Test report",
  };
  assert.equal((await call(c, "post", "/reports").send(input)).status, 404);
  const r = await call(a, "post", "/reports").send(input);
  assert.equal(r.status, 201);
  assert.equal(
    (await call(a, "post", "/reports").send(input)).body.id,
    r.body.id,
  );
  assert.equal((await call(b, "get", "/reports")).body.length, 0);
  assert.equal(
    (await db.message.findUniqueOrThrow({ where: { id: m.message.id } })).body,
    "evidence",
  );
});
test("all admin routes reject regular users", async () => {
  const a = await actor();
  for (const path of [
    "/admin/reports",
    "/admin/verifications",
    "/admin/verifications/missing/image",
  ])
    assert.equal((await call(a, "get", path)).status, 403);
  for (const path of [
    "/admin/reports/missing",
    "/admin/users/missing",
    "/admin/messages/missing",
    "/admin/verifications/missing",
  ])
    assert.equal((await call(a, "patch", path).send({})).status, 403);
});
test("admin reviews evidence, changes report state and suspends/bans users with session revocation", async () => {
  const a = await actor(),
    b = await actor(),
    admin = await actor("ADMIN");
  const r = await call(a, "post", "/reports").send({
    targetId: b.id,
    reason: "Fake profile",
  });
  assert.equal((await call(admin, "get", "/admin/reports")).status, 200);
  assert.equal(
    (
      await call(admin, "patch", `/admin/reports/${r.body.id}`).send({
        status: "REVIEWED",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(admin, "patch", `/admin/users/${b.id}`).send({
        status: "SUSPENDED",
        reason: "Testing suspension",
      })
    ).status,
    200,
  );
  assert.equal((await call(b, "get", "/profiles/me")).status, 401);
  assert.equal(
    (
      await request(app)
        .post("/api/auth/login")
        .set("Origin", origin)
        .send({ email: b.email, password: b.password })
    ).status,
    401,
  );
  assert.equal(
    (
      await call(admin, "patch", `/admin/users/${b.id}`).send({
        status: "BANNED",
        reason: "Testing ban state",
      })
    ).status,
    200,
  );
});
test("privacy omits city/social links and discovery visibility is enforced", async () => {
  const a = await actor(),
    b = await actor();
  await db.profile.update({
    where: { userId: b.id },
    data: {
      city: "Private city",
      socialLinks: ["https://example.com/private"],
      showCity: false,
      showSocialLinks: false,
      discoverable: false,
    },
  });
  const p = await call(a, "get", `/profiles/${b.id}`);
  assert.equal(p.status, 200);
  assert.equal(p.body.city, "");
  assert.deepEqual(p.body.socialLinks, []);
  assert(!("email" in p.body));
  assert(!("photoKey" in p.body));
  const feed = await call(a, "get", "/discover");
  assert(!feed.body.items.some((p: { id: string }) => p.id === b.id));
  await db.profile.update({
    where: { userId: b.id },
    data: { profileVisibility: "CONNECTIONS" },
  });
  assert.equal((await call(a, "get", `/profiles/${b.id}`)).status, 403);
});
test("verification uses college-domain checks, authenticated one-time tokens, and rejects wrong user", async () => {
  const a = await actor("USER", false),
    b = await actor();
  assert.equal(
    (
      await call(a, "post", "/verification/email").send({
        email: "someone@gmail.com",
      })
    ).status,
    400,
  );
  const raw = token();
  await db.authToken.create({
    data: {
      id: hash(raw),
      userId: a.id,
      email: `${prefix}@lnmiit.ac.in`,
      purpose: "VERIFY",
      collegeId: catalog.collegeId,
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  assert.equal(
    (await call(b, "post", "/verification/confirm").send({ token: raw }))
      .status,
    400,
  );
  assert.equal(
    (await call(a, "post", "/verification/confirm").send({ token: raw }))
      .status,
    200,
  );
  assert((await db.user.findUniqueOrThrow({ where: { id: a.id } })).verified);
  assert.equal(
    (await call(a, "post", "/verification/confirm").send({ token: raw }))
      .status,
    400,
  );
});
test("image upload validates decoded content, photo dimensions and protects private documents", async () => {
  const a = await actor();
  assert.equal(
    (
      await call(a, "post", "/uploads/photo").attach(
        "image",
        Buffer.from("<script>evil</script>"),
        { filename: "fake.png", contentType: "image/png" },
      )
    ).status,
    400,
  );
  const tiny = await sharp({
    create: { width: 20, height: 20, channels: 3, background: "#123456" },
  })
    .png()
    .toBuffer();
  assert.equal(
    (
      await call(a, "post", "/uploads/photo").attach("image", tiny, {
        filename: "tiny.png",
        contentType: "image/png",
      })
    ).status,
    400,
  );
  const valid = await sharp({
    create: { width: 200, height: 200, channels: 3, background: "#123456" },
  })
    .png()
    .toBuffer();
  assert.equal(
    (
      await call(a, "post", "/uploads/photo").attach("image", valid, {
        filename: "valid.png",
        contentType: "image/png",
      })
    ).status,
    200,
  );
  assert.equal((await call(a, "get", `/uploads/photo/${a.id}`)).status, 200);
  assert.equal(
    (await call(a, "get", "/admin/verifications/missing/image")).status,
    403,
  );
});
test("notifications belong to recipient and can be marked read only by recipient", async () => {
  const a = await actor(),
    b = await actor();
  await call(a, "post", "/connections").send({ targetId: b.id });
  const n = await call(b, "get", "/notifications");
  assert.equal(n.body.unread, 1);
  const id = n.body.items[0].id;
  await call(a, "patch", "/notifications/read").send({ id });
  assert.equal(
    (await db.notification.findUniqueOrThrow({ where: { id } })).read,
    false,
  );
  await call(b, "patch", "/notifications/read").send({ id });
  assert.equal(
    (await db.notification.findUniqueOrThrow({ where: { id } })).read,
    true,
  );
});
test("deletion requires password, anonymizes profile and preserves reports and messages", async () => {
  const a = await actor(),
    b = await actor();
  const id = await connected(a, b);
  const m = await sendMessage(a.id, {
    conversationId: id,
    clientId: randomUUID(),
    body: "retained evidence",
  });
  await call(b, "post", "/reports").send({
    targetId: a.id,
    messageId: m.message.id,
    reason: "Spam",
  });
  assert.equal(
    (await call(a, "delete", "/profiles/me").send({ password: "wrong" }))
      .status,
    400,
  );
  assert.equal(
    (await call(a, "delete", "/profiles/me").send({ password: a.password }))
      .status,
    200,
  );
  const u = await db.user.findUniqueOrThrow({ where: { id: a.id } });
  assert.equal(u.status, "DELETED");
  assert.notEqual(u.email, a.email);
  assert.equal(await db.profile.findUnique({ where: { userId: a.id } }), null);
  assert(await db.message.findUnique({ where: { id: m.message.id } }));
  assert.equal(await db.report.count({ where: { reportedUserId: a.id } }), 1);
  assert.equal((await call(a, "get", "/profiles/me")).status, 401);
});
test("authenticated sockets deliver persisted messages; revoked sessions and blocks reject sends", async () => {
  const a = await actor(),
    b = await actor();
  const id = await connected(a, b);
  const connect = (a: Actor) =>
    socketClient(url, {
      transports: ["websocket"],
      extraHeaders: { Origin: origin, Cookie: a.cookie },
      reconnection: false,
    });
  const sa = connect(a),
    sb = connect(b);
  try {
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        sa.on("connect", resolve);
        sa.on("connect_error", reject);
      }),
      new Promise<void>((resolve, reject) => {
        sb.on("connect", resolve);
        sb.on("connect_error", reject);
      }),
    ]);
    const received = new Promise<{ body: string }>((resolve) =>
      sb.once("message", resolve),
    );
    const result = await sa.timeout(5000).emitWithAck("send-message", {
      conversationId: id,
      clientId: randomUUID(),
      body: "socket hello",
    });
    assert(result.message);
    assert.equal((await received).body, "socket hello");
    await call(a, "post", "/blocks").send({ targetId: b.id });
    const denied = await sb.timeout(5000).emitWithAck("send-message", {
      conversationId: id,
      clientId: randomUUID(),
      body: "blocked socket",
    });
    assert(denied.error);
    await db.userSession.deleteMany({ where: { userId: b.id } });
    const expired = await sb.timeout(5000).emitWithAck("send-message", {
      conversationId: id,
      clientId: randomUUID(),
      body: "expired session",
    });
    assert(expired.error);
  } finally {
    sa.disconnect();
    sb.disconnect();
  }
});
test("password reset is one-use and revokes old sessions", async () => {
  const a = await actor();
  const raw = token();
  const password = `${randomUUID()}new`;
  await db.authToken.create({
    data: {
      id: hash(raw),
      userId: a.id,
      email: a.email,
      purpose: "RESET",
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  assert.equal(
    (
      await request(app)
        .post("/api/auth/reset")
        .set("Origin", origin)
        .send({ token: raw, password })
    ).status,
    200,
  );
  assert.equal((await call(a, "get", "/profiles/me")).status, 401);
  assert.equal(
    (
      await request(app)
        .post("/api/auth/reset")
        .set("Origin", origin)
        .send({ token: raw, password })
    ).status,
    400,
  );
  assert(
    await bcrypt.compare(
      password,
      (await db.user.findUniqueOrThrow({ where: { id: a.id } })).passwordHash,
    ),
  );
});
test("ID verification is admin-only, one pending upload and expires on college change", async () => {
  const a = await actor("USER", false),
    admin = await actor("ADMIN");
  const image = await sharp({
    create: { width: 200, height: 200, channels: 3, background: "#abcabc" },
  })
    .png()
    .toBuffer();
  assert.equal(
    (await call(a, "post", "/verification/id").attach("image", image, "id.png"))
      .status,
    201,
  );
  assert.equal(
    (await call(a, "post", "/verification/id").attach("image", image, "id.png"))
      .status,
    409,
  );
  const v = await db.verification.findFirstOrThrow({
    where: { userId: a.id, status: "PENDING" },
  });
  assert.equal(
    (await call(a, "get", `/admin/verifications/${v.id}/image`)).status,
    403,
  );
  assert.equal(
    (await call(admin, "get", `/admin/verifications/${v.id}/image`)).status,
    200,
  );
  assert.equal(
    (
      await call(admin, "patch", `/admin/verifications/${v.id}`).send({
        approved: true,
      })
    ).status,
    200,
  );
  assert((await db.user.findUniqueOrThrow({ where: { id: a.id } })).verified);
  assert.equal(
    (await db.verification.findUniqueOrThrow({ where: { id: v.id } }))
      .privateKey,
    null,
  );
  assert.equal(
    (await call(admin, "get", `/admin/verifications/${v.id}/image`)).status,
    404,
  );
  await call(a, "post", "/uploads/photo").attach("image", image, "photo.png");
  const p = await db.profile.findUniqueOrThrow({ where: { userId: a.id } });
  const update = {
    name: p.name,
    username: p.username,
    collegeId: catalog.otherCollegeId,
    degree: "B.Tech",
    year: 2,
    bio: "My new student profile.",
    about: "",
    city: "",
    interests: catalog.interestIds,
    skills: [],
    hobbies: [],
    goals: [],
    careerInterests: [],
    startupInterests: [],
    socialLinks: [],
  };
  assert.equal((await call(a, "put", "/profiles/me").send(update)).status, 200);
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: a.id } })).verified,
    false,
  );
});
test("passes suppress results and arbitrary message cursors cannot expose other conversations", async () => {
  const a = await actor(),
    b = await actor(),
    c = await actor();
  await call(a, "post", `/discover/${b.id}/pass`).send({});
  assert(
    !(await call(a, "get", "/discover")).body.items.some(
      (p: { id: string }) => p.id === b.id,
    ),
  );
  const first = await connected(a, b),
    second = await connected(a, c);
  const m = await sendMessage(a.id, {
    conversationId: second,
    clientId: randomUUID(),
    body: "other conversation",
  });
  assert.equal(
    (await call(b, "get", `/messages/${first}?before=${m.message.id}`)).status,
    400,
  );
});
