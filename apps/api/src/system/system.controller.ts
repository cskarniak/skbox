import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SystemService } from './system.service';

@ApiTags('system')
@Controller('system')
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get('health')
  getHealth() {
    return this.system.getHealth();
  }

  @Put('thermal-shutdown')
  async setThermalShutdown(@Body('active') active: boolean) {
    try {
      await this.system.setThermalShutdownActive(active);
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
    return this.system.getHealth();
  }

  @Post('bridges/:bridge/stop')
  async stopBridge(@Param('bridge') bridge: string) {
    if (bridge !== 'zigbee' && bridge !== 'rfxcom') {
      throw new BadRequestException('bridge must be "zigbee" or "rfxcom"');
    }
    try {
      await this.system.stopBridgeService(bridge);
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
    return this.system.getHealth();
  }
}
