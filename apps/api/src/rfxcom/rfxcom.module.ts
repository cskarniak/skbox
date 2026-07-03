import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { RfxcomService } from './rfxcom.service';
import { RfxcomController } from './rfxcom.controller';

@Module({
  imports: [DevicesModule],
  controllers: [RfxcomController],
  providers: [RfxcomService],
})
export class RfxcomModule {}
