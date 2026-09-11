import "../src/config/runtime.js";
import { db } from "../src/database.js";
const categories: Record<string, string[]> = {
  Technology: [
    "Artificial Intelligence",
    "Machine Learning",
    "Generative AI",
    "Web Development",
    "App Development",
    "Cybersecurity",
    "Robotics",
    "Blockchain",
  ],
  Business: [
    "Startups",
    "Entrepreneurship",
    "Marketing",
    "Branding",
    "Sales",
    "Venture Capital",
    "Consulting",
    "E-commerce",
  ],
  Creative: [
    "Graphic Design",
    "UI/UX",
    "Video Editing",
    "Photography",
    "Music",
    "Writing",
  ],
  Academics: ["Mathematics", "Physics", "Economics", "Psychology", "Finance"],
  Activities: [
    "Hackathons",
    "Debating",
    "Public Speaking",
    "MUN",
    "Sports",
    "Gaming",
    "Reading",
  ],
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
for (const [category, names] of Object.entries(categories))
  for (const name of names)
    await db.interest.upsert({
      where: { id: slug(name) },
      create: { id: slug(name), name, category },
      update: { name, category },
    });
for (const name of [
  "React",
  "Python",
  "Product Design",
  "Figma",
  "Node.js",
  "Data Analysis",
  "Public Speaking",
  "Copywriting",
  "Java",
  "Illustration",
  "Flutter",
  "Research",
])
  await db.skill.upsert({
    where: { id: slug(name) },
    create: { id: slug(name), name },
    update: {},
  });
await db.$disconnect();
console.log("Interest and skill taxonomy saved; no sample users created.");
