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

  @Post(':id/battery-change-mode')
  startBatteryChangeMode(@Param('id') id: string) {
    return this.devices.startBatteryChangeMode(id);
  }

  @Delete(':id/battery-change-mode')
  cancelBatteryChangeMode(@Param('id') id: string) {
    return this.devices.cancelBatteryChangeMode(id);
  }

  @Post(':id/merge/:sourceId')
  mergeInto(@Param('id') id: string, @Param('sourceId') sourceId: string) {
    return this.devices.mergeInto(id, sourceId);
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
      const rfxPayload = this.toRfxcomPayload(command, payload, device.state);
      // rfxcomId = "type/id" ou "type/id/unitCode" (boutons de télécommande) ; le bridge
      // rfxcom2mqtt n'écoute que rfxcom2mqtt/command/#, pas .../send/... (topic legacy inutilisé).
      // Le type doit être au format PascalCase ("Lighting2") : c'est le nom de la classe JS
      // instanciée par rfxcom2mqtt (onCommandDefault fait rfxcom[deviceType] sans capitaliser),
      // alors que "lighting2" en minuscule n'est que l'énumération des sous-types et n'a pas de
      // prototype — l'envoyer tel quel fait planter le bridge (TypeError, service en boucle de crash).
      const [type, ...idParts] = device.rfxcomId.split('/');
      const rfxcomDeviceType = type.charAt(0).toUpperCase() + type.slice(1);
      this.mqtt.publish(
        `rfxcom2mqtt/command/${rfxcomDeviceType}/${idParts.join('/')}`,
        JSON.stringify(rfxPayload),
      );
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
    payload: Record<string, unknown> | undefined,
    deviceState: string,
  ): Record<string, unknown> {
    // Le bridge rfxcom2mqtt attend { deviceFunction, subtype, ... }, pas { command } : ce
    // dernier n'a jamais été un format reconnu, la commande était donc silencieusement ignorée
    // (deviceFunction manquant côté onCommandDefault). Le subtype numérique (ex. 0 = AC pour
    // Chacon/DIO) est capturé sur le dernier état reçu du device (cf. rfxcom.service.ts).
    let subtype: number | undefined;
    try {
      subtype = JSON.parse(deviceState || '{}').subtype;
    } catch {
      subtype = undefined;
    }

    switch (command) {
      case 'on':
        return { deviceFunction: 'switchOn', subtype, ...payload };
      case 'off':
        return { deviceFunction: 'switchOff', subtype, ...payload };
      default:
        return { deviceFunction: command, subtype, ...payload };
    }
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.devices.delete(id);
  }
}
