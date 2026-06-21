export enum Protocol {
  ZIGBEE = 'zigbee',
  MATTER = 'matter',
  MQTT = 'mqtt',
}

export enum DeviceType {
  LIGHT = 'light',
  SWITCH = 'switch',
  SENSOR_TEMPERATURE = 'sensor_temperature',
  SENSOR_HUMIDITY = 'sensor_humidity',
  SENSOR_MOTION = 'sensor_motion',
  SENSOR_DOOR = 'sensor_door',
  THERMOSTAT = 'thermostat',
  PLUG = 'plug',
}

export enum DeviceStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  PAIRING = 'pairing',
}
