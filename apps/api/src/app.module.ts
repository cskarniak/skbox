import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DevicesModule } from './devices/devices.module';
import { MqttModule } from './mqtt/mqtt.module';
import { RoomsModule } from './rooms/rooms.module';
import { ZigbeeModule } from './zigbee/zigbee.module';
import { RfxcomModule } from './rfxcom/rfxcom.module';
import { ScenariosModule } from './scenarios/scenarios.module';
import { PrismaModule } from './prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    MqttModule,
    DevicesModule,
    RoomsModule,
    ZigbeeModule,
    RfxcomModule,
    ScenariosModule,
  ],
})
export class AppModule {}
