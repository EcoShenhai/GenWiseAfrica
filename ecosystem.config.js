// PM2 — GenWise Africa (shared droplet ecocloud-prod-01). One fork-mode process.
// Settings (PORT 4022, DB, SMTP, DeepSeek, LiveKit) come from backend/.env.
module.exports = {
  apps: [{
    name: 'genwise-backend',
    cwd: '/srv/apps/genwise/backend',
    script: 'src/server.js',
    exec_mode: 'fork',
    instances: 1,
    max_memory_restart: '300M',
    node_args: '--max-old-space-size=256',
    env: { NODE_ENV: 'production' },
    out_file: '/var/log/genwise/out.log',
    error_file: '/var/log/genwise/err.log',
    time: true,
  }],
};
