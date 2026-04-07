-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN "totalBackers" INTEGER;
ALTER TABLE "campaigns" ADD COLUMN "totalRaised" REAL;

-- CreateTable
CREATE TABLE "backers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderNumber" TEXT,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "pledgeAmount" REAL NOT NULL,
    "addonsTotal" REAL DEFAULT 0,
    "totalAmount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "paymentMethod" TEXT,
    "errorMessage" TEXT,
    "shopifyOrderJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedAt" DATETIME,
    CONSTRAINT "backers_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "backers_orderId_key" ON "backers"("orderId");

-- CreateIndex
CREATE INDEX "backers_paymentStatus_idx" ON "backers"("paymentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "backers_campaignId_orderId_key" ON "backers"("campaignId", "orderId");
