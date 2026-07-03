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
import { ScenariosService } from './scenarios.service';
import { createScenarioSchema, updateScenarioSchema } from '@skbox/shared';

@ApiTags('scenarios')
@Controller('scenarios')
export class ScenariosController {
  constructor(private readonly scenarios: ScenariosService) {}

  @Get()
  findAll() {
    return this.scenarios.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.scenarios.findById(id);
  }

  @Post()
  create(@Body() body: unknown) {
    const dto = createScenarioSchema.parse(body);
    return this.scenarios.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    const dto = updateScenarioSchema.parse(body);
    return this.scenarios.update(id, dto);
  }

  @Post(':id/test')
  test(@Param('id') id: string) {
    return this.scenarios.testScenario(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.scenarios.delete(id);
  }
}
