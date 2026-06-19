import { insertSignal, getByIdemKey, listSignals } from "./db.js";
import { checkAndConsume } from "./rateLimit.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return fn();
    } catch (err) {
      // unique constraint violations shouldn't be retried, bubble them up
      if (err.code === "SQLITE_CONSTRAINT_UNIQUE") throw err;

      // only retry transient db errors
      if (err.code !== "SQLITE_BUSY" && err.message !== "simulated_db_failure")
        throw err;

      if (attempt === retries) throw err;

      // exponential backoff with jitter
      const wait = Math.pow(2, attempt) * 50 + Math.floor(Math.random() * 50);
      await delay(wait);
    }
  }
}

export async function postSignal(req, reply) {
  const idemKey = req.headers["idempotency-key"] || null;
  const { userId, type, payload } = req.body || {};

  if (!userId || !type || typeof payload === "undefined") {
    return reply.code(400).send({ error: "invalid_body" });
  }

  try {
    const { ok, remaining, resetMs } = await withRetry(() =>
      checkAndConsume(userId)
    );
    if (!ok) {
      return reply.code(429).send({ error: "rate_limited", remaining, resetMs });
    }

    const now = Date.now();

    try {
      const result = await withRetry(() =>
        insertSignal(userId, type, payload, idemKey, now)
      );
      return {
        id: result.lastInsertRowid,
        userId,
        type,
        payload: String(payload),
        idempotencyKey: idemKey,
        createdAt: now,
      };
    } catch (err) {
      // if the insert failed because of a duplicate idempotency key,
      // just return the existing record
      if (err.code === "SQLITE_CONSTRAINT_UNIQUE" && idemKey) {
        const existing = await withRetry(() => getByIdemKey(idemKey));
        if (existing) return existing;
      }
      throw err;
    }
  } catch (err) {
    req.log.error({ err, ctx: "postSignal" });
    return reply.code(503).send({ error: "db_unavailable" });
  }
}

export async function getSignals(req, reply) {
  const { userId, limit = 20 } = req.query || {};
  if (!userId) return reply.code(400).send({ error: "missing_userId" });

  const lim = Math.min(Number(limit) || 20, 100);

  try {
    const rows = await withRetry(() => listSignals(userId, lim));
    return { items: rows };
  } catch (err) {
    req.log.error({ err, ctx: "getSignals" });
    return reply.code(503).send({ error: "db_unavailable" });
  }
}
