-- AlterTable
ALTER TABLE "Device" ADD COLUMN "ieeeAddress" TEXT;
ALTER TABLE "Device" ADD COLUMN "model" TEXT;
ALTER TABLE "Device" ADD COLUMN "mqttTopic" TEXT;
ALTER TABLE "Device" ADD COLUMN "vendor" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Device_ieeeAddress_key" ON "Device"("ieeeAddress");

-- CreateIndex
CREATE INDEX "Device_ieeeAddress_idx" ON "Device"("ieeeAddress");

