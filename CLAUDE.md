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
- `pnpm test` — run unit tests (Vitest; currently `apps/api` only: `BoilerService`, `ScenariosService`)

## Zigbee2MQTT (native)
- Install: `~/zigbee2mqtt` (v1.42.0, git clone + npm ci + npm run build)
- Config: `~/zigbee2mqtt/data/configuration.yaml`
- Dongle: Sonoff ZBDongle-E (Silicon Labs EFR32MG21) on `/dev/cu.usbserial-14220`
- UI: http://localhost:8080
- Runs natively (not Docker) because macOS doesn't support USB passthrough in Docker

## rfxcom2mqtt (native)
- Install: git clone of https://github.com/rfxcom2mqtt/backend (`~/rfxcom2mqtt` on skbox-mini), run via `ts-node src/index.ts` under systemd (`skbox-rfxcom.service`) — not the npm package.
- Config: `~/rfxcom2mqtt/config/config.yml` on each host (also a `rfxcom2mqtt/config.yml` at the Skbox project root for local dev)
- Dongle: RFXtrx433E on `/dev/cu.usbserial-*` (macOS) / `/dev/serial/by-id/usb-RFXCOM_RFXtrx433_*` (Linux/skbox-mini)
- Capteurs: Oregon Scientific (température/humidité), Chacon/DIO (interrupteurs/prises, protocole `lighting2`/subtype `AC`)
- Runs natively (same USB passthrough reason as Z2M)
- **Bugs upstream patchés manuellement sur skbox-mini** (pas trackés dans un commit Skbox, donc perdus si le dépôt `~/rfxcom2mqtt` est réinstallé/mis à jour — à réappliquer si besoin) dans `~/rfxcom2mqtt/src/rfxcom/index.ts`, fonction `onCommandDefault` :
  - Le payload MQTT de commande n'était jamais `JSON.parse()`é (contrairement à `onCommandRfy` juste à côté), donc `payload.deviceFunction`/`payload.subtype` étaient toujours `undefined` — commande silencieusement ignorée.
  - `this.rfxtrx.get()` (une méthode qui n'existe que sur le wrapper `Rfxcom`, pas sur l'objet RFXCOM sous-jacent) était appelé au lieu de `this.rfxtrx` directement — plantait le service à l'instanciation de la classe (`Lighting1/2/5/6`, etc.).
  - Ces deux bugs faisaient planter *tout le bridge* (`skbox-rfxcom.service` en boucle de crash) dès qu'une commande RF433 de type lighting (switch) était envoyée.

## Architecture
- Protocols: Zigbee (via Zigbee2MQTT), RF433 (via rfxcom2mqtt + RFXtrx433E), Matter, MQTT
- API routes prefixed with `/api`
- MQTT topics: `skbox/{protocol}/{deviceId}/{command|state}`
- Zigbee2MQTT topics: `zigbee2mqtt/{friendlyName}` (state), `zigbee2mqtt/{friendlyName}/set` (command), `zigbee2mqtt/{friendlyName}/availability` (online/offline)
- rfxcom2mqtt topics: `rfxcom2mqtt/devices/{id}` or `rfxcom2mqtt/devices/{id}/{unitCode}` (state — the bridge appends `/{unitCode}` for protocols like Chacon/DIO `lighting2` where a single physical remote/id has multiple buttons, e.g. 1-4), `rfxcom2mqtt/command/{PascalCaseType}/{id}[/unitCode]` (command — note the type segment must be the exact PascalCase rfxcom class name, e.g. `Lighting2`, not `lighting2`; the lowercase form is only the subtype-name enum and has no constructor). Command payload must be JSON `{ deviceFunction: 'switchOn'|'switchOff'|..., subtype: <numeric code>, ... }` — `subtype` (e.g. `0` = AC for Chacon/DIO) comes from the device's last received state and is persisted in `Device.state` for this purpose. `rfxcom2mqtt/send/...` is **not** a real topic (the bridge only subscribes to `rfxcom2mqtt/command/#`) despite older docs/code suggesting otherwise.
- Auto-discovery: ZigbeeService listens to `zigbee2mqtt/bridge/devices`, RfxcomService listens to `rfxcom2mqtt/devices/#` (must be `#`, not `+` — a single-level wildcard misses the `/{unitCode}` suffix present on multi-button RF433 remotes)
- RF433 device identity (`Device.rfxcomId`) is `{type}/{id}` or `{type}/{id}/{unitCode}` — the unitCode is part of the identity so that each button of a multi-button Chacon/DIO remote becomes its own `Device` row instead of overwriting a shared one.
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
- Pushing to `origin/main` implies permission to deploy: run the deploy (`ssh skbox-mini 'cd ~/skbox && git pull && bash deploy/deploy.sh'`) right after a push without asking again. (Until 2026-07-09 this required a separate explicit confirmation per deploy — the user lifted that requirement so a push alone is now sufficient authorization.)
- Still ask first if deploying independently of a push you just made (e.g. redeploying an older commit, or after someone else pushed).

## Deletion confirmations (UI convention)
- **Simple deletion** (default): removing an object or a stored record (a graph/panel, a scenario, a room, a theme, etc.) requires a lightweight confirmation — a short message plus a Yes/No (Oui/Non) button, no typed input. Use this unless told otherwise.
- **Secure deletion** (only when explicitly requested for a given feature): the confirmation additionally requires typing "OUI" in full before the delete button is enabled. Reserve this for destructive, hard-to-recover bulk actions (e.g. clearing all of a device's history) — see `ClearHistoryConfirm` in `apps/web/src/app/settings/devices/page.tsx` for the reference pattern.
- Don't retrofit this onto every existing delete action unprompted — apply it going forward, and when asked to touch a delete flow that doesn't have it yet.
