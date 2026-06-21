# Skbox - Box domotique

## Stack
- Monorepo pnpm workspaces
- API: NestJS 11 + Prisma (SQLite) + MQTT
- Web: Next.js 16 + React 19 + Mantine 7 + TanStack Query + Zustand
- Packages: @skbox/db (Prisma), @skbox/shared (types/schemas Zod)
- Docker: Mosquitto (MQTT broker), Redis

## Commands
- `pnpm dev` — start all apps
- `pnpm dev:api` — API only (port 3001)
- `pnpm dev:web` — Web only (port 3002)
- `pnpm db:migrate` — run Prisma migrations
- `pnpm db:seed` — seed rooms
- `pnpm db:studio` — Prisma Studio
- `pnpm docker:up` — start Mosquitto + Redis

## Architecture
- Protocols: Zigbee, Matter, MQTT
- API routes prefixed with `/api`
- MQTT topics: `skbox/{protocol}/{deviceId}/{command|state}`
- Swagger docs at http://localhost:3001/docs
