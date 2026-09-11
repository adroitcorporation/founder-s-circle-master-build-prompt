-- CreateTable
CREATE TABLE "StorageDeletion" (
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StorageDeletion_pkey" PRIMARY KEY ("key")
);
