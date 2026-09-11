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
| `client/App.tsx` | App shell, navigation, session state and socket lifecycle |
| `client/pages/` | Authentication, onboarding/profile editor, discovery, connections, messaging, settings, notifications and moderation |
| `client/components/` | Student cards, profile images/cropping, accessible dialogs, safety controls |
| `client/styles.css` | Dark charcoal theme, red-orange accents, responsive layouts |
| `server/routes/` | Feature-specific authenticated REST endpoints |
| `server/services/` | Authorization policy, recommendations, messaging, storage, retention, email, events and notifications |
| `server/middleware/auth.ts`, `server/sockets.ts` | Session/role checks and authenticated real-time transport |
| `prisma/schema.prisma`, `prisma/migrations/` | Relational schema and four migrations |
| `prisma/seed.ts` | 30 fictional student accounts, five test colleges, taxonomy, connections and messages |
| `tests/backend.test.ts` | PostgreSQL-backed backend/security integration tests |
| `scripts/browser-qa.mjs`, `scripts/onboarding-qa.mjs` | Browser regression and new-user/two-user tests |

## Database migrations

1. `20260910193141_initial`: Users, profiles, colleges, interests/skills and join tables, sessions/tokens, verification, connections, conversations/participants/messages, blocks, reports, notifications, passes, admin actions and analytics.
2. `20260910194000_integrity`: Checks for self-interaction, canonical unordered connection pairs, message length, year and visibility; one pending verification per user.
3. `20260910194826_storage_cleanup`: Durable storage-deletion queue.
4. `20260911090000_ideaboard_events_groups`: Ideas, unique resonances, campus events, unique RSVPs, organizer approval, group conversations, membership departure and context messages.

Apply migrations with `npm run db:migrate`. Never use the reset command on a production database.

## Local setup

Requires Node 24 and npm. PostgreSQL can be supplied externally or run with the included development-only embedded PostgreSQL helper.

```sh
npm ci
```

Copy `.env.example` to `.env`. Replace `CHANGE_ME` in `DATABASE_URL` with a strong local password and set `SEED_PASSWORD` to a separate development password of at least 12 characters. Keep `APP_ORIGIN=http://localhost:5173` for development. Never commit `.env`.

If no PostgreSQL instance is available, start this in a terminal and leave it running:

```sh
npm run db:local
```

In another terminal:

```sh
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev:server
```

In a third terminal:

```sh
npm run dev
```

Open **http://localhost:5173**. Use this exact hostname so origin protection matches your configuration.

Test logins: `student@example.test`, `student2@example.test`, or `admin@example.test`. All use your `SEED_PASSWORD`. Seed identities and colleges are explicitly marked Test. The first student already has two conversations and pending requests. The seed script refuses production mode and is idempotent.

To reset your development database, run `npm run db:reset` and confirm Prisma’s destructive-reset prompt. This erases the selected database. Keep it development-only.

Without SMTP, verification/reset links are saved in **`work/mail/`**, which the app never serves. This is local development behavior only; production startup requires SMTP.

## Environment variables

