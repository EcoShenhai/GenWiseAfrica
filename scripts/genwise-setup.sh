#!/usr/bin/env bash
# =====================================================================
# GenWise Africa — one-time droplet setup (run as root on ecocloud-prod-01)
#
# Does:  DB + user on the shared managed PostgreSQL, app folders, backend
#        .env (secrets generated or copied on the server and never printed),
#        Nginx site, Let's Encrypt SSL for genwiseafrica.org + www,
#        git remote, SMTP2GO login check.
# Does NOT: start, stop, restart or save any PM2 process.
#           Stopped apps stay stopped.
# Safe to re-run: existing DB password / secrets in .env are reused.
# =====================================================================
set -uo pipefail

PORT=4022
APP=/srv/apps/genwise
BE=$APP/backend
FE=$APP/frontend
ENVF=$BE/.env
DOMAIN=genwiseafrica.org
SITE=/etc/nginx/sites-available/$DOMAIN.conf
WORKER_ENV=/srv/apps/worker/backend/.env      # DeepSeek key + DB host source
MEET_ENV=/srv/apps/ecomeet/backend/.env       # LiveKit + TURN source
REPO=git@github.com:EcoShenhai/GenWiseAfrica.git

ok()   { echo -e "  \e[32m✔\e[0m $*"; }
warn() { echo -e "  \e[33m!\e[0m $*"; }
die()  { echo -e "  \e[31m✘ $*\e[0m"; exit 1; }
step() { echo; echo -e "\e[1;35m== $* ==\e[0m"; }
getv() { grep -E "^$1=" "$2" 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

# ---------------------------------------------------------------- 0
step "0. Pre-flight"
ss -tlnH | awk '{print $4}' | grep -qE "[:.]$PORT\$" && die "Port $PORT is already listening — stop and tell Claude."
grep -RqsE "127\.0\.0\.1:$PORT\b" /etc/nginx/sites-enabled/ && ! grep -qs "$PORT" "$SITE" && die "Port $PORT already used by another nginx site."
ok "Port $PORT is free"
[ -f "$WORKER_ENV" ] || die "Missing $WORKER_ENV"
[ -f "$MEET_ENV" ]   || die "Missing $MEET_ENV"
DB_HOST=$(getv DB_HOST "$WORKER_ENV"); DB_PORT=$(getv DB_PORT "$WORKER_ENV"); DB_PORT=${DB_PORT:-25060}
[ -n "$DB_HOST" ] && ok "DB host: $DB_HOST:$DB_PORT" || die "DB_HOST not found"
for h in $DOMAIN www.$DOMAIN; do
  ip=$(getent ahostsv4 $h | awk '{print $1}' | head -1)
  [ "$ip" = "167.172.49.206" ] && ok "$h -> $ip" || warn "$h resolves to '$ip' (expected 167.172.49.206) — SSL step may fail"
done

# ---------------------------------------------------------------- 1
step "1. Secrets (input hidden)"
EXISTING_DB_PW=$(getv DB_PASSWORD "$ENVF")
read -rsp "  doadmin password for the managed PostgreSQL cluster: " DOADMIN_PW; echo
[ -n "$DOADMIN_PW" ] || die "doadmin password required"
EXISTING_SMTP=$(getv SMTP_PASSWORD "$ENVF")
if [ -n "$EXISTING_SMTP" ]; then SMTP_PW=$EXISTING_SMTP; ok "Reusing SMTP password from existing .env"
else read -rsp "  SMTP2GO password for user GenWiseAfrica: " SMTP_PW; echo; fi
EXISTING_SA1=$(getv SUPER_ADMIN_1_PASSWORD "$ENVF"); EXISTING_SA2=$(getv SUPER_ADMIN_2_PASSWORD "$ENVF")
if [ -n "$EXISTING_SA1" ]; then SA1_PW=$EXISTING_SA1; SA2_PW=$EXISTING_SA2; ok "Reusing super admin passwords from existing .env"
else
  read -rsp "  Super admin password for pskipchumba@gmail.com: " SA1_PW; echo
  read -rsp "  Super admin password for christineariga3@gmail.com: " SA2_PW; echo
fi

# ---------------------------------------------------------------- 2
step "2. Database genwise_db + user genwise_user"
DB_PW=${EXISTING_DB_PW:-$(openssl rand -hex 24)}
export PGPASSWORD="$DOADMIN_PW"
PSQL_ADMIN=(psql "host=$DB_HOST port=$DB_PORT user=doadmin dbname=defaultdb sslmode=require" -X -v ON_ERROR_STOP=1 -q)
"${PSQL_ADMIN[@]}" -c "select 1" >/dev/null || die "Cannot connect as doadmin (wrong password or droplet not in Trusted Sources)"
"${PSQL_ADMIN[@]}" <<SQL || die "Role/database creation failed"
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='genwise_user') THEN
    CREATE ROLE genwise_user LOGIN PASSWORD '$DB_PW' CONNECTION LIMIT 3;
  ELSE
    ALTER ROLE genwise_user WITH LOGIN PASSWORD '$DB_PW' CONNECTION LIMIT 3;
  END IF;
