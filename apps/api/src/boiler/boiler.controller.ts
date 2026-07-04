import { Body, Controller, Delete, Get, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BoilerConfig, BoilerService } from './boiler.service';

@ApiTags('boiler')
@Controller('boiler')
export class BoilerController {
  constructor(private readonly boiler: BoilerService) {}

  @Get('config')
  getConfig() {
    return this.boiler.getConfig();
  }

  @Put('config')
  setConfig(@Body() config: BoilerConfig) {
    return this.boiler.setConfig(config);
  }

  @Get('status')
  getStatus() {
    return this.boiler.getStatus();
  }

  @Post('boost')
  setBoost(@Body('mode') mode: 'on' | 'off', @Body('minutes') minutes: number) {
    return this.boiler.setBoost(mode, minutes);
  }

  @Delete('boost')
  clearBoost() {
    return this.boiler.clearBoost();
  }
}
