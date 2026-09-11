# Phase 1 restructuring report

The React/Vite and Express/TypeScript application is split into independent
Frontend and Backend packages. No PostgreSQL query, connection implementation,
schema, migration or business rule was rewritten. No database migration, reset,
seed, database test or MongoDB work was performed.

## Moves and renames

[Complete old → new file mapping](phase-1-moves.md).

- `client/` → `Frontend/src/`; shared active UI → `Frontend/src/components/ui/`;
  utility → `Frontend/src/utils/`; assets → `Frontend/public/`.
- `client/styles.css` → `Frontend/src/index.css`.
- `button.tsx`, `dialog.tsx`, `tabs.tsx` → `Button.tsx`, `Dialog.tsx`, `Tabs.tsx`.
- `server/` → `Backend/src/`; `index.ts` → `server.ts`;
  each of the eleven route modules → `*.routes.ts`;
  `middleware/auth.ts` → `middleware/auth.middleware.ts`;
  `validation/` → `validators/`.
- Prisma source, tests and operational/QA scripts → Backend; legacy D1 source
  retained under `Backend/legacy/` without editing its contents.
- Independent package/lock/config files and ignored `.env` files. Frontend env
  contains no secrets and requires no browser variables. Backend env retains the
  existing private configuration. Root scripts delegate to the package scripts.
- Updated Docker/Compose paths; Render continues to use the root Dockerfile.
  Existing production startup migration behavior is preserved, not executed.

Existing `.ts`/`.tsx` source remains TypeScript. Existing `.mjs` tooling remains
JavaScript. The compiler's emitted JavaScript is ignored build output.

## Verified removals

[Exact removed-file list and reachability evidence](phase-1-cleanup.md).
Removed 58 unused shared UI components, the unused mobile hook, the inactive
Next.js app/config, its vendor CSS and license, the unused Sites Vite plugin and
license, and ten obsolete framework/setup scripts. The live entry/import graph,
Tailwind sources, build/package scripts and deployment references do not use them.
The three required UI components and all public assets were retained.
No database source was deleted. Existing ignored root `node_modules`, `dist`,
`work`, and output directories were preserved; root `dist` is stale output and is
not used by the new build/start scripts.

## Final structure

The trees exclude generated `node_modules/`, `dist/`, and ignored real `.env` files.

```text
Frontend/
├── public/
│   ├── favicon.svg
│   ├── file.svg
│   ├── globe.svg
│   └── window.svg
├── src/
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   ├── Dialog.tsx
│   │   │   └── Tabs.tsx
│   │   ├── Common.tsx
│   │   ├── EventDetail.tsx
│   │   ├── EventEditor.tsx
│   │   ├── IdeaEditor.tsx
│   │   ├── PhotoUpload.tsx
│   │   └── Resonators.tsx
│   ├── pages/
│   │   ├── Admin.tsx
│   │   ├── Auth.tsx
│   │   ├── Connections.tsx
│   │   ├── Discover.tsx
│   │   ├── Events.tsx
│   │   ├── IdeaBoard.tsx
│   │   ├── Messages.tsx
│   │   ├── ProfileEditor.tsx
│   │   └── Settings.tsx
│   ├── utils/
│   │   └── utils.ts
│   ├── App.tsx
│   ├── api.ts
│   ├── index.css
│   ├── main.tsx
│   └── types.ts
├── .env.example
├── .npmrc
├── components.json
├── eslint.config.mjs
├── index.html
├── package-lock.json
├── package.json
├── postcss.config.mjs
├── tsconfig.json
└── vite.config.ts
```

