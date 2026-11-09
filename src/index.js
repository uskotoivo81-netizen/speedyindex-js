// SpeedyIndex API v2 client for Node.js 18+ (no dependencies).
// Indexing, Google/Bing/Yandex index checks, backlink checks and the Rank Tracker API.

export const DEFAULT_BASE_URL = "https://api.speedyindex.com";
const ENGINES = ["google", "yandex", "bing"];
const TASK_TYPES = ["indexer", "checker"];
const MAX_URLS = 10000;
const MAX_IDS = 1000;
const RT = "/v2/rank-tracker";

export class SpeedyIndexError extends Error {
  constructor(message, { code, status, error, payload, retryAfter } = {}) {
    super(message);
    this.name = "SpeedyIndexError";
    this.code = code;
    this.status = status;
    this.error = error;
    this.payload = payload;
    this.retryAfter = retryAfter;
  }
}

function checkEngine(engine, taskType) {
  if (!ENGINES.includes(engine)) throw new TypeError(`engine must be one of ${ENGINES.join(", ")}`);
  if (taskType !== undefined) {
    if (!TASK_TYPES.includes(taskType)) throw new TypeError(`taskType must be one of ${TASK_TYPES.join(", ")}`);
    if (engine === "bing" && taskType !== "checker") throw new TypeError("Bing supports only the 'checker' task type");
  }
}

function cleanUrls(urls) {
  const seen = new Set();
  const out = [];
  for (let u of urls) {
    u = String(u).trim();
    if (u && !u.startsWith("#") && !seen.has(u)) { seen.add(u); out.push(u); }
  }
  return out;
}

export class SpeedyIndex {
  /**
   * @param {{apiKey?: string, baseUrl?: string, timeoutMs?: number, fetch?: typeof fetch}} [options]
   */
  constructor({ apiKey, baseUrl = DEFAULT_BASE_URL, timeoutMs = 60000, fetch: fetchImpl } = {}) {
    this.apiKey = apiKey || (typeof process !== "undefined" ? process.env.SPEEDYINDEX_API_KEY : undefined);
    if (!this.apiKey) throw new SpeedyIndexError("No API key: pass { apiKey } or set SPEEDYINDEX_API_KEY");
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
    this._fetch = fetchImpl || globalThis.fetch;
    this.rank = new RankTracker(this);
  }

