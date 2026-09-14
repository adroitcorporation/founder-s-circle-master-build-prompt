import pg from "pg";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Use run-group-check.mjs. Never use deployment credentials for this check.
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55439");
const name = `fc_migration_check_${Date.now()}`;
const admin = new pg.Client({ connectionString: url.toString() });
await admin.connect();
try { await admin.query(`CREATE DATABASE "${name}"`); }
finally { await admin.end(); }
url.pathname = `/${name}`;
const cli = fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url));
for (let run = 0; run < 2; run++) {
  const result = spawnSync(process.execPath, [cli, "migrate", "deploy", "--schema", "Backend/prisma/schema.prisma"], {
    env: { ...process.env, DATABASE_URL: url.toString(), DIRECT_URL: url.toString() }, encoding: "utf8", timeout: 60000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  if (run === 1) assert.match(result.stdout, /No pending migrations/);
}
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
try {
  assert.equal((await client.query(`SELECT * FROM "_prisma_migrations" WHERE migration_name='20260914120000_group_ownership' AND finished_at IS NOT NULL`)).rowCount, 1);
  assert.equal((await client.query(`SELECT * FROM information_schema.columns WHERE table_name='Conversation' AND column_name='ownerId' AND is_nullable='YES'`)).rowCount, 1);
  assert.equal((await client.query(`SELECT * FROM pg_constraint WHERE conname='Conversation_ownerId_fkey'`)).rowCount, 1);
  const security = (await client.query(`SELECT relrowsecurity FROM pg_class WHERE oid='public."Conversation"'::regclass`)).rows[0];
  assert.equal(security.relrowsecurity, true);
  console.log(`Fresh local migration deployment passed; second deployment was a no-op; ownership FK and RLS intact. Test database retained: ${name}`);
} finally { await client.end(); }
