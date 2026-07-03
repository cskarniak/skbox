import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SystemService } from './system.service';

@ApiTags('system')
@Controller('system')
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get('health')
  getHealth() {
    return this.system.getHealth();
  }
}
