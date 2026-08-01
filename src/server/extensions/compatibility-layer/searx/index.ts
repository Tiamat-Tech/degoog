import { readdir } from "fs/promises";
import { basename, join, resolve } from "path";
import type {
  EngineContext,
  SearchResult,
  SearchEngine,
  SettingField,
  TimeFilter,
} from "../../../types";
import type { EngineFilters } from "../../../../shared/engine-filters";
import { makeExtID } from "../../../utils/extension-id";
import { logger } from "../../../utils/logger";
import { getRandomUserAgent } from "../../../utils/user-agents";
import { useCache } from "../../../utils/cache";
import {
  getSettings,
  mergeDefaults,
  type SettingValue,
} from "../../../utils/plugin-settings";
import { runPython, type RpcFetchReply, type RpcHandlers } from "./rpc";
import { isSupportedEngine } from "./supported";
import { isSupportFile } from "./catalog";
import { searxEnginesDir } from "./paths";

export interface SearxCompatEntry {
  id: string;
  displayName: string;
  searchTypes: string[];
  description?: string;
  instance: SearchEngine;
  disabledByDefault?: boolean;
  source?: "plugin" | "builtin";
  compatibilityLayer?: "searx";
  filters?: EngineFilters;
}

interface DiscoverPayload {
  path: string;
  id: string;
  name: string;
  types: string[];
  paging?: boolean;
  timeRangeSupport?: boolean;
  offline?: boolean;
  error?: string;
}

interface DiscoverAllPayload {
  engines: DiscoverPayload[];
}

interface RequestPayload {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  data?: string;
}

interface ResponsePayload {
  results: SearchResult[];
}

interface RunnerEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
  trace?: string;
}

const runnerPath = join(import.meta.dir, "runner.py");

const DEFAULT_ACCEPT_LANGUAGE = "en-US,en;q=0.9";
const CACHE_NAMESPACE = "searx-compat";
const CACHE_TTL_MS = 60 * 60 * 1000;
const NS = "searx-compat";

export const SAFE_SEARCH_KEY = "safeSearch";

export enum SafeSearch {
  Off = "off",
  Moderate = "moderate",
  Strict = "strict",
}

const SAFE_SEARCH_LEVELS: Record<SafeSearch, number> = {
  [SafeSearch.Off]: 0,
  [SafeSearch.Moderate]: 1,
  [SafeSearch.Strict]: 2,
};

const NSFW_TO_SAFE: Record<string, SafeSearch> = {
  on: SafeSearch.Strict,
  moderate: SafeSearch.Moderate,
  off: SafeSearch.Off,
};

const GUARDED_TYPES = ["images", "videos"];

const DAY_MS = 24 * 60 * 60 * 1000;

const SEARX_TIME_RANGES = [
  { range: "day", within: DAY_MS },
  { range: "week", within: 7 * DAY_MS },
  { range: "month", within: 31 * DAY_MS },
  { range: "year", within: 366 * DAY_MS },
] as const;

const TIME_FILTER_MAP: Partial<Record<TimeFilter, string>> = {
  hour: "day",
  day: "day",
  week: "week",
  month: "month",
  year: "year",
};

const _runPython = <T>(payload: Record<string, unknown>, handlers: RpcHandlers = {}): Promise<T> =>
  runPython<T>(runnerPath, payload, handlers);

const _safeId = (name: string): string => makeExtID(`searx-${name}`, "engine");

const _cookieHeader = (cookies: Record<string, string> | undefined): string =>
  Object.entries(cookies ?? {})
    .filter(([k, v]) => k.trim() && String(v).trim())
    .map(([k, v]) => `${k.trim()}=${String(v).trim()}`)
    .join("; ");

const _headersObject = (headers: Headers): Record<string, string> => {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
};

const _browserHeaders = (context?: EngineContext): Record<string, string> => ({
  "User-Agent": context?.userAgent?.() ?? getRandomUserAgent(),
  "Accept-Language": context?.buildAcceptLanguage?.() ?? DEFAULT_ACCEPT_LANGUAGE,
});

