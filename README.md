# Signals Challenge (Node.js + Fastify)

A minimal production-leaning service that handles load, enforces per-user rate limits, and avoids duplicate writes via idempotency keys.

## Getting Started

```bash
cp .env.example .env
npm install
npm run dev
```

The server starts on `http://localhost:8080` by default.

## Endpoints

### POST /v1/signals

Creates a new signal.

- **Headers**: `X-API-Key` (required), `Idempotency-Key` (optional)
- **Body**: `{ "userId": "string", "type": "string", "payload": "string" }`
- Rate limited per `userId` (default 5 requests/min, configurable via `RATE_LIMIT_PER_MIN`)
- If an `Idempotency-Key` is provided, sending the same key again returns the original resource instead of creating a duplicate.

### GET /v1/signals?userId=...&limit=...

Returns signals for a given user, ordered by most recent. `limit` defaults to 20, max 100.

### GET /healthz

Returns `{ "ok": true }`.

## How It Works

**Rate Limiting** — Uses a SQLite-backed sliding window counter (atomic upsert). Each `userId` gets a row that tracks the window start and request count. This avoids race conditions that in-memory maps would have under concurrency.

**Idempotency** — The `idempotency_key` column has a UNIQUE constraint. If two concurrent requests try to insert the same key, one wins and the other catches the constraint violation and returns the existing row. No check-then-insert race.

**Retry / Backoff** — All DB operations are wrapped in a retry loop with exponential backoff and jitter. The `DB_FAIL_RATE` env var simulates transient failures for testing.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `API_KEY` | `change-me` | API key for auth |
| `PORT` | `8080` | Server port |
| `DATABASE_URL` | `./data/signals.db` | SQLite DB path |
| `RATE_LIMIT_PER_MIN` | `5` | Max requests per user per minute |
| `DB_FAIL_RATE` | `0` | Simulated DB failure rate (0-1) |

## Running Tests

```bash
node --test
```

## Scaling

See [SCALE.md](./SCALE.md) for the approach to handle 10k RPS.
