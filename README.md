# GenWise Africa — Generation of Wisdom

**Think Wise. Live Wise. Lead Generations.**

A multitenant Christian mentorship and learning platform. Churches, ministries and independent mentors each run their own **academy** with courses, podcasts, live classes, mentorship, prayer groups, assessments and certificates, combining an AI Study Guide (DeepSeek) with human instructors.

Live at **https://genwiseafrica.org**

## Stack

| Layer | Choice |
|---|---|
| API | Node.js 22, Express 4, Sequelize 6, PostgreSQL (DigitalOcean managed) |
| Frontend | React 18, Vite 5, Tailwind CSS 3, React Router 6 |
| Auth | JWT access token + httpOnly refresh cookie, 6-digit emailed codes via SMTP2GO |
| Meetings | LiveKit SFU + Coturn TURN (same stack as EcoMeet), Jitsi / external link fallback |
| AI | DeepSeek `deepseek-chat` (OpenAI-compatible) |
| Payments | M-Pesa 0702 122 874, manual approval by super admins |
| Hosting | Shared droplet `ecocloud-prod-01`, PM2 `genwise-backend` on 127.0.0.1:4022, Nginx serves `frontend/dist` |

## Layout

```
backend/    Express API (src/models, src/routes, src/services, src/db/migrations)
frontend/   React SPA (src/pages, src/components, src/lib)
scripts/    genwise-discovery.sh, genwise-setup.sh, genwise-first-deploy.sh, deploy.sh
docs/       GenWise_Africa_Master_Reference.docx
ecosystem.config.js   PM2 config
```

## Local development

```bash
# PostgreSQL with a genwise_db database, then:
cd backend && cp .env.example .env   # set DB_*, leave SMTP_HOST empty to log codes to the console
npm install && npm run migrate && npm run seed && npm run dev
cd ../frontend && npm install && npm run dev     # http://localhost:5173 (proxies /api to :4022)
```

With no `SMTP_HOST`, emailed codes are printed in the API log and shown on screen (development only).

End-to-end check against a running API:

```bash
cd backend && SA_EMAIL=you@example.com SA_PASSWORD=... node tests/smoke.mjs
```

## Deploying

```bash
bash /srv/apps/genwise/scripts/deploy.sh   # pull, install, migrate, build, reload genwise-backend only
```

## Multitenancy

One database, one schema. Every academy-owned row carries `tenant_id`; academy routes live under `/api/v1/t/:slug/…`, resolve the academy from the slug and check the member's role (owner, admin, instructor, mentor, prayer_leader, learner). Super admins can act in every academy.
