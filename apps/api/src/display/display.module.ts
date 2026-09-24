import { Module } from '@nestjs/common';
import { BoilerModule } from '../boiler/boiler.module';
import { DisplayController } from './display.controller';
import { DisplayService } from './display.service';

// Données compactes destinées aux afficheurs externes (M5Stack PaperS3 e-ink...) :
// un seul appel HTTP, JSON déjà mis en forme, pour limiter le travail côté ESP32.
@Module({
  imports: [BoilerModule],
  controllers: [DisplayController],
  providers: [DisplayService],
})
export class DisplayModule {}
