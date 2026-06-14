-- Migration: I-3 (Wave 2) — promote add_sunday_holiday.sql to a proper
-- timestamped Prisma migration. Audit ref: I-3.
--
-- Idempotent.

ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "sundayAutoHoliday" BOOLEAN DEFAULT false;
