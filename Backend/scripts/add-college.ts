import "../src/config/runtime.js";
import { z } from "zod";
import { db, transaction } from "../src/database.js";
import { initialColleges } from "./initial-colleges.js";

try {
  if (process.argv.includes("--initial")) {
    const results = await transaction(async (tx) => {
      const existing = await tx.college.findMany();
      const normalize = (name: string) => name.trim().toLowerCase();
      const results: { id: string; name: string; action: string }[] = [];
      for (const [name, ...aliases] of initialColleges) {
        const names = [name, ...aliases].map(normalize);
        const match = existing.find((college) =>
          names.includes(normalize(college.name)),
        );
        if (match) {
          results.push({ id: match.id, name: match.name, action: "preserved" });
          continue;
        }
        const college = await tx.college.upsert({
          where: { name },
          create: { name, domains: [] },
          update: {},
        });
        results.push({ id: college.id, name: college.name, action: "added" });
      }
      return results;
    });
    console.log(JSON.stringify(results, null, 2));
    console.log(
      "Initial colleges saved; existing IDs, names, domains and profiles preserved.",
    );
  } else {
    const name = z.string().min(3).max(150).parse(process.env.COLLEGE_NAME);
    const domains = z
      .string()
      .min(3)
      .parse(process.env.COLLEGE_DOMAINS)
      .split(",")
      .map((x) => x.trim().toLowerCase());
    if (domains.some((x) => !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(x)))
      throw new Error(
        "Provide exact verified college email domains, comma separated.",
      );
    await db.college.upsert({
      where: { name },
      create: { name, domains },
      update: { domains },
    });
    console.log("College allowlist saved.");
  }
} finally {
  await db.$disconnect();
}
