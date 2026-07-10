import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ScenarioGroupsService } from './scenario-groups.service';

@ApiTags('scenario-groups')
@Controller('scenario-groups')
export class ScenarioGroupsController {
  constructor(private readonly scenarioGroups: ScenarioGroupsService) {}

  @Get()
  findAll() {
    return this.scenarioGroups.findAll();
  }

  @Post()
  create(@Body() body: { name: string }) {
    return this.scenarioGroups.create(body.name);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { name: string }) {
    return this.scenarioGroups.update(id, body.name);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.scenarioGroups.delete(id);
  }
}
