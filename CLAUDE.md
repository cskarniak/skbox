# Skbox - Box domotique

## Stack
- Monorepo pnpm workspaces
- API: NestJS 11 + Prisma (SQLite) + MQTT
- Web: Next.js 16 + React 19 + Mantine 7 + TanStack Query + Zustand
- Packages: @skbox/db (Prisma), @skbox/shared (types/schemas Zod)
- Docker: Mosquitto (MQTT broker), Redis

## Commands
- `./start.sh` — start everything (Docker + Z2M + API + Web)
- `./stop.sh` — stop everything
- `pnpm dev` — start API + Web only
- `pnpm dev:api` — API only (port 3001)
- `pnpm dev:web` — Web only (port 3002)
- `pnpm db:migrate` — run Prisma migrations
- `pnpm db:seed` — seed rooms
- `pnpm db:studio` — Prisma Studio
- `pnpm docker:up` — start Mosquitto + Redis

## Zigbee2MQTT (native)
- Install: `~/zigbee2mqtt` (v1.42.0, git clone + npm ci + npm run build)
- Config: `~/zigbee2mqtt/data/configuration.yaml`
- Dongle: Sonoff ZBDongle-E (Silicon Labs EFR32MG21) on `/dev/cu.usbserial-14220`
- UI: http://localhost:8080
- Runs natively (not Docker) because macOS doesn't support USB passthrough in Docker

## rfxcom2mqtt (native)
- Install: `npm i -g rfxcom2mqtt`
- Config: `rfxcom2mqtt/config.yml` (in project root)
- Dongle: RFXtrx433E on `/dev/cu.usbserial-*`
- Capteurs: Oregon Scientific (température/humidité), Chacon/DIO (interrupteurs/prises)
- Runs natively (same USB passthrough reason as Z2M)

## Architecture
- Protocols: Zigbee (via Zigbee2MQTT), RF433 (via rfxcom2mqtt + RFXtrx433E), Matter, MQTT
- API routes prefixed with `/api`
- MQTT topics: `skbox/{protocol}/{deviceId}/{command|state}`
- Zigbee2MQTT topics: `zigbee2mqtt/{friendlyName}` (state), `zigbee2mqtt/{friendlyName}/set` (command)
- rfxcom2mqtt topics: `rfxcom2mqtt/receive/{type}` (state), `rfxcom2mqtt/send/{type}` (command)
- Auto-discovery: ZigbeeService listens to `zigbee2mqtt/bridge/devices`, RfxcomService listens to `rfxcom2mqtt/receive/+`
- Swagger docs at http://localhost:3001/docs
- Zigbee2MQTT UI at http://localhost:8080
