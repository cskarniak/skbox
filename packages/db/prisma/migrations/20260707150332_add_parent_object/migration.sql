-- AlterTable
ALTER TABLE "Device" ADD COLUMN "parentObject" TEXT;

-- CreateTable
CREATE TABLE "ParentObject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ParentObject_name_key" ON "ParentObject"("name");

-- CreateIndex
CREATE INDEX "Device_parentObject_idx" ON "Device"("parentObject");
