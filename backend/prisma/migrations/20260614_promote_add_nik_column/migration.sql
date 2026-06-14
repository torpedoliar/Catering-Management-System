-- Migration: I-3 (Wave 2) — promote add_nik_column.sql to a proper
-- timestamped Prisma migration. Audit ref: I-3.
--
-- Idempotent. The NIK backfill (random 7-digit number for existing
-- users) is preserved verbatim from the standalone file.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "nik" VARCHAR(30) UNIQUE;
CREATE INDEX IF NOT EXISTS "User_nik_idx" ON "User"("nik");

DO $$
DECLARE
    user_record RECORD;
    new_nik VARCHAR(30);
    nik_exists BOOLEAN;
BEGIN
    FOR user_record IN SELECT id FROM "User" WHERE nik IS NULL
    LOOP
        LOOP
            new_nik := LPAD(FLOOR(RANDOM() * 10000000)::TEXT, 7, '0');
            SELECT EXISTS(SELECT 1 FROM "User" WHERE nik = new_nik) INTO nik_exists;
            EXIT WHEN NOT nik_exists;
        END LOOP;
        UPDATE "User" SET nik = new_nik WHERE id = user_record.id;
    END LOOP;
END $$;
