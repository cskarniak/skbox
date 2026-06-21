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

    this.mqtt.publish(
      `skbox/${device.protocol}/${device.id}/command`,
      JSON.stringify({ command, payload }),
    );

    return { sent: true };
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.devices.delete(id);
  }
}
