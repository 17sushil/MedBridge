-- Add INVENTORY_MANAGER to the Role enum
ALTER TYPE "Role" ADD VALUE 'INVENTORY_MANAGER';

-- Create the account approval-status enum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Add approvalStatus to User. Default PENDING (fail-closed): brand-new
-- self-registrations cannot log in until an admin approves them.
ALTER TABLE "User" ADD COLUMN "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING';

-- Backfill: every account that already existed (and could already log in)
-- is considered approved.
UPDATE "User" SET "approvalStatus" = 'APPROVED';

-- Index for the admin "pending approvals" query
CREATE INDEX "User_hospitalId_approvalStatus_idx" ON "User"("hospitalId", "approvalStatus");
