import "../src/config/runtime.js";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import request from "supertest";
import { io as client } from "socket.io-client";
import sharp from "sharp";
import { db } from "../src/database.js";
import { createApp } from "../src/app.js";
import { createSockets } from "../src/sockets.js";
import { hash, token } from "../src/utils.js";
import { catalogFixture } from "./catalog-fixture.js";
if (process.env.NODE_ENV === "production")
  throw new Error("Development database required");
const app = createApp(),
  server = createServer(app),
  io = createSockets(server);
app.set("io", io);
const users: { id: string; cookie: string }[] = [];
let url = "";
const catalog = catalogFixture();
async function actor(admin = false) {
  const raw = token();
  const u = await db.user.create({
    data: {
      email: `${randomUUID()}@example.test`,
      passwordHash: "test-unused",
      verified: true,
      role: admin ? "ADMIN" : "USER",
      profile: {
        create: {
          name: `Community Test ${users.length}`,
          username: `c${randomUUID().replaceAll("-", "").slice(0, 20)}`,
          completed: true,
          collegeId: catalog.collegeId,
          degree: "B.Tech",
          bio: "Testing the student community.",
        },
      },
    },
  });
  await db.userSession.create({
    data: {
      id: hash(raw),
      userId: u.id,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const a = { id: u.id, cookie: `fc_session=${raw}` };
  users.push(a);
  return a;
}
type Actor = Awaited<ReturnType<typeof actor>>;
function call(
  a: Actor,
  method: "get" | "post" | "put" | "patch" | "delete",
  path: string,
) {
  return request(app)
    [method](`/api${path}`)
    .set("Origin", process.env.APP_ORIGIN!)
    .set("Cookie", a.cookie);
}
before(async () => {
  await catalog.create();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  assert(address && typeof address !== "string");
  url = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  io.close();
  server.close();
  const ids = users.map((u) => u.id);
  const cs = await db.conversation.findMany({
    where: { participants: { some: { userId: { in: ids } } } },
  });
  const cids = cs.map((c) => c.id);
  await db.message.deleteMany({ where: { conversationId: { in: cids } } });
  await db.conversationParticipant.deleteMany({
    where: { conversationId: { in: cids } },
  });
  await db.conversation.deleteMany({ where: { id: { in: cids } } });
  await db.connection.deleteMany({
    where: { OR: [{ senderId: { in: ids } }, { recipientId: { in: ids } }] },
  });
  await db.ideaResonance.deleteMany({ where: { userId: { in: ids } } });
  await db.idea.deleteMany({ where: { authorId: { in: ids } } });
  await db.eventRSVP.deleteMany({ where: { userId: { in: ids } } });
  await db.campusEvent.deleteMany({ where: { creatorId: { in: ids } } });
  await db.block.deleteMany({
    where: { OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }] },
  });
  await db.adminAction.deleteMany({ where: { adminId: { in: ids } } });
  await db.analyticsEvent.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await catalog.remove();
  await db.$disconnect();
});
const idea = {
  title: "Campus learning circle",
  description: "A peer tutoring community with personalized learning paths.",
  category: "Education",
  tags: ["learning"],
  lookingFor: ["Design"],
};
test("Outgoing requests cancel only while pending, disappear for both users, and can be sent again", async () => {
  const a = await actor(),
    b = await actor(),
    outsider = await actor();
  const pending = await call(a, "post", "/connections").send({
    targetId: b.id,
  });
  assert.equal(pending.status, 201);
  const id = pending.body.id;
  assert(
    (await call(b, "get", "/connections")).body.some(
      (c: { id: string }) => c.id === id,
    ),
  );
  for (const user of [b, outsider])
    assert.equal(
      (await call(user, "delete", `/connections/${id}`)).status,
      404,
    );
  assert.equal((await call(a, "delete", `/connections/${id}`)).status, 200);
  for (const user of [a, b])
    assert(
      !(await call(user, "get", "/connections")).body.some(
        (c: { id: string }) => c.id === id,
      ),
    );
  assert.equal(
    await db.notification.count({
      where: { entityId: id, type: "CONNECTION_REQUEST" },
    }),
    0,
  );
  const again = await call(a, "post", "/connections").send({ targetId: b.id });
  assert.equal(again.status, 201);
  assert.notEqual(again.body.id, id);
  assert.equal(
    (
      await call(b, "patch", `/connections/${again.body.id}`).send({
        status: "ACCEPTED",
      })
    ).status,
    200,
  );
  assert.equal(
    (await call(a, "delete", `/connections/${again.body.id}`)).status,
    409,
  );
});

test("Accepted connections create groups; only the creator manages eligible members", async () => {
  const a = await actor(),
    b = await actor(),
    c = await actor(),
    d = await actor(),
    outsider = await actor();
  for (const user of [b, c, d]) {
    const pending = await call(a, "post", "/connections").send({
      targetId: user.id,
    });
    assert.equal(
      (
        await call(user, "patch", `/connections/${pending.body.id}`).send({
          status: "ACCEPTED",
        })
      ).status,
      200,
    );
  }
  const candidates = await call(a, "get", "/messages/group-candidates");
  assert.deepEqual(
    candidates.body.items.map((p: { id: string }) => p.id).sort(),
    [b.id, c.id, d.id].sort(),
  );
  assert.equal(
    (
      await call(a, "post", "/messages/groups").send({
        name: "Not eligible",
        userIds: [outsider.id],
      })
    ).status,
    403,
  );
  const created = await call(a, "post", "/messages/groups").send({
    name: "Our circle",
    userIds: [b.id, c.id, b.id],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.conversationId;
  for (const user of [a, b, c]) {
    assert(
      (await call(user, "get", "/messages")).body.some(
        (g: { id: string }) => g.id === id,
      ),
    );
    assert.equal((await call(user, "get", `/messages/${id}`)).status, 200);
  }
  assert.equal(
    (await call(b, "post", `/messages/${id}/members`).send({ userIds: [d.id] }))
      .status,
    403,
  );
  assert.equal(
    (await call(b, "get", `/messages/group-candidates?groupId=${id}`)).status,
    403,
  );
  assert.equal(
    (await call(b, "delete", `/messages/${id}/members/${c.id}`)).status,
    403,
  );
  assert.equal(
    (
      await call(a, "post", `/messages/${id}/members`).send({
        userIds: [outsider.id],
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(a, "post", `/messages/${id}/members`).send({
        userIds: [d.id],
        ownerId: b.id,
      })
    ).status,
    400,
  );
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await call(a, "post", `/messages/${id}/members`).send({
          userIds: [d.id],
        })
      ).status,
      200,
    );
  assert.equal(
    await db.conversationParticipant.count({ where: { conversationId: id } }),
    4,
  );
  assert.equal(
    (await call(a, "delete", `/messages/${id}/members/${a.id}`)).status,
    409,
  );
  assert.equal((await call(a, "post", `/messages/${id}/leave`)).status, 409);
  assert.equal(
    (await call(a, "delete", `/messages/${id}/members/${c.id}`)).status,
    200,
  );
  assert.equal((await call(c, "get", `/messages/${id}`)).status, 404);
  assert.equal(
    (
      await call(c, "post", "/messages").send({
        conversationId: id,
        body: "Denied",
        clientId: randomUUID(),
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call(d, "post", "/messages").send({
        conversationId: id,
        body: "Hello circle",
        clientId: randomUUID(),
      })
    ).status,
    201,
  );
});

test("Idea groups persist across changing selections and concurrent resonators without losing history", async () => {
  const a = await actor(),
    b = await actor(),
    c = await actor(),
    d = await actor(),
    e = await actor();
  const ideaId = (await call(a, "post", "/ideas").send(idea)).body.id;
  for (const user of [b, c])
    await call(user, "put", `/ideas/${ideaId}/resonance`).send({
      resonated: true,
    });
  const creations = await Promise.all(
    [b, c].map((user) =>
      call(a, "post", `/ideas/${ideaId}/group`).send({ userIds: [user.id] }),
    ),
  );
  creations.forEach((r) => assert.equal(r.status, 201, JSON.stringify(r.body)));
  const id = creations[0].body.conversationId;
  assert.equal(creations[1].body.conversationId, id);
  const message = await call(b, "post", "/messages").send({
    conversationId: id,
    body: "Keep our history",
    clientId: randomUUID(),
  });
  assert.equal(message.status, 201);
  const later = await Promise.all(
    [d, e].map((user) =>
      call(user, "put", `/ideas/${ideaId}/resonance`).send({ resonated: true }),
    ),
  );
  later.forEach((r) => assert.equal(r.status, 200, JSON.stringify(r.body)));
  for (const user of [d, e]) {
    const history = await call(user, "get", `/messages/${id}`);
    assert.equal(history.status, 200);
    assert(
      history.body.items.some((m: { id: string }) => m.id === message.body.id),
    );
  }
  assert.equal(await db.conversation.count({ where: { ideaId } }), 1);
  assert.equal(
    await db.conversationParticipant.count({ where: { conversationId: id } }),
    5,
  );
  assert.equal(
    (await call(a, "delete", `/messages/${id}/members/${d.id}`)).status,
    200,
  );
  await call(d, "put", `/ideas/${ideaId}/resonance`).send({ resonated: true });
  assert.equal((await call(d, "get", `/messages/${id}`)).status, 404);
  assert.equal(
    (await call(a, "post", `/messages/${id}/members`).send({ userIds: [d.id] }))
      .status,
    200,
  );
  await call(e, "post", `/messages/${id}/leave`);
  await call(e, "put", `/ideas/${ideaId}/resonance`).send({ resonated: true });
  assert.equal((await call(e, "get", `/messages/${id}`)).status, 404);
  assert.equal(
    await db.conversationParticipant.count({ where: { conversationId: id } }),
    5,
  );
});
test("Later resonators obey invitation privacy and blocks against every active member", async () => {
  const a = await actor(),
    b = await actor(),
    c = await actor(),
    d = await actor();
  const ideaId = (await call(a, "post", "/ideas").send(idea)).body.id;
  await call(b, "put", `/ideas/${ideaId}/resonance`).send({ resonated: true });
  const id = (
    await call(a, "post", `/ideas/${ideaId}/group`).send({ userIds: [b.id] })
  ).body.conversationId;
  await db.profile.update({
    where: { userId: c.id },
    data: { allowRequests: false },
  });
  assert.equal(
    (
      await call(c, "put", `/ideas/${ideaId}/resonance`).send({
        resonated: true,
      })
    ).status,
    200,
  );
  assert.equal((await call(c, "get", `/messages/${id}`)).status, 404);
  assert.equal(
    (await call(a, "post", `/messages/${id}/members`).send({ userIds: [c.id] }))
      .status,
    403,
  );
  await db.profile.update({
    where: { userId: c.id },
    data: { allowRequests: true, profileVisibility: "CONNECTIONS" },
  });
  await call(c, "put", `/ideas/${ideaId}/resonance`).send({ resonated: true });
  assert.equal((await call(c, "get", `/messages/${id}`)).status, 404);
  await db.profile.update({
    where: { userId: c.id },
    data: { profileVisibility: "STUDENTS" },
  });
  await call(c, "put", `/ideas/${ideaId}/resonance`).send({ resonated: true });
  assert.equal((await call(c, "get", `/messages/${id}`)).status, 200);
  await call(d, "post", "/blocks").send({ targetId: b.id });
  assert.equal(
    (
      await call(d, "put", `/ideas/${ideaId}/resonance`).send({
        resonated: true,
      })
    ).status,
    200,
  );
  assert.equal((await call(d, "get", `/messages/${id}`)).status, 404);
  assert.equal(
    (await call(a, "post", `/messages/${id}/members`).send({ userIds: [d.id] }))
      .status,
    403,
  );
  const candidates = await call(
    a,
    "get",
    `/messages/group-candidates?groupId=${id}`,
  );
  assert.equal(candidates.status, 200);
  assert.equal(candidates.body.items.length, 0);
  assert.equal(await db.conversation.count({ where: { ideaId } }), 1);
});

test("Cancellation racing acceptance cannot remove an accepted connection", async () => {
  const a = await actor(),
    b = await actor();
  const pending = await call(a, "post", "/connections").send({
    targetId: b.id,
  });
  const [cancelled, accepted] = await Promise.all([
    call(a, "delete", `/connections/${pending.body.id}`),
    call(b, "patch", `/connections/${pending.body.id}`).send({
      status: "ACCEPTED",
    }),
  ]);
  assert(cancelled.status === 200 || cancelled.status === 409);
  assert(accepted.status === 200 || accepted.status === 404);
  const row = await db.connection.findUnique({
    where: { id: pending.body.id },
    include: { conversation: true },
  });
  if (cancelled.status === 200) {
    assert.equal(row, null);
    assert.equal(accepted.status, 404);
  } else {
    assert.equal(accepted.status, 200);
    assert.equal(row?.status, "ACCEPTED");
    assert(row?.conversation);
  }
});

test("Ideas enforce ownership, unique resonance, notifications and private resonators", async () => {
  const a = await actor(),
    b = await actor();
  let r = await call(a, "post", "/ideas").send({ ...idea, authorId: b.id });
  assert.equal(r.status, 400);
  r = await call(a, "post", "/ideas").send(idea);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = r.body.id;
  assert.equal((await call(b, "put", `/ideas/${id}`).send(idea)).status, 403);
  assert.equal((await call(b, "delete", `/ideas/${id}`)).status, 403);
  assert.equal(
    (await call(a, "put", `/ideas/${id}/resonance`).send({ resonated: true }))
      .status,
    400,
  );
  for (let n = 0; n < 2; n++) {
    r = await call(b, "put", `/ideas/${id}/resonance`).send({
      resonated: true,
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.resonanceCount, 1);
  }
  assert.equal(
    await db.notification.count({
      where: { entityId: id, type: "IDEA_RESONATED" },
    }),
    1,
  );
  assert.equal((await call(b, "get", `/ideas/${id}/resonators`)).status, 403);
  r = await call(a, "get", `/ideas/${id}/resonators`);
  assert.equal(r.body.items[0].id, b.id);
  assert.equal(r.body.items[0].email, undefined);
  await db.profile.update({
    where: { userId: b.id },
    data: { profileVisibility: "CONNECTIONS" },
  });
  assert.equal(
    (await call(a, "get", `/ideas/${id}/resonators`)).body.items.length,
    0,
  );
  r = await call(b, "put", `/ideas/${id}/resonance`).send({ resonated: false });
  assert.equal(r.body.resonanceCount, 0);
});
test("Idea groups reuse chat, deliver live messages, reject outsiders and revoke access on block", async () => {
  const a = await actor(),
    b = await actor(),
    c = await actor(),
    outsider = await actor();
  const id = (await call(a, "post", "/ideas").send(idea)).body.id;
  for (const p of [b, c])
    assert.equal(
      (await call(p, "put", `/ideas/${id}/resonance`).send({ resonated: true }))
        .status,
      200,
    );
  assert.equal(
    (await call(b, "post", `/ideas/${id}/group`).send({ userIds: [c.id] }))
      .status,
    403,
  );
  assert.equal(
    (
      await call(a, "post", `/ideas/${id}/group`).send({
        userIds: [outsider.id],
      })
    ).status,
    400,
  );
  const r = await call(a, "post", `/ideas/${id}/group`).send({
    userIds: [b.id, c.id],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const conversationId = r.body.conversationId;
  assert.equal(
    (
      await call(a, "post", `/ideas/${id}/group`).send({
        userIds: [c.id, b.id],
      })
    ).body.conversationId,
    conversationId,
  );
  assert.equal(
    (await call(outsider, "get", `/messages/${conversationId}`)).status,
    404,
  );
  assert.equal(
    (await call(b, "get", `/messages/${conversationId}`)).body.items[0].system,
    true,
  );
  const sockets = [b, c].map((p) =>
    client(url, {
      transports: ["websocket"],
      extraHeaders: { Origin: process.env.APP_ORIGIN!, Cookie: p.cookie },
    }),
  );
  try {
    await Promise.all(
      sockets.map(
        (s) =>
          new Promise<void>((resolve, reject) => {
            s.once("connect", resolve);
            s.once("connect_error", reject);
          }),
      ),
    );
    const receives = sockets.map(
      (s) =>
        new Promise<{ body: string }>((resolve) => s.once("message", resolve)),
    );
    const payload = {
      conversationId,
      body: "Let’s build the learning prototype.",
      clientId: randomUUID(),
    };
    assert.equal(
      (await call(a, "post", "/messages").send(payload)).status,
      201,
    );
    const delivered = await Promise.race([
      Promise.all(receives),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Live group delivery timed out")),
          5000,
        ),
      ),
    ]);
    assert(delivered.every((m) => m.body === payload.body));
    await call(a, "post", "/messages").send(payload);
    assert.equal(
      await db.message.count({
        where: { conversationId, clientId: payload.clientId },
      }),
      1,
    );
    assert.equal(
      (await call(b, "post", "/blocks").send({ targetId: a.id })).status,
      200,
    );
    assert.equal(
      (await call(b, "get", `/messages/${conversationId}`)).status,
      404,
    );
    assert.equal(
      (
        await call(b, "post", "/messages").send({
          ...payload,
          clientId: randomUUID(),
        })
      ).status,
      404,
    );
    assert.equal((await call(b, "get", `/ideas/${id}`)).status, 404);
    assert.equal(
      (await call(c, "post", `/messages/${conversationId}/leave`)).status,
      200,
    );
    assert.equal(
      (await call(c, "get", `/messages/${conversationId}`)).status,
      404,
    );
  } finally {
    sockets.forEach((s) => s.disconnect());
  }
});
test("Events require approval, enforce ownership and atomic capacity, and support cancelling", async () => {
  const a = await actor(),
    b = await actor(),
    c = await actor(),
    admin = await actor(true);
  const data = {
    title: "Student AI Demo Night",
    organizerName: "Test Builders Club",
    description: "An evening of student projects and thoughtful feedback.",
    category: "Tech Talk",
    startsAt: new Date(Date.now() + 86400000).toISOString(),
    endsAt: new Date(Date.now() + 90000000).toISOString(),
    timeZone: "Asia/Kolkata",
    location: "Test campus auditorium",
    online: false,
    registrationUrl: null,
    capacity: 1,
  };
  assert.equal((await call(a, "post", "/events").send(data)).status, 403);
  const profile = await db.profile.findUniqueOrThrow({
    where: { userId: a.id },
  });
  assert.equal(
    (
      await call(admin, "patch", "/admin/event-publishers").send({
        username: profile.username,
        approved: true,
        reason: "Approved test organizer",
      })
    ).status,
    200,
  );
  const r = await call(a, "post", "/events").send(data);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = r.body.id;
  assert.equal((await call(b, "delete", `/events/${id}`)).status, 403);
  assert.equal(
    (
      await call(a, "put", `/events/${id}`).send({
        ...data,
        endsAt: data.startsAt,
      })
    ).status,
    400,
  );
  const results = await Promise.all(
    [b, c].map((p) =>
      call(p, "put", `/events/${id}/rsvp`).send({ going: true }),
    ),
  );
  assert.deepEqual(results.map((x) => x.status).sort(), [200, 409]);
  const winner = results[0].status === 200 ? b : c;
  assert.equal(
    (await call(winner, "put", `/events/${id}/rsvp`).send({ going: true })).body
      .attendeeCount,
    1,
  );
  await db.profile.update({
    where: { userId: winner.id },
    data: { profileVisibility: "CONNECTIONS" },
  });
  assert.equal(
    (await call(a, "get", `/events/${id}/attendees`)).body.items.length,
    0,
  );
  assert.equal(
    (await call(winner, "put", `/events/${id}/rsvp`).send({ going: false }))
      .body.attendeeCount,
    0,
  );
  assert.equal((await call(a, "delete", `/events/${id}`)).status, 200);
});

test("Event banners validate content and ownership, and hide after blocking", async () => {
  const a = await actor(true),
    b = await actor(true);
  const e = await db.campusEvent.create({
    data: {
      creatorId: a.id,
      title: "Banner upload test",
      description: "Private image validation test event.",
      organizerName: "QA",
      category: "Workshop",
      startsAt: new Date(Date.now() + 86400000),
      endsAt: new Date(Date.now() + 90000000),
      timeZone: "UTC",
      location: "Test hall",
    },
  });
  assert.equal(
    (
      await call(a, "post", `/events/${e.id}/image`).attach(
        "image",
        Buffer.from("<script>bad</script>"),
        { filename: "fake.png", contentType: "image/png" },
      )
    ).status,
    400,
  );
  const buffer = await sharp({
    create: { width: 640, height: 320, channels: 3, background: "#ef7043" },
  })
    .png()
    .toBuffer();
  assert.equal(
    (
      await call(b, "post", `/events/${e.id}/image`).attach("image", buffer, {
        filename: "banner.png",
        contentType: "image/png",
      })
    ).status,
    403,
  );
  const result = await call(a, "post", `/events/${e.id}/image`).attach(
    "image",
    buffer,
    { filename: "banner.png", contentType: "image/png" },
  );
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.imageKey, undefined);
  assert.equal((await call(b, "get", `/events/${e.id}/image`)).status, 200);
  await call(b, "post", "/blocks").send({ targetId: a.id });
  assert.equal((await call(b, "get", `/events/${e.id}/image`)).status, 404);
  assert.equal((await call(a, "delete", `/events/${e.id}/image`)).status, 200);
});
test("Groups reject blocked member pairs and suspended participants lose access", async () => {
  const a = await actor(),
    b = await actor(),
    c = await actor(),
    admin = await actor(true);
  const ideaId = (await call(a, "post", "/ideas").send(idea)).body.id;
  for (const p of [b, c])
    await call(p, "put", `/ideas/${ideaId}/resonance`).send({
      resonated: true,
    });
  await call(b, "post", "/blocks").send({ targetId: c.id });
  assert.equal(
    (
      await call(a, "post", `/ideas/${ideaId}/group`).send({
        userIds: [b.id, c.id],
      })
    ).status,
    403,
  );
  const group = (
    await call(a, "post", `/ideas/${ideaId}/group`).send({ userIds: [b.id] })
  ).body.conversationId;
  assert.equal(
    (
      await call(admin, "patch", `/admin/users/${b.id}`).send({
        status: "SUSPENDED",
        reason: "Testing group suspension",
      })
    ).status,
    200,
  );
  assert.equal((await call(b, "get", `/messages/${group}`)).status, 401);
  assert.equal(
    (
      await call(a, "post", "/messages").send({
        conversationId: group,
        clientId: randomUUID(),
        body: "The remaining member can still send.",
      })
    ).status,
    201,
  );
  const member = await db.conversationParticipant.findUniqueOrThrow({
    where: { conversationId_userId: { conversationId: group, userId: b.id } },
  });
  assert(member.leftAt);
});
