#!/bin/bash
set -euo pipefail

SKBOX_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SKBOX_DIR"

MODE="${1:-daily}"
if [[ "$MODE" != "daily" && "$MODE" != "full" ]]; then
  echo "Usage: $0 [daily|full]"
  echo "  daily : DB + réseau Zigbee/RF433 (appariement) + .env — sauvegarde des données irremplaçables"
  echo "  full  : daily + configs de déploiement (systemd, mosquitto, docker) — pour reconstruction complète"
  exit 1
fi

Z2M_DATA="$HOME/zigbee2mqtt/data"
RFXCOM_DATA="$HOME/rfxcom2mqtt/config"
BACKUP_DIR="$SKBOX_DIR/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

mkdir -p "$BACKUP_DIR"

echo "=== Skbox — Sauvegarde ($MODE) ==="

# DATABASE_URL="file:../../skbox.db" dans .env est résolu relativement à packages/db/prisma/,
# donc le fichier réel vit à packages/skbox.db (et non packages/db/skbox.db).
DB_FILE="packages/skbox.db"

echo "1. Base de données..."
if command -v sqlite3 >/dev/null 2>&1 && [ -f "$DB_FILE" ]; then
  sqlite3 "$DB_FILE" ".backup '$WORK_DIR/skbox.db'"
else
  cp "$DB_FILE" "$WORK_DIR/skbox.db" 2>/dev/null || echo "   ⚠ $DB_FILE introuvable"
fi

echo "2. Réseau Zigbee (Z2M)..."
if [ -d "$Z2M_DATA" ]; then
  mkdir -p "$WORK_DIR/zigbee2mqtt"
  for f in configuration.yaml database.db coordinator_backup.json state.json; do
    [ -f "$Z2M_DATA/$f" ] && cp "$Z2M_DATA/$f" "$WORK_DIR/zigbee2mqtt/"
  done
else
  echo "   ⚠ $Z2M_DATA introuvable"
fi

echo "3. Réseau RF433 (rfxcom2mqtt)..."
if [ -d "$RFXCOM_DATA" ]; then
  mkdir -p "$WORK_DIR/rfxcom2mqtt"
  for f in config.yml devices.json state.json; do
    [ -f "$RFXCOM_DATA/$f" ] && cp "$RFXCOM_DATA/$f" "$WORK_DIR/rfxcom2mqtt/"
  done
else
  echo "   ⚠ $RFXCOM_DATA introuvable"
fi

echo "4. .env..."
[ -f "$SKBOX_DIR/.env" ] && cp "$SKBOX_DIR/.env" "$WORK_DIR/.env"

if [ "$MODE" = "full" ]; then
  echo "5. Configs de déploiement (systemd, mosquitto, docker)..."
  mkdir -p "$WORK_DIR/deploy" "$WORK_DIR/docker"
  cp -r deploy/. "$WORK_DIR/deploy/" 2>/dev/null || true
  cp -r docker/. "$WORK_DIR/docker/" 2>/dev/null || true
fi

ARCHIVE="$BACKUP_DIR/skbox-$MODE-$STAMP.tar.gz"
tar -czf "$ARCHIVE" -C "$WORK_DIR" .

echo ""
echo "=== Sauvegarde terminée : $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1)) ==="

if [ "$MODE" = "daily" ]; then
  echo "Nettoyage des sauvegardes 'daily' de plus de 14 jours..."
  find "$BACKUP_DIR" -name "skbox-daily-*.tar.gz" -mtime +14 -delete
fi