  async _raw(method, path, { body, params } = {}) {
    let url = this.baseUrl + path;
    if (params) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) qs.set(k, String(v));
      const s = qs.toString();
      if (s) url += "?" + s;
    }
    const headers = { Authorization: this.apiKey, Accept: "application/json", "User-Agent": "speedyindex-js" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await this._fetch(url, {
      method, headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text();
      let payload;
      try { payload = text ? JSON.parse(text) : undefined; } catch { payload = text; }
      const error = payload && typeof payload === "object" ? payload.error : undefined;
      const message = payload && typeof payload === "object" ? payload.message : undefined;
      const ra = res.headers.get("retry-after");
      throw new SpeedyIndexError(
        `HTTP ${res.status} for ${path}` + (error ? `: ${error}` : "") + (message ? ` - ${message}` : ""),
        { code: payload?.code ?? res.status, status: res.status, error, payload, retryAfter: ra ? Number(ra) : undefined },
      );
    }
    return res;
  }

  async _request(method, path, opts) {
    const res = await this._raw(method, path, opts);
    const text = await res.text();
    let payload;
    try { payload = JSON.parse(text); } catch { throw new SpeedyIndexError(`Non-JSON response for ${path}`, { payload: text }); }
    if (payload && typeof payload === "object" && payload.code !== undefined && payload.code !== 0) {
      throw new SpeedyIndexError(`API error ${payload.code}: ${payload.error || payload.message || "see payload"}`,
        { code: payload.code, error: payload.error, payload });
    }
    return payload;
  }

  /** GET /v2/account */
  async balance() { return (await this._request("GET", "/v2/account")).balance; }

  /** POST /v2/task/{engine}/{type}/create — returns {code, task_id, type, ...} */
  async createTask(urls, { engine = "google", taskType = "checker", title, payPerIndexed, dripFeedDays } = {}) {
    checkEngine(engine, taskType);
    const list = cleanUrls(urls);
    if (!list.length) throw new TypeError("urls is empty");
    if (list.length > MAX_URLS) throw new RangeError(`max ${MAX_URLS} URLs per task`);
    const body = { urls: list };
    if (title) body.title = title;
    if (engine === "google" && taskType === "indexer") payPerIndexed = true;
    if (payPerIndexed !== undefined) body.pay_per_indexed = payPerIndexed;
    if (dripFeedDays) {
      if (!(engine === "google" && taskType === "indexer")) throw new TypeError("drip feed is available for google/indexer only");
      if (dripFeedDays < 2 || dripFeedDays > 30) throw new RangeError("dripFeedDays must be 2-30");
      if (list.length < dripFeedDays) throw new RangeError("number of URLs must be >= dripFeedDays");
      body.drip_feed = true;
      body.drip_feed_days = dripFeedDays;
    }
    return this._request("POST", `/v2/task/${engine}/${taskType}/create`, { body });
  }

  /** GET /v2/task/{engine}/{type}/list/{page} */
  async listTasks({ engine = "google", taskType = "indexer", page = 0, filter, payPerIndexed } = {}) {
    checkEngine(engine, taskType);
    return this._request("GET", `/v2/task/${engine}/${taskType}/list/${page}`, { params: { filter, pay_per_indexed: payPerIndexed } });
  }

  /** POST /v2/task/{engine}/{type}/status */
  async taskStatus(taskIds, { engine = "google", taskType = "checker" } = {}) {
    checkEngine(engine, taskType);
    const ids = [...taskIds];
    if (ids.length > MAX_IDS) throw new RangeError(`max ${MAX_IDS} task IDs`);
    return this._request("POST", `/v2/task/${engine}/${taskType}/status`, { body: { task_ids: ids } });
  }

  /** POST /v2/task/{engine}/{type}/report — indexed_links / unindexed_links as URL lists */
  async report(taskId, { engine = "google", taskType = "checker" } = {}) {
    checkEngine(engine, taskType);
    return (await this._request("POST", `/v2/task/${engine}/${taskType}/report`, { body: { task_id: taskId } })).result;
  }

  /** POST /v2/task/{engine}/{type}/fullreport — indexed {url,title}, unindexed {url,error_code} */
  async fullReport(taskId, { engine = "google", taskType = "checker" } = {}) {
    checkEngine(engine, taskType);
    return (await this._request("POST", `/v2/task/${engine}/${taskType}/fullreport`, { body: { task_id: taskId } })).result;
  }

  /** POST /v2/{engine}/url — google or yandex */
  async indexUrl(url, { engine = "google", payPerIndexed } = {}) {
    if (!["google", "yandex"].includes(engine)) throw new TypeError("single-link submission supports google and yandex");
    const body = { url };
    if (payPerIndexed !== undefined) body.pay_per_indexed = payPerIndexed;
    return this._request("POST", `/v2/${engine}/url`, { body });
  }

  /** POST /v2/task/backlink/checker/create */
  async createBacklinkCheck(urls, targetDomains) {
    const list = cleanUrls(urls);
    if (!list.length) throw new TypeError("urls is empty");
    if (list.length > MAX_URLS) throw new RangeError(`max ${MAX_URLS} URLs per task`);
    return this._request("POST", "/v2/task/backlink/checker/create", { body: { urls: list, target_domains: [...targetDomains] } });
  }

  /** POST /v2/task/backlink/checker/status */
  async backlinkStatus(taskIds) {
    const body = typeof taskIds === "string" ? { task_id: taskIds } : { task_ids: [...taskIds] };
    return (await this._request("POST", "/v2/task/backlink/checker/status", { body })).result;
  }

  /** POST /v2/task/backlink/checker/report */
  async backlinkReport(taskId, { page = 0, limit = 50 } = {}) {
    return this._request("POST", "/v2/task/backlink/checker/report", { body: { task_id: taskId, page, limit } });
  }
}

export class RankTracker {
  constructor(client) { this._c = client; }
  _get(path, params) { return this._c._request("GET", RT + path, { params }); }
  _send(method, path, body = {}) { return this._c._request(method, RT + path, { body }); }

  /** Iterate over every item of a cursor-paginated list. */
  async *paginate(path, params = {}) {
    let cursor;
    do {
      const page = await this._get(path, { ...params, cursor });
      for (const item of page.items || []) yield item;
      cursor = page.next_cursor;
    } while (cursor);
  }

  limits() { return this._get("/limits"); }
  async locations(q, { gl, limit } = {}) { return (await this._get("/locations", { q, gl, limit })).locations; }
  async groups() { return (await this._get("/groups")).items; }
  usage({ from, to, tz, group, projectId } = {}) { return this._get("/usage", { from, to, tz, group, project_id: projectId }); }

  projects(params = {}) { return this.paginate("/projects", params); }
  /** regions: [{location, gl, device?}]; extra: name, depth, competitors, schedule, group, tags, webhook_url, check_emails */
  createProject(domain, regions, { keywords, ref, ...extra } = {}) {
    const body = { domain, regions, ...extra };
    if (keywords) body.keywords = [...keywords];
    if (ref) body.ref = ref;
    return this._send("POST", "/projects", body);
  }
  project(projectId) { return this._get(`/projects/${projectId}`); }
  async updateProject(projectId, fields) { return (await this._send("PATCH", `/projects/${projectId}`, fields)).project; }
  deleteProject(projectId) { return this._c._request("DELETE", `${RT}/projects/${projectId}`); }
  async bulk(ids, action, extra = {}) { return (await this._send("POST", "/projects/bulk", { ids, action, ...extra })).results; }
  summary(projectIds) { return this._send("POST", "/projects/summary", { project_ids: projectIds }); }

