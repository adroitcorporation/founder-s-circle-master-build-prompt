# Vercel frontend and Render backend

Frontend: https://adroitcorp.vercel.app
Backend: https://havocbackend.onrender.com

The browser sends `/api` requests to the frontend origin. Vite's proxy only runs
in development. `Frontend/vercel.json` provides the deployed reverse proxy to
Render, preserving paths, request bodies and session cookies. Setting
`VITE_API_URL` alone has no effect: the frontend does not read that variable.

## Apply the fix

1. Push the routing change to the branch deployed by Vercel.
2. In Vercel project settings, set **Root Directory** to `Frontend`, **Framework**
   to Vite, **Build Command** to `npm run build`, and **Output Directory** to `dist`.
   The configuration file must be in the selected project root.
3. Redeploy Vercel. No frontend environment variable is needed for API routing.
   `VITE_API_URL` can be removed from Vercel; never put database/storage secrets there.
4. On Render, set `APP_ORIGIN=https://adroitcorp.vercel.app` exactly, without a
   trailing slash, and `TRUST_PROXY=1`. Use `NODE_ENV=production` with the required
   existing database, private storage, and SMTP or Resend configuration. The server
   refuses production startup if those required services are not configured.
5. If Render variables changed, redeploy Render as well. Keep one backend instance
   with the current in-memory Socket.IO adapter.

The application uses a host-only, HttpOnly session cookie. Through `/api` rewrites,
the cookie belongs to the frontend origin and the existing `SameSite=Lax` policy
works. Do not set its Domain to the Render hostname or switch browser requests
directly to Render as part of this setup.

## Backend-only routing and local development

The backend's `/` returns a JSON service description; `/favicon.ico` and other
non-API paths return a JSON 404. Render does not serve the React frontend.
The existing `/api/health` database check is unchanged. Set the Render service's
Health Check Path to `/api/health` (also specified in `render.yaml`).

`APP_ORIGIN` allows one exact frontend origin per environment. On Render use
`https://adroitcorp.vercel.app`; for the local backend use
`http://localhost:5173`. Do not use a comma-separated list, wildcard, or trailing
slash. This keeps credentialed CORS, write-origin checks, and Socket.IO aligned.
No environment files are changed by this patch.

Read-only backend deployment checks:
`cd Backend` then `node --import tsx --test tests/deployment.test.ts`.
These check the real health query, root/404 responses, unauthenticated API access,
and configured production/local origins without creating database fixtures.

## Verify after redeploying

- Both origins' `/api/health` endpoints should return HTTP 200 and `{"ok":true}`.
  Render's free service may need time to wake up.
- In browser Network, login/signup should POST to
  `https://adroitcorp.vercel.app/api/auth/login` or `/api/auth/signup` and return
  JSON. Seeing the frontend hostname is expected: Vercel forwards it to Render.
- After successful login, `/api/profiles/me` should return 200, including after
  refresh. Check logout and signup too.
- Check authenticated images and real-time connection separately in the deployed
  browser; local routing checks do not establish hosted WebSocket proxy behavior.

If the frontend API still returns Vercel's text `NOT_FOUND`, check the deployed
commit and Root Directory. A Render health failure means the backend also needs
attention; inspect its startup/request logs and configured services.

Reference: https://vercel.com/docs/routing/rewrites
