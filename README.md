# Founder’s Circle — MVP handoff

The app is implemented and tested locally. It has **not been deployed to a production host**. The source bundle contains a React/Vite frontend, Express/Socket.IO server, Prisma/PostgreSQL schema and migrations, tests, seed data, and a Docker deployment configuration.

## Implemented

- Signup, login, logout, bcrypt password hashing, persistent revocable sessions, password changes and one-use password resets. Session cookies are HTTP-only, SameSite=Lax, and Secure in production. Random session tokens are hashed in PostgreSQL; no JWT secret is needed.
- Six-step onboarding, required photo upload/crop, editable student profiles, hierarchical searchable interests, skills, hobbies, goals, career/startup interests, portfolio links, and privacy controls.
- Student verification through allowlisted college email domains or private college-ID review. Changing college removes verification. Email proof is single-use and bound to the account and selected college. College email claims cannot be reused by a second account.
- Discovery/search by name, username, college, interest or skill; filters for college, year, interests, city and goals. A modular recommendation service scores shared interests, skills, goals, year, city and college diversity. It selects a bounded pool of up to 200 candidates, returns 12 per page, and provides relevance explanations. Passing hides someone for seven days. Pending/accepted connections are excluded.
- Incoming/sent/accepted requests, reciprocal-request deduplication, connection-only direct conversations and consent-based idea groups, persisted real-time messages, stable retry IDs, history pagination, timestamps and unread counts.
- Blocking in both directions, report-user and report-message flows, duplicate-report prevention, private evidence, moderation dashboard, audit records, report statuses, suspension, banning, reported-message removal, and session/socket revocation.
- In-app notifications, loading/empty/error states, keyboard-accessible dialogs, focus states, mobile navigation, and responsive chat.
- Account deletion anonymizes identity and retains conversation/moderation records. A durable cleanup queue removes photos and documents; unused verification documents expire after 30 days, and reviewed documents become immediately inaccessible and are queued for deletion.
- Analytics event records, PostgreSQL constraints/indexes, input validation, request size limits, image decoding/re-encoding, private S3 storage adapter, origin checks, security headers, and request/message limits.

## IdeaBoard and Events

- IdeaBoard adds editable posts, categories/tags/skills, recent/popular/personal filters, one resonance per student, clickable notifications, and an author-only resonator list using existing profile privacy rules.
- Verified authors can select up to 19 available verified resonators to create a named group in the existing messaging system. Resonating discloses group invitations; every member can leave. Blocking leaves shared groups. Suspension or deletion removes group access without deleting message evidence.
- Events adds approved-organizer publishing, edit/delete, validated private banner storage, RSVP/cancel with atomic capacity limits, private attendee lists, details, categories, and a date-grouped calendar view.
- Desktop navigation includes both features. Mobile uses Home, Discover, IdeaBoard, Events and Profile; Connections and Messages remain in the header.
- Event posting is available to ADMIN accounts and explicitly approved users. Use Admin → Event organizer access with an exact username to grant/revoke access. The community demo seed approves Alex Test. No new environment variables are required.
- Routes: `#ideas`, `#ideas/:id`, `#events`, `#events/:id`, and `#messages/:id`. Authenticated APIs live at `/api/ideas`, `/api/events`, plus `/api/messages/:id/leave` and admin-only `/api/admin/event-publishers`.

## Main source locations

| Location | Purpose |
| --- | --- |
| `Frontend/src/App.tsx` | App shell, navigation, session state and socket lifecycle |
| `Frontend/src/pages/` | Authentication, onboarding/profile editor, discovery, connections, messaging, settings, notifications and moderation |
| `Frontend/src/components/` | Student cards, profile images/cropping, accessible dialogs, safety controls |
| `Frontend/src/index.css` | Dark charcoal theme, red-orange accents, responsive layouts |
| `Backend/src/routes/` | Feature-specific authenticated REST endpoints |
| `Backend/src/services/` | Authorization policy, recommendations, messaging, storage, retention, email, events and notifications |
| `Backend/src/middleware/auth.middleware.ts`, `Backend/src/sockets.ts` | Session/role checks and authenticated real-time transport |
| `Backend/prisma/schema.prisma`, `Backend/prisma/migrations/` | Relational schema and four migrations |
| `Backend/prisma/seed.ts` | 30 fictional student accounts, five test colleges, taxonomy, connections and messages |
| `Backend/tests/backend.test.ts` | PostgreSQL-backed backend/security integration tests |
| `Backend/scripts/browser-qa.mjs`, `Backend/scripts/onboarding-qa.mjs` | Browser regression and new-user/two-user tests |

