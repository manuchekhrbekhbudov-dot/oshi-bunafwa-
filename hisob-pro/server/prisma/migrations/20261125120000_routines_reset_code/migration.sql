-- AlterTable
ALTER TABLE "PasswordResetToken" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TelegramLink" ADD COLUMN     "pendingRoutineAt" TIMESTAMP(3),
ADD COLUMN     "pendingRoutineId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "routinesAskedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Routine" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "categoryId" TEXT,
    "days" TEXT NOT NULL DEFAULT '1234567',
    "arriveTime" TEXT,
    "leaveTime" TEXT NOT NULL,
    "remindBefore" INTEGER NOT NULL DEFAULT 5,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLeaveDay" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Routine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Routine_userId_idx" ON "Routine"("userId");

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

