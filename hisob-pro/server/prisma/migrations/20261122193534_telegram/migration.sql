-- CreateTable
CREATE TABLE "TelegramLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "username" TEXT,
    "step" TEXT NOT NULL DEFAULT 'income_source',
    "incomeSource" TEXT,
    "monthlyIncome" DECIMAL(18,2),
    "dailyLimit" DECIMAL(18,2),
    "notifyDaily" BOOLEAN NOT NULL DEFAULT true,
    "lastDailyDay" TEXT,
    "lastAlertDay" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramLinkCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramLinkCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLink_userId_key" ON "TelegramLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLink_chatId_key" ON "TelegramLink"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLinkCode_codeHash_key" ON "TelegramLinkCode"("codeHash");

-- CreateIndex
CREATE INDEX "TelegramLinkCode_userId_idx" ON "TelegramLinkCode"("userId");

-- AddForeignKey
ALTER TABLE "TelegramLink" ADD CONSTRAINT "TelegramLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramLinkCode" ADD CONSTRAINT "TelegramLinkCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