## Database migrations

1. `20260910193141_initial`: Users, profiles, colleges, interests/skills and join tables, sessions/tokens, verification, connections, conversations/participants/messages, blocks, reports, notifications, passes, admin actions and analytics.
2. `20260910194000_integrity`: Checks for self-interaction, canonical unordered connection pairs, message length, year and visibility; one pending verification per user.
3. `20260910194826_storage_cleanup`: Durable storage-deletion queue.
4. `20260911090000_ideaboard_events_groups`: Ideas, unique resonances, campus events, unique RSVPs, organizer approval, group conversations, membership departure and context messages.

Apply migrations with `npm run db:migrate`. Never use the reset command on a production database.

## Local setup

Requires Node 24 and npm. Frontend and Backend have independent package manifests
and lockfiles. From the repository root, install both:

```sh
npm --prefix Frontend ci
npm --prefix Backend ci
```

On this computer npm is installed at `C:\Program Files\nodejs\npm.cmd`. If a
PowerShell terminal cannot find npm, reopen it after updating PATH, or replace
`npm` in these commands with `& 'C:\Program Files\nodejs\npm.cmd'`.

Keep backend settings in `Backend/.env` (ignored by Git). For a new checkout,
copy `Backend/.env.example` there and configure the database URL. Set a local
`SEED_PASSWORD` of at least 12 characters only if you intend to seed sample users.
Use `NODE_ENV=development`, `PORT=3001`, and
`APP_ORIGIN=http://localhost:5173`. Never overwrite an existing `.env` as a setup
step. The Phase 1 restructure preserved this computer's existing backend values.

`Frontend/.env.example` documents the frontend configuration: no environment
variables are currently required. All `/api` and `/socket.io` traffic goes through
the Vite proxy. Never put database, email, storage or account secrets in frontend
variables, including variables with the `VITE_` prefix.

Runtime persistence uses Supabase PostgreSQL through Express and Prisma. Configure
`DATABASE_URL` and `DIRECT_URL` with the project's session pooler URL in `Backend/.env`.
Future uploads use the private `founders-circle-private` bucket through the existing
S3 adapter; set `S3_PROVIDER=supabase`, `S3_REGION`, `S3_ENDPOINT`,
`AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` there. Never expose S3 keys in the browser.
Only the backend and frontend need to run locally; do not start `db:local`.
Restart the backend after changing environment settings.

Start the backend in one terminal:

```sh
cd Backend
npm run dev
```

Start the frontend in another terminal, from the repository root:

```sh
cd Frontend
npm run dev
```

Open **http://localhost:5173**. The API remains on **http://localhost:3001**.
Root aliases `npm run dev` and `npm run dev:server` remain available.

For a built local run:

```sh
npm --prefix Frontend run build
npm --prefix Backend run build
npm --prefix Backend start
```

The backend also serves `Frontend/dist` for the existing deployment flow. For
local authentication, use the frontend origin on port 5173 as configured above.

### Database setup

The Supabase application schema is already migrated. Do not import the disposable
local accounts or files, run the demo seed, or reset the database during startup.
The old `work/postgres` data is not used or deleted. Docker Compose uses the cloud
connection from `Backend/.env` and does not start a PostgreSQL container.

A fresh application database needs approved reference data before onboarding:
`npm run db:taxonomy` adds interests/skills without demo users; use `npm run college:add`
with verified `COLLEGE_NAME` and `COLLEGE_DOMAINS` values to configure actual colleges.
Do not use fictional test colleges as a production allowlist. Custom authentication
remains in the normal `public` application tables, not Supabase Auth.

