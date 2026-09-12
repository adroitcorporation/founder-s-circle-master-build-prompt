import "../src/config/runtime.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { profileInput } from "../src/validators/profile.js";
import { createApp } from "../src/app.js";

test("profile usernames accept both cases at 3 and 24 characters without rewriting", () => {
  for (const username of ["Ab1", "_A1", "A".repeat(24), "Mixed_Case123"])
    assert.equal(profileInput.shape.username.parse(username), username);
  for (const username of [
    "",
    "Ab",
    "A".repeat(25),
    "a b",
    "ab@",
    "ab#",
    "a-b",
    "a.b",
    "abc\n",
    "ébc",
  ])
    assert.equal(
      profileInput.shape.username.safeParse(username).success,
      false,
    );
});

test("signup rejects invalid usernames before attempting database writes", async () => {
  const app = createApp();
  for (const username of [
    "Ab",
    "A".repeat(25),
    "a b",
    "ab@",
    "ab#",
    "a-b",
    "a.b",
    "abc\n",
    "ébc",
  ]) {
    const response = await request(app)
      .post("/api/auth/signup")
      .set("Origin", process.env.APP_ORIGIN!)
      .send({
        name: "Username Check",
        email: "username-check@example.test",
        password: "Username-check-password",
        username,
      });
    assert.equal(response.status, 400);
    assert.match(response.body.error, /username/);
  }
});
