import "../src/config/runtime.js";
import { z } from "zod";
import { db } from "../src/database.js";
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
await db.$disconnect();
