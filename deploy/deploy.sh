#!/bin/bash
set -euo pipefail

SKBOX_DIR="/home/christian/skbox"
cd "$SKBOX_DIR"

echo "1. Pull dernier commit..."
git pull origin main

echo "2. Installation des dépendances..."
pnpm install

echo "3. Migrations Prisma..."
pnpm --filter @skbox/db exec prisma migrate deploy
pnpm --filter @skbox/db exec prisma generate

echo "4. Build..."
pnpm build

echo "5. Redémarrage des services..."
sudo systemctl restart skbox-api skbox-web

echo "=== Déploiement terminé ==="
sudo systemctl status skbox-api || true
sudo systemctl status skbox-web || true
