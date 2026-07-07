import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CameraService } from './camera.service';

@ApiTags('camera')
@Controller('cameras')
export class CameraController {
  constructor(private readonly cameras: CameraService) {}

  @Get()
  findAll() {
    return this.cameras.findAll();
  }

  @Post()
  create(@Body() body: { name: string; room?: string | null; rtspUrl: string }) {
    if (!body.name?.trim() || !body.rtspUrl?.trim()) {
      throw new BadRequestException('name et rtspUrl sont requis');
    }
    return this.cameras.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { name?: string; room?: string | null; rtspUrl?: string; active?: boolean; order?: number },
  ) {
    return this.cameras.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cameras.remove(id);
  }

  @Get(':id/snapshot')
  async snapshot(@Param('id') id: string, @Res() res: Response) {
    try {
      const buffer = await this.cameras.getSnapshot(id);
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'no-store');
      res.send(buffer);
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }
}
