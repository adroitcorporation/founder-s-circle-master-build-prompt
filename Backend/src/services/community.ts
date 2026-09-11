import { Prisma } from "@prisma/client";
import type { Tx } from "../database.js";
import { active } from "./policy.js";
import { profileInclude, publicProfile } from "./profiles.js";
import { assert, pair } from "../utils.js";

// The same visibility used by profiles: never project private fields into lists.
export function visibleUser(viewerId: string): Prisma.UserWhereInput {
  return {
    status: "ACTIVE",
    blocks: { none: { blockedId: viewerId } },
    blockedBy: { none: { blockerId: viewerId } },
    OR: [
      { id: viewerId },
      { profile: { completed: true, profileVisibility: "STUDENTS" } },
      {
        AND: [
          { profile: { completed: true, profileVisibility: "CONNECTIONS" } },
          {
            OR: [
              { sent: { some: { recipientId: viewerId, status: "ACCEPTED" } } },
              {
                received: { some: { senderId: viewerId, status: "ACCEPTED" } },
              },
            ],
          },
        ],
      },
    ],
  };
}
export async function visibleProfile(tx: Tx, viewerId: string, userId: string) {
  const user = await tx.user.findFirst({
    where: { AND: [{ id: userId }, visibleUser(viewerId)] },
    include: { profile: { include: profileInclude } },
  });
  assert(user?.profile, 404, "This profile is not available.");
  return publicProfile(user.profile);
}
export async function connectionAction(
  tx: Tx,
  viewerId: string,
  userId: string,
) {
  const c = await tx.connection.findUnique({
    where: { pairKey: pair(viewerId, userId) },
    include: { conversation: true },
  });
  return {
    connectionStatus: c?.status ?? null,
    conversationId: c?.status === "ACCEPTED" ? c.conversation?.id : null,
  };
}
export async function eventPublisher(tx: Tx, userId: string) {
  const u = await active(tx, userId);
  assert(
    u.role === "ADMIN" || u.canPostEvents,
    403,
    "Event posting is available to approved organizers. Contact a moderator for access.",
  );
  return u;
}
