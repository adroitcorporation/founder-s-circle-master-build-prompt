import { z } from "zod";
import { transaction } from "../database.js";
import { conversationAccess, event } from "./policy.js";
import { notify } from "./notifications.js";
import { assert } from "../utils.js";
export const messageInput = z.object({
  conversationId: z.string().min(1).max(80),
  clientId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});
export async function sendMessage(userId: string, input: unknown) {
  const data = messageInput.parse(input);
  return transaction(async (tx) => {
    const other = await conversationAccess(tx, userId, data.conversationId);
    const existing = await tx.message.findUnique({
      where: {
        senderId_clientId: { senderId: userId, clientId: data.clientId },
      },
    });
    if (existing) {
      assert(
        existing.conversationId === data.conversationId &&
          existing.body === data.body,
        409,
        "Message retry does not match the original.",
      );
      return { message: existing, other };
    }
    const recent = await tx.message.count({
      where: {
        senderId: userId,
        createdAt: { gt: new Date(Date.now() - 60_000) },
      },
    });
    assert(
      recent < 30,
      429,
      "You’re sending messages too quickly. Please wait a minute.",
    );
    const message = await tx.message.create({
      data: { ...data, senderId: userId },
    });
    await tx.conversation.update({
      where: { id: data.conversationId },
      data: { updatedAt: new Date() },
    });
    for (const recipient of other)
      await notify(tx, recipient, userId, "MESSAGE", data.conversationId);
    await event(tx, userId, "message_sent");
    return { message, other };
  });
}
