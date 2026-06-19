import { checkRateLimit } from "./db.js";

const RATE = Number(process.env.RATE_LIMIT_PER_MIN || 5);
const WINDOW_MS = 60_000;

export function checkAndConsume(userId, nowMs = Date.now()) {
  const { count, window_start } = checkRateLimit(
    userId,
    RATE,
    WINDOW_MS,
    nowMs,
  );
  const ok = count <= RATE;
  const resetMs = window_start + WINDOW_MS;
  const remaining = Math.max(RATE - count, 0);
  return { ok, remaining, resetMs };
}
