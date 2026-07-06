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
    "displayPreferences" TEXT NOT NULL DEFAULT '[]',
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Device" ("active", "address", "createdAt", "id", "ieeeAddress", "lastSeen", "model", "mqttTopic", "name", "protocol", "rfxcomId", "room", "state", "status", "trackHistory", "type", "updatedAt", "vendor", "visible") SELECT "active", "address", "createdAt", "id", "ieeeAddress", "lastSeen", "model", "mqttTopic", "name", "protocol", "rfxcomId", "room", "state", "status", "trackHistory", "type", "updatedAt", "vendor", "visible" FROM "Device";
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
