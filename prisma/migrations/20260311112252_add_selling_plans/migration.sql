-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN "preOrderType" TEXT;
ALTER TABLE "campaigns" ADD COLUMN "sellingPlanGroupId" TEXT;
ALTER TABLE "campaigns" ADD COLUMN "sellingPlanIds" JSONB;
