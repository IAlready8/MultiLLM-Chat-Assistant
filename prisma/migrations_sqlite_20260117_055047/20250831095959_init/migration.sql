/*
  Warnings:

  - Added the required column `updatedAt` to the `ProviderConfig` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProviderConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "apiKey" TEXT,
    "settings" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "ProviderConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProviderConfig" ("apiKey", "id", "provider", "settings", "userId") SELECT "apiKey", "id", "provider", "settings", "userId" FROM "ProviderConfig";
DROP TABLE "ProviderConfig";
ALTER TABLE "new_ProviderConfig" RENAME TO "ProviderConfig";
CREATE UNIQUE INDEX "ProviderConfig_userId_provider_key" ON "ProviderConfig"("userId", "provider");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;