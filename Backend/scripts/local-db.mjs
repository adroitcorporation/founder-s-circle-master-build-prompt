import "../src/config/runtime.ts";
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

const url = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(url.hostname))
  throw new Error("Embedded database is local-only.");
const pg = new EmbeddedPostgres({
  databaseDir: "work/postgres",
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port: Number(url.port || 5432),
  persistent: true,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
if (!existsSync("work/postgres/PG_VERSION")) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
const dbName = url.pathname.slice(1);
if (!/^[a-z_]+$/.test(dbName))
  throw new Error("Use a lowercase database name.");
if (
  !(await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [dbName]))
    .rowCount
)
  await pg.createDatabase(dbName);
await client.end();
console.log("Local PostgreSQL ready. Keep this process running.");
process.on("SIGINT", async () => {
  await pg.stop();
  process.exit();
});
process.on("SIGTERM", async () => {
  await pg.stop();
  process.exit();
});
setInterval(() => {}, 60_000);
