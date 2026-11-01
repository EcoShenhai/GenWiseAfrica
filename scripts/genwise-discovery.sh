#!/usr/bin/env bash
# GenWise Africa — READ-ONLY droplet discovery
# Starts, stops and restarts nothing; changes no app, Nginx, PM2 or DB state.
# Writes only to /root/genwise-discovery/. Secrets are masked in the report.
# Run:  bash /root/genwise-discovery.sh

OUT=/root/genwise-discovery
REPORT=$OUT/report.txt
rm -rf "$OUT"; mkdir -p "$OUT"
exec > >(tee "$REPORT") 2>&1

sec() { echo; echo "=================================================================="; echo "## $*"; echo "=================================================================="; }
mask_env() {  # prints KEY=VALUE with secrets masked
  grep -vE '^\s*(#|$)' "$1" 2>/dev/null | while IFS= read -r line; do
    k="${line%%=*}"; v="${line#*=}"; v="${v%\"}"; v="${v#\"}"
    if echo "$k" | grep -qiE 'PASS|SECRET|KEY|TOKEN|PRIVATE|SALT|PEPPER|CREDENTIAL|AUTH'; then
      echo "$k=${v:0:4}****(len ${#v})"
    else
      echo "$k=$(echo "$v" | sed -E 's#(://[^:/@]+):[^@]*@#\1:****@#')"
    fi
  done
}
dump_file() {  # dump_file <path> [maxlines]
  local f="$1" n="${2:-250}"
  echo; echo "----- FILE: $f ($(wc -l < "$f") lines, showing up to $n) -----"
  head -n "$n" "$f" | sed -E 's#(://[^:/@]+):[^@]*@#\1:****@#g; s#(sk-[A-Za-z0-9]{4})[A-Za-z0-9]+#\1****#g'
}
code_grep() {  # code_grep <dir> <regex> <maxfiles>
  grep -rIliE "$2" "$1" --include='*.js' --include='*.ts' --include='*.mjs' --include='*.cjs' \
    --include='*.jsx' --include='*.tsx' --include='*.json' --include='*.conf' \
    --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build --exclude-dir=.git \
    --exclude-dir=coverage --exclude-dir=.next --exclude=package-lock.json 2>/dev/null | head -n "$3"
}

sec "0. HOST"
date; hostname; uptime
echo "node $(node -v 2>/dev/null) | npm $(npm -v 2>/dev/null) | pm2 $(pm2 -v 2>/dev/null)"
nginx -v 2>&1; certbot --version 2>&1; psql --version 2>&1 || echo "psql: not installed"
free -m; swapon --show; df -h / | tail -1; nproc

sec "1. PM2 APPS (name, status, cwd, script, PORT) — read only"
pm2 jlist 2>/dev/null | python3 -c '
import json,sys
for a in json.load(sys.stdin):
    e=a.get("pm2_env",{}); env=e.get("env",{}) or {}
    print("%-28s %-8s PORT=%-6s cwd=%s  script=%s" % (a.get("name",""), e.get("status",""), env.get("PORT","-"), e.get("pm_cwd",""), e.get("pm_exec_path","")))
' | tee $OUT/pm2_apps.txt
pm2 jlist 2>/dev/null | python3 -c '
import json,sys
for a in json.load(sys.stdin): print(a["pm2_env"].get("pm_cwd",""))' | sort -u > $OUT/app_dirs.txt

sec "2. PORTS — listening now"
ss -tlnpH 2>/dev/null | awk '{print $4, $6}' | sed -E 's/users:\(\("([^"]+)".*/\1/' | sort -t: -k2 -n | tee $OUT/listening.txt

sec "3. PORTS — reserved by configs (includes STOPPED apps)"
: > $OUT/reserved_ports.txt
echo "# PORT= in app .env files"
while read -r d; do for f in "$d/.env" "$d/../.env" "$d/backend/.env"; do
  [ -f "$f" ] && grep -hE '^\s*PORT\s*=' "$f" | sed "s#^#$(realpath "$f"): #" | tee -a $OUT/reserved_ports.txt
