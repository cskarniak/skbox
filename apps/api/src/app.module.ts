import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DevicesModule } from './devices/devices.module';
import { MqttModule } from './mqtt/mqtt.module';
import { RoomsModule } from './rooms/rooms.module';
import { PrismaModule } from './prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    DevicesModule,
    MqttModule,
    RoomsModule,
  ],
})
export class AppModule {}
