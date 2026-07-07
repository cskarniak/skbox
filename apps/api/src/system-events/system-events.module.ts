import { Module } from '@nestjs/common';
import { SystemEventsService } from './system-events.service';

@Module({
  providers: [SystemEventsService],
  exports: [SystemEventsService],
})
export class SystemEventsModule {}
