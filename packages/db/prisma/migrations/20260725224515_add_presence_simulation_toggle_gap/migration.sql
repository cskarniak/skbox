-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PresenceSimulation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lightDeviceIds" TEXT NOT NULL DEFAULT '[]',
    "onTime" TEXT NOT NULL,
    "offTime" TEXT NOT NULL,
    "onRandomOffsetMin" INTEGER NOT NULL DEFAULT 0,
    "onRandomOffsetMax" INTEGER NOT NULL DEFAULT 0,
    "offRandomOffsetMin" INTEGER NOT NULL DEFAULT 0,
    "offRandomOffsetMax" INTEGER NOT NULL DEFAULT 0,
    "toggleCountMin" INTEGER NOT NULL DEFAULT 0,
    "toggleCountMax" INTEGER NOT NULL DEFAULT 0,
    "toggleDurationMin" INTEGER NOT NULL DEFAULT 1,
    "toggleDurationMax" INTEGER NOT NULL DEFAULT 30,
    "toggleGapMin" INTEGER NOT NULL DEFAULT 15,
    "toggleGapMax" INTEGER NOT NULL DEFAULT 15,
    "toggleWindowStart" TEXT NOT NULL DEFAULT '22:00',
    "toggleWindowEnd" TEXT NOT NULL DEFAULT '23:00',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PresenceSimulation" ("createdAt", "enabled", "id", "lightDeviceIds", "name", "offRandomOffsetMax", "offRandomOffsetMin", "offTime", "onRandomOffsetMax", "onRandomOffsetMin", "onTime", "toggleCountMax", "toggleCountMin", "toggleDurationMax", "toggleDurationMin", "toggleWindowEnd", "toggleWindowStart", "updatedAt") SELECT "createdAt", "enabled", "id", "lightDeviceIds", "name", "offRandomOffsetMax", "offRandomOffsetMin", "offTime", "onRandomOffsetMax", "onRandomOffsetMin", "onTime", "toggleCountMax", "toggleCountMin", "toggleDurationMax", "toggleDurationMin", "toggleWindowEnd", "toggleWindowStart", "updatedAt" FROM "PresenceSimulation";
DROP TABLE "PresenceSimulation";
ALTER TABLE "new_PresenceSimulation" RENAME TO "PresenceSimulation";
CREATE INDEX "PresenceSimulation_enabled_idx" ON "PresenceSimulation"("enabled");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
