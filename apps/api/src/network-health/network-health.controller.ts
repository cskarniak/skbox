import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NetworkHealthService } from './network-health.service';

@ApiTags('network-health')
@Controller('network-health')
export class NetworkHealthController {
  constructor(private readonly networkHealth: NetworkHealthService) {}

  @Get()
  getLastReport() {
    return this.networkHealth.getLastReport();
  }

  @Post('scan')
  scan() {
    return this.networkHealth.scan();
  }
}
