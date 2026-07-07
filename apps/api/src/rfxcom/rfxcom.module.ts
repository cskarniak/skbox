import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { SettingsModule } from '../settings/settings.module';
import { SystemEventsModule } from '../system-events/system-events.module';
import { RfxcomService } from './rfxcom.service';
import { RfxcomController } from './rfxcom.controller';

@Module({
  imports: [DevicesModule, SettingsModule, SystemEventsModule],
  controllers: [RfxcomController],
  providers: [RfxcomService],
  exports: [RfxcomService],
})
export class RfxcomModule {}
