import { insertSignal, getByIdemKey, listSignals } from "./db.js";
import { checkAndConsume } from "./rateLimit.js";

function nowMs() {
  return Date.now();
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(operation, maxRetries = 3) {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await operation();
    } catch (e) {
      if (
        e.message !== "simulated_db_failure" &&
        e.code !== "SQLITE_BUSY" &&
        e.code !== "SQLITE_CONSTRAINT_UNIQUE"
      )
        throw e;
      if (e.code === "SQLITE_CONSTRAINT_UNIQUE") throw e;
      if (i === maxRetries) throw e;
      const jitter = Math.floor(Math.random() * 50);
      await delay(Math.pow(2, i) * 50 + jitter);
    }
  }
}

export async function postSignal(req, reply) {
  const idem = req.headers["idempotency-key"] || null;
  const { userId, type, payload } = req.body || {};
  if (!userId || !type || typeof payload === "undefined") {
    return reply.code(400).send({ error: "invalid_body" });
  }

  try {
    const { ok, remaining, resetMs } = await withRetry(() =>
      checkAndConsume(userId, nowMs()),
    );
    if (!ok)
      return reply
        .code(429)
        .send({ error: "rate_limited", remaining, resetMs });

    try {
      const t = nowMs();
      const info = await withRetry(() =>
        insertSignal(userId, type, payload, idem, t),
      );
      return {
        id: info.lastInsertRowid,
        userId,
        type,
        payload: String(payload),
        idempotencyKey: idem,
        createdAt: t,
      };
    } catch (e) {
      if (e.code === "SQLITE_CONSTRAINT_UNIQUE" && idem) {
        const existing = await withRetry(() => getByIdemKey(idem));
        if (existing) return existing;
      }
      throw e;
    }
  } catch (e) {
    req.log.error({ err: e, ctx: "insertSignal" });
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
  } catch (e) {
    req.log.error({ err: e, ctx: "listSignals" });
    return reply.code(503).send({ error: "db_unavailable" });
  }
}
