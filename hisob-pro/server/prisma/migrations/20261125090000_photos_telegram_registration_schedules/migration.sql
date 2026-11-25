-- AlterTable
ALTER TABLE "TelegramLink" ADD COLUMN     "lastBackupDay" TEXT,
ADD COLUMN     "lastMonthlyKey" TEXT,
ADD COLUMN     "lastReminderDay" TEXT,
ADD COLUMN     "lastWeeklyKey" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "telegramUserId" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateTable
CREATE TABLE "TransactionPhoto" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "telegramFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingRegistration" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "pollTokenHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "language" "Language" NOT NULL DEFAULT 'tg',
    "chatId" TEXT,
    "completedUserId" TEXT,
    "error" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransactionPhoto_transactionId_key" ON "TransactionPhoto"("transactionId");

-- CreateIndex
CREATE INDEX "TransactionPhoto_userId_createdAt_idx" ON "TransactionPhoto"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PendingRegistration_codeHash_key" ON "PendingRegistration"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "PendingRegistration_pollTokenHash_key" ON "PendingRegistration"("pollTokenHash");

-- CreateIndex
CREATE INDEX "PendingRegistration_chatId_idx" ON "PendingRegistration"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramUserId_key" ON "User"("telegramUserId");

-- AddForeignKey
ALTER TABLE "TransactionPhoto" ADD CONSTRAINT "TransactionPhoto_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionPhoto" ADD CONSTRAINT "TransactionPhoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

