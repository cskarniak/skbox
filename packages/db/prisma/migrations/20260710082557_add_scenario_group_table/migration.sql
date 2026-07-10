-- CreateTable
CREATE TABLE "ScenarioGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioGroup_name_key" ON "ScenarioGroup"("name");

-- Backfill: enregistre les noms de groupe déjà utilisés par des scénarios existants.
INSERT INTO "ScenarioGroup" ("id", "name", "createdAt", "updatedAt")
SELECT DISTINCT lower(hex(randomblob(16))), "group", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Scenario"
WHERE "group" IS NOT NULL;
