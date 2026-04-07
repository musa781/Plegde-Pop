-- CreateTable
CREATE TABLE "milestones" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isReached" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "milestones_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_campaigns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "productImage" TEXT,
    "originalPrice" TEXT NOT NULL,
    "campaignMode" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
INSERT INTO "new_campaigns" ("backersCount", "basePledge", "campaignMode", "campaignTitle", "createdAt", "endDate", "endTime", "id", "manualUnits", "originalPrice", "productId", "productImage", "productTitle", "raisedAmount", "shop", "startDate", "startTime", "status", "targetUnits", "timezone") SELECT "backersCount", "basePledge", "campaignMode", "campaignTitle", "createdAt", "endDate", "endTime", "id", "manualUnits", "originalPrice", "productId", "productImage", "productTitle", "raisedAmount", "shop", "startDate", "startTime", "status", "targetUnits", "timezone" FROM "campaigns";
DROP TABLE "campaigns";
ALTER TABLE "new_campaigns" RENAME TO "campaigns";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
