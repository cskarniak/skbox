import { Global, Module } from '@nestjs/common';
import { TriggerContextService } from './trigger-context.service';

@Global()
@Module({
  providers: [TriggerContextService],
  exports: [TriggerContextService],
})
export class TriggerContextModule {}
