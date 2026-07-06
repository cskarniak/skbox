import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HistoryTemplatesService } from './history-templates.service';
import { createHistoryTemplateSchema, updateHistoryTemplateSchema } from '@skbox/shared';

@ApiTags('history-templates')
@Controller('history-templates')
export class HistoryTemplatesController {
  constructor(private readonly historyTemplates: HistoryTemplatesService) {}

  @Get()
  findAll() {
    return this.historyTemplates.findAll();
  }

  @Post()
  create(@Body() body: unknown) {
    const dto = createHistoryTemplateSchema.parse(body);
    return this.historyTemplates.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    const dto = updateHistoryTemplateSchema.parse(body);
    return this.historyTemplates.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.historyTemplates.delete(id);
  }
}
