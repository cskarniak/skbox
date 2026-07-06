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
- Zigbee2MQTT topics: `zigbee2mqtt/{friendlyName}` (state), `zigbee2mqtt/{friendlyName}/set` (command), `zigbee2mqtt/{friendlyName}/availability` (online/offline)
- rfxcom2mqtt topics: `rfxcom2mqtt/receive/{type}` (state), `rfxcom2mqtt/send/{type}` (command)
- Auto-discovery: ZigbeeService listens to `zigbee2mqtt/bridge/devices`, RfxcomService listens to `rfxcom2mqtt/receive/+`
- Device online/offline status for Zigbee devices comes from Z2M's per-device availability ping, not just from the last state message — a device that stops responding gets marked offline even if the Z2M bridge itself stays connected. Required in `configuration.yaml` on every Z2M install/server:
  ```yaml
  availability:
    active:
      timeout: 5
  ```
  Timeout is set to 5min (Z2M default is 10min) so that critical devices (e.g. the boiler-control Shelly relay) are detected offline promptly, without polling so aggressively it strains the network.
- Swagger docs at http://localhost:3001/docs
- Zigbee2MQTT UI at http://localhost:8080

## Deploying to the test server (skbox-mini)
- **Always ask for explicit confirmation before running the deploy** (`ssh skbox-mini 'cd ~/skbox && git pull && bash deploy/deploy.sh'`), even right after finishing and verifying a fix. Committing and pushing to `origin/main` does not imply permission to deploy.
- Committing to git still doesn't require asking (per standing repo convention), only the deploy step itself.

## Deletion confirmations (UI convention)
- **Simple deletion** (default): removing an object or a stored record (a graph/panel, a scenario, a room, a theme, etc.) requires a lightweight confirmation — a short message plus a Yes/No (Oui/Non) button, no typed input. Use this unless told otherwise.
- **Secure deletion** (only when explicitly requested for a given feature): the confirmation additionally requires typing "OUI" in full before the delete button is enabled. Reserve this for destructive, hard-to-recover bulk actions (e.g. clearing all of a device's history) — see `ClearHistoryConfirm` in `apps/web/src/app/settings/devices/page.tsx` for the reference pattern.
- Don't retrofit this onto every existing delete action unprompted — apply it going forward, and when asked to touch a delete flow that doesn't have it yet.
