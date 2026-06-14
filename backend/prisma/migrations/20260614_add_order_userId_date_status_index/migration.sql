-- Migration: D-4 (Wave 3) — composite index for "today's order" +
-- manual check-in duplicate-lookup queries.
-- Audit ref: D-4
--
-- Existing @@index([userId, orderDate]) covers most of the query but
-- the additional status filter does a post-index scan. Adding
-- @@index([userId, orderDate, status]) makes the duplicate-checkin
-- and "find today's order" paths covering-index scans.

CREATE INDEX IF NOT EXISTS "Order_userId_orderDate_status_idx"
    ON "Order"("userId", "orderDate", "status");
