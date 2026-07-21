import { TimeOrSolar } from './solar-time';

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: ValidationSeverity;
  field: 'toggleWindowStart' | 'toggleWindowEnd' | 'toggleDurationMax' | 'toggleCountMax' | 'offTime';
  message: string;
}

export interface PresenceSimulationValidationInput {
  onTime: TimeOrSolar;
  offTime: TimeOrSolar;
  toggleWindowStart: string; // HH:MM
  toggleWindowEnd: string; // HH:MM
  toggleCountMin: number;
  toggleCountMax: number;
  toggleDurationMin: number;
  toggleDurationMax: number;
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Nombre de minutes entre deux horaires HH:MM en supposant que `to` peut tomber le lendemain
// de `from` (passage minuit), comme le fait presence-simulation.service.ts pour l'allumage,
// l'extinction et la fenêtre de bascules : si `to` semble "avant" `from" sur l'horloge 24h, on
// considère qu'il s'agit en réalité du lendemain plutôt qu'une plage vide/invalide.
function minutesUntilStrict(fromMin: number, toMin: number): number {
  const diff = toMin - fromMin;
  return diff < 0 ? diff + 1440 : diff;
}

function minutesUntilOrEqual(fromMin: number, toMin: number): number {
  const diff = toMin - fromMin;
  return diff <= 0 ? diff + 1440 : diff;
}

/**
 * Vérifie la cohérence des paramètres d'une simulation de présence : l'allumage et
 * l'extinction sont toujours prioritaires (le plan réel les respecte toujours et borne/écarte
 * les bascules en conséquence, voir generateDailyPlan), cette fonction sert à prévenir
 * l'utilisateur en amont plutôt que de le laisser découvrir des bascules silencieusement
 * ignorées dans le journal des événements. Reproduit le traitement du passage minuit de
 * presence-simulation.service.ts (resolveTime + les bumps de +24h) pour ne pas signaler à tort
 * une fenêtre comme "vide" quand elle traverse minuit (ex: 23:30 → 01:00). Fonction pure,
 * réutilisée par l'API (erreurs bloquantes) et le formulaire web (erreurs + avertissements).
 */
export function validatePresenceSimulationParams(input: PresenceSimulationValidationInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const {
    onTime, offTime, toggleWindowStart, toggleWindowEnd,
    toggleCountMax, toggleDurationMin, toggleDurationMax,
  } = input;

  const windowStartMin = hhmmToMinutes(toggleWindowStart);
  const windowEndMin = hhmmToMinutes(toggleWindowEnd);

  // Durée effective des bascules disponible pour l'utilisateur : bornée par l'allumage/
  // l'extinction quand on les connaît (mode fixe des deux côtés), sinon la taille brute de la
  // fenêtre (on ne peut pas se borner sur une heure solaire dont l'horaire exact varie chaque jour).
  let effectiveDurationMin: number;

  if (onTime.mode === 'fixed' && offTime.mode === 'fixed') {
    const onMin = hhmmToMinutes(onTime.time);
    const offMin = hhmmToMinutes(offTime.time);
    const offRel = minutesUntilOrEqual(onMin, offMin); // (0, 1440], onAt = référence 0

    const windowStartRel = minutesUntilStrict(onMin, windowStartMin); // [0, 1440)
    const windowEndRel0 = windowEndMin - onMin; // brut, avant le bump relatif au début de fenêtre
    const windowEndRel = windowEndRel0 <= windowStartRel ? windowEndRel0 + 1440 : windowEndRel0;

    if (windowStartRel < 0) {
      issues.push({
        severity: 'warning',
        field: 'toggleWindowStart',
        message: "Le début de la fenêtre de bascules précède l'allumage : il sera automatiquement ramené à l'heure d'allumage (l'allumage est toujours prioritaire).",
      });
    }
    if (windowEndRel > offRel) {
      issues.push({
        severity: 'warning',
        field: 'toggleWindowEnd',
        message: "La fin de la fenêtre de bascules dépasse l'extinction : elle sera automatiquement ramenée à l'heure d'extinction (l'extinction est toujours prioritaire).",
      });
    }

    const clippedStart = Math.max(0, windowStartRel);
    const clippedEnd = Math.min(offRel, windowEndRel);
    effectiveDurationMin = Math.max(0, clippedEnd - clippedStart);

    if (effectiveDurationMin === 0) {
      issues.push({
        severity: 'error',
        field: 'toggleWindowEnd',
        message: "La fenêtre de bascules ne chevauche pas du tout la période allumage/extinction : aucune bascule ne pourra jamais s'exécuter.",
      });
    }
  } else {
    // Allumage et/ou extinction basés sur le soleil : l'heure exacte varie chaque jour, on ne
    // peut pas borner la fenêtre par rapport à eux. On vérifie seulement sa taille brute.
    effectiveDurationMin = minutesUntilOrEqual(windowStartMin, windowEndMin);
  }

  if (effectiveDurationMin > 0 && toggleDurationMax >= effectiveDurationMin) {
    issues.push({
      severity: 'error',
      field: 'toggleDurationMax',
      message: `La durée max d'une bascule (${toggleDurationMax} min) dépasse la fenêtre de bascules disponible (${effectiveDurationMin} min) : une bascule de cette durée ne peut jamais se terminer avant l'extinction et sera toujours ignorée.`,
    });
  } else if (effectiveDurationMin > 0 && toggleDurationMax > effectiveDurationMin * 0.6) {
    issues.push({
      severity: 'warning',
      field: 'toggleDurationMax',
      message: `La durée max d'une bascule (${toggleDurationMax} min) est proche de la taille de la fenêtre de bascules disponible (${effectiveDurationMin} min) : les bascules tirées tardivement seront souvent ignorées si leur rallumage tombe après l'extinction.`,
    });
  }

  if (toggleCountMax > 0 && effectiveDurationMin > 0) {
    // Estimation grossière (pas un calcul de faisabilité exact : les bascules sont tirées
    // indépendamment et peuvent se chevaucher, auquel cas elles sont fusionnées) pour repérer
    // les configurations où beaucoup de chevauchement est probable.
    const roughNeededMin = toggleCountMax * toggleDurationMin;
    if (roughNeededMin > effectiveDurationMin * 2) {
      issues.push({
        severity: 'warning',
        field: 'toggleCountMax',
        message: `Le nombre max de bascules (${toggleCountMax}) est élevé par rapport à la fenêtre disponible (${effectiveDurationMin} min) : des bascules risquent de se chevaucher (elles seront alors fusionnées), réduisant le nombre de bascules réellement visibles en dessous du maximum configuré.`,
      });
    }
  }

  return issues;
}