  addRegion(projectId, { location, gl, device }) {
    const body = { location, gl };
    if (device) body.device = device;
    return this._send("POST", `/projects/${projectId}/regions`, body);
  }
  removeRegion(projectId, regionId) { return this._c._request("DELETE", `${RT}/projects/${projectId}/regions/${regionId}`); }

  keywords(projectId, params = {}) { return this.paginate(`/projects/${projectId}/keywords`, params); }
  addKeywords(projectId, keywords, { tags } = {}) { return this._send("POST", `/projects/${projectId}/keywords`, { keywords: [...keywords], ...(tags ? { tags } : {}) }); }
  replaceKeywords(projectId, keywords, { tags } = {}) { return this._send("PUT", `/projects/${projectId}/keywords`, { keywords: [...keywords], ...(tags ? { tags } : {}) }); }
  editKeywords(projectId, ids, { addTags, removeTags, targetUrl } = {}) {
    const body = { ids };
    if (addTags) body.add_tags = addTags;
    if (removeTags) body.remove_tags = removeTags;
    if (targetUrl !== undefined) body.target_url = targetUrl;
    return this._send("PATCH", `/projects/${projectId}/keywords`, body);
  }
  async deleteKeywords(projectId, ids) { return (await this._send("POST", `/projects/${projectId}/keywords/delete`, { ids })).deleted; }
  keywordHistory(projectId, keywordId, { regionId, limit } = {}) { return this._get(`/projects/${projectId}/keywords/${keywordId}/history`, { region_id: regionId, limit }); }
  async tags(projectId) { return (await this._get(`/projects/${projectId}/tags`)).items; }

  cost(projectId, { regionId } = {}) { return this._get(`/projects/${projectId}/cost`, { region_id: regionId }); }
  async runCheck(projectId, { regionId } = {}) { return (await this._send("POST", `/projects/${projectId}/checks`, regionId ? { region_id: regionId } : {})).check; }
  checks(projectId, params = {}) { return this.paginate(`/projects/${projectId}/checks`, params); }
  async check(checkId) { return (await this._get(`/checks/${checkId}`)).check; }
  checksStatus(checkIds) { return this._send("POST", "/checks/status", { check_ids: checkIds }); }
  async cancelCheck(checkId) { return (await this._send("POST", `/checks/${checkId}/cancel`)).check; }
  /** Poll a check (15-60 s is recommended) until it is no longer queued or running. */
  async wait(checkId, { intervalMs = 30000, timeoutMs } = {}) {
    const start = Date.now();
    for (;;) {
      const c = await this.check(checkId);
      if (!["queued", "running"].includes(c.status)) return c;
      if (timeoutMs !== undefined && Date.now() - start > timeoutMs) return c;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  positions(projectId, { checkId, regionId, tag, changedOnly, limit } = {}) {
    return this.paginate(`/projects/${projectId}/positions`, { check_id: checkId, region_id: regionId, tag, changed_only: changedOnly, limit });
  }
  trend(projectId, { regionId } = {}) { return this._get(`/projects/${projectId}/trend`, { region_id: regionId }); }
  keywordInCheck(checkId, keywordId, { regionId } = {}) { return this._get(`/checks/${checkId}/keywords/${keywordId}`, { region_id: regionId }); }
  /** Returns the export as text (CSV with BOM, or JSON). */
  async export(projectId, { format = "csv", checkId, regionId, tag } = {}) {
    const res = await this._c._raw("GET", `${RT}/projects/${projectId}/export`, { params: { format, check_id: checkId, region_id: regionId, tag } });
    return res.text();
  }

  async webhook() { return (await this._get("/webhook")).webhook; }
  setWebhook(url, { events } = {}) { return this._send("PUT", "/webhook", events ? { url, events } : { url }); }
  async removeWebhook() { return (await this._c._request("DELETE", `${RT}/webhook`)).webhook; }
  rotateWebhookSecret() { return this._send("POST", "/webhook/secret"); }
  async testWebhook(url) { return (await this._send("POST", "/webhook/test", url ? { url } : {})).delivery; }
  deliveries(params = {}) { return this.paginate("/webhook/deliveries", params); }
  redeliver(deliveryId) { return this._send("POST", `/webhook/deliveries/${deliveryId}/redeliver`); }
}
