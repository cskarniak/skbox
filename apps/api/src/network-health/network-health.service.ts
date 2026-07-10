import { Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { MqttService } from '../mqtt/mqtt.service';

const SCAN_TOPIC = 'zigbee2mqtt/bridge/request/networkmap';
const RESPONSE_TOPIC = 'zigbee2mqtt/bridge/response/networkmap';
// Z2M interroge réellement chaque routeur par radio pour construire le relevé "raw" du
// maillage — sur ce réseau (9 appareils) ça a pris ~23s en pratique, donc une marge large
// pour rester fiable si le réseau grandit ou qu'une requête radio traîne davantage.
const SCAN_TIMEOUT_MS = 45_000;
const AUTO_SCAN_INTERVAL_MS = 30 * 60_000;
// Sous ce seuil (sur une échelle 0-255), un lien est considéré fragile — repère visuel,
// pas une limite stricte : le maillage Zigbee peut rester fonctionnel avec des valeurs
// basses tant qu'une route alternative existe.
const WEAK_LINK_THRESHOLD = 50;

interface RawNode {
  ieeeAddr: string;
  friendlyName: string;
  type: 'Coordinator' | 'Router' | 'EndDevice';
  lastSeen?: number | null;
  failed?: string[];
}

interface RawLink {
  sourceIeeeAddr: string;
  targetIeeeAddr: string;
  linkquality: number;
}

export interface NetworkLink {
  sourceName: string;
  targetName: string;
  linkquality: number;
  weak: boolean;
}

export interface NetworkDevice {
  ieeeAddr: string;
  friendlyName: string;
  type: 'Coordinator' | 'Router' | 'EndDevice';
}

export interface NetworkHealthReport {
  scannedAt: string;
  devices: NetworkDevice[];
  links: NetworkLink[]; // triés du plus faible au plus fort
}

@Injectable()
export class NetworkHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NetworkHealthService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastReport: NetworkHealthReport | null = null;
  // MqttService n'a pas de désabonnement ciblé ni de mode "une seule fois" : on enregistre
  // donc un unique handler persistant à l'initialisation, qui relaie la réponse vers la
  // requête en attente (s'il y en a une), plutôt que de ré-abonner un nouveau handler à
  // chaque scan (ce qui les accumulerait indéfiniment).
  private pending: { resolve: (v: { nodes: RawNode[]; links: RawLink[] }) => void; reject: (e: Error) => void } | null =
    null;
  // Un scan manuel qui tombe pile pendant le scan automatique périodique (ou un double-clic)
  // partage ce même scan en cours plutôt que d'échouer immédiatement avec "déjà en cours".
  private inFlight: Promise<NetworkHealthReport> | null = null;

  constructor(private readonly mqtt: MqttService) {}

  onModuleInit() {
    this.mqtt.subscribe(RESPONSE_TOPIC, (_topic, payload) => this.handleResponse(payload));
    this.timer = setInterval(() => {
      this.scan().catch((err) => this.logger.warn(`Scan réseau périodique échoué : ${err.message}`));
    }, AUTO_SCAN_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  getLastReport(): NetworkHealthReport | null {
    return this.lastReport;
  }

  // Demande à Zigbee2MQTT un relevé complet du maillage (mêmes données que l'onglet
  // "Schéma" de son interface), plutôt que de se fier au dernier `linkquality` connu par
  // appareil — qui ne se met à jour que si du trafic passe justement par ce lien.
  async scan(): Promise<NetworkHealthReport> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.runScan().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async runScan(): Promise<NetworkHealthReport> {
    const raw = await this.requestNetworkMap();
    const report = this.buildReport(raw);
    this.lastReport = report;
    return report;
  }

  private handleResponse(payload: string): void {
    if (!this.pending) return; // aucun scan en attente, réponse tardive ignorée
    const { resolve, reject } = this.pending;
    this.pending = null;
    try {
      const parsed = JSON.parse(payload);
      if (parsed.status !== 'ok' || parsed.data?.type !== 'raw') {
        reject(new ServiceUnavailableException('Réponse networkmap inattendue'));
        return;
      }
      resolve(parsed.data.value);
    } catch {
      reject(new ServiceUnavailableException('Réponse networkmap illisible'));
    }
  }

  private requestNetworkMap(): Promise<{ nodes: RawNode[]; links: RawLink[] }> {
    if (this.pending) {
      return Promise.reject(new ServiceUnavailableException('Un scan est déjà en cours'));
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending = null;
        reject(new ServiceUnavailableException("Zigbee2MQTT n'a pas répondu (bridge indisponible ?)"));
      }, SCAN_TIMEOUT_MS);

      this.pending = {
        resolve: (v) => {
          clearTimeout(timeout);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timeout);
          reject(e);
        },
      };
      this.mqtt.publish(SCAN_TOPIC, JSON.stringify({ type: 'raw', routes: false }));
    });
  }

  private buildReport(raw: { nodes: RawNode[]; links: RawLink[] }): NetworkHealthReport {
    const nameByAddr = new Map(raw.nodes.map((n) => [n.ieeeAddr, n.friendlyName || n.ieeeAddr]));

    const links: NetworkLink[] = raw.links
      .map((l) => ({
        sourceName: nameByAddr.get(l.sourceIeeeAddr) ?? l.sourceIeeeAddr,
        targetName: nameByAddr.get(l.targetIeeeAddr) ?? l.targetIeeeAddr,
        linkquality: l.linkquality,
        weak: l.linkquality < WEAK_LINK_THRESHOLD,
      }))
      .sort((a, b) => a.linkquality - b.linkquality);

    const devices: NetworkDevice[] = raw.nodes.map((n) => ({
      ieeeAddr: n.ieeeAddr,
      friendlyName: n.friendlyName || n.ieeeAddr,
      type: n.type,
    }));

    return { scannedAt: new Date().toISOString(), devices, links };
  }
}
