import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const backend = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
test("Docker and Render use the migration-gated production command; development stays separate", async () => {
  const docker = await readFile(
    new URL("../../Dockerfile", import.meta.url),
    "utf8",
  );
  const render = await readFile(
    new URL("../../render.yaml", import.meta.url),
    "utf8",
  );
  assert.equal(backend.scripts["db:migrate"], "prisma migrate deploy");
  assert.equal(
    backend.scripts["start:production"],
    "npm run db:migrate && npm start",
  );
  assert.equal(backend.scripts.start, "node dist/src/server.js");
  assert.equal(backend.scripts.dev, "tsx watch src/server.ts");
  assert.match(backend.scripts.build, /^prisma generate && /);
  assert(
    backend.dependencies.prisma,
    "Prisma CLI must survive production pruning",
  );
  assert.match(
    docker,
    /CMD \["npm", "--prefix", "Backend", "run", "start:production"\]/,
  );
  assert.match(docker, /\/app\/Backend\/prisma \.\/Backend\/prisma/);
  assert.match(render, /autoDeployTrigger: commit/);
  assert.match(
    render,
    /dockerCommand: npm --prefix Backend run start:production/,
  );
  assert.match(render, /key: DIRECT_URL\s+sync: false/);
});
for (const migrationExit of [0, 23]) {
  test(`production startup ${migrationExit ? "blocks" : "starts"} the API when migration exit is ${migrationExit}`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "fc-deployment-"));
    try {
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({
          scripts: {
            "start:production": backend.scripts["start:production"],
            "db:migrate": `node -e "process.exit(${migrationExit})"`,
            start: `node -e "require('node:fs').writeFileSync('api-started', 'yes')"`,
          },
        }),
      );
      // Fixed command arguments only; this fixture never invokes Prisma or a DB.
      const result = spawnSync("npm", ["run", "start:production"], {
        cwd: dir,
        shell: process.platform === "win32",
        encoding: "utf8",
        timeout: 20000,
      });
      assert.ifError(result.error);
      assert.equal(result.status, migrationExit, result.stderr);
      if (migrationExit) await assert.rejects(access(join(dir, "api-started")));
      else await access(join(dir, "api-started"));
    } finally {
      assert(dir.startsWith(join(tmpdir(), "fc-deployment-")));
      await rm(dir, { recursive: true, force: true });
    }
  });
}
