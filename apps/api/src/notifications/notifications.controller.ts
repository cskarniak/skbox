import { Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NotificationService } from './notification.service';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Post('test/telegram')
  testTelegram() {
    return this.notifications.sendTelegram('Test Skbox : cette alarme fonctionne.');
  }

  @Post('test/email')
  testEmail() {
    return this.notifications.sendEmail('Test Skbox', 'Test Skbox : cette alarme fonctionne.');
  }
}
