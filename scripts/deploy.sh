#!/usr/bin/env bash
# GenWise Africa — routine deploy from GitHub (run as root on ecocloud-prod-01).
#   bash /srv/apps/genwise/scripts/deploy.sh
# Touches only genwise-backend in PM2. Never restarts other apps.
set -euo pipefail
APP=/srv/apps/genwise
cd "$APP"
echo "== pull"; git pull --ff-only origin main
echo "== backend"; cd backend && npm ci --omit=dev --no-audit --no-fund && npm run migrate && npm run seed
echo "== frontend"; cd ../frontend && npm ci --no-audit --no-fund && NODE_OPTIONS=--max-old-space-size=768 npm run build
cd "$APP"
if pm2 describe genwise-backend >/dev/null 2>&1; then pm2 reload genwise-backend --update-env; else pm2 start ecosystem.config.js --only genwise-backend; fi
sleep 3
curl -fsS http://127.0.0.1:4022/health && echo && echo "Deployed $(git log -1 --format='%h %s')"
