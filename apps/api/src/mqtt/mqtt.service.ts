import { Injectable, Logger, OnModuleInit, OnModuleDestroy, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';

const LOG_BUFFER_SIZE = 500;
const BROKER_TOPICS = ['skbox/#', 'zigbee2mqtt/#', 'rfxcom2mqtt/#'];

export interface MqttLogEntry {
  topic: string;
  payload: string;
  timestamp: number;
}

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy, OnApplicationBootstrap {
  private client!: mqtt.MqttClient;
  private readonly logger = new Logger(MqttService.name);
  private readonly handlers = new Map<string, ((topic: string, payload: string) => void)[]>();
  private readonly disconnectHandlers: (() => void)[] = [];
  private readonly logBuffer: MqttLogEntry[] = [];
  private connected = false;

  constructor(private readonly config: ConfigService) {}

  get isConnected() {
    return this.connected;
  }

  async onModuleInit() {
    const url = this.config.get('MQTT_URL', 'mqtt://localhost:1883');

    this.client = mqtt.connect(url, {
      clientId: `skbox-api-${Date.now()}`,
      reconnectPeriod: 5000,
    });

    this.client.on('connect', () => {
      this.logger.log('Connected to MQTT broker');
      this.connected = true;
      this.subscribeToBrokerTopics();
    });

    this.client.on('message', (topic, message) => {
      const payload = message.toString();
      this.logger.debug(`${topic}: ${payload}`);

      this.logBuffer.push({ topic, payload, timestamp: Date.now() });
      if (this.logBuffer.length > LOG_BUFFER_SIZE) this.logBuffer.shift();

      for (const [pattern, handlers] of this.handlers) {
        if (this.matchTopic(pattern, topic)) {
          for (const handler of handlers) {
            handler(topic, payload);
          }
        }
      }
    });

    this.client.on('error', (err) => {
      this.logger.error(`MQTT error: ${err.message}`);
    });

    this.client.on('offline', () => {
      this.logger.warn('MQTT broker disconnected');
      this.connected = false;
      for (const handler of this.disconnectHandlers) {
        handler();
      }
    });
  }

  // Tous les onModuleInit (et donc tous les subscribe() enregistrant les handlers des
  // autres services) ont désormais eu lieu. Si la connexion MQTT s'était établie plus
  // vite que le boot complet de Nest — de plus en plus probable au fil des modules
  // ajoutés — le premier subscribe() côté broker (dans 'connect' ci-dessus) a pu arriver
  // avant que Zigbee/Rfxcom aient enregistré leurs handlers, faisant perdre en silence
  // toute la salve de messages retenus (bridge/devices, availability...). Se réabonner
  // ici force le broker à les redélivrer, cette fois avec tous les handlers en place.
  onApplicationBootstrap() {
    if (this.connected) {
      this.subscribeToBrokerTopics();
    }
  }

  private subscribeToBrokerTopics() {
    for (const topic of BROKER_TOPICS) {
      this.client.subscribe(topic);
    }
  }

  async onModuleDestroy() {
    await this.client?.endAsync();
  }

  publish(topic: string, message: string) {
    this.client.publish(topic, message);
  }

  subscribe(pattern: string, handler: (topic: string, payload: string) => void) {
    const existing = this.handlers.get(pattern) ?? [];
    existing.push(handler);
    this.handlers.set(pattern, existing);
  }

  onDisconnect(handler: () => void) {
    this.disconnectHandlers.push(handler);
  }

  getRecentMessages(topicFilter?: string): MqttLogEntry[] {
    const entries = topicFilter
      ? this.logBuffer.filter((entry) => this.matchTopic(topicFilter, entry.topic))
      : this.logBuffer;
    return [...entries].reverse();
  }

  private matchTopic(pattern: string, topic: string): boolean {
    const patternParts = pattern.split('/');
    const topicParts = topic.split('/');

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] === '#') return true;
      if (patternParts[i] === '+') continue;
      if (patternParts[i] !== topicParts[i]) return false;
    }

    return patternParts.length === topicParts.length;
  }
}
