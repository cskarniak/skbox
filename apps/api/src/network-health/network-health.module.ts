import { Module } from '@nestjs/common';
import { NetworkHealthService } from './network-health.service';
import { NetworkHealthController } from './network-health.controller';

@Module({
  controllers: [NetworkHealthController],
  providers: [NetworkHealthService],
})
export class NetworkHealthModule {}
