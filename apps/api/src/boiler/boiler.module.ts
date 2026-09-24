import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { BoilerService } from './boiler.service';
import { BoilerController } from './boiler.controller';

@Module({
  imports: [SettingsModule],
  controllers: [BoilerController],
  providers: [BoilerService],
  exports: [BoilerService],
})
export class BoilerModule {}
