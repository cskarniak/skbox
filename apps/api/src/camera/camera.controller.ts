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
  create(
    @Body()
    body: {
      name: string;
      room?: string | null;
      host: string;
      port?: number;
      path?: string;
      username?: string | null;
      password?: string | null;
      onvifPort?: number | null;
    },
  ) {
    if (!body.name?.trim() || !body.host?.trim()) {
      throw new BadRequestException('name et host sont requis');
    }
    return this.cameras.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      room?: string | null;
      host?: string;
      port?: number;
      path?: string;
      username?: string | null;
      password?: string | null;
      onvifPort?: number | null;
      active?: boolean;
      order?: number;
    },
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

  @Post(':id/ptz/move')
  async ptzMove(@Param('id') id: string, @Body() body: { x: number; y: number; zoom: number }) {
    try {
      await this.cameras.ptzMove(id, body.x, body.y, body.zoom);
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }

  @Post(':id/ptz/stop')
  async ptzStop(@Param('id') id: string) {
    try {
      await this.cameras.ptzStop(id);
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }

  @Get(':id/ptz/presets')
  async listPresets(@Param('id') id: string) {
    try {
      return await this.cameras.listPresets(id);
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }

  @Post(':id/ptz/presets')
  async savePreset(@Param('id') id: string, @Body() body: { name: string }) {
    if (!body.name?.trim()) throw new BadRequestException('name est requis');
    try {
      return { token: await this.cameras.savePreset(id, body.name.trim()) };
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }

  @Post(':id/ptz/presets/:token/goto')
  async gotoPreset(@Param('id') id: string, @Param('token') token: string) {
    try {
      await this.cameras.gotoPreset(id, token);
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }

  @Delete(':id/ptz/presets/:token')
  async removePreset(@Param('id') id: string, @Param('token') token: string) {
    try {
      await this.cameras.removePreset(id, token);
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }

  @Get(':id/imaging')
  async getImaging(@Param('id') id: string) {
    try {
      return await this.cameras.getImagingSettings(id);
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }

  @Get(':id/imaging/options')
  async getImagingOptions(@Param('id') id: string) {
    try {
      return await this.cameras.getImagingOptions(id);
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }

  @Patch(':id/imaging')
  async setImaging(
    @Param('id') id: string,
    @Body() body: { brightness?: number; contrast?: number; saturation?: number; sharpness?: number },
  ) {
    try {
      await this.cameras.setImagingSettings(id, body);
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }
}
