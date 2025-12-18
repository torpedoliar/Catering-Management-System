-- Add Sunday Auto-Holiday setting
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "sundayAutoHoliday" BOOLEAN DEFAULT false;