Without SMTP or Resend, development reset/verification emails still go to `work/mail`.
This is separate from profile/document uploads, which use private Supabase Storage.

## Environment variables

| Variable | Use |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL; use a bounded connection pool, e.g. `?connection_limit=10` |
| `DIRECT_URL` | Prisma migration connection; use the direct endpoint or session pooler |
| `APP_ORIGIN` | Exact frontend origin; HTTPS required in production |
| `PORT` | Server port, default 3001 |
| `NODE_ENV` | `development` locally, `production` when deployed |
| `TRUST_PROXY` | Set `1` only behind exactly one trusted reverse proxy; leave `0` otherwise |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | Email delivery; port 465 uses TLS, 587 supports STARTTLS |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` | Private S3-compatible storage; endpoint optional for AWS S3 |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Credentials restricted to the app’s private bucket, or use the AWS role credential chain |
| `UPLOAD_DIR` | Local development upload directory; default `work/uploads` |
| `SEED_PASSWORD` | Development sample-account password; never use production seeding |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | One-time initial administrator creation; remove afterward |
| `COLLEGE_NAME`, `COLLEGE_DOMAINS` | One-time college allowlist management; domains comma-separated |

## Deployment

This app requires a long-running **Node server** with PostgreSQL and WebSocket support. The existing Render Docker service uses Supabase PostgreSQL; the frontend is hosted separately. It does not run as a Cloudflare Worker.

1. Provision PostgreSQL, an HTTPS domain/reverse proxy, SMTP, and a private S3 bucket with encryption. Deny public bucket access. Configure secrets in your hosting platform.
2. Configure the production `APP_ORIGIN`. Configure the reverse proxy to forward `/api`, `/socket.io` WebSocket upgrades, and frontend requests to this app on port 3001. Keep the app on one instance for this MVP.
3. Build with `npm --prefix Frontend ci`, `npm --prefix Backend ci`, and `npm run build`; start production with `npm --prefix Backend run start:production`. Docker and Render use this same command. It runs `prisma migrate deploy` and starts the API only if migration succeeds. No manual SQL or separate migration command is needed on routine deploys. Compose can use `docker compose --env-file Backend/.env up --build -d`; it binds the app to localhost for an HTTPS reverse proxy and does not provision HTTPS itself.
4. Before admitting students, run `npm run db:taxonomy` to initialize interests/skills without sample users. Add each actual college with `COLLEGE_NAME` and `COLLEGE_DOMAINS` plus `npm run college:add`. Independently validate exact college domains; do not blindly trust the test seed’s allowlist.
5. Create the first moderator using `ADMIN_EMAIL`, a strong `ADMIN_PASSWORD`, and `npm run admin:create` from an operator environment with dependencies installed and access to the production database. The script refuses to overwrite an existing account. Remove the bootstrap password afterward.
6. Test live SMTP delivery, private bucket access, WebSocket upgrades, session cookies, the health endpoint, and a two-user conversation on the actual deployment. Configure backups and a named moderation owner before the student pilot.

For a local build smoke test, keep `NODE_ENV=development` and your local services configured. Actual production mode intentionally refuses to start without HTTPS, SMTP, and private storage.

### Automatic Prisma migrations on Render

`render.yaml` enables deploys on commits to the linked branch and uses the production startup gate. The Docker build generates the Prisma client; migrations run against `DIRECT_URL` at container startup, before the API listens. A migration failure exits nonzero and blocks the new backend from starting. The current free service uses this gate because Render pre-deploy commands require a paid service.

One-time setup: sync the Blueprint (or mirror its Docker command and auto-deploy setting on a manually managed service), and configure `DIRECT_URL` as the existing Supabase direct endpoint or **session pooler on port 5432**, using a role authorized for schema migrations. Keep `DATABASE_URL` configured for runtime traffic and both URLs pointed at the same database/schema. Do not use the transaction pooler on port 6543 for migrations. Secrets are configured on Render, never committed.

Future workflow: commit the Prisma schema **and migration files** → push → Docker build/Prisma generate → `prisma migrate deploy` → API starts. Do not edit previously deployed migration files. `npm run dev` and `npm start` remain migration-free for local development; choose `start:production` for production. See [deployment and ownership migration details](docs/automatic-prisma-deployment.md) for first-rollout checks, failure handling, and verification commands.

## Validation

Current Phase 1 results are in [the report](docs/phase-1-report.md). The database-writing backend and browser regression suites below are for a separately authorized development test run.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm --prefix Backend audit --omit=dev
```

