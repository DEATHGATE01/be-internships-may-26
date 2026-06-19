# Scale Plan — 10k RPS

## Database

SQLite won't cut it past a few hundred RPS because of its single-writer lock.

- Switch to PostgreSQL (or CockroachDB if we want multi-region).
- Add a connection pool (e.g. `pg-pool`, 20-50 connections per instance) so we don't open/close connections on every request.
- Make sure `idempotency_key` has a UNIQUE index — this is what makes upserts and duplicate detection fast.
- The existing `idx_user_created` index already covers the GET query.

## Rate Limiting

In-memory maps don't work across instances.

- Use Redis with `INCR` + `EXPIRE` for sliding window counters. Each key is like `rl:<userId>:<windowBucket>`.
- Redis handles the atomicity for us — no race conditions even with 10 instances hitting it.
- If Redis goes down temporarily, we can fall back to allowing requests (fail-open) rather than blocking everyone.

## Idempotency Across Instances

- The DB-level UNIQUE constraint on `idempotency_key` is the source of truth. It doesn't matter which instance handles the request — duplicates are caught at the DB.
- On conflict, we just fetch and return the existing row. No in-memory caches needed for correctness.

## Horizontal Scaling

- Run N stateless Node.js instances behind a load balancer (NGINX / ALB).
- Each instance connects to the same Postgres and Redis.
- No sticky sessions needed since all state lives in the DB / Redis.

## Handling Failures

- Retry transient DB errors with exponential backoff + jitter (already implemented in the code).
- For sustained outages, a circuit breaker pattern would help — stop hammering the DB and return 503 immediately for a cooldown period.
- Dead letter queue for requests that fail after all retries, so we don't lose data silently.

## Observability

- Structured JSON logs (Fastify already does this).
- Track p99 latency, error rate, and rate-limit hit rate with Prometheus / Grafana.
- Alert on sustained 5xx spikes or DB connection pool exhaustion.

## Rough Infra Sketch

For 10k RPS:

- 4-6 Node.js instances (c5.large or similar), each handling ~2k RPS.
- 1 PostgreSQL primary + 1 read replica (RDS db.r5.xlarge).
- 1 Redis cluster (ElastiCache, 2 shards) for rate limits.
- ALB in front, auto-scaling group for the Node instances.
- Estimated cost: ~$800-1200/month on AWS.
