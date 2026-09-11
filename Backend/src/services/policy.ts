import { Tx } from "../database.js";
import { assert, pair } from "../utils.js";
export async function active(tx: Tx, id: string) {
  const user = await tx.user.findUnique({
    where: { id },
    include: { profile: true },
  });
  assert(
    user && user.status === "ACTIVE",
    403,
    "This account is no longer available.",
  );
  return user;
}
export async function allowed(
  tx: Tx,
  a: string,
  b: string,
  requireConnection = false,
) {
  assert(a !== b, 400, "Choose another student.");
  const users = await Promise.all([active(tx, a), active(tx, b)]);
  const blocked = await tx.block.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
  });
  assert(!blocked, 403, "Interaction with this user is unavailable.");
  if (requireConnection) {
    const connection = await tx.connection.findUnique({
      where: { pairKey: pair(a, b) },
    });
    assert(
      connection?.status === "ACCEPTED",
      403,
      "Connect before starting a conversation.",
    );
  }
  return users;
}
export async function conversationAccess(tx: Tx, userId: string, id: string) {
  const conversation = await tx.conversation.findUnique({
    where: { id },
    include: { participants: true },
  });
  assert(
    conversation &&
      conversation.participants.some((p) => p.userId === userId && !p.leftAt),
    404,
    "Conversation not found.",
  );
  await active(tx, userId);
  const others = conversation.participants.filter(
    (p) => p.userId !== userId && !p.leftAt,
  );
  for (const other of others)
    await allowed(tx, userId, other.userId, conversation.kind === "DIRECT");
  return others.map((p) => p.userId);
}
export const event = (tx: Tx, userId: string, name: string) =>
  tx.analyticsEvent.create({ data: { userId, name } });
