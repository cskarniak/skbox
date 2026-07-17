import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DevicesModule } from './devices/devices.module';
import { MqttModule } from './mqtt/mqtt.module';
import { RoomsModule } from './rooms/rooms.module';
import { ParentObjectsModule } from './parent-objects/parent-objects.module';
import { ThemesModule } from './themes/themes.module';
import { ZigbeeModule } from './zigbee/zigbee.module';
import { RfxcomModule } from './rfxcom/rfxcom.module';
import { ScenariosModule } from './scenarios/scenarios.module';
import { ScenarioGroupsModule } from './scenario-groups/scenario-groups.module';
import { SystemModule } from './system/system.module';
import { SettingsModule } from './settings/settings.module';
import { BackupModule } from './backup/backup.module';
import { BoilerModule } from './boiler/boiler.module';
import { HistoryTemplatesModule } from './history-templates/history-templates.module';
import { CameraModule } from './camera/camera.module';
import { PrismaModule } from './prisma.module';
import { TriggerContextModule } from './scenarios/trigger-context.module';
import { WeatherModule } from './weather/weather.module';
import { NetworkHealthModule } from './network-health/network-health.module';
import { TerminalModule } from './terminal/terminal.module';
import { PresenceSimulationModule } from './presence-simulation/presence-simulation.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    TriggerContextModule,
    MqttModule,
    DevicesModule,
    RoomsModule,
    ParentObjectsModule,
    ThemesModule,
    ZigbeeModule,
    RfxcomModule,
    ScenariosModule,
    ScenarioGroupsModule,
    SystemModule,
    SettingsModule,
    BackupModule,
    BoilerModule,
    HistoryTemplatesModule,
    CameraModule,
    WeatherModule,
    NetworkHealthModule,
    TerminalModule,
    PresenceSimulationModule,
  ],
})
export class AppModule {}
