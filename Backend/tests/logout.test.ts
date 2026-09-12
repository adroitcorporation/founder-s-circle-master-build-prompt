import "../src/config/runtime.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../src/app.js";
import { db } from "../src/database.js";
import { hash } from "../src/utils.js";

test("login and logout revoke only the supplied session and clear revoked cookies", async () => {
  assert.notEqual(process.env.NODE_ENV, "production");
  const app = createApp();
  const email = `logout-${randomUUID()}@example.test`;
  const password = `${randomUUID()}A`;
  const post = (path: string) => request(app).post(`/api/auth/${path}`).set("Origin", process.env.APP_ORIGIN!);
  let userId: string | undefined;
  try {
    const signup = await post("signup").send({ email, password, name: "Logout QA", username: `Qa_${Date.now()}` });
    assert.equal(signup.status, 201);
    userId = (await db.user.findUniqueOrThrow({ where: { email } })).id;
    const signupCookie = signup.headers["set-cookie"][0].split(";")[0];
    const login = await post("login").send({ email, password });
    assert.equal(login.status, 200);
    const cookie = login.headers["set-cookie"][0].split(";")[0];
    assert.equal((await request(app).get("/api/profiles/me").set("Cookie", cookie)).status, 200);
    const logout = await post("logout").set("Cookie", cookie).send({});
    assert.equal(logout.status, 200);
    assert.match(logout.headers["set-cookie"][0], /fc_session=;.*Path=\/;.*Expires=Thu, 01 Jan 1970.*HttpOnly.*SameSite=Lax/);
    assert.equal(await db.userSession.findUnique({ where: { id: hash(cookie.slice("fc_session=".length)) } }), null);
    assert.equal((await request(app).get("/api/profiles/me").set("Cookie", cookie)).status, 401);
    assert.equal((await request(app).get("/api/profiles/me").set("Cookie", signupCookie)).status, 200);
    assert.equal((await post("logout").set("Cookie", cookie).send({})).status, 200);
    assert.equal((await post("logout").send({})).status, 200);
    assert.equal((await request(app).post("/api/auth/logout").set("Origin", "https://example.invalid").set("Cookie", signupCookie).send({})).status, 403);
  } finally {
    if (userId) {
      await db.analyticsEvent.deleteMany({ where: { userId } });
      await db.user.delete({ where: { id: userId } });
    }
    await db.$disconnect();
  }
});
