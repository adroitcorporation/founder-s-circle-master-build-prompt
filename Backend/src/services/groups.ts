import { z } from "zod";
import type { Tx } from "../database.js";
import { active, allowed } from "./policy.js";
import { visibleProfile } from "./community.js";
import { notify } from "./notifications.js";
import { assert, ApiError } from "../utils.js";

export const groupInput = z
  .object({
    userIds: z.array(z.string().min(1).max(80)).min(1).max(19),
    name: z.string().trim().min(2).max(160).optional(),
  })
  .strict();

export async function groupOwner(tx: Tx, userId: string, id: string) {
  await active(tx, userId);
  const group = await tx.conversation.findUnique({
    where: { id },
    include: { participants: true },
  });
  assert(
    group?.kind === "GROUP" &&
      group.participants.some((p) => p.userId === userId && !p.leftAt),
    404,
    "Group not found.",
  );
  assert(
    group.ownerId === userId,
    403,
    "Only the group creator can manage members.",
  );
  return group;
}

export async function groupCreator(tx: Tx, userId: string) {
  const owner = await active(tx, userId);
  assert(
    owner.verified && owner.profile?.completed,
    403,
    "Complete your profile and verify your student status before creating a group.",
  );
}

export async function eligibleMember(
  tx: Tx,
  ownerId: string,
  userId: string,
  ideaId: string | null,
  memberIds: string[],
) {
  const [, user] = await allowed(tx, ownerId, userId, !ideaId);
  assert(
    user.verified && user.profile?.completed && user.profile.allowRequests,
    403,
    "A selected student is not available for group invitations.",
  );
  await visibleProfile(tx, ownerId, userId);
  if (ideaId)
    assert(
      await tx.ideaResonance.findUnique({
        where: { ideaId_userId: { ideaId, userId } },
      }),
      400,
      "Select students who currently resonate with this idea.",
    );
  for (const memberId of memberIds)
    if (memberId !== userId && memberId !== ownerId)
      await allowed(tx, userId, memberId);
}

export async function addGroupMembers(
  tx: Tx,
  ownerId: string,
  id: string,
  userIds: string[],
  automatic = false,
) {
  const group = await groupOwner(tx, ownerId, id);
  const activeIds = group.participants
    .filter((p) => !p.leftAt)
    .map((p) => p.userId);
  for (const userId of [...new Set(userIds)]) {
    const membership = group.participants.find((p) => p.userId === userId);
    if (membership && (!membership.leftAt || automatic)) continue;
    assert(activeIds.length < 20, 409, "Groups can have up to 20 members.");
    await eligibleMember(tx, ownerId, userId, group.ideaId, activeIds);
    await tx.conversationParticipant.upsert({
      where: { conversationId_userId: { conversationId: id, userId } },
      create: { conversationId: id, userId },
      update: { leftAt: null, lastReadAt: new Date() },
    });
    activeIds.push(userId);
    await notify(tx, userId, ownerId, "IDEA_GROUP_INVITE", id);
  }
  await tx.conversation.update({
    where: { id },
    data: { updatedAt: new Date() },
  });
  return activeIds;
}

// Called only inside the existing retrying Serializable transaction. The unique
// idea-only groupKey protects simultaneous creators regardless of member selection.
export async function ideaGroup(
  tx: Tx,
  ownerId: string,
  idea: { id: string; title: string; description: string },
  input: z.infer<typeof groupInput>,
) {
  await groupCreator(tx, ownerId);
  const groupKey = `idea:${idea.id}`;
  const existing = await tx.conversation.findUnique({ where: { groupKey } });
  if (existing)
    return {
      id: existing.id,
      ids: await addGroupMembers(tx, ownerId, existing.id, input.userIds),
    };
  const ids = [...new Set(input.userIds)];
  assert(!ids.includes(ownerId), 400, "The creator is included automatically.");
  for (const id of ids) await eligibleMember(tx, ownerId, id, idea.id, ids);
  const group = await tx.conversation.create({
    data: {
      kind: "GROUP",
      ownerId,
      ideaId: idea.id,
      groupKey,
      name: input.name || `${idea.title || "Untitled idea"} — Builders`,
      participants: { create: [ownerId, ...ids].map((userId) => ({ userId })) },
      messages: {
        create: {
          senderId: ownerId,
          clientId: crypto.randomUUID(),
          system: true,
          body: `This group was created from the IdeaBoard idea:\n${idea.title ? idea.title + "\n" : ""}${idea.description}`,
        },
      },
    },
  });
  for (const id of ids)
    await notify(tx, id, ownerId, "IDEA_GROUP_INVITE", group.id);
  await notify(tx, ownerId, ownerId, "IDEA_GROUP_CREATED", group.id);
  return { id: group.id, ids: [ownerId, ...ids] };
}

export async function joinExistingIdeaGroup(
  tx: Tx,
  ideaId: string,
  userId: string,
) {
  const group = await tx.conversation.findUnique({
    where: { groupKey: `idea:${ideaId}` },
    include: { participants: true },
  });
  if (!group?.ownerId || group.participants.some((p) => p.userId === userId))
    return [];
  // Ineligible resonance is still valid; it must not break privacy or undo a leave.
  try {
    await groupOwner(tx, group.ownerId, group.id);
    const ids = group.participants
      .filter((p) => !p.leftAt)
      .map((p) => p.userId);
    if (ids.length >= 20) return [];
    await eligibleMember(tx, group.ownerId, userId, ideaId, ids);
  } catch (error) {
    if (error instanceof ApiError) return [];
    throw error;
  }
  return addGroupMembers(tx, group.ownerId, group.id, [userId], true);
}
