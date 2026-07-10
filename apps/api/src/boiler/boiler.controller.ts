import { Body, Controller, Delete, Get, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BoilerConfig, BoilerService, LEVEL_LABELS, LevelKey } from './boiler.service';

@ApiTags('boiler')
@Controller('boiler')
export class BoilerController {
  constructor(private readonly boiler: BoilerService) {}

  @Get('levels')
  getLevels() {
    return LEVEL_LABELS;
  }

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
  setBoost(@Body('level') level: LevelKey, @Body('minutes') minutes: number) {
    return this.boiler.setBoost(level, minutes);
  }

  @Delete('boost')
  clearBoost() {
    return this.boiler.clearBoost();
  }

  @Put('enabled')
  setEnabled(@Body('enabled') enabled: boolean) {
    return this.boiler.setEnabled(enabled);
  }
}
