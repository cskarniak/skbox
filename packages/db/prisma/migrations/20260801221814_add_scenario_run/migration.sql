-- CreateTable
CREATE TABLE "ScenarioRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scenarioId" TEXT NOT NULL,
    "triggeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "triggerInfo" TEXT NOT NULL DEFAULT '[]',
    "actionResults" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "ScenarioRun_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ScenarioRun_scenarioId_triggeredAt_idx" ON "ScenarioRun"("scenarioId", "triggeredAt");
