# Scale Plan (10k RPS)

## Current Bottlenecks

- Single SQLite instance
- Application memory limits (single Node.js process)

## Horizontal Scaling

- Deploy multiple instances of the Node.js application behind a load balancer (e.g., NGINX, AWS ALB).
- Use a Redis cluster for the rate-limiting buckets. Using `INCR` with expirations handles concurrency out-of-the-box and guarantees consistency across all app instances.

## Database Scaling

- Migrate from SQLite to a highly available relational database like PostgreSQL.
- Add read replicas to scale out read queries (like the `GET /v1/signals` endpoint) if read volume is high.
- Use a connection pool (e.g., pg-pool) on the Node instances to efficiently manage database connections.

## Asynchronous Processing (Optional)

- For write-heavy bursts, instead of direct DB writes, publish signals to a message queue (Kafka/RabbitMQ/SQS).
- A pool of consumer workers will pull from the queue, enforce idempotency checks, and batch insert into the database, dramatically reducing DB lock contention and connection limits.
- Idempotency is handled at the consumer/database level by retaining unique constraints on `idempotency_key`.

- Observability (logs/metrics/alerts):
- Failure modes (DB down / partial outages / retries):
- 10k RPS design sketch (infra & cost ballpark):
