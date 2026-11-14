# Navortal

A day planner built around how ADHD actually gets in the way: too many open tasks, bad time estimates, and plans that fall apart by noon. You write tasks down, decide what today looks like, and track what really happened. When the day goes sideways, the app helps you re-plan without making you feel bad about it.

The interface is in Turkish, and so are most of the project docs. The code, routes and API names are in English.

It's a planning tool, not a medical one. It doesn't diagnose or treat anything.

Live at **[www.navortal.com.tr](https://www.navortal.com.tr)**.

## What it does

- **Tasks** nest as deep as you need. You can reorder them by dragging or from the keyboard, and estimates add up from the subtasks. An unknown estimate stays unknown instead of quietly counting as zero.
- **Day planning** gives you a list of timed and untimed items. Plan by hand, or let the scheduler propose a day and review it before it's applied. If the plan doesn't fit, the app tells you. Nothing gets moved to another day behind your back.
- **Work tracking** runs a timer that survives closing the browser. Plans, actual work and estimates are stored separately, so past days stay accurate. Stopping the timer doesn't mark the task as done.
- **Focus tools**: Pomodoro sessions, an Eisenhower matrix, a five-minute quick start and a calmer one-task view.
- **Calendar and routines**: month views with history, recurring tasks that plan themselves ahead, and special days.
- **Notes, projects, pools and categories** for keeping things organized.
- **Reminders** show up in the app and, if you opt in, as web push notifications.
- **Analytics** compare what you planned with what you did.

Open tabs stay in sync over SignalR, and the app can be installed as a PWA.

## Stack

| Part | Tech |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, TanStack Query, Tailwind CSS 4 |
| Backend | ASP.NET Core 10, EF Core, SignalR, Quartz |
| Database | PostgreSQL 18 |
| Tests | xUnit with a real PostgreSQL database, Vitest, Playwright, axe |

The backend is a modular monolith, and all the planning and time rules live there. The frontend doesn't keep a second copy of that logic.

## Repository layout

```text
API/       ASP.NET Core solution (Api, Application, Domain, Infrastructure) and its tests
UI/        Next.js app, unit and end-to-end tests, tooling
docs/      Backend docs, OpenAPI file and the frontend API guide
```

## Running it locally

You'll need the .NET 10 SDK, Node 24.22 with npm 11, and PostgreSQL. On Windows the scripts below set up Node and PostgreSQL for you inside ignored `.local/` folders, so nothing gets installed system-wide.

### Everything with Docker

The compose file in the repo root runs the database, migrations, API and UI together:

```bash
cp .env.example .env   # set POSTGRES_PASSWORD and JWT_SIGNING_KEY
docker compose up --build
```

Then open `http://localhost:3100` and register. The API isn't published to the host; the UI proxies `/api` to it inside the compose network.

### API on Windows

From `API/`:

```powershell
.\scripts\install-local-postgres.ps1
.\scripts\start-local-postgres.ps1
dotnet tool restore
dotnet restore --locked-mode
dotnet ef database update --project src/Adhd.Infrastructure --startup-project src/Adhd.Api
.\scripts\run-api.ps1
```

PostgreSQL runs on port 55432 and the API on `http://127.0.0.1:5080`. `run-api.ps1` generates a development JWT key the first time and reuses it after that.

### API on Linux or macOS

Point the API at your own PostgreSQL and set a signing key of at least 32 bytes:

```bash
cd API
export ASPNETCORE_ENVIRONMENT=Development
export ConnectionStrings__Planner="Host=127.0.0.1;Port=5432;Database=adhd;Username=postgres;Password=<your-password>"
export Jwt__SigningKey="$(openssl rand -base64 48)"
dotnet tool restore
dotnet ef database update --project src/Adhd.Infrastructure --startup-project src/Adhd.Api
dotnet run --project src/Adhd.Api --no-launch-profile --urls http://127.0.0.1:5080
```

Keep the key somewhere if you want sessions to survive a restart.

### API with Docker

This starts the database, runs the migrations and brings up the API on port 5080. It doesn't include the frontend.

```bash
cd API
export POSTGRES_PASSWORD=<your-password>
export JWT_SIGNING_KEY="$(openssl rand -base64 48)"
docker compose up --build
```

In production put an HTTPS reverse proxy on the same host in front of port 5080. The API trusts forwarded client addresses only from the compose network's gateway (`172.30.80.1` by default). If that subnet clashes with another network, or your proxy reaches the API from a different address, set `API_SUBNET`, `API_GATEWAY` or `REVERSE_PROXY_IP` (see `docs/operations.md`).

### Frontend

From `UI/` on Windows:

```powershell
./tools/prepare-node.ps1
./tools/npm.ps1 ci
./tools/npm.ps1 run dev
```

Anywhere else, use Node 24.22 and run `npm ci` and `npm run dev`.

The app runs on `http://127.0.0.1:3100` and expects the API on port 5080. Set `API_ORIGIN` if yours is somewhere else. Then open `/register` and create an account.

### Optional services

Password reset email (SMTP), web push and profile photos (Cloudinary) are all off by default, and the app works fine without them.

**Password reset (SMTP).** Set `Smtp__Enabled=true` plus `Smtp__Host`, `Smtp__Port`, `Smtp__Security` (`StartTls` or `SslOnConnect`), `Smtp__From` and `Smtp__ResetPageUrl`, and `Smtp__Username`/`Smtp__Password` if your provider needs them. The reset URL should look like `https://<your-app>/reset-password#` so the code stays in the URL fragment. Plain HTTP and `Security=None` are only accepted on loopback in Development. Reset codes last 30 minutes and work once. While SMTP is off, forgot-password still answers 202 but no mail goes out.

The local API launcher reads these keys from the ignored `API/.local/smtp.env` without overriding existing process environment variables. Use `Navortal <your-sender@example.com>` for the sender name; messages include branded HTML and plain text. The sender always puts the reset code in the URL fragment, including when the configured URL omits `#`. Configure the reset page for the environment serving the same account database: localhost for local development, your HTTPS app address for production. Keep SMTP credentials on the API host only.

**Web push.** Generate a key pair once with `./scripts/new-web-push-keys.ps1 -Subject 'mailto:you@example.com'` (it goes to the ignored `API/.local/web-push.json`), then start the API with `./scripts/run-api.ps1 -EnablePush`. On localhost no domain is needed; the browser still asks for permission. More in `docs/notifications-realtime.md`.

For the root Docker Compose deployment, run `node API/scripts/configure-web-push.mjs mailto:you@example.com` from the repository root, using a real contact address, then recreate the API. This creates the ignored `API/.local/push.env` with mode `0600`; Compose loads it only into the API. Running the script again verifies and preserves the same keys. Keep this private file with the deployment secrets so browser subscriptions survive rebuilds. Users still enable notifications explicitly on each browser.

**Profile photos.** Put `Cloudinary__Enabled`, `Cloudinary__CloudName`, `Cloudinary__ApiKey` and `Cloudinary__ApiSecret` in `API/.local/cloudinary.env` (see `API/.env.example`). Photos go through the API, the frontend never sees the keys. Max 2 MiB, JPEG/PNG/WebP. More in `docs/profile.md`.

### Frontend settings

`UI/.env.example` lists them. The ones worth knowing:

- `API_ORIGIN`: where the API runs, default `http://127.0.0.1:5080`.
- `SITE_URL` and `SITE_INDEXING`: only for a real deployment. `SITE_URL` must be a public HTTPS origin, and indexing is only on when `SITE_INDEXING=true` and it's a production build. Without them public pages stay `noindex` and the sitemap is empty. They're build inputs, so rebuild after changing them.
- `LEGAL_*`: public contact info shown on the privacy and terms pages. Don't put secrets here. If they're missing the legal pages show a draft and stay out of the sitemap.
- `UI_E2E_CHECKS`: leave it `false`. It only turns on internal check pages for local e2e runs.

The typed API client is generated from `docs/openapi-v1.json`. After `npm ci`, run `npm --prefix tools/api-types ci` once, then `npm run api:generate` to regenerate or `npm run api:check` to see if it's out of date.

## Tests

Backend, from `API/`. These need PostgreSQL, and they create and clean up their own random `adhd_test_` databases, so don't point them at a shared one:

```bash
dotnet test tests/Adhd.IntegrationTests -c Release
```

Set `ADHD_TEST_POSTGRES` to an admin connection string if you're not using the local Windows setup.

Frontend, from `UI/`:

```bash
npm run typecheck
npm run lint
npm test
```

End-to-end tests run against a production build, the real API and a throwaway database. They never touch your development data. Install the browsers once, then pick the specs you want, because the full matrix takes a while:

```bash
npm run test:browsers
python -B tools/run-e2e.py --project chromium --project mobile-chromium --test-file tasks.spec.ts
```

The runner needs ports 3400, 3401, 5180–5182, 5526, 5527 and 55433 to be free. If one is taken it stops instead of killing anything. Use `--project webkit` or `--project firefox` for a quick check in other browsers. The e2e build goes to `.local/next-e2e`, so it doesn't mess with your dev server.

Real push delivery has its own opt-in test: `UI_REAL_PUSH=1` with local VAPID keys and `--test-file native-push-provider.spec.ts`.

## API docs

- `docs/openapi-v1.json` is the OpenAPI file. The route that serves it is only on in Development and Testing.
- `docs/Frontend API Rehberi.md` covers every endpoint with examples (in Turkish).
- `docs/architecture.md` and `docs/database-design.md` explain how the backend is put together.
- `GET /health/live` and `GET /health/ready` are the health checks. `ready` returns 503 while the database isn't reachable.
- Errors come back as ProblemDetails with a `code` and a `traceId`.
- Browser sessions use an HttpOnly cookie, and writes need a same-origin `Origin` header plus `X-ADHD-CSRF: 1`. Other clients can send `Authorization: Bearer`.

## Status

The app is live at [www.navortal.com.tr](https://www.navortal.com.tr) and still a work in progress. Physical devices and screen readers still need proper testing. Mobile performance is still being tuned. Google sign-in is conditionally supported via backend configuration (`Google:Enabled` and `Google:ClientId`); when unconfigured or disabled, accounts use email and password only. See the [Google Auth Setup Guide](docs/google-auth-setup.md) for configuration steps, OAuth requirements, and activation instructions. Note that actual Google Cloud credentials are not provided in the repository, and live end-to-end validation with a real Google account remains a manual operational step.

## License

There's no license file yet, so the code isn't open for reuse. Questions: info@navortal.com.tr