done; done < $OUT/app_dirs.txt
echo "# PORT in pm2 ecosystem files"
find /var/www /root /opt /home -maxdepth 4 -name 'ecosystem*.js*' -not -path '*/node_modules/*' 2>/dev/null \
  | xargs -r grep -HnoE 'PORT[^0-9]{0,6}[0-9]{4,5}' | tee -a $OUT/reserved_ports.txt
echo "# proxy_pass ports in nginx"
grep -RhoE 'proxy_pass\s+https?://(127\.0\.0\.1|localhost):[0-9]+' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null \
  | sort | uniq -c | tee -a $OUT/reserved_ports.txt

sec "4. FREE PORT CANDIDATES 4018–4040 (not listening AND not referenced anywhere)"
USED=$( (awk '{print $1}' $OUT/listening.txt | grep -oE '[0-9]+$'; grep -oE '[0-9]{4,5}' $OUT/reserved_ports.txt) | sort -un)
for p in $(seq 4018 4040); do echo "$USED" | grep -qx "$p" && echo "$p  USED/RESERVED" || echo "$p  FREE"; done

sec "5. NGINX + SSL"
ls -1 /etc/nginx/sites-enabled/
echo; echo "# any existing genwise config?"; grep -Rli 'genwise' /etc/nginx/ 2>/dev/null || echo "none"
echo; echo "# certificates"; certbot certificates 2>/dev/null | grep -E 'Certificate Name|Domains|Expiry'
echo; echo "# renewal authenticator/installer style"
grep -hE '^(authenticator|installer|webroot_path)' /etc/letsencrypt/renewal/*.conf 2>/dev/null | sort | uniq -c
for site in cpamind ecomeet worker; do
  f=$(grep -Rli "$site" /etc/nginx/sites-enabled/ 2>/dev/null | head -1)
  [ -n "$f" ] && dump_file "$f" 150
done

sec "6. DNS for genwiseafrica.org (droplet IP should be 167.172.49.206)"
curl -s4 --max-time 5 ifconfig.me; echo "  <- this droplet public IP"
for h in genwiseafrica.org www.genwiseafrica.org; do echo "$h -> $(getent ahostsv4 $h | awk '{print $1}' | sort -u | tr '\n' ' ')"; done
command -v dig >/dev/null && { echo "MX: $(dig +short MX genwiseafrica.org)"; echo "TXT: $(dig +short TXT genwiseafrica.org)"; }

# ---- locate reference apps ----
dir_of() { grep -iE "$1" $OUT/app_dirs.txt | head -1; }
CPA=$(dir_of 'cpamind' | grep -vi '_ug\|-ug\|uganda' ); [ -z "$CPA" ] && CPA=$(dir_of cpamind)
WRK=$(dir_of 'worker'); MEET=$(dir_of 'ecomeet')
echo; echo "cpamind=$CPA | worker=$WRK | ecomeet=$MEET"

for APP in "$CPA" "$WRK"; do
  [ -z "$APP" ] && continue
  ROOT=$(cd "$APP" && git rev-parse --show-toplevel 2>/dev/null || echo "$APP")
  sec "7. $(basename "$ROOT") — .env (masked)"
  for f in "$APP/.env" "$ROOT/.env" "$ROOT/backend/.env"; do [ -f "$f" ] && { echo "# $f"; mask_env "$f"; }; done | awk '!seen[$0]++'
  echo; echo "# package.json deps"; [ -f "$APP/package.json" ] && python3 -c "import json;d=json.load(open('$APP/package.json'));print(json.dumps({**d.get('dependencies',{})},indent=0))"
  echo; echo "# git"; (cd "$ROOT" && git remote -v | sed -E 's#://[^@]+@#://****@#' | head -2; git log -1 --format='%h %ci %s')

  sec "8. $(basename "$ROOT") — DeepSeek / AI code"
  for f in $(code_grep "$ROOT" 'deepseek|api\.deepseek|openai|chat/completions' 8); do dump_file "$f" 200; done

  sec "9. $(basename "$ROOT") — SMTP2GO / email + OTP/MFA code"
  for f in $(code_grep "$ROOT" 'smtp2go|createTransport|nodemailer' 6); do dump_file "$f" 200; done
  for f in $(code_grep "$ROOT" 'otp|mfa|verification[_ ]?code|resend[_-]?code|generateCode|randomInt' 8 | grep -viE 'test|spec|\.json$'); do dump_file "$f" 220; done
done

if [ -n "$MEET" ]; then
  MROOT=$(cd "$MEET" && git rev-parse --show-toplevel 2>/dev/null || echo "$MEET")
  sec "10. ECOMEET — .env (masked), deps, structure"
  for f in "$MEET/.env" "$MROOT/.env" "$MROOT/backend/.env" "$MROOT/frontend/.env"; do [ -f "$f" ] && { echo "# $f"; mask_env "$f"; }; done | awk '!seen[$0]++'
  for pj in "$MEET/package.json" "$MROOT/frontend/package.json" "$MROOT/client/package.json"; do
    [ -f "$pj" ] && { echo "# $pj"; python3 -c "import json;d=json.load(open('$pj'));print(list(d.get('dependencies',{}).keys()))"; }; done
  echo; find "$MROOT" -maxdepth 3 -type d -not -path '*/node_modules*' -not -path '*/.git*' | head -60
  sec "11. ECOMEET — meeting/RTC implementation"
  for f in $(code_grep "$MROOT" 'jitsi|livekit|mediasoup|simple-peer|peerjs|RTCPeerConnection|iceServers|turn:|stun:|daily\.co|agora|socket\.io' 14); do dump_file "$f" 220; done
  echo; echo "# media servers / TURN on host"
  ps aux | grep -iE 'livekit|jitsi|jvb|prosody|janus|mediasoup|coturn|turnserver' | grep -v grep || echo "none running"
  command -v docker >/dev/null && docker ps --format '{{.Names}} {{.Image}} {{.Ports}}' 2>/dev/null
  systemctl is-active coturn 2>/dev/null
