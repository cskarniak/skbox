import { Injectable } from '@nestjs/common';

export interface TriggerContextValue {
  deviceId: string;
  deviceName: string;
  property: string;
  value: unknown;
}

export interface TriggerContext {
  scenarioName: string;
  values: TriggerContextValue[];
}

interface StoredContext extends TriggerContext {
  expiresAt: number;
}

// Fenêtre entre l'exécution d'une action de scénario (publication MQTT) et l'arrivée du
// message de confirmation d'état réel de l'appareil (Z2M/rfxcom2mqtt) qui déclenche
// l'écriture du DeviceEvent — passé ce délai on considère le contexte périmé plutôt que
// de risquer de l'attacher à un changement d'état sans rapport.
const CONTEXT_TTL_MS = 10_000;

// Associe temporairement, par device cible, les valeurs des capteurs qui ont justifié
// une action de scénario, le temps que le DeviceEvent correspondant soit écrit (Zigbee/
// RFXCOM) et puisse embarquer ce contexte pour affichage dans l'historique.
@Injectable()
export class TriggerContextService {
  private readonly contexts = new Map<string, StoredContext>();

  record(deviceId: string, context: TriggerContext): void {
    this.contexts.set(deviceId, { ...context, expiresAt: Date.now() + CONTEXT_TTL_MS });
  }

  consume(deviceId: string): TriggerContext | undefined {
    const stored = this.contexts.get(deviceId);
    if (!stored) return undefined;
    this.contexts.delete(deviceId);
    if (stored.expiresAt < Date.now()) return undefined;
    const { expiresAt: _expiresAt, ...context } = stored;
    return context;
  }
}
