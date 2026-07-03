import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { ZigbeeService } from './zigbee.service';
import { ZigbeeController } from './zigbee.controller';

@Module({
  imports: [DevicesModule],
  controllers: [ZigbeeController],
  providers: [ZigbeeService],
})
export class ZigbeeModule {}
