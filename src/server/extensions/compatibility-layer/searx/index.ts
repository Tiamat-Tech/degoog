import { readdir } from "fs/promises";
import { basename, join, resolve } from "path";
import type { EngineContext, SearchResult, SearchEngine, TimeFilter } from "../../../types";
import type { EngineFilters } from "../../../../shared/engine-filters";
import { makeExtID } from "../../../utils/extension-id";
import { logger } from "../../../utils/logger";
import { getRandomUserAgent } from "../../../utils/user-agents";
import { useCache } from "../../../utils/cache";
import { runPython, type RpcFetchReply, type RpcHandlers } from "./rpc";
import { isSupportedEngine } from "./supported";

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
  description?: string;
  types: string[];
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

const searxEnginesDir = (): string =>
  process.env.DEGOOG_SEARX_ENGINES_DIR ??
  join(process.env.DEGOOG_DATA_DIR ?? join(process.cwd(), "data"), "searx", "engines");

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

const _safesearch = (context?: EngineContext): number => {
  const nsfw = context?.imageFilter?.nsfw;
  if (nsfw === "on") return 2;
  if (nsfw === "moderate") return 1;
  return 0;
};

class SearxCompatEngine implements SearchEngine {
  name: string;
  bangShortcut: string;
  needsAppRestart = true;

  constructor(
    private path: string,
    displayName: string,
    bangShortcut: string,
    private engineId: string,
  ) {
    this.name = displayName;
    this.bangShortcut = bangShortcut;
  }

  async executeSearch(
    query: string,
    page = 1,
    timeFilter: TimeFilter = "any",
    context?: EngineContext,
  ): Promise<SearchResult[]> {
    const fetcher = context?.fetch ?? fetch;
    const bridge = _bridge(this.engineId, context);
    const req = await _runPython<RequestPayload>(
      {
        action: "request",
        path: this.path,
        name: this.name,
        query,
        page,
        timeFilter,
        locale: context?.lang ?? "all",
        safesearch: _safesearch(context),
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
        timeFilter,
        locale: context?.lang ?? "all",
        safesearch: _safesearch(context),
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
  for (const meta of discovered) {
    const file = basename(meta.path ?? "", ".py");
    const code = meta.id || file;
    if (meta.error || meta.offline || !isSupportedEngine(code)) {
      excluded.push(code);
      continue;
    }
    const rawId = code;
    const id = _safeId(rawId);
    entries.push({
      id,
      displayName: meta.name || file,
      searchTypes: meta.types?.length ? meta.types : ["web"],
      description: meta.description,
      instance: new SearxCompatEngine(meta.path, meta.name || file, rawId, id),
      source: "plugin",
      compatibilityLayer: "searx",
    });
  }
  logger.info(NS, `SearX compatibility layer imported - ${entries.length} engine(s) available`);
  if (excluded.length > 0) {
    logger.info(NS, `known excluded engines (${excluded.length}): ${excluded.sort().join(", ")}`);
  }
  return entries;
};
