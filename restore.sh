#!/bin/bash
set -euo pipefail

SKBOX_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SKBOX_DIR"

ARCHIVE=""
WITH_DEPLOY=false
ASSUME_YES=false
for arg in "$@"; do
  case "$arg" in
    --with-deploy) WITH_DEPLOY=true ;;
    -y|--yes) ASSUME_YES=true ;;
    *) ARCHIVE="$arg" ;;
  esac
done

if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "Usage: $0 <archive.tar.gz> [--with-deploy] [--yes]"
  echo ""
  echo "Sauvegardes disponibles :"
  ls -1t backups/*.tar.gz 2>/dev/null || echo "  (aucune dans ./backups)"
  exit 1
fi

Z2M_DATA="$HOME/zigbee2mqtt/data"
RFXCOM_DATA="$HOME/rfxcom2mqtt/config"
STAMP="$(date +%Y%m%d-%H%M%S)"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "=== Skbox — Restauration depuis $ARCHIVE ==="
if [ "$ASSUME_YES" = false ]; then
  read -p "Ceci va écraser la DB, les configs Zigbee/RF433 et l'.env actuels (une copie de sécurité sera faite avant). Continuer ? [y/N] " CONFIRM
  if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Annulé."
    exit 0
  fi
fi

tar -xzf "$ARCHIVE" -C "$WORK_DIR"

echo "1. Arrêt des services..."
if command -v systemctl >/dev/null 2>&1 && systemctl list-units --full -all 2>/dev/null | grep -q skbox-api; then
  sudo systemctl stop skbox-api skbox-web skbox-z2m skbox-rfxcom 2>/dev/null || true
elif [ -x ./stop.sh ]; then
  ./stop.sh || true
fi

echo "2. Base de données..."
if [ -f "$WORK_DIR/skbox.db" ]; then
  [ -f "packages/db/skbox.db" ] && cp "packages/db/skbox.db" "packages/db/skbox.db.backup-$STAMP"
  cp "$WORK_DIR/skbox.db" "packages/db/skbox.db"
  echo "   OK (ancienne DB conservée: packages/db/skbox.db.backup-$STAMP)"
fi

echo "3. Réseau Zigbee (Z2M)..."
if [ -d "$WORK_DIR/zigbee2mqtt" ] && [ -d "$Z2M_DATA" ]; then
  for f in "$WORK_DIR"/zigbee2mqtt/*; do
    name="$(basename "$f")"
    [ -f "$Z2M_DATA/$name" ] && cp "$Z2M_DATA/$name" "$Z2M_DATA/$name.backup-$STAMP"
    cp "$f" "$Z2M_DATA/$name"
  done
  echo "   OK"
elif [ -d "$WORK_DIR/zigbee2mqtt" ]; then
  echo "   ⚠ $Z2M_DATA introuvable, fichiers non restaurés (voir $WORK_DIR/zigbee2mqtt)"
fi

echo "4. Réseau RF433 (rfxcom2mqtt)..."
if [ -d "$WORK_DIR/rfxcom2mqtt" ] && [ -d "$RFXCOM_DATA" ]; then
  for f in "$WORK_DIR"/rfxcom2mqtt/*; do
    name="$(basename "$f")"
    [ -f "$RFXCOM_DATA/$name" ] && cp "$RFXCOM_DATA/$name" "$RFXCOM_DATA/$name.backup-$STAMP"
    cp "$f" "$RFXCOM_DATA/$name"
  done
  echo "   OK"
elif [ -d "$WORK_DIR/rfxcom2mqtt" ]; then
  echo "   ⚠ $RFXCOM_DATA introuvable, fichiers non restaurés (voir $WORK_DIR/rfxcom2mqtt)"
fi

echo "5. .env..."
if [ -f "$WORK_DIR/.env" ]; then
  [ -f "$SKBOX_DIR/.env" ] && cp "$SKBOX_DIR/.env" "$SKBOX_DIR/.env.backup-$STAMP"
  cp "$WORK_DIR/.env" "$SKBOX_DIR/.env"
  echo "   OK (ancien .env conservé: .env.backup-$STAMP)"
fi

if [ "$WITH_DEPLOY" = true ] && [ -d "$WORK_DIR/deploy" ]; then
  echo "6. Configs de déploiement (dans ./restored-deploy/, à comparer et appliquer manuellement)..."
  RESTORED_DIR="$SKBOX_DIR/restored-deploy-$STAMP"
  mkdir -p "$RESTORED_DIR"
  cp -r "$WORK_DIR/deploy" "$RESTORED_DIR/" 2>/dev/null || true
  cp -r "$WORK_DIR/docker" "$RESTORED_DIR/" 2>/dev/null || true
  echo "   → $RESTORED_DIR (ces fichiers sont normalement déjà dans git, à ne réappliquer qu'en cas de reconstruction complète)"
fi

echo ""
echo "=== Restauration terminée ==="
echo "Pense à relancer les services : ./start.sh (dev) ou sudo systemctl start skbox-api skbox-web skbox-z2m skbox-rfxcom (serveur)"
