import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

// Dedicated local database; never reads or changes the deployment .env.
const pg = new EmbeddedPostgres({
  databaseDir: "work/group-regression-postgres", user: "group_tests", password: "local-group-tests-only",
  port: 55439, persistent: true, authMethod: "scram-sha-256", postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {}, onError: () => {},
});
if (!existsSync("work/group-regression-postgres/PG_VERSION")) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
if (!(await client.query("SELECT 1 FROM pg_database WHERE datname='group_regressions'")).rowCount) await pg.createDatabase("group_regressions");
await client.end();
console.log("Isolated group regression database ready on 127.0.0.1:55439.");
process.on("SIGINT", async () => { await pg.stop(); process.exit(); });
process.on("SIGTERM", async () => { await pg.stop(); process.exit(); });
setInterval(() => {}, 60000);
