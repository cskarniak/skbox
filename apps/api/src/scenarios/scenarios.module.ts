import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ScenariosController } from './scenarios.controller';
import { ScenariosService } from './scenarios.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ScenariosController],
  providers: [ScenariosService],
})
export class ScenariosModule {}
