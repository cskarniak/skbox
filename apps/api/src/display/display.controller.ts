import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { DisplayService } from './display.service';

@ApiTags('display')
@Controller('display')
export class DisplayController {
  constructor(private readonly display: DisplayService) {}

  @Get('summary')
  @ApiQuery({
    name: 'devices',
    required: false,
    description: "Ids de capteurs séparés par des virgules (ordre conservé). Absent = tous les capteurs de température visibles.",
  })
  getSummary(@Query('devices') devices?: string) {
    const ids = devices
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    return this.display.getSummary(ids?.length ? ids : undefined);
  }
}
