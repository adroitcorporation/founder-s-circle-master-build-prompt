import { z } from "zod";
export const ideaCategories = [
  "Startup",
  "AI",
  "Fintech",
  "Health",
  "Education",
  "Social Impact",
  "Gaming",
  "Consumer",
  "Research",
  "Other",
] as const;
export const eventCategories = [
  "Hackathon",
  "Gaming",
  "Meetup",
  "Pitch Event",
  "Workshop",
  "Networking",
  "Conference",
  "Tech Talk",
  "Career",
  "Competition",
  "Startup",
  "Other",
] as const;
const tags = z
  .array(z.string().trim().min(1).max(40))
  .max(8)
  .default([])
  .transform((v) => [...new Set(v)]);
export const ideaInput = z
  .object({
    title: z.string().trim().max(120).default(""),
    description: z.string().trim().min(20).max(3000),
    category: z.enum(ideaCategories),
    lookingFor: tags,
    tags,
  })
  .strict();
export const eventInput = z
  .object({
    title: z.string().trim().min(3).max(140),
    organizerName: z.string().trim().min(2).max(120),
    description: z.string().trim().min(20).max(5000),
    category: z.enum(eventCategories),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    timeZone: z
      .string()
      .max(80)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, "Use a valid time zone."),
    location: z.string().trim().min(2).max(200),
    online: z.boolean(),
    registrationUrl: z
      .string()
      .url()
      .max(500)
      .refine((v) => v.startsWith("https://"), "Use an HTTPS link.")
      .nullable()
      .default(null),
    capacity: z.number().int().min(1).max(100000).nullable().default(null),
  })
  .strict()
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    message: "End time must be after start time.",
    path: ["endsAt"],
  });
export const pageInput = z.coerce.number().int().min(0).max(10000).default(0);
