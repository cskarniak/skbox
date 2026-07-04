import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { BackupConfig, BackupService } from './backup.service';

@ApiTags('backup')
@Controller('backup')
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Get()
  async list() {
    return this.backup.list();
  }

  @Get('config')
  async getConfig() {
    const config = await this.backup.getConfig();
    return { ...config, nextRun: this.backup.getNextRun() };
  }

  @Put('config')
  async setConfig(@Body() config: BackupConfig) {
    const saved = await this.backup.setConfig(config);
    return { ...saved, nextRun: this.backup.getNextRun() };
  }

  @Post('run')
  async run(@Body('mode') mode: 'daily' | 'full' = 'daily') {
    return this.backup.run(mode);
  }

  @Post('restore')
  async restore(@Body('filename') filename: string) {
    await this.backup.restore(filename);
    return { restored: filename };
  }

  @Delete(':filename')
  async delete(@Param('filename') filename: string) {
    this.backup.delete(filename);
    return { deleted: filename };
  }

  @Get(':filename/download')
  async download(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = this.backup.getFilePath(filename);
    res.download(filePath, filename);
  }
}
