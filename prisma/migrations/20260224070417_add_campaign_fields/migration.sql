/*
  Warnings:

  - You are about to drop the `Campaign` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Campaign";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "campaigns" (
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
    "timezone" TEXT DEFAULT 'America/New_York',
    "status" TEXT DEFAULT 'draft',
    "backersCount" INTEGER DEFAULT 0,
    "raisedAmount" REAL DEFAULT 0
);
