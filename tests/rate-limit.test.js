import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import http from "node:http";

const PORT = 9092;
const BASE = `http://localhost:${PORT}`;

function startServer(env = {}) {
  return spawn("node", ["src/server.js"], {
    env: { ...process.env, API_KEY: "k", PORT: String(PORT), RATE_LIMIT_PER_MIN: "5", ...env },
  });
}

test("rate limit: 5 requests allowed, 6th gets 429", async () => {
  const proc = startServer();
  await wait(400);

  try {
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      const code = await postStatus(`${BASE}/v1/signals`, {
        headers: { "x-api-key": "k" },
        body: { userId: "rl-user-1", type: "note", payload: String(i) },
      });
      statuses.push(code);
    }

    // first 5 should be 200, 6th should be 429
    const ok = statuses.filter((s) => s === 200).length;
    const limited = statuses.filter((s) => s === 429).length;
    assert.ok(ok >= 5, `expected at least 5 successes, got ${ok}`);
    assert.ok(limited >= 1, `expected at least 1 rate limit, got ${limited}`);
  } finally {
    proc.kill();
  }
});

test("rate limit: different users have separate limits", async () => {
  const proc = startServer();
  await wait(400);

  try {
    // fill up user A's limit
    for (let i = 0; i < 5; i++) {
      await postStatus(`${BASE}/v1/signals`, {
        headers: { "x-api-key": "k" },
        body: { userId: "user-a", type: "note", payload: String(i) },
      });
    }

    // user B should still be able to post
    const code = await postStatus(`${BASE}/v1/signals`, {
      headers: { "x-api-key": "k" },
      body: { userId: "user-b", type: "note", payload: "hi" },
    });

    assert.equal(code, 200);
  } finally {
    proc.kill();
  }
});

test("rate limit: returns 429 with rate_limited error body", async () => {
  const proc = startServer({ RATE_LIMIT_PER_MIN: "1" });
  await wait(400);

  try {
    // first request should succeed
    await postStatus(`${BASE}/v1/signals`, {
      headers: { "x-api-key": "k" },
      body: { userId: "rl-body", type: "note", payload: "1" },
    });

    // second should be rate limited, check the body
    const { status, body } = await postFull(`${BASE}/v1/signals`, {
      headers: { "x-api-key": "k" },
      body: { userId: "rl-body", type: "note", payload: "2" },
    });

    assert.equal(status, 429);
    assert.equal(body.error, "rate_limited");
    assert.equal(typeof body.remaining, "number");
    assert.equal(typeof body.resetMs, "number");
  } finally {
    proc.kill();
  }
});

async function postStatus(url, { headers, body }) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function postFull(url, { headers, body }) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
      },
      (res) => {
        let chunks = "";
        res.on("data", (d) => (chunks += d));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: JSON.parse(chunks || "{}") })
        );
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}
