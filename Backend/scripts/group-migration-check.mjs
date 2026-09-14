import pg from "pg";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55439");
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
try {
  await client.query(`BEGIN;
    CREATE TEMP TABLE "User" (id text PRIMARY KEY);
    CREATE TEMP TABLE "Idea" (id text PRIMARY KEY, "authorId" text);
    CREATE TEMP TABLE "Conversation" (id text PRIMARY KEY, "ideaId" text, kind text, "groupKey" text UNIQUE, "createdAt" timestamp);
    CREATE TEMP TABLE "Message" (id text PRIMARY KEY, "conversationId" text, "senderId" text, system boolean, "createdAt" timestamp, body text);
    INSERT INTO "User" VALUES ('owner');
    INSERT INTO "Idea" VALUES ('idea', 'owner');
    INSERT INTO "Conversation" VALUES ('older', 'idea', 'GROUP', 'legacy-a', '2026-01-01'), ('newer', 'idea', 'GROUP', 'legacy-b', '2026-01-02'), ('deleted-idea', NULL, 'GROUP', 'legacy-c', '2026-01-03');
    INSERT INTO "Message" VALUES ('context', 'deleted-idea', 'owner', true, '2026-01-03', 'preserve context'), ('history', 'older', 'owner', false, '2026-01-01', 'preserve history');`);
  await client.query(await readFile("Backend/prisma/migrations/20260914120000_group_ownership/migration.sql", "utf8"));
  const { rows } = await client.query('SELECT * FROM "Conversation" ORDER BY id');
  assert.equal(rows.length, 3);
  assert(rows.every((r) => r.ownerId === "owner"));
  assert.equal(rows.find((r) => r.id === "older").groupKey, "idea:idea");
  assert.equal(rows.find((r) => r.id === "newer").groupKey, "legacy-b");
  assert.equal((await client.query('SELECT * FROM "Message"')).rows.length, 2);
  console.log("Migration check passed: duplicate groups and messages preserved; oldest canonical; owners recovered, including deleted idea.");
} finally { await client.query("ROLLBACK"); await client.end(); }
