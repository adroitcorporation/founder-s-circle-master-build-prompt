ALTER TABLE "Connection" ADD CONSTRAINT "Connection_distinct_users" CHECK ("senderId" <> "recipientId");
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_canonical_pair" CHECK ("pairKey" = LEAST("senderId", "recipientId") || ':' || GREATEST("senderId", "recipientId"));
ALTER TABLE "Block" ADD CONSTRAINT "Block_distinct_users" CHECK ("blockerId" <> "blockedId");
ALTER TABLE "Report" ADD CONSTRAINT "Report_distinct_users" CHECK ("reporterId" <> "reportedUserId");
ALTER TABLE "Message" ADD CONSTRAINT "Message_length" CHECK (char_length("body") BETWEEN 1 AND 4000);
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_valid_year" CHECK ("year" BETWEEN 1 AND 8);
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_visibility" CHECK ("profileVisibility" IN ('STUDENTS', 'CONNECTIONS'));
CREATE UNIQUE INDEX "Verification_one_pending" ON "Verification" ("userId") WHERE "status" = 'PENDING';
