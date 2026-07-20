-- AlterTable: remplace la fenêtre de bascules exprimée en minutes avant l'extinction
-- par une plage horaire explicite (heure de début / heure de fin).
ALTER TABLE "PresenceSimulation" ADD COLUMN "toggleWindowStart" TEXT NOT NULL DEFAULT '22:00';
ALTER TABLE "PresenceSimulation" ADD COLUMN "toggleWindowEnd" TEXT NOT NULL DEFAULT '23:00';
ALTER TABLE "PresenceSimulation" DROP COLUMN "toggleWindowMinutes";
