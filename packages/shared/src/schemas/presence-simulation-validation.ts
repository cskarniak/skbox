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

/**
 * Vérifie la cohérence des paramètres d'une simulation de présence : l'allumage et
 * l'extinction sont toujours prioritaires (le plan réel les respecte toujours et borne/écarte
 * les bascules en conséquence, voir generateDailyPlan), cette fonction sert à prévenir
 * l'utilisateur en amont plutôt que de le laisser découvrir des bascules silencieusement
 * ignorées dans le journal des événements. Fonction pure, réutilisée par l'API (erreurs
 * bloquantes) et le formulaire web (erreurs + avertissements informatifs).
 */
export function validatePresenceSimulationParams(input: PresenceSimulationValidationInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const {
    onTime, offTime, toggleWindowStart, toggleWindowEnd,
    toggleCountMax, toggleDurationMin, toggleDurationMax,
  } = input;

  const windowStartMin = hhmmToMinutes(toggleWindowStart);
  const windowEndMin = hhmmToMinutes(toggleWindowEnd);

  if (windowStartMin >= windowEndMin) {
    issues.push({
      severity: 'error',
      field: 'toggleWindowEnd',
      message: "La fenêtre de bascules est vide : l'heure de fin doit être après l'heure de début.",
    });
    return issues;
  }

  const windowDurationMin = windowEndMin - windowStartMin;

  if (toggleDurationMax >= windowDurationMin) {
    issues.push({
      severity: 'error',
      field: 'toggleDurationMax',
      message: `La durée max d'une bascule (${toggleDurationMax} min) dépasse la fenêtre de bascules (${windowDurationMin} min) : une bascule de cette durée ne peut jamais se terminer avant l'extinction et sera toujours ignorée.`,
    });
  } else if (toggleDurationMax > windowDurationMin * 0.6) {
    issues.push({
      severity: 'warning',
      field: 'toggleDurationMax',
      message: `La durée max d'une bascule (${toggleDurationMax} min) est proche de la taille de la fenêtre de bascules (${windowDurationMin} min) : les bascules tirées tardivement seront souvent ignorées si leur rallumage tombe après l'extinction.`,
    });
  }

  if (onTime.mode === 'fixed' && offTime.mode === 'fixed') {
    const onMin = hhmmToMinutes(onTime.time);
    const offMin = hhmmToMinutes(offTime.time);
    if (onMin >= offMin) {
      issues.push({
        severity: 'error',
        field: 'offTime',
        message: "L'heure d'extinction doit être après l'heure d'allumage.",
      });
    } else {
      if (windowStartMin < onMin) {
        issues.push({
          severity: 'warning',
          field: 'toggleWindowStart',
          message: "Le début de la fenêtre de bascules précède l'allumage : il sera automatiquement ramené à l'heure d'allumage (l'allumage est toujours prioritaire).",
        });
      }
      if (windowEndMin > offMin) {
        issues.push({
          severity: 'warning',
          field: 'toggleWindowEnd',
          message: "La fin de la fenêtre de bascules dépasse l'extinction : elle sera automatiquement ramenée à l'heure d'extinction (l'extinction est toujours prioritaire).",
        });
      }
    }
  }

  if (toggleCountMax > 0) {
    // Estimation grossière (pas un calcul de faisabilité exact : les bascules sont tirées
    // indépendamment et peuvent se chevaucher, auquel cas elles sont fusionnées) pour repérer
    // les configurations où beaucoup de chevauchement est probable.
    const roughNeededMin = toggleCountMax * toggleDurationMin;
    if (roughNeededMin > windowDurationMin * 2) {
      issues.push({
        severity: 'warning',
        field: 'toggleCountMax',
        message: `Le nombre max de bascules (${toggleCountMax}) est élevé par rapport à la fenêtre disponible (${windowDurationMin} min) : des bascules risquent de se chevaucher (elles seront alors fusionnées), réduisant le nombre de bascules réellement visibles en dessous du maximum configuré.`,
      });
    }
  }

  return issues;
}