Browser checks require running local servers and the test seed. The scripts use installed Microsoft Edge through Playwright; on another OS, change the channel or install a Playwright browser.

```sh
npm run test:browser
```

Browser QA intentionally sends sample messages, files reports on fictional accounts, and creates/deletes a QA account. Run it only against development. Backend test cleanup removes its own QA fixtures; it never resets the whole database.

Historical validation before Phase 1 (not rerun against PostgreSQL in this pass): 26 PostgreSQL-backed backend tests; real Socket.IO send/receive and revoked-session checks; desktop/mobile browser interactions; widths **360, 390, 414, 768, 1024 and 1440**; full new-user onboarding and email-link verification; two simultaneous browser sessions proving live receipt without refresh; persisted history after reload; account deletion. Type checking, lint and production build were run. See [Phase 1 report](docs/phase-1-report.md) for the current restructuring checks, actual command output, and limitations.

## Boundaries and remaining operational work

- **No Startup Idea Validator**, monetization, marketplace, calls, stories, reels, advanced AI or gamification.
- Button-based Pass/Connect is implemented; gesture swiping is intentionally not required. Typing indicators, read receipts, conversation hiding and push/email notifications are not included.
- Recommendations use a bounded candidate pool, not a global ML ranking. Mutual-connection scoring and exposure-history diversification beyond pass/request suppression are future improvements.
- Settings do not provide arbitrary login-email changes. College changes require re-verification; adding secure email-change confirmation is a separate enhancement.
- Socket.IO and HTTP attempt limits assume one server instance. Multiple replicas require a shared Socket.IO adapter and distributed rate-limit store. Do not scale replicas before adding these.
- Document storage is private and decoded images are re-encoded, but forged student IDs still require human review. Email-domain ownership alone cannot prove current enrollment. CAPTCHA/device-abuse detection is not implemented.
- Supabase PostgreSQL and private Supabase S3 storage were verified through the running Express API: signup/login/session persistence, profile updates, idea CRUD, authorized file retrieval, access denial, and object deletion. All 30 backend tests and 8 frontend tests passed. Temporary test accounts, catalog fixtures, and uploaded objects were removed; only the application's interest/skill taxonomy was initialized.
- Real SMTP, HTTPS proxying, Linux Docker execution, backups/restore, load testing and external penetration testing were **not verified in this environment**.
- Conversation/moderation evidence remains after account deletion. A final retention period and operator deletion process for that evidence must be chosen before public launch. Private documents/photos use the implemented cleanup queue; alert on persistent cleanup failures.
- The optional WebMCP navigation hook is feature-detected. A supported WebMCP runtime was unavailable for validation; it is not required for ordinary app functionality.

Architecture references: [Prisma transaction isolation and retries](https://www.prisma.io/docs/orm/v6/prisma-Frontend/src/queries/transactions) and [embedded PostgreSQL development helper](https://github.com/leinelissen/embedded-postgres).


### Initial college catalog

Run `npm --prefix Backend run college:add -- --initial` to add the ten predefined
Jaipur colleges without demo users or other seed data. This extends the existing
college CLI and preserves matching records (including recognized aliases), IDs,
verification domains, and profile references on repeat runs. Review existing names
before running against a different database to identify any additional aliases.
New colleges have an empty email-domain allowlist: selection and college-ID review
work, while email verification requires independently approved domains configured
with the existing `COLLEGE_NAME` / `COLLEGE_DOMAINS` mode of `college:add`.

College-specific browser regression (local servers required; creates and retains
one QA account): `cd Backend; node --import tsx scripts/college-qa.mjs`.
Checks selection, save/reload, editing, invalid IDs, and simulated catalog states.
