#!/bin/bash

SKBOX_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SKBOX_DIR"

echo "=== Skbox — Démarrage ==="

echo "0. Nettoyage des anciens process..."
pkill -9 -f "zigbee2mqtt/index.js" 2>/dev/null || true
pkill -9 -f "rfxcom2mqtt/src/index.ts" 2>/dev/null || true
pkill -9 -f "nest start" 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true
lsof -ti :3001 -ti :3002 -ti :8080 -ti :8891 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1

echo "1. Docker (Mosquitto + Redis)..."
docker compose -f docker/docker-compose.yml up -d

echo "2. Zigbee2MQTT..."
ZIGBEE2MQTT_DATA="$HOME/zigbee2mqtt/data" node "$HOME/zigbee2mqtt/index.js" &
Z2M_PID=$!

echo "3. rfxcom2mqtt..."
if [ -d "$HOME/rfxcom2mqtt" ]; then
  export RFXCOM2MQTT_DATA="$HOME/rfxcom2mqtt/config/"
  (cd "$HOME/rfxcom2mqtt" && npx ts-node src/index.ts) &
  RFXCOM_PID=$!
else
  echo "   ⚠ rfxcom2mqtt non installé (git clone https://github.com/rfxcom2mqtt/backend.git ~/rfxcom2mqtt)"
  RFXCOM_PID=""
fi

sleep 5

echo "4. API + Web..."
pnpm dev &
DEV_PID=$!

echo ""
echo "=== Skbox démarré ==="
echo "  Dashboard : http://localhost:3002"
echo "  API       : http://localhost:3001/api"
echo "  Swagger   : http://localhost:3001/docs"
echo "  Z2M       : http://localhost:8080"
echo "  RFXcom    : http://localhost:8891"
echo ""
echo "Ctrl+C pour arrêter"

trap "kill $Z2M_PID $RFXCOM_PID $DEV_PID 2>/dev/null; docker compose -f docker/docker-compose.yml down" EXIT
wait
