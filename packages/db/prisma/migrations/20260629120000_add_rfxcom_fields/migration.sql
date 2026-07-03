-- AlterTable
ALTER TABLE "Device" ADD COLUMN "rfxcomId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Device_rfxcomId_key" ON "Device"("rfxcomId");

-- CreateIndex
CREATE INDEX "Device_rfxcomId_idx" ON "Device"("rfxcomId");
