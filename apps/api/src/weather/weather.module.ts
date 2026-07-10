import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { WeatherService } from './weather.service';
import { WeatherController } from './weather.controller';

@Module({
  imports: [SettingsModule],
  controllers: [WeatherController],
  providers: [WeatherService],
})
export class WeatherModule {}
