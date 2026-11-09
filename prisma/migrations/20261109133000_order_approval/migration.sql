ALTER TABLE "RepairOrder" ADD COLUMN "approval" TEXT NOT NULL DEFAULT 'aguarda';
ALTER TABLE "RepairOrder" ADD COLUMN "approvalAt" DATETIME;
