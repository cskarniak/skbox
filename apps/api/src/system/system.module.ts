import { Module } from '@nestjs/common';
import { ZigbeeModule } from '../zigbee/zigbee.module';
import { RfxcomModule } from '../rfxcom/rfxcom.module';
import { TailscaleModule } from '../tailscale/tailscale.module';
import { SystemService } from './system.service';
import { SystemController } from './system.controller';

@Module({
  imports: [ZigbeeModule, RfxcomModule, TailscaleModule],
  controllers: [SystemController],
  providers: [SystemService],
})
export class SystemModule {}
