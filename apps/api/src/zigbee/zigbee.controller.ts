import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZigbeeService } from './zigbee.service';

@ApiTags('zigbee')
@Controller('zigbee')
export class ZigbeeController {
  constructor(private readonly zigbee: ZigbeeService) {}

  @Post('permit-join')
  permitJoin(@Body() body: { enable: boolean; duration?: number }) {
    return this.zigbee.permitJoin(body.enable, body.duration);
  }

  @Post('devices/:ieeeAddress/command')
  sendCommand(
    @Param('ieeeAddress') ieeeAddress: string,
    @Body() command: Record<string, unknown>,
  ) {
    return this.zigbee.sendCommand(ieeeAddress, command);
  }
}
