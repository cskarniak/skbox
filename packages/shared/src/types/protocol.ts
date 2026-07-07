export enum Protocol {
  ZIGBEE = 'zigbee',
  MATTER = 'matter',
  MQTT = 'mqtt',
  RF433 = 'rf433',
}

export enum DeviceType {
  LIGHT = 'light',
  SWITCH = 'switch',
  SENSOR_TEMPERATURE = 'sensor_temperature',
  SENSOR_HUMIDITY = 'sensor_humidity',
  SENSOR_MOTION = 'sensor_motion',
  SENSOR_DOOR = 'sensor_door',
  SENSOR_RAIN = 'sensor_rain',
  SENSOR_WIND = 'sensor_wind',
  SENSOR_UV = 'sensor_uv',
  SENSOR_POWER = 'sensor_power',
  THERMOSTAT = 'thermostat',
  PLUG = 'plug',
  REMOTE = 'remote',
}

export enum DeviceStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  PAIRING = 'pairing',
}
