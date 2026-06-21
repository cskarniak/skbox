import { Protocol, DeviceType, DeviceStatus } from './protocol';

export interface Device {
  id: string;
  name: string;
  protocol: Protocol;
  type: DeviceType;
  status: DeviceStatus;
  room?: string;
  state: Record<string, unknown>;
  lastSeen: Date;
  createdAt: Date;
}

export interface DeviceCommand {
  deviceId: string;
  command: string;
  payload?: Record<string, unknown>;
}

export interface DeviceEvent {
  deviceId: string;
  event: string;
  data: Record<string, unknown>;
  timestamp: Date;
}
