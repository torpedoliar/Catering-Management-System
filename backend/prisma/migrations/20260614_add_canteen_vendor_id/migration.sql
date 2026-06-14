-- Migration: add Canteen.vendorId for F-2 vendor scoping
-- Audit ref: F-2 (Wave 2)
--
-- Nullable column. Existing canteens have NULL vendorId; the
-- /api/vendor/* endpoints will deny VENDOR users with no bound canteen
-- (handled in code). No data migration needed.

ALTER TABLE "Canteen" ADD COLUMN "vendorId" TEXT;

CREATE INDEX "Canteen_vendorId_idx" ON "Canteen"("vendorId");

ALTER TABLE "Canteen" ADD CONSTRAINT "Canteen_vendorId_fkey"
    FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
