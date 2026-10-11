import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EnergyService } from './energy.service';

@ApiTags('energy')
@Controller('energy')
export class EnergyController {
  constructor(private readonly energy: EnergyService) {}

  @Get('electricity')
  getElectricity(@Query('days') days?: string) {
    return this.energy.getElectricityDaily(Number(days));
  }
}
