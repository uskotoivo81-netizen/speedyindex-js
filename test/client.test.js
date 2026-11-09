import { test } from "node:test";
import assert from "node:assert/strict";
import { SpeedyIndex, SpeedyIndexError } from "../src/index.js";
import { sign, verifySignature, parseEvent } from "../src/webhooks.js";

function fakeFetch(responses, calls) {
  return async (url, init) => {
    calls.push({ url, init });
    const r = responses.shift();
    return new Response(JSON.stringify(r.body), { status: r.status || 200, headers: r.headers || {} });
  };
}

test("balance sends the key as is", async () => {
  const calls = [];
  const si = new SpeedyIndex({ apiKey: "k", fetch: fakeFetch([{ body: { code: 0, balance: { tokens: 1 } } }], calls) });
  assert.deepEqual(await si.balance(), { tokens: 1 });
  assert.equal(calls[0].init.headers.Authorization, "k");
  assert.match(calls[0].url, /\/v2\/account$/);
});

test("google indexer forces pay_per_indexed and dedupes", async () => {
  const calls = [];
  const si = new SpeedyIndex({ apiKey: "k", fetch: fakeFetch([{ body: { code: 0, task_id: "t" } }], calls) });
  await si.createTask(["https://a/", "https://a/", "#x", "https://b/"], { taskType: "indexer" });
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.urls, ["https://a/", "https://b/"]);
  assert.equal(body.pay_per_indexed, true);
});

test("validation", async () => {
  const si = new SpeedyIndex({ apiKey: "k", fetch: async () => { throw new Error("no call"); } });
  await assert.rejects(si.createTask(["https://a/"], { engine: "bing", taskType: "indexer" }), TypeError);
  await assert.rejects(si.createTask(["https://a/"], { dripFeedDays: 2 }), TypeError);
});

test("rank positions paginate and HTTP errors are parsed", async () => {
  const calls = [];
  const si = new SpeedyIndex({ apiKey: "k", fetch: fakeFetch([
    { body: { code: 0, items: [{ q: "a" }], next_cursor: "c1" } },
    { body: { code: 0, items: [{ q: "b" }], next_cursor: null } },
    { status: 429, body: { code: 3, error: "rate_limited", message: "slow down" }, headers: { "Retry-After": "7" } },
  ], calls) });
  const rows = [];
  for await (const r of si.rank.positions("p1", { changedOnly: true })) rows.push(r.q);
  assert.deepEqual(rows, ["a", "b"]);
  assert.match(calls[0].url, /rank-tracker\/projects\/p1\/positions\?changed_only=true/);
  assert.match(calls[1].url, /cursor=c1/);
  await assert.rejects(si.rank.check("c"), (e) => e instanceof SpeedyIndexError && e.status === 429 && e.error === "rate_limited" && e.retryAfter === 7);
});

test("webhook signatures", () => {
  const body = Buffer.from('{"event":"check.finished","event_id":"e1"}');
  const good = sign(body, "whsec_new");
  assert.ok(verifySignature(body, good, "whsec_new"));
  assert.ok(verifySignature(body, `${good}, ${sign(body, "whsec_old")}`, "whsec_old"));
  assert.ok(!verifySignature(body, good, "whsec_x"));
  assert.equal(parseEvent(body, good, "whsec_new").event_id, "e1");
  assert.throws(() => parseEvent(body, "sha256=00", "whsec_new"));
});