const _setCookies = (headers: Headers): Record<string, string> => {
  const out: Record<string, string> = {};
  const raw = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  for (const line of raw) {
    const [pair] = line.split(";");
    const eq = pair?.indexOf("=") ?? -1;
    if (eq <= 0) continue;
    out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return out;
};

const _toReply = async (resp: Response, fallbackUrl: string): Promise<RpcFetchReply> => ({
  url: resp.url || fallbackUrl,
  status: resp.status,
  headers: _headersObject(resp.headers),
  cookies: _setCookies(resp.headers),
  text: await resp.text(),
});

const _bridge = (engineId: string, context?: EngineContext): RpcHandlers => {
  const fetcher = (context?.fetch ?? fetch) as typeof fetch;
  const store = useCache<string>(`${CACHE_NAMESPACE}:${engineId}`, CACHE_TTL_MS);
  return {
    onFetch: async (req) => {
      const headers = { ..._browserHeaders(context), ...req.headers };
      const cookie = _cookieHeader(req.cookies);
      if (cookie && !Object.keys(headers).some((k) => k.toLowerCase() === "cookie")) {
        headers.Cookie = cookie;
      }
      logger.debug(NS, `${engineId} side request ${req.method} ${req.url}`);
      const resp = await fetcher(req.url, {
        headers,
        redirect: "follow",
        ...(req.method !== "GET" ? { method: req.method } : {}),
        ...(req.data ? { body: req.data } : {}),
      });
      return _toReply(resp, req.url);
    },
    onCache: async (req) => {
      if (req.op === "set") {
        await store.set(req.key, req.value ?? "", req.ttl ? req.ttl * 1000 : undefined);
        return null;
      }
      return store.get(req.key);
    },
  };
};

const _safesearch = (engineSafe: SafeSearch, context?: EngineContext): number => {
  const nsfw = context?.imageFilter?.nsfw;
  const resolved = (nsfw && NSFW_TO_SAFE[nsfw]) ?? engineSafe;
  return SAFE_SEARCH_LEVELS[resolved] ?? SAFE_SEARCH_LEVELS[SafeSearch.Off];
};

const _rangeFromDates = (dateFrom?: string, dateTo?: string): string | null => {
  const oldest = dateFrom || dateTo;
  if (!oldest) return null;
  const at = Date.parse(oldest);
  if (Number.isNaN(at)) return null;
  const elapsed = Date.now() - at;
  const bucket = SEARX_TIME_RANGES.find((entry) => elapsed <= entry.within);
  return bucket ? bucket.range : null;
};

const _timeRange = (
  timeFilter: TimeFilter,
  context?: EngineContext,
): string | null => {
  if (timeFilter === "custom") {
    return _rangeFromDates(context?.dateFrom, context?.dateTo);
  }
  return TIME_FILTER_MAP[timeFilter] ?? null;
};

const _defaultSafe = (types: string[]): SafeSearch =>
  types.some((type) => GUARDED_TYPES.includes(type.toLowerCase()))
    ? SafeSearch.Moderate
    : SafeSearch.Off;

class SearxCompatEngine implements SearchEngine {
  name: string;
  bangShortcut: string;
  safeSearch: SafeSearch;
  settingsSchema: SettingField[];

  constructor(
    private path: string,
    displayName: string,
    bangShortcut: string,
    private engineId: string,
    private paging: boolean,
    private timeRanges: boolean,
    types: string[],
  ) {
    this.name = displayName;
    this.bangShortcut = bangShortcut;
    this.safeSearch = _defaultSafe(types);
    this.settingsSchema = [
      {
        key: SAFE_SEARCH_KEY,
        label: "Safe Search",
        type: "select",
        options: Object.values(SafeSearch),
        default: this.safeSearch,
        description: "Filter explicit content from this engine's results.",
      },
    ];
  }

  configure(settings: Record<string, SettingValue>): void {
    const stored = settings[SAFE_SEARCH_KEY];
    if (typeof stored === "string" && stored in SAFE_SEARCH_LEVELS) {
      this.safeSearch = stored as SafeSearch;
    }
  }

  async executeSearch(
    query: string,
    page = 1,
    timeFilter: TimeFilter = "any",
    context?: EngineContext,
  ): Promise<SearchResult[]> {
    if (page > 1 && !this.paging) return [];
    const fetcher = context?.fetch ?? fetch;
    const bridge = _bridge(this.engineId, context);
    const safesearch = _safesearch(this.safeSearch, context);
    const timeRange = this.timeRanges ? _timeRange(timeFilter, context) : null;
    const req = await _runPython<RequestPayload>(
      {
        action: "request",
        path: this.path,
        name: this.name,
        query,
        page,
        timeFilter: timeRange,
        locale: context?.lang ?? "all",
        safesearch,
        headers: _browserHeaders(context),
      },
      bridge,
    );
    if (!req.url || !/^https?:\/\//i.test(req.url)) {
      throw new Error(`${this.name} needs an instance URL configured before it can search`);
    }
    const headers = { ...(req.headers ?? {}) };
    const cookie = _cookieHeader(req.cookies);
    if (cookie && !Object.keys(headers).some((k) => k.toLowerCase() === "cookie")) {
      headers.Cookie = cookie;
    }
    const init: RequestInit = {
      headers,
      redirect: "follow",
      ...(req.method && req.method !== "GET" ? { method: req.method } : {}),
      ...(req.data ? { body: req.data } : {}),
    };
    const resp = await (fetcher as typeof fetch)(req.url, init);
    context?.sentinel?.({ ok: resp.ok, status: resp.status }, this.name);
    const text = await resp.text();
    const parsed = await _runPython<ResponsePayload>(
      {
        action: "response",
        path: this.path,
        name: this.name,
        source: this.name,
        query,
        page,
        timeFilter: timeRange,
        locale: context?.lang ?? "all",
        safesearch,
        headers: _browserHeaders(context),
        request: { ...req, url: req.url, headers },
        response: {
          url: resp.url || req.url,
          status: resp.status,
          headers: _headersObject(resp.headers),
          cookies: _setCookies(resp.headers),
          text,
        },
      },
      bridge,
    );
    return parsed.results;
  }
}

export const loadSearxCompatibilityEngines = async (): Promise<SearxCompatEntry[]> => {
  const dir = resolve(searxEnginesDir());
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    logger.debug("searx-compat", `No SearX engines dir at ${dir}`, err);
    return [];
  }
  const files = names
    .filter((name) => name.endsWith(".py") && !name.startsWith("__"))
    .filter((name) => !isSupportFile(basename(name, ".py")))
    .sort((a, b) => a.localeCompare(b));
  if (files.length === 0) return [];
  const paths = files.map((file) => join(dir, file));
  let discovered: DiscoverPayload[];
  try {
    discovered = (await _runPython<DiscoverAllPayload>({ action: "discover_all", paths })).engines;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(NS, `SearX discovery failed: ${message}`);
    return [];
  }
  const entries: SearxCompatEntry[] = [];
  const excluded: string[] = [];
  const broken: string[] = [];
  for (const meta of discovered) {
    const file = basename(meta.path ?? "", ".py");
    const code = meta.id || file;
    if (meta.error) {
      broken.push(`${code} (${meta.error})`);
      continue;
    }
    if (meta.offline || !isSupportedEngine(code)) {
      excluded.push(code);
      continue;
    }
    const rawId = code;
    const id = _safeId(rawId);
    const types = meta.types?.length ? meta.types : ["web"];
    const instance = new SearxCompatEngine(
      meta.path,
      meta.name || file,
      rawId,
      id,
      meta.paging === true,
      meta.timeRangeSupport === true,
      types,
    );
    const stored = await getSettings(id);
    instance.configure(mergeDefaults(stored, instance.settingsSchema));
    entries.push({
      id,
      displayName: meta.name || file,
      searchTypes: types,
      instance,
      source: "plugin",
      compatibilityLayer: "searx",
    });
  }
  logger.info(NS, `SearX compatibility layer imported - ${entries.length} engine(s) available`);
  if (excluded.length > 0) {
    logger.info(NS, `known excluded engines (${excluded.length}): ${excluded.sort().join(", ")}`);
  }
  if (broken.length > 0) {
    logger.warn(NS, `engines that failed to load (${broken.length}): ${broken.sort().join(", ")}`);
  }
  return entries;
};
