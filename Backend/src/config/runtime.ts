import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// Source: Backend/src/config; compiled: Backend/dist/src/config.
const candidate = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const backendRoot = existsSync(resolve(candidate, "package.json"))
  ? candidate
  : resolve(candidate, "..");
config({ path: resolve(backendRoot, ".env"), quiet: true });
// Keep existing database, upload, mail and QA directories in the repository root.
process.chdir(resolve(backendRoot, ".."));
