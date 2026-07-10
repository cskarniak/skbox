import { Module } from '@nestjs/common';
import { ScenarioGroupsController } from './scenario-groups.controller';
import { ScenarioGroupsService } from './scenario-groups.service';

@Module({
  controllers: [ScenarioGroupsController],
  providers: [ScenarioGroupsService],
})
export class ScenarioGroupsModule {}