```text
Backend/
├── legacy/
│   ├── db/
│   │   ├── index.ts
│   │   └── schema.ts
│   ├── drizzle/
│   │   └── meta/
│   │       └── _journal.json
│   ├── examples/
│   │   └── d1/
│   │       ├── app/
│   │       │   └── api/
│   │       │       └── notes/
│   │       │           └── route.ts
│   │       └── db/
│   │           └── schema.ts
│   ├── README.md
│   ├── cloudflare-env.d.ts
│   └── drizzle.config.ts
├── prisma/
│   ├── migrations/
│   │   ├── 20260910193141_initial/
│   │   │   └── migration.sql
│   │   ├── 20260910194000_integrity/
│   │   │   └── migration.sql
│   │   ├── 20260910194826_storage_cleanup/
│   │   │   └── migration.sql
│   │   ├── 20260911090000_ideaboard_events_groups/
│   │   │   └── migration.sql
│   │   └── migration_lock.toml
│   ├── schema.prisma
│   └── seed.ts
├── scripts/
│   ├── add-college.ts
│   ├── bootstrap-admin.ts
│   ├── browser-qa.mjs
│   ├── community-qa.mjs
│   ├── local-db.mjs
│   ├── moderation-qa.mjs
│   ├── onboarding-qa.mjs
│   ├── seed-community.ts
│   └── seed-taxonomy.ts
├── src/
│   ├── config/
│   │   └── runtime.ts
│   ├── middleware/
│   │   └── auth.middleware.ts
│   ├── routes/
│   │   ├── admin.routes.ts
│   │   ├── auth.routes.ts
│   │   ├── connections.routes.ts
│   │   ├── discover.routes.ts
│   │   ├── events.routes.ts
│   │   ├── ideas.routes.ts
│   │   ├── messages.routes.ts
│   │   ├── notifications.routes.ts
│   │   ├── profiles.routes.ts
│   │   ├── safety.routes.ts
│   │   └── verification.routes.ts
│   ├── services/
│   │   ├── community.ts
│   │   ├── email.ts
│   │   ├── messages.ts
│   │   ├── notifications.ts
│   │   ├── policy.ts
│   │   ├── profiles.ts
│   │   ├── recommendation.ts
│   │   ├── retention.ts
│   │   └── storage.ts
│   ├── validators/
│   │   ├── community.ts
│   │   └── profile.ts
│   ├── app.ts
│   ├── database.ts
│   ├── server.ts
│   ├── sockets.ts
│   └── utils.ts
├── tests/
│   ├── backend.test.ts
│   ├── community.test.ts
│   └── providers.test.ts
├── .env.example
├── .npmrc
├── eslint.config.mjs
├── package-lock.json
├── package.json
├── tsconfig.build.json
└── tsconfig.json
```

## Ports and commands

Frontend: **5173**, Backend: **3001**, unchanged. Use `http://localhost:5173`.

From the repository root:

```powershell
cd Frontend
npm install
npm run dev
```

In a second terminal, again starting at the repository root:

```powershell
cd Backend
npm install
npm run build
npm start
# Alternatively for backend development: npm run dev
```

The existing PostgreSQL service must be available for authenticated/data features.
If you intentionally use the embedded helper, run `npm --prefix Backend run db:local`
from the repository root in a separate terminal. That command was not run in this pass.

On this computer npm exists at `C:\Program Files\nodejs\npm.cmd`, but is absent
from this task terminal's PATH. Validation used that executable (or its npm CLI
entry through Node for the bounded startup harness). In PowerShell, use
`& 'C:\Program Files\nodejs\npm.cmd'` in place of `npm` if needed.

## Validation and evidence

Every command below exited 0. Full actual output follows, including npm warnings.

- Frontend `npm install`, `npm run build`, `npm run lint` passed.
- Backend `npm install`, `npm run build`, `npm run lint`, `npm run typecheck` passed.
- Backend `npm start` and frontend `npm run dev` started on their unchanged ports.
- A real headless Microsoft Edge page loaded the login UI without JavaScript
  errors, imported the existing frontend API helper and sent a request through
  Vite to Express. The unauthenticated request returned the expected HTTP 401 JSON
  and OPTIONS returned 204. The initial app request also reached `/api/profiles/me`.
- Express served the newly built frontend with HTTP 200 and `/assets/` references.
- The smoke harness stopped both servers within seconds, before the first
  60-second cleanup interval. No auth cookies were supplied, so auth rejected the
  requests before its first database query. This proves startup, rendering and
  proxy/auth reachability, not database-backed feature correctness.
- All 194 active relative/aliased module references resolve against exact-case Git
  paths. Both package lockfiles keep the original versions: no newly introduced
  dependency paths or changed locked versions.
- Comparison with `6b68aa2` found all 35 original backend/Prisma files unchanged
  apart from import updates and the frontend static-directory reference. The
  database connection module, schema and migrations remain unchanged.
- Both real env files are Git-ignored; no real secrets were staged.

An initial startup attempt hit the old project's Vite process on IPv6 localhost
port 5173. Its exact project command was verified, that old preview was stopped,
and validation then passed on 5173. [Initial failure output](startup-proxy-initial.log)
is retained. No port number was changed. The validation servers are now stopped.

## Remaining limits

- Database-backed integration and browser mutation suites were not executed; they
  would change PostgreSQL records. Database availability/migration state is not
  claimed as validated. No actual SMTP/S3 or Socket.IO authenticated exchange was
  tested in this pass.
- Docker/Render configuration paths were updated but no image build, deployment,
  migration or remote service action was run.
- npm emitted install-script warnings for existing backend dependencies. Prisma
  generation, backend compilation and startup nevertheless passed. The embedded
  PostgreSQL helper itself was intentionally not started.
