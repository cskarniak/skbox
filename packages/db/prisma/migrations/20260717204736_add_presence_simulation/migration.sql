-- CreateTable
CREATE TABLE "PresenceSimulation" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PresenceSimulationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "plannedOnAt" DATETIME NOT NULL,
    "plannedOffAt" DATETIME NOT NULL,
    "verifiedAt" DATETIME,
    "verifiedOk" BOOLEAN,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PresenceSimulationRun_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PresenceSimulation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PresenceSimulationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "executedAt" DATETIME,
    "success" BOOLEAN,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PresenceSimulationEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PresenceSimulationRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PresenceSimulation_enabled_idx" ON "PresenceSimulation"("enabled");

-- CreateIndex
CREATE INDEX "PresenceSimulationRun_profileId_date_idx" ON "PresenceSimulationRun"("profileId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PresenceSimulationRun_profileId_date_key" ON "PresenceSimulationRun"("profileId", "date");

-- CreateIndex
CREATE INDEX "PresenceSimulationEvent_runId_scheduledAt_idx" ON "PresenceSimulationEvent"("runId", "scheduledAt");

-- CreateIndex
CREATE INDEX "PresenceSimulationEvent_scheduledAt_idx" ON "PresenceSimulationEvent"("scheduledAt");
