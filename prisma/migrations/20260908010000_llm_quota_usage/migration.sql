CREATE TABLE "LlmQuotaUsage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "units" INTEGER NOT NULL CHECK ("units" BETWEEN 1 AND 8),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "LlmQuotaUsage_userId_createdAt_idx" ON "LlmQuotaUsage"("userId", "createdAt");
