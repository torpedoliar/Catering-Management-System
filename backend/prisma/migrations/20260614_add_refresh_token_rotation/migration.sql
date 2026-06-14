-- Migration: add refresh-token rotation fields + enableTokenRotation flag
-- Audit ref: F-3 (Wave 1)
--
-- Backward-compatible: existing rows have NULL tokenFamilyId; treated as
-- single-use families. First rotation will populate the family. No data loss.
-- enableTokenRotation defaults to false so existing deployments are unaffected
-- until an admin flips the flag (recommended: monitor for 1 week first).

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN "tokenFamilyId" TEXT;
ALTER TABLE "RefreshToken" ADD COLUMN "replacedById" TEXT;
ALTER TABLE "RefreshToken" ADD COLUMN "revokedReason" TEXT;

-- CreateIndex (unique self-relation FK)
CREATE UNIQUE INDEX "RefreshToken_replacedById_key" ON "RefreshToken"("replacedById");

-- CreateIndex (token family lookup for family-revoke)
CREATE INDEX "RefreshToken_tokenFamilyId_idx" ON "RefreshToken"("tokenFamilyId");

-- AlterTable: Settings.enableTokenRotation
ALTER TABLE "Settings" ADD COLUMN "enableTokenRotation" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey (self-referential)
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "RefreshToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
