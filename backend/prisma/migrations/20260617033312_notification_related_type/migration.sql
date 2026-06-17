-- FE-NOTIF-NAV: Add Notification.relatedType so the frontend can route
-- notification clicks to the correct page (/history, /settings, /admin/messages,
-- etc.) without parsing the title string. The notification model has a
-- polymorphic `relatedId` (Order / Blacklist / Message); the new enum
-- column disambiguates which table that id points to.
--
-- The backfill below populates `relatedType` for legacy rows by matching
-- the title prefix used in the callsites of NotificationService.notifyUser
-- and notifyAdmins (see backend/src/services/notification.service.ts and
-- the 8 callers in noshow.service.ts, scheduler.ts, message.routes.ts).
-- Re-running this migration is safe: the ALTER and index creation are wrapped
-- in a DO block that swallows `duplicate_column` / `duplicate_table` errors.

-- 1. Add the column (idempotent)
DO $$
BEGIN
    BEGIN
        ALTER TABLE "Notification" ADD COLUMN "relatedType" TEXT;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
END $$;

-- 2. Index for future filter queries (idempotent)
CREATE INDEX IF NOT EXISTS "Notification_relatedType_idx" ON "Notification"("relatedType");

-- 3. Backfill legacy rows. The patterns below MUST match the strings
--    used at the notify call-sites; if you add a new notification title
--    that should route, add it here AND to the same callsite.
UPDATE "Notification"
   SET "relatedType" = 'ORDER'
 WHERE "relatedType" IS NULL
   AND (
        "title" LIKE '⚠️ Pelanggaran%'          -- user no-show strike
     OR "title" LIKE '❌ Pesanan Dibatalkan%'    -- user order auto-cancelled
     OR "title" LIKE 'Sanggahan Disetujui%'     -- user appeal approved
     OR "title" LIKE 'Sanggahan Ditolak%'       -- user appeal rejected
   );

UPDATE "Notification"
   SET "relatedType" = 'BLACKLIST'
 WHERE "relatedType" IS NULL
   AND (
        "title" LIKE '🚫 Akun Diblokir%'           -- user auto-blacklisted
     OR "title" LIKE '🚫 User Auto-Blacklist%'    -- admin notified of blacklist
   );

UPDATE "Notification"
   SET "relatedType" = 'MESSAGE'
 WHERE "relatedType" IS NULL
   AND "title" LIKE 'Pengajuan Sanggahan%';   -- admin new-appeal

-- 4. Anything still NULL is ambient (admin daily no-show summary, backup
--    failure, or any pre-backfill row we don't recognise). Mark NONE so the
--    frontend mapper falls back to title-prefix matching.
UPDATE "Notification"
   SET "relatedType" = 'NONE'
 WHERE "relatedType" IS NULL;
