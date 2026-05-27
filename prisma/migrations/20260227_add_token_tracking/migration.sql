-- Migration: Add token usage tracking to Message table
-- Created: 2026-02-27

-- Add token tracking columns to Message table
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "promptTokens" INTEGER;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "completionTokens" INTEGER;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "totalTokens" INTEGER;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "costUsd" DOUBLE PRECISION;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "latencyMs" INTEGER;

-- Add index for time-based analytics queries
CREATE INDEX IF NOT EXISTS "Message_createdAt_idx" ON "Message"("createdAt");
