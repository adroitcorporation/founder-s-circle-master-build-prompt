# Local login fix

The local frontend and API were listening on 5173 and 3001, but PostgreSQL was
not listening on 55432. The health endpoint returned HTTP 500. Starting the
existing database with the existing `db:local` helper restored health to
HTTP 200 with `{"ok":true}`. No schema changes, migrations, resets or seeding
were performed.

The frontend previously called `response.json()` unconditionally. An empty or
HTML error response could therefore show a JSON parser exception. The API helper
now handles malformed/empty responses, network failures and 204 responses while
preserving server-provided authentication messages. The exact earlier empty-body
failure was not observed against the already-running API during this inspection;
regression tests reproduce it using representative proxy responses.

Validation:

- Eight API-helper tests passed, including empty 500 and HTML 502 responses.
- Frontend TypeScript/Vite build and lint passed.
- Real Edge browser: demo-account login HTTP 200.
- Authenticated profile HTTP 200, including after reload.
- Test session logged out with HTTP 200.

The existing frontend/API were kept running and the local PostgreSQL helper was
started in the background. After a computer restart, start the local database
with `npm --prefix Backend run db:local`, then start the backend and frontend.
