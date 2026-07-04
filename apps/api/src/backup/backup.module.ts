import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { BackupService } from './backup.service';
import { BackupController } from './backup.controller';

@Module({
  imports: [SettingsModule],
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
