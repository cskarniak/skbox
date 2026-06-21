import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private client!: mqtt.MqttClient;
  private readonly logger = new Logger(MqttService.name);
  private readonly handlers = new Map<string, (topic: string, payload: string) => void>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get('MQTT_URL', 'mqtt://localhost:1883');

    this.client = mqtt.connect(url, {
      clientId: `skbox-api-${Date.now()}`,
      reconnectPeriod: 5000,
    });

    this.client.on('connect', () => {
      this.logger.log('Connected to MQTT broker');
      this.client.subscribe('skbox/#');
    });

    this.client.on('message', (topic, message) => {
      const payload = message.toString();
      this.logger.debug(`${topic}: ${payload}`);

      for (const [pattern, handler] of this.handlers) {
        if (this.matchTopic(pattern, topic)) {
          handler(topic, payload);
        }
      }
    });

    this.client.on('error', (err) => {
      this.logger.error(`MQTT error: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    await this.client?.endAsync();
  }

  publish(topic: string, message: string) {
    this.client.publish(topic, message);
  }

  subscribe(pattern: string, handler: (topic: string, payload: string) => void) {
    this.handlers.set(pattern, handler);
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
