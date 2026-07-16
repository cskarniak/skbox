import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { TerminalService } from './terminal.service';
import { TerminalController } from './terminal.controller';
import { TerminalWsService } from './terminal-ws.service';

@Module({
  imports: [SettingsModule],
  controllers: [TerminalController],
  providers: [TerminalService, TerminalWsService],
  exports: [TerminalWsService],
})
export class TerminalModule {}