END \$\$;
GRANT genwise_user TO doadmin;
SELECT 'CREATE DATABASE genwise_db OWNER genwise_user' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='genwise_db')\gexec
REVOKE ALL ON DATABASE genwise_db FROM PUBLIC;
GRANT ALL PRIVILEGES ON DATABASE genwise_db TO genwise_user;
SQL
psql "host=$DB_HOST port=$DB_PORT user=doadmin dbname=genwise_db sslmode=require" -X -q <<'SQL' || warn "Schema/extension step reported an error (see above)"
ALTER SCHEMA public OWNER TO genwise_user;
GRANT ALL ON SCHEMA public TO genwise_user;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
SQL
unset PGPASSWORD DOADMIN_PW
PGPASSWORD="$DB_PW" psql "host=$DB_HOST port=$DB_PORT user=genwise_user dbname=genwise_db sslmode=require" -XAtc \
  "select 'connected as '||current_user||' to '||current_database()||', ext: '||string_agg(extname,',') from pg_extension" \
  && ok "genwise_user can connect" || die "genwise_user login failed"

# ---------------------------------------------------------------- 3
step "3. App folders"
mkdir -p "$BE/uploads" "$FE/dist" /var/log/genwise
ok "$APP/{backend,frontend}"
if [ ! -f "$FE/dist/index.html" ]; then
cat > "$FE/dist/index.html" <<'HTML'
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GenWise Africa — Generation of Wisdom</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 50% 35%,#1B1250,#0E0637 60%);color:#F6F1E4;font-family:Georgia,serif;text-align:center}
h1{color:#C9A34E;letter-spacing:.12em;font-size:clamp(2rem,6vw,3.4rem);margin:.2em 0}p{margin:.4em 1em}.t{color:#E6C97A;font-style:italic}.s{opacity:.7;font-family:system-ui;font-size:.9rem;margin-top:2em}</style></head>
<body><main><h1>GENWISE AFRICA</h1><p class="t">Generation of Wisdom</p><p>Think Wise. Live Wise. Lead Generations.</p><p class="s">Our mentorship platform is launching soon.</p></main></body></html>
HTML
ok "Placeholder landing page written"
fi

# ---------------------------------------------------------------- 4
step "4. Backend .env (chmod 600, never committed)"
keep() { local v; v=$(getv "$1" "$ENVF"); echo "${v:-$2}"; }
JWT_SECRET=$(keep JWT_SECRET "$(openssl rand -hex 32)")
JWT_REFRESH_SECRET=$(keep JWT_REFRESH_SECRET "$(openssl rand -hex 32)")
JWT_MFA_SECRET=$(keep JWT_MFA_SECRET "$(openssl rand -hex 32)")
CODE_PEPPER=$(keep AUTH_CODE_PEPPER "$(openssl rand -hex 16)")
DEEPSEEK_KEY=$(getv DEEPSEEK_API_KEY "$WORKER_ENV")
LK_URL=$(getv LIVEKIT_URL "$MEET_ENV"); LK_KEY=$(getv LIVEKIT_API_KEY "$MEET_ENV"); LK_SECRET=$(getv LIVEKIT_API_SECRET "$MEET_ENV")
TURN_SECRET=$(getv TURN_SECRET "$MEET_ENV")
[ -f "$ENVF" ] && cp -p "$ENVF" "$ENVF.bak-$(date +%Y%m%d-%H%M%S)"
umask 077
{
  echo "# GenWise Africa backend — generated by genwise-setup.sh $(date -u +%F)"
  echo "NODE_ENV=production"
  echo "PORT=$PORT"
  echo "BIND_HOST=127.0.0.1"
  echo "APP_NAME=\"GenWise Africa\""
  echo "APP_DOMAIN=$DOMAIN"
  echo "APP_BASE_URL=https://$DOMAIN"
  echo "FRONTEND_URL=https://$DOMAIN"
  echo "CORS_ORIGINS=https://$DOMAIN,https://www.$DOMAIN"
  echo
  echo "# Database (shared DO managed PostgreSQL)"
  echo "DB_HOST=$DB_HOST"
  echo "DB_PORT=$DB_PORT"
  echo "DB_NAME=genwise_db"
  echo "DB_USER=genwise_user"
  echo "DB_PASSWORD=$DB_PW"
  echo "DB_SSL=true"
  echo "DB_POOL_MAX=2"
  echo "DB_SYNC=false"
  echo
  echo "# Auth"
  echo "JWT_SECRET=$JWT_SECRET"
  echo "JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET"
  echo "JWT_MFA_SECRET=$JWT_MFA_SECRET"
  echo "JWT_EXPIRES_IN=15m"
  echo "JWT_REFRESH_EXPIRES_IN=7d"
  echo "MFA_TOKEN_EXPIRES_IN=10m"
  echo "BCRYPT_ROUNDS=12"
  echo "AUTH_CODE_LENGTH=6"
  echo "AUTH_CODE_TTL_MIN=10"
  echo "AUTH_CODE_MAX_ATTEMPTS=5"
  echo "AUTH_CODE_RESEND_COOLDOWN_SEC=60"
  echo "AUTH_CODE_PEPPER=$CODE_PEPPER"
  echo
  echo "# SMTP2GO"
  echo "SMTP_HOST=mail-eu.smtp2go.com"
  echo "SMTP_PORT=2525"
  echo "SMTP_SECURE=false"
  echo "SMTP_USER=GenWiseAfrica"
  echo "SMTP_PASSWORD=$SMTP_PW"
  echo "SMTP_FROM_NAME=\"GenWise Africa\""
  echo "SMTP_FROM_EMAIL=noreply@$DOMAIN"
  echo
  echo "# Super admins (seeder only)"
  echo "SUPER_ADMIN_1_EMAIL=pskipchumba@gmail.com"
  echo "SUPER_ADMIN_1_NAME=\"Peter Kipchumba\""
  echo "SUPER_ADMIN_1_PASSWORD=$SA1_PW"
  echo "SUPER_ADMIN_2_EMAIL=christineariga3@gmail.com"
  echo "SUPER_ADMIN_2_NAME=\"Christine Ariga\""
  echo "SUPER_ADMIN_2_PASSWORD=$SA2_PW"
  echo
  echo "# AI — DeepSeek (OpenAI-compatible)"
  echo "DEEPSEEK_API_KEY=$DEEPSEEK_KEY"
  echo "DEEPSEEK_API_BASE=https://api.deepseek.com"
  echo "DEEPSEEK_MODEL=deepseek-chat"
  echo "AI_TEMPERATURE=0.4"
  echo "AI_MAX_TOKENS=1500"
  echo "AI_DAILY_TOKEN_BUDGET_PER_TENANT=200000"
  echo
  echo "# Online meetings — LiveKit SFU + Coturn (same stack as EcoMeet)"
  echo "SFU_PROVIDER=livekit"
  echo "LIVEKIT_URL=$LK_URL"
  echo "LIVEKIT_API_KEY=$LK_KEY"
  echo "LIVEKIT_API_SECRET=$LK_SECRET"
  echo "LIVEKIT_ROOM_PREFIX=genwise-"
  echo "TURN_URL=turn:turn.eshcloud.com:3478"
  echo "TURN_SECRET=$TURN_SECRET"
  echo "JITSI_DOMAIN=meet.jit.si"
  echo
  echo "# M-Pesa (manual approval)"
  echo "MPESA_RECEIVER=254702122874"
  echo "MPESA_DISPLAY=\"0702 122 874\""
  echo
  echo "# Uploads / limits"
  echo "STORAGE_DIR=$BE/uploads"
  echo "MAX_UPLOAD_MB=200"
  echo "RATE_LIMIT_WINDOW_MS=900000"
  echo "RATE_LIMIT_MAX=300"
  echo "AUTH_RATE_LIMIT_MAX=20"
} > "$ENVF"
chmod 600 "$ENVF"; umask 022
ok ".env written ($(grep -c '=' "$ENVF") keys)"
[ -n "$DEEPSEEK_KEY" ] && ok "DeepSeek key copied from Worker (len ${#DEEPSEEK_KEY})" || warn "DeepSeek key not found"
[ -n "$LK_KEY" ] && ok "LiveKit creds copied from EcoMeet ($LK_URL)" || warn "LiveKit creds not found"
[ -n "$TURN_SECRET" ] && ok "TURN secret copied from EcoMeet" || warn "TURN secret not found"

# ---------------------------------------------------------------- 5
step "5. SMTP2GO login check (no email sent)"
NM=/srv/apps/worker/backend/node_modules/nodemailer
SMTP_PASSWORD="$SMTP_PW" node -e "
const n=require('$NM');n.createTransport({host:'mail-eu.smtp2go.com',port:2525,secure:false,auth:{user:'GenWiseAfrica',pass:process.env.SMTP_PASSWORD}})
.verify().then(()=>console.log('  \x1b[32m✔\x1b[0m SMTP2GO accepted GenWiseAfrica credentials')).catch(e=>console.log('  \x1b[33m!\x1b[0m SMTP2GO check failed: '+e.message))"

# ---------------------------------------------------------------- 6
step "6. Nginx site"
FX=""; [ -f /etc/nginx/snippets/shenhai-fx.conf ] && FX="    include /etc/nginx/snippets/shenhai-fx.conf;"
if [ -f "$SITE" ] && grep -q "managed by Certbot" "$SITE"; then
  ok "Site already exists with SSL — left unchanged"
else
cat > "$SITE" <<NGINX
# GenWise Africa — genwiseafrica.org → 127.0.0.1:$PORT (frontend served from dist)
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
$FX
    client_max_body_size 200m;

    root $FE/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_cache_bypass \$http_upgrade;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /health {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$host;
    }

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files \$uri =404;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX
  ln -sf "$SITE" /etc/nginx/sites-enabled/$DOMAIN.conf
  ok "Wrote $SITE"
fi
nginx -t 2>&1 | tail -2
nginx -t >/dev/null 2>&1 && systemctl reload nginx && ok "Nginx reloaded (graceful; no app restarted)" || die "nginx -t failed — site not reloaded"

# ---------------------------------------------------------------- 7
step "7. SSL certificate (Let's Encrypt, nginx plugin — same as other domains)"
if certbot certificates 2>/dev/null | grep -q "Certificate Name: $DOMAIN\$"; then
  ok "Certificate already exists"
else
  certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos -m pskipchumba@gmail.com --redirect \
    && ok "SSL issued for $DOMAIN + www" || warn "certbot failed — check DNS, then re-run this script"
fi
curl -sI --max-time 10 https://$DOMAIN | head -1

# ---------------------------------------------------------------- 8
step "8. Git"
cd "$APP"
[ -d .git ] || git init -q -b main
git remote get-url origin >/dev/null 2>&1 || git remote add origin "$REPO"
printf '%s\n' 'node_modules/' '.env' '.env.*' '!.env.example' 'backend/uploads/' 'frontend/dist/' 'logs/' '*.log' '*.bak-*' > .gitignore
ok "Repo initialised at $APP → $(git remote get-url origin)"
timeout 15 git ls-remote "$REPO" >/dev/null 2>&1 && ok "Droplet can reach GitHub repo over SSH" || warn "Cannot reach $REPO over SSH"

# ---------------------------------------------------------------- 9
step "9. Summary"
echo "  App dir     : $APP   (backend/, frontend/dist/)"
echo "  Port        : $PORT  (bound to 127.0.0.1)"
echo "  Database    : genwise_db / genwise_user (conn limit 3, pool 2)"
echo "  Site        : https://$DOMAIN"
echo "  PM2         : nothing started — app is deployed in the next step"
echo
echo "  Paste everything from step 0 to here back to Claude (it contains no secrets)."
