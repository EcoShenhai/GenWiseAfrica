#!/usr/bin/env bash
# =====================================================================
# GenWise Africa — FIRST deploy from the release archive.
# Run as root on ecocloud-prod-01 after copying genwise-release.tgz to /root/.
#   bash /root/genwise-first-deploy.sh
#
# 1. Unpacks the code into /srv/apps/genwise (keeps backend/.env and uploads)
# 2. Commits and pushes to github.com/EcoShenhai/GenWiseAfrica (droplet SSH key)
# 3. Installs backend deps, runs migrations and seeds the super admins
# 4. Uses the prebuilt frontend (no build on the droplet)
# 5. Starts ONLY genwise-backend in PM2 and checks health
# Does NOT restart, stop or save any other PM2 process.
# =====================================================================
set -uo pipefail
APP=/srv/apps/genwise
TGZ=${1:-/root/genwise-release.tgz}
ok()   { echo -e "  \e[32m✔\e[0m $*"; }
warn() { echo -e "  \e[33m!\e[0m $*"; }
die()  { echo -e "  \e[31m✘ $*\e[0m"; exit 1; }
step() { echo; echo -e "\e[1;35m== $* ==\e[0m"; }

step "0. Checks"
[ -f "$TGZ" ] || die "Release archive not found: $TGZ"
[ -f "$APP/backend/.env" ] || die "$APP/backend/.env missing — run genwise-setup.sh first"
grep -q '^PORT=4022' "$APP/backend/.env" && ok ".env present (PORT 4022)" || warn ".env has no PORT=4022"
ss -tlnH | awk '{print $4}' | grep -qE '[:.]4022$' && ! pm2 describe genwise-backend >/dev/null 2>&1 && die "Port 4022 is in use by something else"
ok "Port 4022 available for genwise-backend"

step "1. Unpack code"
tar -xzf "$TGZ" -C "$APP" || die "Could not unpack archive"
mkdir -p "$APP/backend/uploads" /var/log/genwise
chmod 600 "$APP/backend/.env"
ok "Code unpacked into $APP ($(find "$APP/backend/src" -name '*.js' | wc -l) backend files, frontend/dist $( [ -f "$APP/frontend/dist/index.html" ] && echo present || echo MISSING))"

step "2. Commit and push to GitHub"
cd "$APP"
[ -d .git ] || git init -q -b main
git remote get-url origin >/dev/null 2>&1 || git remote add origin git@github.com:EcoShenhai/GenWiseAfrica.git
git add -A
if git diff --cached --quiet; then ok "Nothing new to commit"; else
  git -c user.name="EcoShenhai" -c user.email="pskipchumba@gmail.com" commit -q -F - <<'MSG'
GenWise Africa v1.0: multitenant Christian mentorship LMS

- Express + Sequelize API: tenants/academies, roles, emailed MFA codes (SMTP2GO)
- Courses, lessons, assessments, certificates (PDF + QR verification)
- Podcasts with RSS, live classes via LiveKit + Coturn, mentorship, prayer groups
- DeepSeek AI Study Guide, M-Pesa manual payment approvals, super admin console
- React + Vite + Tailwind frontend with landing page
- Deploy: port 4022, /srv/apps/genwise, nginx + Let's Encrypt for genwiseafrica.org

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GE661ET9HUQGscmNNwFSnV
MSG
  ok "Committed $(git log -1 --format=%h)"
fi
if timeout 60 git push -u origin main 2>/tmp/genwise-push.log; then ok "Pushed to github.com/EcoShenhai/GenWiseAfrica"
else
  warn "Push rejected — remote already has commits; merging them"
  timeout 60 git fetch origin main && git -c user.name="EcoShenhai" -c user.email="pskipchumba@gmail.com" merge -q --allow-unrelated-histories -X ours origin/main -m "Merge remote README" \
    && timeout 60 git push -u origin main && ok "Pushed after merge" || { cat /tmp/genwise-push.log; warn "Push failed — deployment continues; fix and run: cd $APP && git push -u origin main"; }
fi

step "3. Backend install, migrate, seed"
cd "$APP/backend"
npm ci --omit=dev --no-audit --no-fund 2>&1 | tail -2 || die "npm ci failed"
npm run migrate 2>&1 | tail -4 || die "Migration failed"
npm run seed 2>&1 | tail -6 || die "Seed failed"

step "4. Start genwise-backend (PM2)"
cd "$APP"
if pm2 describe genwise-backend >/dev/null 2>&1; then pm2 reload genwise-backend --update-env >/dev/null; ok "Reloaded genwise-backend"
else pm2 start ecosystem.config.js --only genwise-backend >/dev/null; ok "Started genwise-backend"; fi
sleep 4
curl -fsS http://127.0.0.1:4022/health && echo || { pm2 logs genwise-backend --lines 30 --nostream; die "Health check failed"; }
code=$(curl -s -o /dev/null -w '%{http_code}' https://genwiseafrica.org/); ok "https://genwiseafrica.org → HTTP $code"
code=$(curl -s -o /dev/null -w '%{http_code}' https://genwiseafrica.org/api/v1/public/stats); ok "https://genwiseafrica.org/api/v1/public/stats → HTTP $code"

step "5. Keep GenWise running after a reboot (your choice)"
echo "  'pm2 save' records every process with its CURRENT state, including the stopped ones."
pm2 jlist 2>/dev/null | python3 -c 'import json,sys; s=[a["name"] for a in json.load(sys.stdin) if a["pm2_env"]["status"]!="online"]; print("  Currently stopped:", ", ".join(s) or "none")'
read -rp "  Run 'pm2 save' now? [y/N] " ans
if [[ "$ans" =~ ^[Yy]$ ]]; then pm2 save >/dev/null && ok "PM2 list saved"; else warn "Skipped. Run 'pm2 save' later if you want GenWise to come back after a reboot."; fi

step "Done"
echo "  Site    : https://genwiseafrica.org"
echo "  Logs    : pm2 logs genwise-backend"
echo "  Updates : bash $APP/scripts/deploy.sh"
echo "  Paste this output back to Claude."
