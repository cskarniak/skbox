-- CreateTable
CREATE TABLE "Theme" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "_DeviceToTheme" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_DeviceToTheme_A_fkey" FOREIGN KEY ("A") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_DeviceToTheme_B_fkey" FOREIGN KEY ("B") REFERENCES "Theme" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "room" TEXT,
    "state" TEXT NOT NULL DEFAULT '{}',
    "address" TEXT,
    "ieeeAddress" TEXT,
    "rfxcomId" TEXT,
    "vendor" TEXT,
    "model" TEXT,
    "mqttTopic" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "trackHistory" BOOLEAN NOT NULL DEFAULT false,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Device" ("address", "createdAt", "id", "ieeeAddress", "lastSeen", "model", "mqttTopic", "name", "protocol", "rfxcomId", "room", "state", "status", "type", "updatedAt", "vendor") SELECT "address", "createdAt", "id", "ieeeAddress", "lastSeen", "model", "mqttTopic", "name", "protocol", "rfxcomId", "room", "state", "status", "type", "updatedAt", "vendor" FROM "Device";
DROP TABLE "Device";
ALTER TABLE "new_Device" RENAME TO "Device";
CREATE UNIQUE INDEX "Device_ieeeAddress_key" ON "Device"("ieeeAddress");
CREATE UNIQUE INDEX "Device_rfxcomId_key" ON "Device"("rfxcomId");
CREATE INDEX "Device_protocol_idx" ON "Device"("protocol");
CREATE INDEX "Device_room_idx" ON "Device"("room");
CREATE INDEX "Device_ieeeAddress_idx" ON "Device"("ieeeAddress");
CREATE INDEX "Device_rfxcomId_idx" ON "Device"("rfxcomId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Theme_name_key" ON "Theme"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_DeviceToTheme_AB_unique" ON "_DeviceToTheme"("A", "B");

-- CreateIndex
CREATE INDEX "_DeviceToTheme_B_index" ON "_DeviceToTheme"("B");
