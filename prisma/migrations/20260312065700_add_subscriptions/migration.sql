-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "backerId" TEXT,
    "shopifySubscriptionId" TEXT NOT NULL,
    "shopifyOrderId" TEXT,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "planId" TEXT,
    "amount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentCycle" INTEGER NOT NULL DEFAULT 1,
    "nextBillingDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "subscriptions_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_shopifySubscriptionId_key" ON "subscriptions"("shopifySubscriptionId");
