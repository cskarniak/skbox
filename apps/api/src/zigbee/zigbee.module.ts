import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { SettingsModule } from '../settings/settings.module';
import { ZigbeeService } from './zigbee.service';
import { ZigbeeController } from './zigbee.controller';

@Module({
  imports: [DevicesModule, SettingsModule],
  controllers: [ZigbeeController],
  providers: [ZigbeeService],
  exports: [ZigbeeService],
})
export class ZigbeeModule {}
