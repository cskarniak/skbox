import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MqttService } from './mqtt.service';

@ApiTags('mqtt')
@Controller('mqtt')
export class MqttController {
  constructor(private readonly mqtt: MqttService) {}

  @Get('logs')
  getLogs(@Query('topic') topic?: string) {
    return this.mqtt.getRecentMessages(topic);
  }
}
