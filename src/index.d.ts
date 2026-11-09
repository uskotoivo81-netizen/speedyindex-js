export declare const DEFAULT_BASE_URL: string;
type Engine = "google" | "yandex" | "bing";
type TaskType = "indexer" | "checker";
type Json = Record<string, any>;

export declare class SpeedyIndexError extends Error {
  code?: number; status?: number; error?: string; payload?: unknown; retryAfter?: number;
}

export interface Options { apiKey?: string; baseUrl?: string; timeoutMs?: number; fetch?: typeof fetch; }
export interface TaskOptions { engine?: Engine; taskType?: TaskType; }

export declare class SpeedyIndex {
  constructor(options?: Options);
  readonly rank: RankTracker;
  balance(): Promise<{ tokens: number; indexer: number; checker: number }>;
  createTask(urls: Iterable<string>, options?: TaskOptions & { title?: string; payPerIndexed?: boolean; dripFeedDays?: number }): Promise<Json>;
  listTasks(options?: TaskOptions & { page?: number; filter?: "standard" | "pay_per_indexed" | "drip_feed"; payPerIndexed?: boolean }): Promise<Json>;
  taskStatus(taskIds: Iterable<string>, options?: TaskOptions): Promise<Json>;
  report(taskId: string, options?: TaskOptions): Promise<{ indexed_links: string[]; unindexed_links: string[] } & Json>;
  fullReport(taskId: string, options?: TaskOptions): Promise<{ indexed_links: { url: string; title: string }[]; unindexed_links: { url: string; error_code?: number }[] } & Json>;
  indexUrl(url: string, options?: { engine?: "google" | "yandex"; payPerIndexed?: boolean }): Promise<Json>;
  createBacklinkCheck(urls: Iterable<string>, targetDomains: Iterable<string>): Promise<Json>;
  backlinkStatus(taskIds: string | Iterable<string>): Promise<Json>;
  backlinkReport(taskId: string, options?: { page?: number; limit?: number }): Promise<Json>;
}

export interface Region { location: string; gl: string; device?: string; }

export declare class RankTracker {
  paginate(path: string, params?: Json): AsyncGenerator<Json>;
  limits(): Promise<Json>;
  locations(q: string, options?: { gl?: string; limit?: number }): Promise<Json[]>;
  groups(): Promise<Json[]>;
  usage(options?: { from?: string; to?: string; tz?: string; group?: string; projectId?: string }): Promise<Json>;
  projects(params?: Json): AsyncGenerator<Json>;
  createProject(domain: string, regions: Region[], options?: { keywords?: Iterable<string | Json>; ref?: string } & Json): Promise<Json>;
  project(projectId: string): Promise<Json>;
  updateProject(projectId: string, fields: Json): Promise<Json>;
  deleteProject(projectId: string): Promise<Json>;
  bulk(ids: string[], action: string, extra?: Json): Promise<Json[]>;
  summary(projectIds: string[]): Promise<Json>;
  addRegion(projectId: string, region: Region): Promise<Json>;
  removeRegion(projectId: string, regionId: string): Promise<Json>;
  keywords(projectId: string, params?: Json): AsyncGenerator<Json>;
  addKeywords(projectId: string, keywords: Iterable<string | Json>, options?: { tags?: string[] }): Promise<Json>;
  replaceKeywords(projectId: string, keywords: Iterable<string | Json>, options?: { tags?: string[] }): Promise<Json>;
  editKeywords(projectId: string, ids: string[], options?: { addTags?: string[]; removeTags?: string[]; targetUrl?: string | null }): Promise<Json>;
  deleteKeywords(projectId: string, ids: string[]): Promise<number>;
  keywordHistory(projectId: string, keywordId: string, options?: { regionId?: string; limit?: number }): Promise<Json>;
  tags(projectId: string): Promise<Json[]>;
  cost(projectId: string, options?: { regionId?: string }): Promise<Json>;
  runCheck(projectId: string, options?: { regionId?: string }): Promise<Json>;
  checks(projectId: string, params?: Json): AsyncGenerator<Json>;
  check(checkId: string): Promise<Json>;
  checksStatus(checkIds: string[]): Promise<Json>;
  cancelCheck(checkId: string): Promise<Json>;
  wait(checkId: string, options?: { intervalMs?: number; timeoutMs?: number }): Promise<Json>;
  positions(projectId: string, options?: { checkId?: string; regionId?: string; tag?: string; changedOnly?: boolean; limit?: number }): AsyncGenerator<Json>;
  trend(projectId: string, options?: { regionId?: string }): Promise<Json>;
  keywordInCheck(checkId: string, keywordId: string, options?: { regionId?: string }): Promise<Json>;
  export(projectId: string, options?: { format?: "csv" | "json"; checkId?: string; regionId?: string; tag?: string }): Promise<string>;
  webhook(): Promise<Json>;
  setWebhook(url: string, options?: { events?: string[] }): Promise<Json>;
  removeWebhook(): Promise<Json>;
  rotateWebhookSecret(): Promise<Json>;
  testWebhook(url?: string): Promise<Json>;
  deliveries(params?: Json): AsyncGenerator<Json>;
  redeliver(deliveryId: string): Promise<Json>;
}
