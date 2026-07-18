import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { NetatmoController } from './netatmo.controller';
import { NetatmoService } from './netatmo.service';

@Module({
  imports: [SettingsModule],
  controllers: [NetatmoController],
  providers: [NetatmoService],
})
export class NetatmoModule {}
