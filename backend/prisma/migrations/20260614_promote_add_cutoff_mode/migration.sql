-- Migration: I-3 (Wave 2) — promote add_cutoff_mode.sql to a proper
-- timestamped Prisma migration. Audit ref: I-3.
--
-- Original SQL was applied manually out-of-band. This re-applies it
-- idempotently for fresh databases running `prisma migrate deploy`.
-- IF NOT EXISTS guards make re-application safe.

ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "cutoffMode" TEXT NOT NULL DEFAULT 'per-shift';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "weeklyCutoffDay" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "weeklyCutoffHour" INTEGER NOT NULL DEFAULT 17;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "weeklyCutoffMinute" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "orderableDays" TEXT NOT NULL DEFAULT '1,2,3,4,5,6';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "maxWeeksAhead" INTEGER NOT NULL DEFAULT 1;
