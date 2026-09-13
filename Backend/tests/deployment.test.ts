import "../src/config/runtime.js";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { db } from "../src/database.js";

after(async () => {
  await db.$disconnect();
});

test("backend-only routes return JSON without serving frontend files", async () => {
  const app = createApp();
  const root = await request(app).get("/");
  assert.equal(root.status, 200);
  assert.deepEqual(root.body, {
    service: "Founder's Circle API",
    health: "/api/health",
  });
  for (const path of ["/favicon.ico", "/index.html", "/missing-page"]) {
    const response = await request(app).get(path);
    assert.equal(response.status, 404);
    assert.deepEqual(response.body, { error: "Not found." });
  }
});

test("health still executes the read-only database check and protected routes require a session", async () => {
  const app = createApp();
  const health = await request(app).get("/api/health");
  assert.equal(health.status, 200, JSON.stringify(health.body));
  assert.deepEqual(health.body, { ok: true });
  const profile = await request(app).get("/api/profiles/me");
  assert.equal(profile.status, 401);
  assert.deepEqual(profile.body, { error: "Please log in to continue." });
});

test("APP_ORIGIN supports production or local CORS and rejects writes from other origins", async () => {
  const previous = process.env.APP_ORIGIN;
  try {
    for (const origin of [
      "https://adroitcorp.vercel.app",
      "http://localhost:5173",
    ]) {
      process.env.APP_ORIGIN = origin;
      const app = createApp();
      const preflight = await request(app)
        .options("/api/auth/login")
        .set("Origin", origin)
        .set("Access-Control-Request-Method", "POST")
        .set("Access-Control-Request-Headers", "content-type");
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers["access-control-allow-origin"], origin);
      assert.equal(
        preflight.headers["access-control-allow-credentials"],
        "true",
      );
      // Invalid input reaches validation without any database write.
      const allowed = await request(app)
        .post("/api/auth/login")
        .set("Origin", origin)
        .send({});
      assert.equal(allowed.status, 400);
      assert.equal(allowed.headers["access-control-allow-origin"], origin);
      const other = origin.startsWith("https:")
        ? "http://localhost:5173"
        : "https://adroitcorp.vercel.app";
      const denied = await request(app)
        .post("/api/auth/login")
        .set("Origin", other)
        .send({});
      assert.equal(denied.status, 403);
      assert.deepEqual(denied.body, {
        error: "Request origin is not allowed.",
      });
      assert.notEqual(denied.headers["access-control-allow-origin"], other);
      assert.notEqual(denied.headers["access-control-allow-origin"], "*");
    }
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
});
