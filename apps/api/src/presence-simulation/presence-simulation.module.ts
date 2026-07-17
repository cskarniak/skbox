import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { WeatherModule } from '../weather/weather.module';
import { PresenceSimulationController } from './presence-simulation.controller';
import { PresenceSimulationService } from './presence-simulation.service';

@Module({
  imports: [NotificationsModule, WeatherModule],
  controllers: [PresenceSimulationController],
  providers: [PresenceSimulationService],
})
export class PresenceSimulationModule {}
