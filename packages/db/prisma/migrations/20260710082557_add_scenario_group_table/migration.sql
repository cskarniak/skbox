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
-- Le DISTINCT doit porter uniquement sur "group" (dans la sous-requête) : mis directement
-- dans le SELECT du dessus, randomblob() change à chaque ligne et empêche toute
-- déduplication réelle, ce qui viole la contrainte UNIQUE dès qu'un nom est répété.
INSERT INTO "ScenarioGroup" ("id", "name", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), g."group", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "group" FROM "Scenario" WHERE "group" IS NOT NULL) AS g;
