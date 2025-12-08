-- CreateTable
CREATE TABLE "DepartmentShift" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentShift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DepartmentShift_departmentId_idx" ON "DepartmentShift"("departmentId");

-- CreateIndex
CREATE INDEX "DepartmentShift_shiftId_idx" ON "DepartmentShift"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentShift_departmentId_shiftId_key" ON "DepartmentShift"("departmentId", "shiftId");

-- AddForeignKey
ALTER TABLE "DepartmentShift" ADD CONSTRAINT "DepartmentShift_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentShift" ADD CONSTRAINT "DepartmentShift_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;
