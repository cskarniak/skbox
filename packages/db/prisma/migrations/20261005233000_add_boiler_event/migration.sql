-- CreateTable
CREATE TABLE "BoilerEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "operatingMode" TEXT NOT NULL,
    "level" TEXT,
    "programName" TEXT,
    "exceptionName" TEXT,
    "targetTemp" REAL,
    "currentTemp" REAL,
    "hysteresis" REAL,
    "sensorAgeMinutes" INTEGER,
    "overrideUntil" DATETIME,
    "previousStateMinutes" INTEGER
);

-- CreateIndex
CREATE INDEX "BoilerEvent_at_idx" ON "BoilerEvent"("at");
