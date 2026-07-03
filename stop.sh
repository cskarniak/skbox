#!/bin/bash

SKBOX_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SKBOX_DIR"

echo "=== Skbox — Arrêt ==="
pkill -9 -f "zigbee2mqtt/index.js" 2>/dev/null || true
pkill -9 -f "rfxcom2mqtt" 2>/dev/null || true
pkill -9 -f "nest start" 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "pnpm.*dev" 2>/dev/null || true
lsof -ti :3001 -ti :3002 -ti :8080 -ti :8891 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1
docker compose -f docker/docker-compose.yml down 2>/dev/null || true
echo "Arrêté."
