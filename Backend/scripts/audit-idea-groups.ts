import "../src/config/runtime.js";
import { db } from "../src/database.js";

// Read-only: no names, messages, credentials, or other personal data are printed.
try {
  const groups = await db.conversation.findMany({
    where: { kind: "GROUP" },
    select: {
      id: true,
      ideaId: true,
      createdAt: true,
      idea: { select: { authorId: true } },
      participants: { select: { userId: true, leftAt: true } },
      _count: { select: { participants: true, messages: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const counts = new Map<string, number>();
  for (const g of groups)
    if (g.ideaId) counts.set(g.ideaId, (counts.get(g.ideaId) || 0) + 1);
  const duplicates = [...counts].filter(([, count]) => count > 1);
  console.log(
    JSON.stringify(
      {
        groupCount: groups.length,
        ideaCount: counts.size,
        duplicateIdeaCount: duplicates.length,
        excessGroupCount: duplicates.reduce(
          (sum, [, count]) => sum + count - 1,
          0,
        ),
        duplicates: duplicates.map(([ideaId, count]) => ({ ideaId, count })),
        groupsWithoutIdea: groups.filter((g) => !g.ideaId).length,
        groups: groups.map((g) => ({
          id: g.id,
          ideaId: g.ideaId,
          ...g._count,
          activeMembers: g.participants.filter((p) => !p.leftAt).length,
          authorIsActiveMember: g.participants.some(
            (p) => p.userId === g.idea?.authorId && !p.leftAt,
          ),
        })),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    "Read-only group audit failed:",
    (error as { code?: string }).code || "database unavailable",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
