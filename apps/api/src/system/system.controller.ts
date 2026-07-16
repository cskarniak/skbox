import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
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

  @Get('events')
  getEvents(@Query('limit') limit?: string) {
    return this.system.getEvents(limit ? parseInt(limit, 10) : undefined);
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

  @Post('bridges/:bridge/restart')
  async restartBridge(@Param('bridge') bridge: string) {
    if (bridge !== 'zigbee' && bridge !== 'rfxcom') {
      throw new BadRequestException('bridge must be "zigbee" or "rfxcom"');
    }
    try {
      await this.system.restartBridgeService(bridge);
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
    return this.system.getHealth();
  }

  @Post('go2rtc/stop')
  async stopGo2rtc() {
    try {
      await this.system.stopGo2rtcService();
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
    return this.system.getHealth();
  }

  @Post('go2rtc/start')
  async startGo2rtc() {
    try {
      await this.system.startGo2rtcService();
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
    return this.system.getHealth();
  }

  @Post('tailscale/stop')
  async stopTailscale() {
    try {
      await this.system.stopTailscaleService();
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
    return this.system.getHealth();
  }

  @Post('tailscale/start')
  async startTailscale() {
    try {
      await this.system.startTailscaleService();
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
    return this.system.getHealth();
  }

  @Post('run-tests')
  runTests() {
    return this.system.runTests();
  }

  @Post('reboot')
  async reboot() {
    try {
      await this.system.rebootServer();
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
    return { ok: true };
  }
}
