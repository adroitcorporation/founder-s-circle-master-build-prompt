-- Keep every existing conversation, participant and message.
-- PostgreSQL Prisma migrations are not implicitly transactional. Roll back the
-- entire schema/backfill if any statement fails; never leave partial ownership.
BEGIN;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';
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
-- Preserve an already-canonical group if present; otherwise choose the oldest.
-- The existing unique index stays enabled throughout. A legacy group holding
-- another idea's reserved key is re-keyed, never removed or merged.
DO $$
DECLARE
  canonical RECORD;
  conflict_id TEXT;
  legacy_key TEXT;
BEGIN
  FOR canonical IN
    SELECT DISTINCT ON ("ideaId") id, "ideaId"
    FROM "Conversation" WHERE kind = 'GROUP' AND "ideaId" IS NOT NULL
    ORDER BY "ideaId", ("groupKey" = 'idea:' || "ideaId") DESC, "createdAt", id
  LOOP
    SELECT id INTO conflict_id FROM "Conversation"
    WHERE "groupKey" = 'idea:' || canonical."ideaId" AND id <> canonical.id;
    IF conflict_id IS NOT NULL THEN
      legacy_key := 'legacy:' || conflict_id;
      WHILE EXISTS (SELECT 1 FROM "Conversation" WHERE "groupKey" = legacy_key) LOOP
        legacy_key := legacy_key || ':legacy';
      END LOOP;
      UPDATE "Conversation" SET "groupKey" = legacy_key WHERE id = conflict_id;
    END IF;
    UPDATE "Conversation" SET "groupKey" = 'idea:' || canonical."ideaId"
    WHERE id = canonical.id;
  END LOOP;
END $$;
COMMIT;
