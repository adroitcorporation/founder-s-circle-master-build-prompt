import { db } from "../database.js";
import { removeImage } from "./storage.js";
let running = false;
export async function cleanup() {
  if (running) return;
  running = true;
  try {
    // Unreviewed student documents expire after 30 days. Review outcomes remain.
    const expired = await db.verification.findMany({
      where: {
        privateKey: { not: null },
        OR: [
          { status: { not: "PENDING" } },
          { createdAt: { lt: new Date(Date.now() - 30 * 86400_000) } },
        ],
      },
      take: 50,
    });
    for (const v of expired)
      await db.$transaction(async (tx) => {
        await tx.storageDeletion.upsert({
          where: { key: v.privateKey! },
          create: { key: v.privateKey! },
          update: {},
        });
        await tx.verification.update({
          where: { id: v.id },
          data: {
            privateKey: null,
            ...(v.status === "PENDING" ? { status: "DISMISSED" } : {}),
          },
        });
      });
    for (const job of await db.storageDeletion.findMany({
      orderBy: { createdAt: "asc" },
      take: 50,
    })) {
      try {
        await removeImage(job.key);
        await db.storageDeletion.deleteMany({ where: { key: job.key } });
      } catch {
        await db.storageDeletion.updateMany({
          where: { key: job.key },
          data: { attempts: { increment: 1 } },
        });
        console.error("Storage deletion retry required.");
      }
    }
    await db.userSession.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    await db.authToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  } finally {
    running = false;
  }
}
