-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "autoBackupEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoBackupInterval" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "lastAutoBackup" TIMESTAMP(3);
