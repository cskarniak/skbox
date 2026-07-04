import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get(':key')
  async get(@Param('key') key: string) {
    const value = await this.settings.get(key);
    return { key, value };
  }

  @Put(':key')
  async set(@Param('key') key: string, @Body() body: { value: string }) {
    await this.settings.set(key, body.value);
    return { key, value: body.value };
  }
}
