import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import {
  createDeviceSchema,
  updateDeviceSchema,
  deviceCommandSchema,
  CreateDeviceDto,
  UpdateDeviceDto,
  DeviceCommandDto,
} from '@skbox/shared';
import { MqttService } from '../mqtt/mqtt.service';

@ApiTags('devices')
@Controller('devices')
export class DevicesController {
  constructor(
    private readonly devices: DevicesService,
    private readonly mqtt: MqttService,
  ) {}

  @Get()
  findAll() {
    return this.devices.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.devices.findById(id);
  }

  @Post()
  create(@Body() body: unknown) {
    const dto = createDeviceSchema.parse(body);
    return this.devices.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    const dto = updateDeviceSchema.parse(body);
    return this.devices.update(id, dto);
  }

  @Post(':id/command')
  async sendCommand(@Param('id') id: string, @Body() body: unknown) {
    const { command, payload } = deviceCommandSchema.parse(body);
    const device = await this.devices.findById(id);

    if (device.protocol === 'zigbee' && device.mqttTopic) {
      const z2mPayload = this.toZ2MPayload(command, payload);
      this.mqtt.publish(`${device.mqttTopic}/set`, JSON.stringify(z2mPayload));
    } else if (device.protocol === 'rf433' && device.rfxcomId) {
      const rfxPayload = this.toRfxcomPayload(command, payload);
      const [type] = device.rfxcomId.split('/');
      this.mqtt.publish(`rfxcom2mqtt/send/${type}`, JSON.stringify({ id: device.rfxcomId, ...rfxPayload }));
    } else {
      this.mqtt.publish(
        `skbox/${device.protocol}/${device.id}/command`,
        JSON.stringify({ command, payload }),
      );
    }

    return { sent: true };
  }

  private toZ2MPayload(
    command: string,
    payload?: Record<string, unknown>,
  ): Record<string, unknown> {
    switch (command) {
      case 'on':
        return { state: 'ON', ...payload };
      case 'off':
        return { state: 'OFF', ...payload };
      case 'toggle':
        return { state: 'TOGGLE', ...payload };
      case 'brightness':
        return { brightness: payload?.value, ...payload };
      default:
        return { [command]: payload?.value ?? true, ...payload };
    }
  }

  private toRfxcomPayload(
    command: string,
    payload?: Record<string, unknown>,
  ): Record<string, unknown> {
    switch (command) {
      case 'on':
        return { command: 'On', ...payload };
      case 'off':
        return { command: 'Off', ...payload };
      default:
        return { command, ...payload };
    }
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.devices.delete(id);
  }
}
