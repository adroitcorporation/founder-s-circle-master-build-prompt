import "dotenv/config";
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { createSockets } from "./sockets.js";
import { db } from "./database.js";
import { cleanup } from "./services/retention.js";
if (!process.env.DATABASE_URL || !process.env.APP_ORIGIN)
  throw new Error("DATABASE_URL and APP_ORIGIN are required.");
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.APP_ORIGIN.startsWith("https://") ||
    (!process.env.SMTP_HOST && !process.env.RESEND_API_KEY) ||
    !process.env.S3_BUCKET)
)
  throw new Error(
    "Production requires HTTPS APP_ORIGIN, SMTP or Resend, and private S3-compatible storage.",
  );
const app = createApp();
const server = createServer(app);
const io = createSockets(server);
app.set("io", io);
const cleanupTimer = setInterval(() => {
  void cleanup().catch(() =>
    console.error("Retention job failed; it will retry."),
  );
}, 60_000);
server.listen(Number(process.env.PORT ?? 3001), "0.0.0.0", () =>
  console.log(
    `Founder’s Circle API ready at http://localhost:${process.env.PORT ?? 3001}`,
  ),
);
async function stop() {
  clearInterval(cleanupTimer);
  io.close();
  server.close();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
