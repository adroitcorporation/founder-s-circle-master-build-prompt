import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("deployed auth, profiles, uploads and realtime retain their backend paths", async () => {
  const config = JSON.parse(
    await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  );
  for (const path of [
    "/api/auth/login",
    "/api/auth/signup",
    "/api/profiles/me",
    "/api/uploads/photo",
    "/socket.io/",
  ]) {
    const route = config.rewrites.find(({ source }) =>
      path.startsWith(source.replace(":path*", "")),
    );
    assert.ok(route, `Missing backend route for ${path}`);
    const prefix = route.source.replace(":path*", "");
    assert.equal(
      route.destination.replace(":path*", path.slice(prefix.length)),
      `https://havocbackend.onrender.com${path}`,
    );
  }
});
