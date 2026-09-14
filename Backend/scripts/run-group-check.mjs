import { config } from "dotenv";
import { spawn } from "node:child_process";
config({ path: "Backend/.env", quiet: true });
// Override after dotenv so deployed database/storage/email cannot be used by QA.
const env = { ...process.env, NODE_ENV: "test", APP_ORIGIN: "http://localhost:5173",
  DATABASE_URL: "postgresql://group_tests:local-group-tests-only@127.0.0.1:55439/group_regressions",
  DIRECT_URL: "postgresql://group_tests:local-group-tests-only@127.0.0.1:55439/group_regressions",
  S3_BUCKET: "", RESEND_API_KEY: "", SMTP_HOST: "", UPLOAD_DIR: "work/group-regression-uploads",
};
const child = spawn(process.execPath, process.argv.slice(2), { env, stdio: "inherit" });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
