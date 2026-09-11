import "../src/config/runtime.js";
import { db } from "../src/database.js";
if (process.env.NODE_ENV === "production")
  throw new Error("Demo seed is development-only.");
try {
  const author = await db.user.findUnique({ where: { id: "demo-student-1" } });
  if (!author) throw new Error("Run the main development seed first.");
  await db.user.update({
    where: { id: author.id },
    data: { canPostEvents: true },
  });
  const ideas = [
    [
      "Campus credit, built on effort",
      "Micro-lending where your college track record — projects, internships and academic progress — helps you build a financial identity.",
      "Fintech",
    ],
    [
      "A learning path that gets you",
      "AI personalized learning paths that adapt to what you understand, with student mentors when you get stuck.",
      "AI",
    ],
    [
      "Health signals, without the disruption",
      "A non-invasive wearable that helps students understand their daily health patterns without interrupting campus life.",
      "Health",
    ],
    [
      "A marketplace across campuses",
      "Buy, sell and lend textbooks, equipment and everyday essentials with verified students at nearby colleges.",
      "Consumer",
    ],
    [
      "Find your founding team",
      "Help student founders meet complementary builders around a shared problem and a small first project.",
      "Startup",
    ],
  ];
  for (const [i, entry] of ideas.entries()) {
    const [title, description, category] = entry;
    const ideaId = `demo-idea-${i + 1}`;
    await db.idea.upsert({
      where: { id: ideaId },
      update: {},
      create: {
        id: ideaId,
        authorId: `demo-student-${i + 1}`,
        title,
        description,
        category,
        tags: ["campus", "students"],
        lookingFor: ["Product design", "Development"],
      },
    });
    for (const userId of ["demo-student-7", "demo-student-8"])
      await db.ideaResonance.upsert({
        where: { ideaId_userId: { ideaId, userId } },
        update: {},
        create: { ideaId, userId },
      });
  }
  const events = [
    ["Campus Build Weekend", "Hackathon"],
    ["Meet Your Fellow Founders", "Networking"],
    ["AI Demo Night", "Tech Talk"],
    ["Campus Gaming Tournament", "Gaming"],
    ["From Problem to Prototype", "Workshop"],
  ];
  for (const [i, [title, category]] of events.entries()) {
    const start = new Date(Date.now() + (i + 3) * 86400000);
    start.setUTCHours(12, 30, 0, 0);
    await db.campusEvent.upsert({
      where: { id: `demo-event-${i + 1}` },
      update: {},
      create: {
        id: `demo-event-${i + 1}`,
        creatorId: author.id,
        title,
        category,
        organizerName: "Demo Student Builders Club",
        description:
          "Development demo event: meet fellow students, exchange ideas and work on something together. This is a fictional listing for testing.",
        startsAt: start,
        endsAt: new Date(+start + 3 * 3600000),
        timeZone: "Asia/Kolkata",
        location: "Demo campus innovation centre, Jaipur",
        online: false,
        capacity: 50,
      },
    });
  }
  console.log(
    "Added 5 demo ideas and 5 demo events without replacing existing records.",
  );
} finally {
  await db.$disconnect();
}
