/*
  Warnings:

  - A unique constraint covering the columns `[date,shiftId]` on the table `Holiday` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Holiday_date_key";

-- AlterTable
ALTER TABLE "Holiday" ADD COLUMN     "shiftId" TEXT;

-- CreateIndex
CREATE INDEX "Holiday_shiftId_idx" ON "Holiday"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_shiftId_key" ON "Holiday"("date", "shiftId");

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
