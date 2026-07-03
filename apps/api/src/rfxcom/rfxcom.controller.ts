import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RfxcomService } from './rfxcom.service';

@ApiTags('rfxcom')
@Controller('rfxcom')
export class RfxcomController {
  constructor(private readonly rfxcom: RfxcomService) {}

  @Post('devices/:rfxcomId/command')
  sendCommand(
    @Param('rfxcomId') rfxcomId: string,
    @Body() command: Record<string, unknown>,
  ) {
    return this.rfxcom.sendCommand(rfxcomId, command);
  }
}
