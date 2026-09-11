import type { Tx } from "../database.js";
export async function notify(
  tx: Tx,
  recipientId: string,
  actorId: string,
  type: string,
  entityId: string,
) {
  const p = await tx.profile.findUnique({ where: { userId: recipientId } });
  if (type === "MESSAGE" ? !p?.notifyMessages : !p?.notifyConnections) return;
  await tx.notification.create({
    data: { recipientId, actorId, type, entityId },
  });
}
