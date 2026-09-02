-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'DISPUTED';

-- AlterTable
ALTER TABLE "DownloadGrant" ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "disputeOutcome" TEXT,
ADD COLUMN     "disputedAt" TIMESTAMP(3),
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "refundedCents" INTEGER NOT NULL DEFAULT 0;
