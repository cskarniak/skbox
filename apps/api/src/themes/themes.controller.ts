import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ThemesService } from './themes.service';
import { createThemeSchema, updateThemeSchema } from '@skbox/shared';

@ApiTags('themes')
@Controller('themes')
export class ThemesController {
  constructor(private readonly themes: ThemesService) {}

  @Get()
  findAll() {
    return this.themes.findAll();
  }

  @Post()
  create(@Body() body: unknown) {
    const dto = createThemeSchema.parse(body);
    return this.themes.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    const dto = updateThemeSchema.parse(body);
    return this.themes.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.themes.delete(id);
  }
}
