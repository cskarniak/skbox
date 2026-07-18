import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { netatmoConnectSchema, netatmoCredentialsSchema } from '@skbox/shared';
import { NetatmoService } from './netatmo.service';

@ApiTags('netatmo')
@Controller('netatmo')
export class NetatmoController {
  constructor(private readonly netatmo: NetatmoService) {}

  @Get('status')
  getStatus() {
    return this.netatmo.getStatus();
  }

  @Put('credentials')
  async saveCredentials(@Body() body: unknown) {
    const dto = netatmoCredentialsSchema.parse(body);
    await this.netatmo.saveCredentials(dto.clientId, dto.clientSecret);
    return this.netatmo.getStatus();
  }

  @Get('authorize-url')
  async getAuthorizeUrl() {
    return { url: await this.netatmo.getAuthorizeUrl() };
  }

  @Post('connect')
  connect(@Body() body: unknown) {
    const dto = netatmoConnectSchema.parse(body);
    return this.netatmo.connect(dto.code);
  }

  @Post('disconnect')
  disconnect() {
    return this.netatmo.disconnect();
  }

  @Post('sync-now')
  syncNow() {
    return this.netatmo.syncNow();
  }
}
