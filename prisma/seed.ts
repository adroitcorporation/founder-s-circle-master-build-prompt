import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { db } from "../server/database.js";
import { pair } from "../server/utils.js";
import { saveImage } from "../server/services/storage.js";
if (process.env.NODE_ENV === "production")
  throw new Error("Sample data must never be seeded in production.");
if (!process.env.SEED_PASSWORD || process.env.SEED_PASSWORD.length < 12)
  throw new Error(
    "Set SEED_PASSWORD to a development-only password of at least 12 characters.",
  );
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
const skills = [
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
];
for (const name of skills)
  await db.skill.upsert({
    where: { id: slug(name) },
    create: { id: slug(name), name },
    update: {},
  });
const colleges = [
  ["demo-lnmiit", "LNMIIT · Test campus", "lnmiit.ac.in"],
  ["demo-iitd", "IIT Delhi · Test campus", "iitd.ac.in"],
  ["demo-bits", "BITS Pilani · Test campus", "pilani.bits-pilani.ac.in"],
  ["demo-du", "Delhi University · Test campus", "du.ac.in"],
  ["demo-manipal", "Manipal · Test campus", "manipal.edu"],
];
for (const [id, name, domain] of colleges)
  await db.college.upsert({
    where: { id },
    create: { id, name, domains: [domain] },
    update: {},
  });
const names = [
  "Alex",
  "Sam",
  "Jordan",
  "Casey",
  "Riley",
  "Taylor",
  "Morgan",
  "Jamie",
  "Avery",
  "Robin",
  "Ash",
  "Drew",
  "Blair",
  "Reese",
  "Quinn",
  "Sky",
  "Charlie",
  "River",
  "Sage",
  "Emery",
  "Finley",
  "Rowan",
  "Cameron",
  "Dakota",
  "Ellis",
  "Harper",
  "Jules",
  "Kai",
  "Lane",
  "Parker",
];
const bios = [
  "Building useful things with code. Looking for curious people to try ambitious ideas with.",
  "Designing simple experiences for complicated problems. Always up for a thoughtful project.",
  "Exploring how AI can make learning more accessible. Let’s build something that matters.",
  "Hackathons, late-night brainstorming, and a very long reading list. Say hello!",
  "Curious about the intersection of business and creativity. Learning by making things.",
];
const sets = [
  ["Artificial Intelligence", "Startups", "Web Development", "Hackathons"],
  ["UI/UX", "Graphic Design", "Startups", "Photography"],
  [
    "Artificial Intelligence",
    "Machine Learning",
    "Generative AI",
    "Hackathons",
  ],
  ["Web Development", "Hackathons", "Reading", "Startups"],
  ["Marketing", "Branding", "Entrepreneurship", "Writing"],
];
const passwordHash = await bcrypt.hash(process.env.SEED_PASSWORD, 12);
for (let i = 0; i < 30; i++) {
  const id = `demo-student-${i + 1}`;
  if (await db.user.findUnique({ where: { id } })) continue;
  const palette = ["#78452b", "#51496b", "#366257", "#825041", "#3d5774"];
  const buffer = await sharp(
    Buffer.from(
      `<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg"><rect width="256" height="256" fill="${palette[i % 5]}"/><text x="128" y="153" font-family="Arial" text-anchor="middle" font-size="85" fill="#f2dac9">${names[i][0]}T</text></svg>`,
    ),
  )
    .png()
    .toBuffer();
  const photoKey = await saveImage(
    { buffer, size: buffer.length } as Express.Multer.File,
    "photo",
  );
  await db.user.create({
    data: {
      id,
      email: `${i === 0 ? "student" : `student${i + 1}`}@example.test`,
      passwordHash,
      verified: true,
      profile: {
        create: {
          name: `${names[i]} Test`,
          username: `test_${names[i].toLowerCase()}`,
          collegeId: colleges[i % 5][0],
          degree:
            i % 5 === 1
              ? "B.Des, Communication Design"
              : "B.Tech, Computer Science",
          year: 1 + (i % 4),
          bio: bios[i % 5],
          about:
            "This is an explicitly fictional student for development and testing.",
          city: ["Jaipur", "Delhi", "Pilani", "Delhi", "Manipal"][i % 5],
          showCity: true,
          completed: true,
          photoKey,
          hobbies: ["Reading", "Photography"],
          goals:
            i % 2
              ? ["Project partners", "New friends"]
              : ["Hackathon teammates", "Startup collaborators"],
          interests: {
            create: sets[i % 5].map((s) => ({ interestId: slug(s) })),
          },
          skills: {
            create: [
              skills[i % skills.length],
              skills[(i + 1) % skills.length],
            ].map((s) => ({ skillId: slug(s) })),
          },
        },
      },
    },
  });
}
for (const [a, b, status] of [
  ["demo-student-1", "demo-student-2", "ACCEPTED"],
  ["demo-student-1", "demo-student-3", "ACCEPTED"],
  ["demo-student-4", "demo-student-1", "PENDING"],
  ["demo-student-5", "demo-student-1", "PENDING"],
  ["demo-student-1", "demo-student-6", "PENDING"],
] as const) {
  const c = await db.connection.upsert({
    where: { pairKey: pair(a, b) },
    create: { pairKey: pair(a, b), senderId: a, recipientId: b, status },
    update: {},
  });
  if (status === "ACCEPTED") {
    const conversation = await db.conversation.upsert({
      where: { connectionId: c.id },
      create: {
        connectionId: c.id,
        participants: { create: [{ userId: a }, { userId: b }] },
      },
      update: {},
    });
    if (
      !(await db.message.count({ where: { conversationId: conversation.id } }))
    ) {
      await db.message.create({
        data: {
          conversationId: conversation.id,
          senderId: b,
          clientId: randomUUID(),
          body: "Hey Alex! Great to meet someone interested in building useful things. What are you working on?",
        },
      });
      await db.message.create({
        data: {
          conversationId: conversation.id,
          senderId: a,
          clientId: randomUUID(),
          body: "Hey! I’m exploring a project for our next hackathon. Would love to hear your ideas.",
        },
      });
    }
  }
}
await db.user.upsert({
  where: { email: "admin@example.test" },
  create: {
    email: "admin@example.test",
    passwordHash,
    role: "ADMIN",
    verified: true,
    profile: {
      create: {
        name: "Moderator Test",
        username: "test_moderator",
        collegeId: colleges[0][0],
        degree: "Administration",
        bio: "Development moderation account.",
        completed: true,
        discoverable: false,
      },
    },
  },
  update: {},
});
console.log(
  "Seeded 30 fictional students, five test campuses, connections and messages. Login: student@example.test or admin@example.test; password is SEED_PASSWORD in your local .env.",
);
await db.$disconnect();
