ALTER TABLE "User" ADD COLUMN "deletionRequestedAt" TIMESTAMP(3);
CREATE TABLE "AccountDeletion" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "stripeCustomerId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'requested',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastErrorCode" TEXT
);
CREATE UNIQUE INDEX "AccountDeletion_stripeCustomerId_key" ON "AccountDeletion"("stripeCustomerId");
CREATE INDEX "AccountDeletion_status_leaseExpiresAt_idx" ON "AccountDeletion"("status", "leaseExpiresAt");
CREATE INDEX "AccountDeletion_completedAt_idx" ON "AccountDeletion"("completedAt");
-- Enforce all new writes and cascade active accounts without rejecting historical
-- orphan analytics during deployment. Audit those legacy rows separately.
ALTER TABLE "Analytics" ADD CONSTRAINT "Analytics_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