| Variable | Use |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL; use a bounded connection pool, e.g. `?connection_limit=10` |
| `APP_ORIGIN` | Exact frontend origin; HTTPS required in production |
| `PORT` | Server port, default 3001 |
| `NODE_ENV` | `development` locally, `production` when deployed |
| `TRUST_PROXY` | Set `1` only behind exactly one trusted reverse proxy; leave `0` otherwise |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | Email delivery; port 465 uses TLS, 587 supports STARTTLS |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` | Private S3-compatible storage; endpoint optional for AWS S3 |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Credentials restricted to the app’s private bucket, or use the AWS role credential chain |
| `UPLOAD_DIR` | Local development upload directory; default `work/uploads` |
| `SEED_PASSWORD` | Development sample-account password; never use production seeding |
| `POSTGRES_PASSWORD` | Database service password for Docker Compose; use a URL-safe random value |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | One-time initial administrator creation; remove afterward |
| `COLLEGE_NAME`, `COLLEGE_DOMAINS` | One-time college allowlist management; domains comma-separated |

## Deployment

This app requires a long-running **Node server** with PostgreSQL and WebSocket support. It does not run as a Cloudflare Worker. No production resources or credentials were supplied, so there is no live deployment URL.

1. Provision PostgreSQL, an HTTPS domain/reverse proxy, SMTP, and a private S3 bucket with encryption. Deny public bucket access. Configure secrets in your hosting platform.
2. Configure the production `APP_ORIGIN`. Configure the reverse proxy to forward `/api`, `/socket.io` WebSocket upgrades, and frontend requests to this app on port 3001. Keep the app on one instance for this MVP.
3. Build and start with `npm ci`, `npm run build`, `npm run db:migrate`, `npm start`, or use `docker compose up --build -d` after configuring `.env` and `POSTGRES_PASSWORD`. The Docker image runs migrations at startup and runs the app as a non-root user. Compose binds the app to localhost for an HTTPS reverse proxy; it does not provision HTTPS itself.
4. Before admitting students, run `npm run db:taxonomy` to initialize interests/skills without sample users. Add each actual college with `COLLEGE_NAME` and `COLLEGE_DOMAINS` plus `npm run college:add`. Independently validate exact college domains; do not blindly trust the test seed’s allowlist.
5. Create the first moderator using `ADMIN_EMAIL`, a strong `ADMIN_PASSWORD`, and `npm run admin:create` from an operator environment with dependencies installed and access to the production database. The script refuses to overwrite an existing account. Remove the bootstrap password afterward.
6. Test live SMTP delivery, private bucket access, WebSocket upgrades, session cookies, the health endpoint, and a two-user conversation on the actual deployment. Configure backups and a named moderation owner before the student pilot.

For a local build smoke test, keep `NODE_ENV=development` and your local services configured. Actual production mode intentionally refuses to start without HTTPS, SMTP, and private storage.

## Validation

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm audit --omit=dev
```

Browser checks require running local servers and the test seed. The scripts use installed Microsoft Edge through Playwright; on another OS, change the channel or install a Playwright browser.

```sh
npm run test:browser
```

Browser QA intentionally sends sample messages, files reports on fictional accounts, and creates/deletes a QA account. Run it only against development. Backend test cleanup removes its own QA fixtures; it never resets the whole database.

Validation performed: 26 PostgreSQL-backed backend tests; real Socket.IO send/receive and revoked-session checks; desktop/mobile browser interactions; widths **360, 390, 414, 768, 1024 and 1440**; full new-user onboarding and email-link verification; two simultaneous browser sessions proving live receipt without refresh; persisted history after reload; account deletion. Type checking, lint and production build were run. See `VALIDATION.md` for final results and limitations.

## Boundaries and remaining operational work

- **No Startup Idea Validator**, monetization, marketplace, calls, stories, reels, advanced AI or gamification.
- Button-based Pass/Connect is implemented; gesture swiping is intentionally not required. Typing indicators, read receipts, conversation hiding and push/email notifications are not included.
- Recommendations use a bounded candidate pool, not a global ML ranking. Mutual-connection scoring and exposure-history diversification beyond pass/request suppression are future improvements.
- Settings do not provide arbitrary login-email changes. College changes require re-verification; adding secure email-change confirmation is a separate enhancement.
- Socket.IO and HTTP attempt limits assume one server instance. Multiple replicas require a shared Socket.IO adapter and distributed rate-limit store. Do not scale replicas before adding these.
- Document storage is private and decoded images are re-encoded, but forged student IDs still require human review. Email-domain ownership alone cannot prove current enrollment. CAPTCHA/device-abuse detection is not implemented.
- S3 integration, real SMTP, HTTPS proxying, Linux Docker execution, backups/restore, load testing and external penetration testing were **not verified in this environment**.
- Conversation/moderation evidence remains after account deletion. A final retention period and operator deletion process for that evidence must be chosen before public launch. Private documents/photos use the implemented cleanup queue; alert on persistent cleanup failures.
- The optional WebMCP navigation hook is feature-detected. A supported WebMCP runtime was unavailable for validation; it is not required for ordinary app functionality.

Architecture references: [Prisma transaction isolation and retries](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions) and [embedded PostgreSQL development helper](https://github.com/leinelissen/embedded-postgres).

