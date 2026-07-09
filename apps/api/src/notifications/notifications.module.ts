import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { NotificationService } from './notification.service';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [SettingsModule],
  controllers: [NotificationsController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
