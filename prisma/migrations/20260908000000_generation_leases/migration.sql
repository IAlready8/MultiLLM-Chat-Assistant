ALTER TABLE "Generation" ADD COLUMN "leaseExpiresAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "Generation_status_leaseExpiresAt_idx" ON "Generation"("status", "leaseExpiresAt");
