import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ParentObjectsService } from './parent-objects.service';

@ApiTags('parent-objects')
@Controller('parent-objects')
export class ParentObjectsController {
  constructor(private readonly parentObjects: ParentObjectsService) {}

  @Get()
  findAll() {
    return this.parentObjects.findAll();
  }

  @Post()
  create(@Body() body: { name: string; icon?: string }) {
    return this.parentObjects.create(body.name, body.icon);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { name?: string; icon?: string }) {
    return this.parentObjects.update(id, body.name, body.icon);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.parentObjects.delete(id);
  }
}
