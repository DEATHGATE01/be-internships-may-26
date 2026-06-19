import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import http from "node:http";

const PORT = 9091;
const BASE = `http://localhost:${PORT}`;

function startServer() {
  return spawn("node", ["src/server.js"], {
    env: { ...process.env, API_KEY: "k", PORT: String(PORT) },
  });
}

test("idempotency: same key returns same resource", async () => {
  const proc = startServer();
  await wait(400);

  try {
    const key = "idem-test-" + Date.now();

    const first = await postJson(`${BASE}/v1/signals`, {
      headers: { "x-api-key": "k", "Idempotency-Key": key },
      body: { userId: "u1", type: "click", payload: "hello" },
    });
    const second = await postJson(`${BASE}/v1/signals`, {
      headers: { "x-api-key": "k", "Idempotency-Key": key },
      body: { userId: "u1", type: "click", payload: "hello" },
    });

    assert.equal(first.id, second.id);
    assert.equal(first.idempotencyKey, second.idempotencyKey);
    assert.equal(first.createdAt, second.createdAt);
  } finally {
    proc.kill();
  }
});

test("idempotency: different keys create different signals", async () => {
  const proc = startServer();
  await wait(400);

  try {
    const a = await postJson(`${BASE}/v1/signals`, {
      headers: { "x-api-key": "k", "Idempotency-Key": "key-a-" + Date.now() },
      body: { userId: "u2", type: "click", payload: "a" },
    });
    const b = await postJson(`${BASE}/v1/signals`, {
      headers: { "x-api-key": "k", "Idempotency-Key": "key-b-" + Date.now() },
      body: { userId: "u2", type: "click", payload: "b" },
    });

    assert.notEqual(a.id, b.id);
  } finally {
    proc.kill();
  }
});

test("idempotency: no key means no dedup", async () => {
  const proc = startServer();
  await wait(400);

  try {
    const a = await postJson(`${BASE}/v1/signals`, {
      headers: { "x-api-key": "k" },
      body: { userId: "u3", type: "click", payload: "same" },
    });
    const b = await postJson(`${BASE}/v1/signals`, {
      headers: { "x-api-key": "k" },
      body: { userId: "u3", type: "click", payload: "same" },
    });

    assert.notEqual(a.id, b.id);
  } finally {
    proc.kill();
  }
});

async function postJson(url, { headers, body }) {
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
        res.on("end", () => resolve(JSON.parse(chunks || "{}")));
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}
