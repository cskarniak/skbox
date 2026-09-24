import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { DisplayService } from './display.service';

function parseIds(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

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
  @ApiQuery({
    name: 'switches',
    required: false,
    description: 'Ids de prises / lumières séparés par des virgules (ordre conservé). Absent = aucune.',
  })
  getSummary(@Query('devices') devices?: string, @Query('switches') switches?: string) {
    const ids = parseIds(devices);
    return this.display.getSummary(ids.length ? ids : undefined, parseIds(switches));
  }
}
