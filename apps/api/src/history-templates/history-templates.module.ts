import { Module } from '@nestjs/common';
import { HistoryTemplatesController } from './history-templates.controller';
import { HistoryTemplatesService } from './history-templates.service';

@Module({
  controllers: [HistoryTemplatesController],
  providers: [HistoryTemplatesService],
})
export class HistoryTemplatesModule {}
