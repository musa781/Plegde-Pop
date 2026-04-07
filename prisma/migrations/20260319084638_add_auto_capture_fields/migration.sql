-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_backers" (
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
    "invoiceSent" BOOLEAN NOT NULL DEFAULT false,
    "invoiceSentAt" DATETIME,
    CONSTRAINT "backers_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_backers" ("addonsTotal", "campaignId", "capturedAt", "createdAt", "currency", "customerEmail", "customerName", "customerPhone", "errorMessage", "id", "orderId", "orderNumber", "paymentMethod", "paymentStatus", "pledgeAmount", "shopifyOrderJson", "totalAmount") SELECT "addonsTotal", "campaignId", "capturedAt", "createdAt", "currency", "customerEmail", "customerName", "customerPhone", "errorMessage", "id", "orderId", "orderNumber", "paymentMethod", "paymentStatus", "pledgeAmount", "shopifyOrderJson", "totalAmount" FROM "backers";
DROP TABLE "backers";
ALTER TABLE "new_backers" RENAME TO "backers";
CREATE UNIQUE INDEX "backers_orderId_key" ON "backers"("orderId");
CREATE INDEX "backers_paymentStatus_idx" ON "backers"("paymentStatus");
CREATE UNIQUE INDEX "backers_campaignId_orderId_key" ON "backers"("campaignId", "orderId");
CREATE TABLE "new_campaigns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "productImage" TEXT,
    "originalPrice" TEXT NOT NULL,
    "campaignMode" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalRaised" REAL,
    "totalBackers" INTEGER,
    "sellingPlanGroupId" TEXT,
    "sellingPlanIds" JSONB,
    "preOrderType" TEXT,
    "fundingPercentage" REAL DEFAULT 0,
    "autoCaptureTriggered" BOOLEAN NOT NULL DEFAULT false,
    "invoiceSent" BOOLEAN NOT NULL DEFAULT false,
    "capturedAt" DATETIME,
    "campaignTitle" TEXT,
    "basePledge" REAL DEFAULT 2.0,
    "targetUnits" INTEGER DEFAULT 100,
    "manualUnits" INTEGER DEFAULT 0,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "startTime" TEXT,
    "endTime" TEXT,
    "timezone" TEXT DEFAULT 'Pakistan/Islamabad',
    "status" TEXT DEFAULT 'draft',
    "backersCount" INTEGER DEFAULT 0,
    "raisedAmount" REAL DEFAULT 0
);
INSERT INTO "new_campaigns" ("backersCount", "basePledge", "campaignMode", "campaignTitle", "createdAt", "endDate", "endTime", "id", "manualUnits", "originalPrice", "preOrderType", "productId", "productImage", "productTitle", "raisedAmount", "sellingPlanGroupId", "sellingPlanIds", "shop", "startDate", "startTime", "status", "targetUnits", "timezone", "totalBackers", "totalRaised") SELECT "backersCount", "basePledge", "campaignMode", "campaignTitle", "createdAt", "endDate", "endTime", "id", "manualUnits", "originalPrice", "preOrderType", "productId", "productImage", "productTitle", "raisedAmount", "sellingPlanGroupId", "sellingPlanIds", "shop", "startDate", "startTime", "status", "targetUnits", "timezone", "totalBackers", "totalRaised" FROM "campaigns";
DROP TABLE "campaigns";
ALTER TABLE "new_campaigns" RENAME TO "campaigns";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
