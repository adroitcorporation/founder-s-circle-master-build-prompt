import "../src/config/runtime.js";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { Prisma } from "@prisma/client";
import { db } from "../src/database.js";
import { createApp } from "../src/app.js";

after(async () => {
  await db.$disconnect();
});

test("connection list does not select missing Conversation.ownerId and preserves request/chat fields", async (t) => {
  // Model the pre-ownership database: selecting all conversation columns fails.
  // No database calls or persistent sessions are made by this test.
  const originalSession = db.userSession.findUnique;
  const originalConnections = db.connection.findMany;
  t.after(() => {
    db.userSession.findUnique = originalSession;
    db.connection.findMany = originalConnections;
  });
  db.userSession.findUnique = (async () => ({
    id: "session",
    expiresAt: new Date(Date.now() + 60000),
    user: { id: "viewer", status: "ACTIVE", role: "USER" },
  })) as unknown as typeof db.userSession.findUnique;
  const profile = {
    userId: "other",
    name: "Other student",
    username: "other",
    college: null,
    user: { verified: true },
    interests: [],
    skills: [],
  };
  const findMany = t.mock.fn(
    async (query: {
      include: { conversation: true | { select: Record<string, boolean> } };
    }) => {
      if (
        query.include.conversation === true ||
        query.include.conversation.select.ownerId
      ) {
        throw new Prisma.PrismaClientKnownRequestError(
          "The column `Conversation.ownerId` does not exist in the current database.",
          {
            code: "P2022",
            clientVersion: Prisma.prismaVersion.client,
            meta: { column: "Conversation.ownerId" },
          },
        );
      }
      assert.deepEqual(query.include.conversation, { select: { id: true } });
      return [
        {
          id: "incoming",
          status: "PENDING",
          senderId: "other",
          recipientId: "viewer",
          sender: { profile },
          recipient: { profile },
          conversation: null,
        },
        {
          id: "outgoing",
          status: "PENDING",
          senderId: "viewer",
          recipientId: "other",
          sender: { profile },
          recipient: { profile },
          conversation: null,
        },
        {
          id: "accepted",
          status: "ACCEPTED",
          senderId: "viewer",
          recipientId: "other",
          sender: { profile },
          recipient: { profile },
          conversation: { id: "chat" },
        },
      ];
    },
  );
  db.connection.findMany = findMany as unknown as typeof db.connection.findMany;
  const response = await request(createApp())
    .get("/api/connections?offset=0")
    .set("Cookie", "fc_session=test-session");
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(findMany.mock.callCount(), 1);
  assert.deepEqual(
    response.body.map(
      ({
        id,
        status,
        incoming,
        conversationId,
      }: {
        id: string;
        status: string;
        incoming: boolean;
        conversationId?: string;
      }) => ({ id, status, incoming, conversationId }),
    ),
    [
      {
        id: "incoming",
        status: "PENDING",
        incoming: true,
        conversationId: undefined,
      },
      {
        id: "outgoing",
        status: "PENDING",
        incoming: false,
        conversationId: undefined,
      },
      {
        id: "accepted",
        status: "ACCEPTED",
        incoming: false,
        conversationId: "chat",
      },
    ],
  );
  assert(
    response.body.every(
      (row: { profile: { id: string } }) => row.profile.id === "other",
    ),
  );
});
