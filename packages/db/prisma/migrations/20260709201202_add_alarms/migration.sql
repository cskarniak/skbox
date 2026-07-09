-- CreateTable
CREATE TABLE "AlarmEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scenarioId" TEXT NOT NULL,
    "triggeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" DATETIME,
    "resolvedAt" DATETIME,
    "triggerValue" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "AlarmEvent_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Scenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "category" TEXT NOT NULL DEFAULT 'automation',
    "severity" TEXT,
    "trigger" TEXT NOT NULL,
    "conditions" TEXT NOT NULL DEFAULT '[]',
    "actions" TEXT NOT NULL DEFAULT '[]',
    "lastRun" DATETIME,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Scenario" ("actions", "conditions", "createdAt", "enabled", "id", "lastRun", "name", "runCount", "trigger", "updatedAt") SELECT "actions", "conditions", "createdAt", "enabled", "id", "lastRun", "name", "runCount", "trigger", "updatedAt" FROM "Scenario";
DROP TABLE "Scenario";
ALTER TABLE "new_Scenario" RENAME TO "Scenario";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AlarmEvent_scenarioId_resolvedAt_idx" ON "AlarmEvent"("scenarioId", "resolvedAt");
