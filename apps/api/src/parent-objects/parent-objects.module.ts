import { Module } from '@nestjs/common';
import { ParentObjectsController } from './parent-objects.controller';
import { ParentObjectsService } from './parent-objects.service';

@Module({
  controllers: [ParentObjectsController],
  providers: [ParentObjectsService],
})
export class ParentObjectsModule {}
