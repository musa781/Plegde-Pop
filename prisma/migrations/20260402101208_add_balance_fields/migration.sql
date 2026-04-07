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
    "remainingAmount" REAL,
    "balanceInvoiceSent" BOOLEAN NOT NULL DEFAULT false,
    "balanceInvoiceSentAt" DATETIME,
    "balancePaidAt" DATETIME,
    "balanceOrderId" TEXT,
    CONSTRAINT "backers_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_backers" ("addonsTotal", "campaignId", "capturedAt", "createdAt", "currency", "customerEmail", "customerName", "customerPhone", "errorMessage", "id", "invoiceSent", "invoiceSentAt", "orderId", "orderNumber", "paymentMethod", "paymentStatus", "pledgeAmount", "shopifyOrderJson", "totalAmount") SELECT "addonsTotal", "campaignId", "capturedAt", "createdAt", "currency", "customerEmail", "customerName", "customerPhone", "errorMessage", "id", "invoiceSent", "invoiceSentAt", "orderId", "orderNumber", "paymentMethod", "paymentStatus", "pledgeAmount", "shopifyOrderJson", "totalAmount" FROM "backers";
DROP TABLE "backers";
ALTER TABLE "new_backers" RENAME TO "backers";
CREATE UNIQUE INDEX "backers_orderId_key" ON "backers"("orderId");
CREATE INDEX "backers_paymentStatus_idx" ON "backers"("paymentStatus");
CREATE UNIQUE INDEX "backers_campaignId_orderId_key" ON "backers"("campaignId", "orderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