fi

sec "12. DATABASE (read-only, using cpamind's own app user)"
ENVF=""; for f in "$CPA/.env" "$(dirname "$CPA")/.env"; do [ -f "$f" ] && ENVF="$f" && break; done
if [ -n "$ENVF" ] && command -v psql >/dev/null; then
  set -a; . <(grep -E '^(DB_|DATABASE_URL|PG)' "$ENVF" | sed 's/\r$//'); set +a
  URL="${DATABASE_URL:-postgresql://${DB_USER:-$DB_USERNAME}:${DB_PASSWORD:-$DB_PASS}@${DB_HOST}:${DB_PORT:-25060}/${DB_NAME:-$DB_DATABASE}?sslmode=require}"
  echo "host: $(echo "$URL" | sed -E 's#.*@([^:/]+).*#\1#')"
  timeout 20 psql "$URL" -XAtc "show max_connections;" -c "select 'active_conns='||count(*) from pg_stat_activity;" \
    -c "select 'by_db: '||coalesce(datname,'-')||'='||count(*) from pg_stat_activity group by datname order by 1;" \
    -c "select 'genwise_db exists: '||count(*) from pg_database where datname='genwise_db';" \
    -c "select 'genwise_user exists: '||count(*) from pg_roles where rolname='genwise_user';" 2>&1 | sed -E 's#(://[^:/@]+):[^@]*@#\1:****@#g'
  echo "# which app envs reference doadmin (names only):"
  while read -r d; do grep -lE 'doadmin' "$d/.env" 2>/dev/null; done < $OUT/app_dirs.txt
else echo "skipped (no env or psql)"; fi

sec "13. GIT ACCESS FROM DROPLET"
ls -1 ~/.ssh 2>/dev/null; git config --global credential.helper
timeout 10 ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -T git@github.com 2>&1 | head -1
GIT_TERMINAL_PROMPT=0 timeout 15 git ls-remote https://github.com/EcoShenhai/GenWiseAfrica.git 2>&1 | head -3 || true
ls -ld /var/www/* 2>/dev/null | awk '{print $NF}'

sec "14. MEMORY TOP 12"
ps -eo rss,comm,args --sort=-rss | head -13 | awk '{printf "%6.0fMB %s\n",$1/1024,substr($0,index($0,$3),90)}'

echo; echo "DONE. Report: $REPORT ($(wc -c < $REPORT) bytes)"
tar -czf /root/genwise-discovery.tgz -C /root genwise-discovery && echo "Archive: /root/genwise-discovery.tgz"
