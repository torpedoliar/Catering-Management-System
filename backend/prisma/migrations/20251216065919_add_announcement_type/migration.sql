-- CreateEnum
CREATE TYPE "AnnouncementType" AS ENUM ('ANNOUNCEMENT', 'AGREEMENT');

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "type" "AnnouncementType" NOT NULL DEFAULT 'ANNOUNCEMENT';
