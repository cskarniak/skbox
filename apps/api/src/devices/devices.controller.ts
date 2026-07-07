import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import {
  createDeviceSchema,
  updateDeviceSchema,
  updateDeviceThemesSchema,
  updateDisplayPreferencesSchema,
  updateHistoryFieldConfigSchema,
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

  @Patch(':id/themes')
  updateThemes(@Param('id') id: string, @Body() body: unknown) {
    const dto = updateDeviceThemesSchema.parse(body);
    return this.devices.updateThemes(id, dto);
  }

  @Patch(':id/display-preferences')
  updateDisplayPreferences(@Param('id') id: string, @Body() body: unknown) {
    const dto = updateDisplayPreferencesSchema.parse(body);
    return this.devices.updateDisplayPreferences(id, dto);
  }

  @Patch(':id/history-config')
  updateHistoryFieldConfig(@Param('id') id: string, @Body() body: unknown) {
    const dto = updateHistoryFieldConfigSchema.parse(body);
    return this.devices.updateHistoryFieldConfig(id, dto);
  }

  @Get(':id/history')
  getHistory(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('maxPoints') maxPoints?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : NaN;
    const parsedMaxPoints = maxPoints ? parseInt(maxPoints, 10) : NaN;
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    return this.devices.getHistory(
      id,
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 500,
      fromDate,
      toDate,
      Number.isFinite(parsedMaxPoints) && parsedMaxPoints > 0 ? parsedMaxPoints : undefined,
    );
  }

  @Delete(':id/history')
  clearHistory(@Param('id') id: string) {
    return this.devices.clearHistory(id);
  }

  @Post('optimize-history')
  optimizeAllHistories(@Query('dryRun') dryRun?: string) {
    return this.devices.optimizeAllHistories(dryRun === 'true');
  }

  @Post(':id/optimize-history')
  optimizeHistory(@Param('id') id: string, @Query('dryRun') dryRun?: string) {
    return this.devices.optimizeHistory(id, dryRun === 'true');
  }

  @Post(':id/command')
  async sendCommand(@Param('id') id: string, @Body() body: unknown) {
    const { command, payload } = deviceCommandSchema.parse(body);
    const device = await this.devices.findById(id);

    if (!device.active) {
      throw new BadRequestException('Appareil inactivé');
    }

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
