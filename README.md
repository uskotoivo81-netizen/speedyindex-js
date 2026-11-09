# speedyindex — Node.js client for the SpeedyIndex API

`speedyindex` is a dependency-free Node.js client for SpeedyIndex, a service for link indexing, Google, Bing and Yandex index checking and Google rank tracking. It covers the [SpeedyIndex API](https://en.speedyindex.com/api.php) v2: index checks, indexing tasks, reports, backlink checks, the Rank Tracker API and webhook signatures. TypeScript types are included.

- Node.js 18+ (built-in `fetch`), ESM, no dependencies
- Index checks for Google, Bing and Yandex; reports with indexed and unindexed URLs
- Link indexing for Google and Yandex, single URLs and drip feed
- Rank Tracker: projects, keywords, regions, checks, positions, history, AI Overview citations, CSV export
- Webhooks: verify `X-SpeedyIndex-Signature`

A Python version with a CLI is on PyPI as [`speedyindex`](https://pypi.org/project/speedyindex/).

## Install

```bash
npm install speedyindex
```

## API key

Get the key in your SpeedyIndex dashboard or the SpeedyIndex Telegram bot settings and pass it as `apiKey`, or set `SPEEDYINDEX_API_KEY`. Keep it in environment variables or a secret store, not in code.

## Index checks

```js
import { SpeedyIndex } from "speedyindex";

const si = new SpeedyIndex(); // reads SPEEDYINDEX_API_KEY

const { task_id } = await si.createTask(
  ["https://example.com/", "https://example.com/blog/post-1"],
  { engine: "google", taskType: "checker", title: "blog check" },
);

const report = await si.report(task_id, { engine: "google", taskType: "checker" });
console.log(report.unindexed_links);

const full = await si.fullReport(task_id, { engine: "google", taskType: "checker" });
// indexed_links: [{ url, title }]  unindexed_links: [{ url, error_code }]  (-1: noindex, 0: none, else HTTP status)
```

Bing supports `checker` tasks only. Indexing, with optional drip feed for Google:

```js
await si.createTask(urls, { engine: "google", taskType: "indexer", dripFeedDays: 7 });
await si.indexUrl("https://example.com/new-page", { engine: "yandex" });
```

## Rank Tracker

Projects created through the API are the same ones you see in the dashboard.

```js
const [loc] = await si.rank.locations("new york", { gl: "us" });
const { project } = await si.rank.createProject(
  "example.com",
  [{ location: loc.canonical_name, gl: loc.country_code }],
  { keywords: ["pizza delivery", "best pizza near me"], depth: 30, ref: "my-project-1" },
);

let check = await si.rank.runCheck(project.id);
check = await si.rank.wait(check.id); // or use a webhook

for await (const row of si.rank.positions(project.id, { checkId: check.id })) {
  console.log(row.q, row.found ? row.position : "not found");
}

const csv = await si.rank.export(project.id, { format: "csv" });
```

Lists (`projects`, `keywords`, `checks`, `positions`, `deliveries`) are async iterators that follow `next_cursor`.

## Webhooks

```js
import express from "express";
import { parseEvent } from "speedyindex/webhooks";

app.post("/speedyindex", express.raw({ type: "application/json" }), (req, res) => {
  try {
    const event = parseEvent(req.body, req.get("X-SpeedyIndex-Signature"), process.env.SPEEDYINDEX_WEBHOOK_SECRET);
    // event.event: check.finished | check.failed | check.skipped; handle each event.event_id once
    res.sendStatus(200);
  } catch {
    res.sendStatus(401);
  }
});
```

## Errors

Failed calls throw `SpeedyIndexError` with `code`, `status`, `error` (machine-readable name such as `rows_expired`) and `retryAfter` on HTTP 429.

## License

MIT
