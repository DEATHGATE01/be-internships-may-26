import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import http from "node:http";

const PORT = 9093;
const BASE = `http://localhost:${PORT}`;

function startServer() {
  return spawn("node", ["src/server.js"], {
    env: { ...process.env, API_KEY: "testkey", PORT: String(PORT) },
  });
}

test("healthz returns ok", async () => {
  const proc = startServer();
  await wait(400);

  try {
    const { status, body } = await getJson(`${BASE}/healthz`);
    assert.equal(status, 200);
    assert.equal(body.ok, true);
  } finally {
    proc.kill();
  }
});

test("missing api key returns 401", async () => {
  const proc = startServer();
  await wait(400);

  try {
    const { status } = await postFull(`${BASE}/v1/signals`, {
      headers: {},
      body: { userId: "u1", type: "note", payload: "x" },
    });
    assert.equal(status, 401);
  } finally {
    proc.kill();
  }
});

test("wrong api key returns 401", async () => {
  const proc = startServer();
  await wait(400);

  try {
    const { status } = await postFull(`${BASE}/v1/signals`, {
      headers: { "x-api-key": "wrong-key" },
      body: { userId: "u1", type: "note", payload: "x" },
    });
    assert.equal(status, 401);
  } finally {
    proc.kill();
  }
});

test("post with missing body fields returns 400", async () => {
  const proc = startServer();
  await wait(400);

  try {
    const { status, body } = await postFull(`${BASE}/v1/signals`, {
      headers: { "x-api-key": "testkey" },
      body: { userId: "u1" },
    });
    assert.equal(status, 400);
    assert.equal(body.error, "invalid_body");
  } finally {
    proc.kill();
  }
});

test("GET /v1/signals returns posted signals", async () => {
  const proc = startServer();
  await wait(400);

  try {
    // create a signal first
    await postFull(`${BASE}/v1/signals`, {
      headers: { "x-api-key": "testkey" },
      body: { userId: "get-test", type: "ping", payload: "data" },
    });

    const { status, body } = await getJson(
      `${BASE}/v1/signals?userId=get-test&limit=10`,
      { "x-api-key": "testkey" }
    );

    assert.equal(status, 200);
    assert.ok(Array.isArray(body.items));
    assert.ok(body.items.length >= 1);
    assert.equal(body.items[0].userId, "get-test");
  } finally {
    proc.kill();
  }
});

test("GET /v1/signals without userId returns 400", async () => {
  const proc = startServer();
  await wait(400);

  try {
    const { status, body } = await getJson(`${BASE}/v1/signals?limit=10`, {
      "x-api-key": "testkey",
    });
    assert.equal(status, 400);
    assert.equal(body.error, "missing_userId");
  } finally {
    proc.kill();
  }
});

async function getJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: "GET", headers }, (res) => {
      let chunks = "";
      res.on("data", (d) => (chunks += d));
      res.on("end", () =>
        resolve({ status: res.statusCode, body: JSON.parse(chunks || "{}") })
      );
    });
    req.on("error", reject);
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
