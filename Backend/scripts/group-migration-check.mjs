import pg from "pg";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55439");
const sql = await readFile(
  "Backend/prisma/migrations/20260914120000_group_ownership/migration.sql",
  "utf8",
);
async function check(injectFailure = false) {
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    // Session-local tables shadow real tables and disappear on disconnect.
    await client.query(`
      CREATE TEMP TABLE "User" (id text PRIMARY KEY);
      CREATE TEMP TABLE "Idea" (id text PRIMARY KEY, "authorId" text REFERENCES "User"(id));
      CREATE TEMP TABLE "Conversation" (id text PRIMARY KEY, "ideaId" text REFERENCES "Idea"(id), kind text, "groupKey" text UNIQUE, "createdAt" timestamp, name text,
        CHECK ((kind = 'GROUP' AND "groupKey" IS NOT NULL AND name IS NOT NULL) OR (kind = 'DIRECT' AND "groupKey" IS NULL)));
      CREATE TEMP TABLE "Message" (id text PRIMARY KEY, "conversationId" text REFERENCES "Conversation"(id), "senderId" text REFERENCES "User"(id), system boolean, "createdAt" timestamp, body text);
      CREATE TEMP TABLE "ConversationParticipant" ("conversationId" text REFERENCES "Conversation"(id), "userId" text REFERENCES "User"(id), "leftAt" timestamp, PRIMARY KEY ("conversationId", "userId"));
      INSERT INTO "User" VALUES ('owner'), ('member');
      INSERT INTO "Idea" VALUES ('idea', 'owner'), ('existing', 'owner'), ('clash', 'owner');
      INSERT INTO "Conversation" VALUES
        ('older', 'idea', 'GROUP', 'legacy-a', '2026-01-01', 'Older'),
        ('newer', 'idea', 'GROUP', 'legacy-b', '2026-01-02', 'Newer'),
        ('existing-old', 'existing', 'GROUP', 'legacy-existing', '2026-01-01', 'Existing old'),
        ('existing-canonical', 'existing', 'GROUP', 'idea:existing', '2026-01-02', 'Existing canonical'),
        ('clash-group', 'clash', 'GROUP', 'legacy-clash', '2026-01-01', 'Clash'),
        ('deleted-idea', NULL, 'GROUP', 'idea:clash', '2026-01-03', 'Deleted idea'),
        ('unknown-owner', NULL, 'GROUP', 'legacy:deleted-idea', '2026-01-03', 'Unknown owner'),
        ('direct', NULL, 'DIRECT', NULL, '2026-01-03', NULL);
      INSERT INTO "Message" VALUES
        ('context', 'deleted-idea', 'owner', true, '2026-01-03', 'preserve context'),
        ('history', 'older', 'member', false, '2026-01-01', 'preserve history');
      INSERT INTO "ConversationParticipant" VALUES ('older', 'owner', NULL), ('older', 'member', '2026-01-02'), ('newer', 'member', NULL);
    `);
    const messages = (await client.query('SELECT * FROM "Message" ORDER BY id'))
      .rows;
    const memberships = (
      await client.query(
        'SELECT * FROM "ConversationParticipant" ORDER BY "conversationId", "userId"',
      )
    ).rows;
    const before = (
      await client.query('SELECT * FROM "Conversation" ORDER BY id')
    ).rows;
    if (injectFailure) {
      await assert.rejects(
        client.query(sql.replace("COMMIT;", "SELECT 1 / 0;\nCOMMIT;")),
        { code: "22012" },
      );
      await client.query("ROLLBACK");
      assert.deepEqual(
        (await client.query('SELECT * FROM "Conversation" ORDER BY id')).rows,
        before,
      );
      console.log(
        "Migration failure check passed: schema, keys, and ownership roll back atomically.",
      );
    } else {
      await client.query(sql);
      const rows = (
        await client.query('SELECT * FROM "Conversation" ORDER BY id')
      ).rows;
      assert.equal(rows.length, before.length);
      const group = (id) => rows.find((r) => r.id === id);
      assert.equal(group("older").groupKey, "idea:idea");
      assert.equal(group("newer").groupKey, "legacy-b");
      assert.equal(group("existing-canonical").groupKey, "idea:existing");
      assert.equal(group("existing-old").groupKey, "legacy-existing");
      assert.equal(group("clash-group").groupKey, "idea:clash");
      assert.equal(
        group("deleted-idea").groupKey,
        "legacy:deleted-idea:legacy",
      );
      assert.equal(group("deleted-idea").ownerId, "owner");
      assert.equal(group("unknown-owner").ownerId, null);
      assert.equal(group("direct").ownerId, null);
      assert(rows.filter((r) => r.ideaId).every((r) => r.ownerId === "owner"));
      assert.deepEqual(
        rows.map(({ ownerId, groupKey, ...r }) => r),
        before.map(({ groupKey, ...r }) => r),
      );
      await assert.rejects(
        client.query(
          `UPDATE "Conversation" SET "ownerId"='nonexistent' WHERE id='older'`,
        ),
        { code: "23503" },
      );
      await assert.rejects(
        client.query(
          `UPDATE "Conversation" SET "groupKey"='idea:idea' WHERE id='newer'`,
        ),
        { code: "23505" },
      );
      await assert.rejects(
        client.query(
          `UPDATE "Conversation" SET "groupKey"=NULL WHERE id='newer'`,
        ),
        { code: "23514" },
      );
      console.log(
        "Migration preservation check passed: duplicates, existing canonical, key collisions, NULL ownership, deleted ideas, FK/unique/check constraints.",
      );
    }
    assert.deepEqual(
      (await client.query('SELECT * FROM "Message" ORDER BY id')).rows,
      messages,
    );
    assert.deepEqual(
      (
        await client.query(
          'SELECT * FROM "ConversationParticipant" ORDER BY "conversationId", "userId"',
        )
      ).rows,
      memberships,
    );
  } finally {
    await client.end();
  }
}
await check();
await check(true);
