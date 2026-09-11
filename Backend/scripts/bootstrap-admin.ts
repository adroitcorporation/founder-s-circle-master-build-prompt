import "../src/config/runtime.js";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../src/database.js";
const email = z
  .string()
  .email()
  .transform((x) => x.toLowerCase())
  .parse(process.env.ADMIN_EMAIL);
const password = z.string().min(16).max(72).parse(process.env.ADMIN_PASSWORD);
const existing = await db.user.findUnique({ where: { email } });
if (existing)
  throw new Error(
    "Account already exists. Promote an existing user through an audited database operation instead.",
  );
await db.user.create({
  data: {
    email,
    passwordHash: await bcrypt.hash(password, 12),
    role: "ADMIN",
    profile: {
      create: {
        name: "Student moderator",
        username: `mod_${Date.now()}`,
        completed: true,
        discoverable: false,
      },
    },
  },
});
console.log(
  "Administrator created. Remove ADMIN_PASSWORD from the environment.",
);
await db.$disconnect();
