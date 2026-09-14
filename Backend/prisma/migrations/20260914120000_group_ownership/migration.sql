-- Keep every existing conversation, participant and message.
ALTER TABLE "Conversation" ADD COLUMN "ownerId" TEXT;
UPDATE "Conversation" c SET "ownerId" = i."authorId"
FROM "Idea" i WHERE c."ideaId" = i.id AND c.kind = 'GROUP';
-- Deleted ideas retain the original creator in their initial context message.
UPDATE "Conversation" c SET "ownerId" = (
  SELECT m."senderId" FROM "Message" m
  WHERE m."conversationId" = c.id AND m.system = true
  ORDER BY m."createdAt", m.id LIMIT 1
) WHERE c.kind = 'GROUP' AND c."ownerId" IS NULL;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
-- The oldest group is canonical; duplicate groups remain untouched and accessible.
UPDATE "Conversation" c SET "groupKey" = 'idea:' || c."ideaId"
WHERE c.id IN (
  SELECT DISTINCT ON ("ideaId") id FROM "Conversation"
  WHERE kind = 'GROUP' AND "ideaId" IS NOT NULL
  ORDER BY "ideaId", "createdAt", id
);
