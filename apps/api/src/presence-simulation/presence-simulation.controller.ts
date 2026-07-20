import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createPresenceSimulationSchema, updatePresenceSimulationSchema } from '@skbox/shared';
import { PresenceSimulationService } from './presence-simulation.service';

@ApiTags('presence-simulation')
@Controller('presence-simulation')
export class PresenceSimulationController {
  constructor(private readonly presenceSimulation: PresenceSimulationService) {}

  @Get()
  findAll() {
    return this.presenceSimulation.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.presenceSimulation.findById(id);
  }

  @Post()
  create(@Body() body: unknown) {
    const dto = createPresenceSimulationSchema.parse(body);
    return this.presenceSimulation.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    const dto = updatePresenceSimulationSchema.parse(body);
    return this.presenceSimulation.update(id, dto);
  }

  @Put(':id/enabled')
  setEnabled(@Param('id') id: string, @Body('enabled') enabled: boolean) {
    return this.presenceSimulation.setEnabled(id, enabled);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.presenceSimulation.delete(id);
  }

  @Get(':id/events')
  listEvents(@Param('id') id: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.presenceSimulation.listEvents(id, from, to);
  }

  @Delete(':id/runs/:date')
  regenerateRun(@Param('id') id: string, @Param('date') date: string) {
    return this.presenceSimulation.regenerateRun(id, date);
  }

  @Post('verify-now')
  verifyNow() {
    return this.presenceSimulation.verifyCompletedRuns();
  }
}
