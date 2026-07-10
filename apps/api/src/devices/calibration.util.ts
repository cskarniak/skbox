import type { Device } from '@prisma/client';

// Corrige les lectures brutes d'un capteur avec les offsets réglés pour compenser
// une sonde qui lit systématiquement trop haut/trop bas (ex: +0.5°C).
export function applySensorCalibration(
  state: Record<string, unknown>,
  device: Pick<Device, 'temperatureOffset' | 'humidityOffset'>,
): Record<string, unknown> {
  const corrected = { ...state };

  if (typeof corrected.temperature === 'number' && device.temperatureOffset) {
    corrected.temperature = Math.round((corrected.temperature + device.temperatureOffset) * 10) / 10;
  }
  if (typeof corrected.humidity === 'number' && device.humidityOffset) {
    corrected.humidity = Math.round((corrected.humidity + device.humidityOffset) * 10) / 10;
  }

  return corrected;
}
