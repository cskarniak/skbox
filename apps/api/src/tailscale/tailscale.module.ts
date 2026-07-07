import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { TailscaleService } from './tailscale.service';

@Module({
  imports: [SettingsModule],
  providers: [TailscaleService],
  exports: [TailscaleService],
})
export class TailscaleModule {}
