import { z } from "zod";
const tags = z.array(z.string().trim().min(1).max(60)).max(12);
export const profileInput = z.object({
  name: z.string().trim().min(2).max(70),
  username: z.string().regex(/^[A-Za-z0-9_]{3,24}$/),
  collegeId: z.string().min(1),
  degree: z.string().trim().min(2).max(80),
  year: z.number().int().min(1).max(8),
  bio: z.string().trim().min(10).max(240),
  about: z.string().max(2000),
  city: z.string().max(80),
  interests: z.array(z.string()).min(3).max(20),
  skills: z.array(z.string()).max(12),
  hobbies: tags,
  goals: tags,
  careerInterests: tags,
  startupInterests: tags,
  socialLinks: z
    .array(
      z
        .string()
        .url()
        .max(300)
        .refine((x) => /^https:\/\//.test(x), "Use an HTTPS link."),
    )
    .max(5),
});
export const settingsInput = z
  .object({
    showCity: z.boolean(),
    showSocialLinks: z.boolean(),
    discoverable: z.boolean(),
    allowRequests: z.boolean(),
    profileVisibility: z.enum(["STUDENTS", "CONNECTIONS"]),
    notifyMessages: z.boolean(),
    notifyConnections: z.boolean(),
  })
  .partial()
  .strict();
