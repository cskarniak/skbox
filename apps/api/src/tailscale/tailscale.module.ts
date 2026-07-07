import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { SystemEventsModule } from '../system-events/system-events.module';
import { TailscaleService } from './tailscale.service';

@Module({
  imports: [SettingsModule, SystemEventsModule],
  providers: [TailscaleService],
  exports: [TailscaleService],
})
export class TailscaleModule {}
