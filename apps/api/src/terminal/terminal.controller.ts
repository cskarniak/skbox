import { BadRequestException, Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TerminalService } from './terminal.service';

@ApiTags('terminal')
@Controller('system/terminal')
export class TerminalController {
  constructor(private readonly terminal: TerminalService) {}

  @Get('status')
  async status() {
    return { configured: await this.terminal.isConfigured() };
  }

  @Post('setup')
  async setup(@Body('password') password: string) {
    try {
      await this.terminal.setup(password);
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
    return { configured: true };
  }

  @Put('password')
  async changePassword(
    @Body('currentPassword') currentPassword: string,
    @Body('newPassword') newPassword: string,
  ) {
    try {
      await this.terminal.changePassword(currentPassword, newPassword);
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
    return { ok: true };
  }
}
