import { randomUUID } from "node:crypto";
import { db } from "../src/database.js";

// Fresh databases need test-owned reference rows, not imported demo accounts.
export function catalogFixture() {
  const prefix = `qa_${randomUUID()}`;
  const collegeId = `${prefix}_college`;
  const otherCollegeId = `${prefix}_other_college`;
  const interestIds = ["ai", "startups", "hackathons"].map(
    (id) => `${prefix}_${id}`,
  );
  return {
    collegeId,
    otherCollegeId,
    interestIds,
    async create() {
      await db.$transaction([
        db.college.createMany({
          data: [
            {
              id: collegeId,
              name: `${prefix} college`,
              domains: ["lnmiit.ac.in"],
            },
            {
              id: otherCollegeId,
              name: `${prefix} other college`,
              domains: ["example.test"],
            },
          ],
        }),
        db.interest.createMany({
          data: interestIds.map((id) => ({ id, name: id, category: "QA" })),
        }),
      ]);
    },
    async remove() {
      await db.interest.deleteMany({ where: { id: { in: interestIds } } });
      await db.college.deleteMany({
        where: { id: { in: [collegeId, otherCollegeId] } },
      });
    },
  };
}
