import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoomsService } from './rooms.service';

@ApiTags('rooms')
@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get()
  findAll() {
    return this.rooms.findAll();
  }

  @Post()
  create(@Body() body: { name: string; icon?: string }) {
    return this.rooms.create(body.name, body.icon);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { name?: string; icon?: string }) {
    return this.rooms.update(id, body.name, body.icon);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.rooms.delete(id);
  }
}
