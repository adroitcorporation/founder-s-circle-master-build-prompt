-- DropForeignKey
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_connectionId_fkey";

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "groupKey" TEXT,
ADD COLUMN     "ideaId" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'DIRECT',
ADD COLUMN     "name" TEXT,
ALTER COLUMN "connectionId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ConversationParticipant" ADD COLUMN     "leftAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "system" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "canPostEvents" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Idea" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "lookingFor" TEXT[],
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdeaResonance" (
    "ideaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdeaResonance_pkey" PRIMARY KEY ("ideaId","userId")
);

-- CreateTable
CREATE TABLE "CampusEvent" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "organizerName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timeZone" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "imageKey" TEXT,
    "registrationUrl" TEXT,
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRSVP" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventRSVP_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateIndex
CREATE INDEX "Idea_createdAt_id_idx" ON "Idea"("createdAt", "id");

-- CreateIndex
CREATE INDEX "Idea_authorId_createdAt_idx" ON "Idea"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "Idea_category_createdAt_idx" ON "Idea"("category", "createdAt");

-- CreateIndex
CREATE INDEX "IdeaResonance_userId_createdAt_idx" ON "IdeaResonance"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CampusEvent_startsAt_id_idx" ON "CampusEvent"("startsAt", "id");

-- CreateIndex
CREATE INDEX "CampusEvent_creatorId_idx" ON "CampusEvent"("creatorId");

-- CreateIndex
CREATE INDEX "CampusEvent_category_startsAt_idx" ON "CampusEvent"("category", "startsAt");

-- CreateIndex
CREATE INDEX "EventRSVP_userId_idx" ON "EventRSVP"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_groupKey_key" ON "Conversation"("groupKey");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaResonance" ADD CONSTRAINT "IdeaResonance_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaResonance" ADD CONSTRAINT "IdeaResonance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampusEvent" ADD CONSTRAINT "CampusEvent_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRSVP" ADD CONSTRAINT "EventRSVP_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CampusEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRSVP" ADD CONSTRAINT "EventRSVP_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CampusEvent" ADD CONSTRAINT "CampusEvent_valid_dates" CHECK ("endsAt" > "startsAt");
ALTER TABLE "CampusEvent" ADD CONSTRAINT "CampusEvent_positive_capacity" CHECK ("capacity" IS NULL OR "capacity" > 0);
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_kind_integrity" CHECK (("kind" = 'DIRECT' AND "connectionId" IS NOT NULL AND "groupKey" IS NULL) OR ("kind" = 'GROUP' AND "connectionId" IS NULL AND "groupKey" IS NOT NULL AND "name" IS NOT NULL));
