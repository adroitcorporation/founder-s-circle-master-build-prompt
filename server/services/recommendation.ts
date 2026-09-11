import { db } from "../database.js";
import { profileInclude, publicProfile } from "./profiles.js";
import type { FullProfile } from "./profiles.js";
export function relevance(me: FullProfile, candidate: FullProfile) {
  const shared = candidate.interests.filter((i) =>
    me.interests.some((m) => m.interestId === i.interestId),
  );
  const skills = candidate.skills.filter((i) =>
    me.skills.some((m) => m.skillId === i.skillId),
  );
  const goals = candidate.goals.filter((x) => me.goals.includes(x));
  return {
    score:
      shared.length * 10 +
      skills.length * 4 +
      goals.length * 6 +
      (me.city && candidate.showCity && me.city === candidate.city ? 2 : 0) +
      (me.collegeId !== candidate.collegeId ? 3 : 0) +
      (me.year === candidate.year ? 1 : 0),
    explanation: shared.length
      ? `${shared.length} shared interests · ${shared
          .slice(0, 2)
          .map((i) => i.interest.name)
          .join(" & ")}`
      : goals.length
        ? `You’re both looking for ${goals[0].toLowerCase()}`
        : "A new perspective from your student community",
  };
}
export async function recommend(
  userId: string,
  query: {
    q?: string;
    college?: string;
    year?: number;
    interest?: string;
    city?: string;
    goal?: string;
    page: number;
  },
) {
  const me = await db.profile.findUniqueOrThrow({
    where: { userId },
    include: profileInclude,
  });
  const sharedIds = me.interests.map((i) => i.interestId);
  // Rank a bounded, interest-first candidate pool in the service, never the entire user table in the browser.
  const where = {
    completed: true,
    discoverable: true,
    profileVisibility: "STUDENTS",
    userId: { not: userId },
    user: {
      status: "ACTIVE" as const,
      blocks: { none: { blockedId: userId } },
      blockedBy: { none: { blockerId: userId } },
      passedBy: {
        none: {
          userId,
          createdAt: { gt: new Date(Date.now() - 7 * 86400_000) },
        },
      },
      sent: {
        none: {
          recipientId: userId,
          status: { in: ["PENDING", "ACCEPTED"] as ("PENDING" | "ACCEPTED")[] },
        },
      },
      received: {
        none: {
          senderId: userId,
          status: { in: ["PENDING", "ACCEPTED"] as ("PENDING" | "ACCEPTED")[] },
        },
      },
    },
    ...(query.college ? { collegeId: query.college } : {}),
    ...(query.year ? { year: query.year } : {}),
    ...(query.interest
      ? { interests: { some: { interestId: query.interest } } }
      : {}),
    ...(query.city
      ? {
          showCity: true,
          city: { contains: query.city, mode: "insensitive" as const },
        }
      : {}),
    ...(query.goal ? { goals: { has: query.goal } } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" as const } },
            { username: { contains: query.q, mode: "insensitive" as const } },
            {
              college: {
                name: { contains: query.q, mode: "insensitive" as const },
              },
            },
            {
              interests: {
                some: {
                  interest: {
                    name: { contains: query.q, mode: "insensitive" as const },
                  },
                },
              },
            },
            {
              skills: {
                some: {
                  skill: {
                    name: { contains: query.q, mode: "insensitive" as const },
                  },
                },
              },
            },
          ],
        }
      : {}),
  };
  const candidates = await db.profile.findMany({
    where: {
      AND: [where, { interests: { some: { interestId: { in: sharedIds } } } }],
    },
    include: profileInclude,
    take: 200,
    orderBy: [{ user: { lastActiveAt: "desc" } }, { id: "asc" }],
  });
  if (candidates.length < 200)
    candidates.push(
      ...(await db.profile.findMany({
        where: { AND: [where, { id: { notIn: candidates.map((p) => p.id) } }] },
        include: profileInclude,
        take: 200 - candidates.length,
        orderBy: [{ user: { lastActiveAt: "desc" } }, { id: "asc" }],
      })),
    );
  const ranked = candidates
    .map((p) => ({ ...publicProfile(p), ...relevance(me, p) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return {
    items: ranked.slice(query.page * 12, (query.page + 1) * 12),
    hasMore: ranked.length > (query.page + 1) * 12,
  };
}
