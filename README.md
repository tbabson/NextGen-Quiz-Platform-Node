# PUNCH NextGen Quiz & Rewards — API

REST API for a mini quiz-and-rewards platform. Students register, take multiple-choice quizzes, get server-graded results, earn XP and badges, and compete on a leaderboard. A separate React client consumes it.

|                  |                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Live API**     | https://nextgen-quiz-platform-node.onrender.com/, e.g. `https://punch-nextgen-quiz-api.onrender.com/api/health`\_       |
| **Client**       | https://next-gen-quiz-platform-react-seven.vercel.app/ / repo\_ https://github.com/tbabson/ NextGen-Quiz-Platform-React |
| **API contract** | [docs/openapi.yaml](docs/openapi.yaml) (OpenAPI 3.1; paste it into [editor.swagger.io](https://editor.swagger.io))      |

## Test accounts

All fictitious, created by the seed. Password for each: **`Password123!`**

| Email            | Starting state                                                                    |
| ---------------- | --------------------------------------------------------------------------------- |
| `ada@test.dev`   | Fresh account, 0 XP. Use it for the demo                                          |
| `grace@test.dev` | 80 XP: perfect score on _Nigeria Quick Facts_; First Steps + Perfect Score badges |
| `alan@test.dev`  | 90 XP: 9/12 on _Digital Literacy Basics_; First Steps badge                       |

## Tech stack

| Concern    | Choice                                                               | Why                                                                                                                                                                      |
| ---------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime    | Node.js 20+ LTS, plain JavaScript (ES modules), no build step        | One language with the React client; fastest path to a running demo                                                                                                       |
| HTTP       | Express 4                                                            | Mature, minimal, well understood                                                                                                                                         |
| Database   | PostgreSQL 16 via **`pg` + Knex** (migrations + seed)                | The brief needs raw SQL features: `SELECT … FOR UPDATE`, a partial unique index, a deferred constraint trigger and `RANK()`. Knex keeps these explicit and parameterised |
| Validation | Zod schema per route                                                 | One schema gives both validation and the parsed, typed value                                                                                                             |
| Auth       | `jsonwebtoken` (HS256) + `bcryptjs` (cost 12)                        | `bcryptjs` is pure JS: same algorithm and hashes as native `bcrypt`, with no compiler toolchain needed                                                                   |
| Security   | `helmet`, `cors` (allow-list), `express-rate-limit`, 100 KB body cap | Brief's security baseline                                                                                                                                                |
| Logging    | `pino` + `pino-http`, per-request id, secrets redacted               | Structured JSON logs                                                                                                                                                     |
| Tests      | Vitest + Supertest against a real PostgreSQL test database           | Tests the real SQL, locks and constraints, not mocks                                                                                                                     |
| Deploy     | Dockerfile, `render.yaml` blueprint, Nginx config                    | API on Render and PostgreSQL on Neon for the demo; Nginx for self-hosting                                                                                                |

## Getting started

**Prerequisites:** Node.js 20+ and PostgreSQL 16+ (or Docker).

### Option A: Docker Compose (database + API)

```bash
docker compose up --build
curl http://localhost:4000/api/health
```

The container migrates and seeds itself on start (`SEED_ON_START=true`). The database is published on host port **5434** (not 5432), so it can run alongside a locally installed PostgreSQL: `psql -h localhost -p 5434 -U quiz quiz` (password `quiz`).

### Option B: Local Node.js

```bash
npm install
cp .env.example .env           # set DATABASE_URL and a random JWT_ACCESS_SECRET
createdb quiz_dev              # or create the database in pgAdmin
npm run migrate
npm run seed                   # idempotent: safe to re-run
npm run dev                    # http://localhost:4000, restarts on file changes
```

Generate a secret with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.

### Scripts

| Script                                 | What it does                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| `npm run dev`                          | Start with `node --watch`                                                     |
| `npm start`                            | Start the server                                                              |
| `npm run migrate` / `migrate:rollback` | Apply / roll back all migrations                                              |
| `npm run seed`                         | Upsert badges, quizzes and demo users; play the demo attempts. Safe to re-run |
| `npm test`                             | Run the test suite against the database in `.env.test` (reset at start)       |
| `npm run lint`                         | ESLint                                                                        |

### Running the tests

The suite needs a **disposable** PostgreSQL database: it rolls back, re-migrates and re-seeds it on every run.

```bash
createdb quiz_test
npm test                                                   # uses .env.test
DATABASE_URL=postgres://user:pass@host:5432/quiz_test npm test   # or override the URL
```

### Configuration

All config comes from environment variables, validated by Zod at boot ([src/config/env.js](src/config/env.js)). The app refuses to start if a value is invalid, including a placeholder JWT secret in production. See [.env.example](.env.example) for the full list. The ones that matter in deployment:

| Variable            | Default                 | Notes                                                                                   |
| ------------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| `DATABASE_URL`      | —                       | PostgreSQL connection string                                                            |
| `DATABASE_SSL`      | `false`                 | `true` for hosted databases that require TLS (Neon); the server certificate is verified |
| `JWT_ACCESS_SECRET` | —                       | ≥ 32 random characters                                                                  |
| `CORS_ORIGIN`       | `http://localhost:5173` | Comma-separated client origins. Also used by the CSRF origin check                      |
| `COOKIE_SAMESITE`   | `strict`                | Use `none` when the client and API are on different sites (requires HTTPS)              |
| `TRUST_PROXY`       | `0`                     | Set to `1` behind Render or Nginx so rate limits see real client IPs                    |
| `SEED_ON_START`     | —                       | Container only: run the idempotent seed on start                                        |

## API overview

All routes are under `/api`. Full request and response schemas are in [docs/openapi.yaml](docs/openapi.yaml).

| Method | Path                    | Auth       | Purpose                                                                        |
| ------ | ----------------------- | ---------- | ------------------------------------------------------------------------------ |
| POST   | `/auth/register`        | public     | `{name, email, password}` → 201, access token + refresh cookie                 |
| POST   | `/auth/login`           | public     | Access token (15 min) + refresh token (httpOnly cookie, 7 days)                |
| POST   | `/auth/refresh`         | cookie     | Rotate refresh token, new access token                                         |
| POST   | `/auth/logout`          | cookie     | Revoke refresh token, clear cookie → 204                                       |
| POST   | `/auth/change-password` | JWT        | `{current_password, new_password}` → signs out other devices, new session here |
| GET    | `/me`                   | JWT        | Caller's profile (name, email, xp, joined date)                                |
| PATCH  | `/me`                   | JWT        | Change display name (email and XP are not editable)                            |
| GET    | `/me/dashboard`         | JWT        | name, xp, quizzes_completed, badges, rank                                      |
| GET    | `/quizzes`              | JWT        | Quizzes with a per-user `completed` flag                                       |
| GET    | `/quizzes/:id`          | JWT        | Questions + options, **never** `is_correct`                                    |
| POST   | `/quizzes/:id/submit`   | JWT        | `{answers:[{question_id, option_id}]}` + `Idempotency-Key` header              |
| GET    | `/attempts`             | JWT        | Caller's attempts only (`limit`, `offset`)                                     |
| GET    | `/attempts/:id`         | JWT, owner | Per-question breakdown                                                         |
| GET    | `/leaderboard?limit=20` | JWT        | Ranked by XP desc; ties go to whoever reached the score first                  |
| GET    | `/health`               | public     | Liveness + DB ping (503 if the DB is down)                                     |

Every error has the same shape:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "…",
    "details": [{ "field": "answers[2].option_id", "message": "…" }]
  }
}
```

Status codes used: 400 (malformed JSON or Idempotency-Key), 401, 403 (foreign `Origin` on auth routes), 404, 409, 413 (body > 100 KB), 422, 429, 500 (no internals leaked), 503.

## Features and business rules

### Scoring (server-side only)

The client sends option ids, never a score. A request that includes a `score` field is **rejected** with 422, not silently ignored. The answer key is loaded on the server and graded by a pure function, [scoring.service.js](src/services/scoring.service.js):

- **XP** = correct × `xp_per_correct` (10), **+20 bonus** for a perfect score.
- **Validation (422 with field errors):** every question answered exactly once, every option belongs to its question, no unknown question or option ids.

### Duplicate protection (two layers)

1. **Same `Idempotency-Key` again** (e.g. a network retry or a double click) returns the stored result with **200** and `Idempotent-Replayed: true`. No new attempt is created and no XP is added. A key reused by a _different_ user or for a _different_ quiz is rejected with 409 `IDEMPOTENCY_KEY_REUSED`.
2. **Completing the same quiz again with a new key** is **rejected with 409 `QUIZ_ALREADY_COMPLETED`**. The response `details` include the original `attempt_id` so the client can show it.

> **Decision: reject with 409 rather than record "practice" attempts.** The brief allows either. Rejecting matches the required `UNIQUE(user_id, quiz_id)` constraint exactly, so the database itself guarantees one rewarded completion per quiz. Practice attempts would have needed a weaker partial constraint and a flag on every XP query. Students can still review their result breakdown at any time.

### The submit transaction, step by step

[`submitQuiz` in quizzes.service.js](src/modules/quizzes/quizzes.service.js#L83):

| Step | Line                                                | What and why                                                                                                                                               |
| ---- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | [L85](src/modules/quizzes/quizzes.service.js#L85)   | **Fast-path replay:** if this Idempotency-Key already has an attempt, return it before doing any work                                                      |
| 2    | [L88](src/modules/quizzes/quizzes.service.js#L88)   | Load the answer key (`is_correct`) on the server; 404 if the quiz doesn't exist                                                                            |
| 3    | [L90](src/modules/quizzes/quizzes.service.js#L90)   | Validate answers → 422 with field errors                                                                                                                   |
| 4    | [L93](src/modules/quizzes/quizzes.service.js#L93)   | Grade with the pure scoring function (outside the transaction, so locks are held briefly)                                                                  |
| 5    | [L96](src/modules/quizzes/quizzes.service.js#L96)   | **`BEGIN`:** one transaction from here on                                                                                                                  |
| 6    | [L99](src/modules/quizzes/quizzes.service.js#L99)   | **`SELECT … FROM users WHERE id = $1 FOR UPDATE`:** concurrent submits by the same user queue here, so they cannot double-award XP                         |
| 7    | [L103](src/modules/quizzes/quizzes.service.js#L103) | Re-check the key under the lock: a parallel retry may have just committed → replay                                                                         |
| 8    | [L106](src/modules/quizzes/quizzes.service.js#L106) | Already completed this quiz? → 409                                                                                                                         |
| 9    | [L110](src/modules/quizzes/quizzes.service.js#L110) | **Insert the attempt**, with a per-question grading snapshot in `answers` (jsonb)                                                                          |
| 10   | [L124](src/modules/quizzes/quizzes.service.js#L124) | **Add XP** (`xp = xp + $1`) and stamp `xp_updated_at` for leaderboard tie-breaks                                                                           |
| 11   | [L127](src/modules/quizzes/quizzes.service.js#L127) | **Evaluate badges** in the same transaction (`INSERT … ON CONFLICT DO NOTHING`)                                                                            |
| 12   | —                                                   | **`COMMIT`.** Any error at steps 6–11 rolls back everything                                                                                                |
| 13   | [L136](src/modules/quizzes/quizzes.service.js#L136) | Safety net for unique violations (the `pg` equivalent of Prisma `P2002`): replay if the key exists, else 409. It still works even if the lock were removed |

Both layers are mutation-tested. With the row lock removed, the unique-constraint safety net alone keeps concurrent submits correct. With both removed, the concurrency tests fail. A test forces a failure on the last write (the badge insert) and checks that no attempt, XP or badge survives.

### Gamification

- **Badges** ([badge.service.js](src/services/badge.service.js)) are defined as data. Each `badges` row carries a JSON rule, e.g. `{"type":"xp_at_least","value":100}`. A new badge with an existing rule type needs only a database row, no code change. Seeded badges: **First Steps** (1 quiz completed), **Perfect Score** (100% on any quiz), **XP 100**. The submit and attempt responses list the badges that attempt unlocked.
- **Leaderboard:** `RANK() OVER (ORDER BY xp DESC, xp_updated_at ASC)`. Ties go to whoever reached the score first. Ranks are global, not relative to the page, and the response includes the caller's own position even outside the top N. Emails are never exposed.
- **Dashboard:** name, XP, quizzes completed out of the total, badges, and rank out of all players.

### Data model

| Table            | Notes                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`          | `email` unique and `CHECK (email = lower(email))`; `xp >= 0`; `xp_updated_at` = when the current XP was reached (the brief's `updated_at`, named for what it means) |
| `quizzes`        | Plus a unique `slug`, so the seed is idempotent                                                                                                                     |
| `questions`      | FK `ON DELETE CASCADE`; unique `(quiz_id, position)`                                                                                                                |
| `options`        | **Exactly one correct option per question**: a partial unique index ensures at most one, and a deferred constraint trigger checked at `COMMIT` ensures at least one |
| `attempts`       | `UNIQUE(user_id, quiz_id)`, `UNIQUE(idempotency_key)`, `CHECK (score BETWEEN 0 AND total)`; quiz FK is `RESTRICT` so deleting a quiz cannot erase earned history    |
| `badges`         | `code` unique; `rule` jsonb                                                                                                                                         |
| `user_badges`    | `PRIMARY KEY (user_id, badge_id)`; `attempt_id` records which attempt earned it                                                                                     |
| `refresh_tokens` | SHA-256 hashes only; `family_id` for reuse detection                                                                                                                |

## Security

- **Passwords:** bcrypt, cost 12. Passwords over 72 bytes are rejected rather than silently truncated. Login takes the same time and returns the same error for an unknown email as for a wrong password.
- **Tokens:** the HS256 access token comes from an env secret. Only HS256 is accepted, so `alg: none` and algorithm-confusion tricks are rejected. Refresh tokens are opaque 256-bit random values, stored only as SHA-256 hashes, and **rotated on every use**. Presenting an already-rotated token is treated as theft and **revokes the whole session family**. The refresh row is locked with `FOR UPDATE`, so exactly one of N concurrent refreshes succeeds (tested with 8).
- **Cookies:** `HttpOnly`, `Secure` in production, configurable `SameSite`, scoped to `Path=/api/auth`.
- **CSRF:** auth routes reject requests whose `Origin` is not in the client allow-list. This matters when `SameSite=None` is needed for cross-site deployments.
- **Access control:** every route except health and auth requires a JWT. Owner-scoped reads check `attempt.user_id = caller` and answer **404 rather than 403**, so attempt ids cannot be probed. `GET /quizzes/:id` selects columns explicitly, and a test asserts the strings `is_correct` and `correct_option` never appear in its response.
- **Input:** Zod at every boundary. The submit body is strict (unknown keys rejected). Body cap is 100 KB. Malformed ids return 404.
- **Rate limits:** login and register 5/min per IP; refresh and logout 30/min per IP; submit 10/min **per user** (students behind one school NAT don't share a quota).
- **Headers:** Helmet defaults (HSTS, nosniff, frame-ancestors, …), `x-powered-by` off, CORS allow-list with credentials.
- **Database:** parameterised queries only, a 10 s statement timeout and a 10 s idle-in-transaction timeout.
- **Secrets:** env only. `.env` is gitignored; `.env.example` is committed. Logs redact `Authorization`, cookies and passwords (verified: no token or password appears in the server log after a full login, refresh and dashboard run).
- **Dependencies:** `npm audit` reports 0 vulnerabilities. vitest was moved to the patched 4.1.12 rather than a forced major upgrade, keeping Node 20 support.

## Testing

**93 tests** in [tests/](tests/), all against a real PostgreSQL database. The brief's minimum tests:

| Required test                                                     | Where                                                                            |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Scoring: all correct, none correct, perfect-score bonus           | [tests/scoring.test.js](tests/scoring.test.js)                                   |
| Submit twice with the same Idempotency-Key → one attempt, XP once | [tests/quizzes.test.js](tests/quizzes.test.js) (sequential **and** 6 concurrent) |
| Invalid option id → 422                                           | [tests/quizzes.test.js](tests/quizzes.test.js)                                   |
| Another user's attempt → 404                                      | [tests/attempts.test.js](tests/attempts.test.js)                                 |
| No token → 401                                                    | quizzes, attempts, dashboard and leaderboard tests                               |

Beyond those, the suite also covers:

- **Concurrency:** different-key and same-key submit races; 8-way refresh race.
- **Rollback:** of attempt, XP and badges, using test-only failing triggers.
- **Badges:** award timing, and no award twice.
- **Leaderboard:** tie-breaks.
- **Auth:** refresh-token reuse detection and the CSRF origin check.
- **Rate limits** (429), plus the 413, 400 and 404 error shapes.
- **Config:** env fail-fast at boot.

## Deployment

### Demo: API on Render, database on Neon

1. **Database (Neon):** create a free project at [neon.tech](https://neon.tech) (PostgreSQL 16+, pick the region closest to the Render service). Under **Connect**, turn **off** connection pooling and copy the **direct** connection string (no `-pooler` in the host). The API sets its 10 s statement and idle-in-transaction timeouts through the connection's startup `options`; Neon's direct endpoint honours them, while the pooled endpoint (PgBouncer) refuses the connection with "unsupported startup parameter".
2. **API (Render):** push the repo to GitHub, then choose **New → Blueprint** and select the repo. [render.yaml](render.yaml) creates the Docker web service, sets `DATABASE_SSL=true` (Neon requires TLS; the certificate is verified) and generates `JWT_ACCESS_SECRET`. When prompted, set:
   - `DATABASE_URL`: the Neon connection string from step 1
   - `CORS_ORIGIN`: the client URL
3. The container runs migrations and the idempotent seed on every start ([scripts/docker-entrypoint.sh](scripts/docker-entrypoint.sh)), so the Neon database gets its tables, quizzes, badges and test accounts on the first deploy.

Neon's free tier suspends the database after a few idle minutes; the first request afterwards takes about a second longer while it wakes.

**Rehearse the deploy locally:** [docker-compose.neon.yml](docker-compose.neon.yml) runs the production image against Neon exactly as Render will (API only, no local database). Put the secrets in a gitignored `.env.neon`:

```env
DATABASE_URL=postgresql://<user>:<password>@ep-xxx.<region>.aws.neon.tech/neondb?sslmode=verify-full
DATABASE_SSL=true
JWT_ACCESS_SECRET=<48+ random characters>
```

Then `docker compose down` (frees port 4000) and `docker compose -f docker-compose.neon.yml up --build`. The container migrates and seeds Neon on start, and `/api/health` reports `"database":"up"` once it's connected.

The client and API on two `*.onrender.com` hosts count as **cross-site** (`onrender.com` is a public suffix), so the blueprint sets `COOKIE_SAMESITE=none`. Cookies are `Secure` by default in production. The client must call the API with `credentials: 'include'`.

### Self-hosting with Nginx

[deploy/nginx.conf](deploy/nginx.conf) serves the React build and proxies `/api/` to the API on `127.0.0.1:4000`, all on **one origin**. The refresh cookie is then first-party and `COOKIE_SAMESITE=strict` works. The config includes:

- HTTP→HTTPS redirect, TLS via certbot, and a 100 KB `client_max_body_size`
- `X-Forwarded-For` overwritten rather than appended, so clients can't spoof their IP
- a request id passed through to the API logs
- a coarse per-IP rate limit in front of the app's own limits

Run the API with `TRUST_PROXY=1`.

```bash
docker build -t quiz-api .
docker run -d --restart unless-stopped -p 127.0.0.1:4000:4000 --env-file .env.production quiz-api
sudo cp deploy/nginx.conf /etc/nginx/sites-available/quiz.conf && sudo ln -s ../sites-available/quiz.conf /etc/nginx/sites-enabled/
sudo certbot --nginx -d quiz.example.com && sudo nginx -t && sudo systemctl reload nginx
```

The image runs as the non-root `node` user, with a `HEALTHCHECK` on `/api/health` and graceful shutdown on `SIGTERM`.

## Project structure

Feature-based modules. Each request flows **route → Zod validation → controller → service**. Services hold all logic and database access; controllers only translate HTTP.

```
src/
  app.js                    Express app and middleware order
  server.js                 listen + graceful shutdown
  config/                   env.js (zod-validated), logger.js (pino)
  db/                       knex.js, migrations/, seeds/, seed-data.js
  middleware/               auth, validate, errorHandler, rateLimit, idempotencyKey, trustedOrigin
  modules/
    auth/                   routes · controller · service · schema · tokens
    quizzes/                list, get (no is_correct), transactional submit
    attempts/               owner-scoped history + breakdown
    dashboard/              GET /me/dashboard
    leaderboard/            RANK() window query
    profile/                GET/PATCH /me (password change lives in auth/)
    health/                 liveness + DB ping
  services/                 scoring.service.js (pure), badge.service.js (runs in the submit transaction)
  utils/                    AppError, asyncHandler, password, pgErrors
tests/                      Vitest + Supertest
docs/openapi.yaml           API contract
deploy/nginx.conf           self-hosting
```

## Known limitations

- **Rate limits are in-memory**, so they are correct only with a single API instance. Running several instances needs a shared store such as `rate-limit-redis`.
- **Clients must not refresh concurrently.** Two simultaneous refreshes with the same cookie look like token theft and end the session. The client should serialise refresh calls (watch for React StrictMode double effects in development).
- **A replayed Idempotency-Key returns the original result even if the request body changed.** The key identifies the submission, not its contents. Clients should generate a fresh key for each new submission.
- **No retakes for reward:** a completed quiz cannot be replayed for practice (see the 409 decision above).
- **Registration reveals whether an email is taken** (409). This is inherent to self-service sign-up; it is rate-limited.
- **Expired and revoked refresh-token rows are never pruned.** A scheduled `DELETE … WHERE expires_at < now()` would handle it.
- **No admin or quiz-authoring API.** Quizzes come from the seed.
- **No account deletion or data export endpoint.** Deleting a user row cascades their attempts, badges and tokens, but there is no self-service route.
- The Docker image and Render blueprint were checked by running the entrypoint script locally; the image itself was not built in the development environment (no Docker daemon was available).

## AI-assistant disclosure

I built this project myself with AI coding assistant, **Claude Code (Anthropic, Claude Opus 5.5)**, as the brief permits.

- **How it was used:** I directed the build block by block, following the brief's suggested split: schema, auth, quizzes and submit, gamification, hardening, then deploy and docs. I reviewed and committed each block myself. The assistant drafted the code, tests and documentation, ran the test suite and linters, and carried out a security review.
- **Design decisions I approved:**
  - `pg` + Knex rather than Prisma
  - rejecting second completions with 409
  - a separate client repository
  - the feature-based module layout
  - fixes from the review, including the CSRF origin check, the vitest upgrade path and the idempotency safety-net fix
- **Verification:** behaviour is backed by the automated tests above. Key concurrency guarantees were checked by deliberately removing the lock and the safety net and confirming the tests fail.