- Inactive D1 examples retain their original optional Cloudflare/Drizzle imports
  and are excluded from the active build. No new dependencies were added to make
  obsolete examples runnable. There are no unresolved imports in the active app.
- The absent historical `VALIDATION.md` link was replaced with this report.

## Actual command output

### frontend-install.log

```text
added 267 packages in 14s
```

### frontend-build.log

```text
> founders-circle-frontend@0.1.0 build
> tsc --noEmit && vite build

vite v8.3.0 building client environment for production...
transforming...
✓ 1982 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                          0.60 kB │ gzip:   0.39 kB
dist/assets/index-Bgei9u24.css          50.38 kB │ gzip:  11.53 kB
dist/assets/check-jmqP6GoW.js            0.11 kB │ gzip:   0.13 kB
dist/assets/arrow-left-DTNnNm6M.js       0.15 kB │ gzip:   0.15 kB
dist/assets/trash-2-WnScU8Ju.js          0.63 kB │ gzip:   0.35 kB
dist/assets/Admin-BK3h8hlJ.js            4.91 kB │ gzip:   1.76 kB
dist/assets/Discover-DKTi1mlK.js         7.32 kB │ gzip:   2.67 kB
dist/assets/Messages-DMqVuH23.js         7.50 kB │ gzip:   2.87 kB
dist/assets/Settings-BKv8HC4o.js         9.02 kB │ gzip:   2.96 kB
dist/assets/ProfileEditor-B8KPSPg_.js    9.40 kB │ gzip:   3.48 kB
dist/assets/IdeaBoard-CQmFNLea.js       11.18 kB │ gzip:   4.04 kB
dist/assets/Events-evoZRm7H.js          13.96 kB │ gzip:   4.54 kB
dist/assets/Connections-DfSeILcM.js     21.43 kB │ gzip:   7.44 kB
dist/assets/index-D40JlSLb.js          333.11 kB │ gzip: 104.71 kB

✓ built in 3.76s
[PLUGIN_TIMINGS] Plugin hooks ran for 3.6s of this 3.8s build (96%).
The slowest hooks, timed inside each callback (the wait before a callback starts is excluded, the time it awaits is included):
  - vite:css-post renderChunk (78%, 2.9s, 12 calls)
Additional hook time came from hooks under 1s.
See https://rolldown.rs/reference/InputOptions.checks#plugintimings for more details.
```

### frontend-lint.log

```text
> founders-circle-frontend@0.1.0 lint
> eslint src
```

### backend-install.log

```text
added 356 packages in 41s
npm warn install-scripts 5 packages have install scripts not yet covered by allowScripts:
npm warn install-scripts   @embedded-postgres/windows-x64@18.4.0-beta.17 (postinstall: node scripts/hydrate-symlinks.js)
npm warn install-scripts   @prisma/client@6.19.3 (postinstall: node scripts/postinstall.js)
npm warn install-scripts   @prisma/engines@6.19.3 (postinstall: node scripts/postinstall.js)
npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)
npm warn install-scripts   prisma@6.19.3 (preinstall: node scripts/preinstall-entry.js)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
```

### backend-build.log

```text
> founders-circle-backend@0.1.0 build
> prisma generate && tsc -p tsconfig.build.json

Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma

✔ Generated Prisma Client (v6.19.3) to .\node_modules\@prisma\client in 143ms

Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)

Tip: Need your database queries to be 1000x faster? Accelerate offers you that and more: https://pris.ly/tip-2-accelerate
```

### backend-lint.log

```text
> founders-circle-backend@0.1.0 lint
> eslint src prisma tests scripts/*.ts
```

### backend-typecheck.log

```text
> founders-circle-backend@0.1.0 typecheck
> tsc --noEmit
```

### startup-proxy.log

```text
$ cd Backend && npm start

$ cd Frontend && npm run dev

> founders-circle-frontend@0.1.0 dev
> vite


> founders-circle-backend@0.1.0 start
> node dist/src/server.js


  VITE v8.3.0  ready in 295 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
Founder’s Circle API ready at http://localhost:3001

Browser frontend API helper and Vite proxy: {"status":401,"body":{"error":"Please log in to continue."},"apiError":"Please log in to continue.","preflightStatus":204,"loginVisible":true}
Browser API responses: ["401 http://localhost:5173/api/profiles/me","401 http://localhost:5173/api/me","401 http://localhost:5173/api/me","204 http://localhost:5173/api/me"]
Browser page errors: []
Backend serving Frontend/dist: HTTP 200, built asset reference: true
PASS: frontend 5173 -> backend 3001, real browser request reached auth middleware. No cookies supplied; no database query was needed.
Validation servers stopped before the first retention interval.
```
