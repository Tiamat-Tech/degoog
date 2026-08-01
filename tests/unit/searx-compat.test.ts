import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { clearServerSettingsCache } from "../../src/server/utils/server-settings";
import { clearTypeCache } from "../../src/server/extensions/engines/registry";

const withSearxEnv = async <T>(fn: (dir: string) => Promise<T>): Promise<T> => {
  const dir = mkdtempSync(join(tmpdir(), "degoog-searx-compat-"));
  const prev = {
    dataDir: process.env.DEGOOG_DATA_DIR,
    enginesDir: process.env.DEGOOG_ENGINES_DIR,
    transportsDir: process.env.DEGOOG_TRANSPORTS_DIR,
    settingsFile: process.env.DEGOOG_PLUGIN_SETTINGS_FILE,
    serverSettingsFile: process.env.DEGOOG_SERVER_SETTINGS_FILE,
    searxDir: process.env.DEGOOG_SEARX_ENGINES_DIR,
    extraEngines: process.env.DEGOOG_SEARX_EXTRA_ENGINES,
  };
  process.env.DEGOOG_DATA_DIR = dir;
  process.env.DEGOOG_ENGINES_DIR = join(dir, "engines");
  process.env.DEGOOG_TRANSPORTS_DIR = join(dir, "transports");
  process.env.DEGOOG_PLUGIN_SETTINGS_FILE = join(dir, "plugin-settings.json");
  process.env.DEGOOG_SERVER_SETTINGS_FILE = join(dir, "server-settings.json");
  delete process.env.DEGOOG_SEARX_ENGINES_DIR;
  process.env.DEGOOG_SEARX_EXTRA_ENGINES = "tiny,statics,pager";
  mkdirSync(process.env.DEGOOG_ENGINES_DIR, { recursive: true });
  mkdirSync(process.env.DEGOOG_TRANSPORTS_DIR, { recursive: true });
  mkdirSync(join(dir, "searx", "engines"), { recursive: true });
  writeFileSync(process.env.DEGOOG_PLUGIN_SETTINGS_FILE, "{}");
  writeFileSync(
    process.env.DEGOOG_SERVER_SETTINGS_FILE,
    JSON.stringify({
      settings: { degoogIndexerEnabled: false, searxCompatEnabled: true },
    }),
  );
  clearServerSettingsCache();
  clearTypeCache();
  try {
    return await fn(dir);
  } finally {
    if (prev.dataDir === undefined) delete process.env.DEGOOG_DATA_DIR;
    else process.env.DEGOOG_DATA_DIR = prev.dataDir;
    if (prev.enginesDir === undefined) delete process.env.DEGOOG_ENGINES_DIR;
    else process.env.DEGOOG_ENGINES_DIR = prev.enginesDir;
    if (prev.transportsDir === undefined) delete process.env.DEGOOG_TRANSPORTS_DIR;
    else process.env.DEGOOG_TRANSPORTS_DIR = prev.transportsDir;
    if (prev.settingsFile === undefined) delete process.env.DEGOOG_PLUGIN_SETTINGS_FILE;
    else process.env.DEGOOG_PLUGIN_SETTINGS_FILE = prev.settingsFile;
    if (prev.serverSettingsFile === undefined) delete process.env.DEGOOG_SERVER_SETTINGS_FILE;
    else process.env.DEGOOG_SERVER_SETTINGS_FILE = prev.serverSettingsFile;
    if (prev.searxDir === undefined) delete process.env.DEGOOG_SEARX_ENGINES_DIR;
    else process.env.DEGOOG_SEARX_ENGINES_DIR = prev.searxDir;
    if (prev.extraEngines === undefined) delete process.env.DEGOOG_SEARX_EXTRA_ENGINES;
    else process.env.DEGOOG_SEARX_EXTRA_ENGINES = prev.extraEngines;
    clearServerSettingsCache();
    clearTypeCache();
    rmSync(dir, { recursive: true, force: true });
  }
};

const writeTinyEngine = (dir: string): void => {
  writeFileSync(
    join(dir, "searx", "engines", "tiny.py"),
    `from urllib.parse import urlencode
from searx.result_types import EngineResults

about = {"website": "https://example.com"}
base_url = None
categories = ["general", "web"]
paging = True

def request(query, params):
    params["url"] = base_url + "/search?" + urlencode({"q": query, "p": params["pageno"]})
    params["headers"]["Accept"] = "text/html"
    params["cookies"]["CONSENT"] = "YES+"

def response(resp):
    results = EngineResults()
    results.append({"url": "https://result.test/", "title": "Result title", "content": "from compat"})
    return results
`,
  );
};

const writeEngine = (dir: string, name: string, body: string): void => {
  writeFileSync(join(dir, "searx", "engines", `${name}.py`), body);
};

const STATIC_ENGINE = `about = {"website": "https://static.example"}
base_url = "https://static.example"
categories = ["images"]
paging = False
time_range_support = False

def request(query, params):
    params["url"] = base_url + "/?q=" + query

def response(resp):
    return [{"url": "https://static.example/a", "title": "hit", "content": "c"}]
`;

const PAGER_ENGINE = `about = {"website": "https://pager.example"}
base_url = "https://pager.example"
categories = ["general"]
paging = True
time_range_support = True

def request(query, params):
    params["url"] = base_url + "/?q=" + query + "&range=" + str(params["time_range"]) + "&safe=" + str(params["safesearch"])

def response(resp):
    return [{"url": "https://pager.example/a", "title": "hit", "content": "c"}]
`;

const CACHING_ENGINE = `about = {"website": "https://cache.example"}
base_url = "https://cache.example"
categories = ["general"]
paging = True

def request(query, params):
    token = CACHE.get("token")
    if token is None:
        token = {"id": "abc", "n": 1}
        CACHE.set("token", token)
    params["url"] = base_url + "/?id=" + token["id"] + "&n=" + str(token["n"])

def response(resp):
    return [{"url": "https://cache.example/a", "title": "hit", "content": "c"}]
`;

const okFetch = async (): Promise<Response> =>
  new Response("<html></html>", { status: 200 });

describe("SearX engine parity with native engines", () => {
  test("engines that cannot page return nothing past page one", async () => {
    await withSearxEnv(async (dir) => {
      writeEngine(dir, "statics", STATIC_ENGINE);
      const { initEngines, getEngineMap } = await import(
        "../../src/server/extensions/engines/registry"
      );
      await initEngines(true);
      const engine = getEngineMap()["searx-statics-engine"];
      const first = await engine.executeSearch("q", 1, "any", { fetch: okFetch });
      const second = await engine.executeSearch("q", 2, "any", { fetch: okFetch });
      expect(first.length).toBe(1);
      expect(second).toEqual([]);
    });
  });

  test("safe search defaults follow the engine type and stay configurable", async () => {
    await withSearxEnv(async (dir) => {
      writeEngine(dir, "statics", STATIC_ENGINE);
      writeEngine(dir, "pager", PAGER_ENGINE);
      const { initEngines, getEngineMap } = await import(
        "../../src/server/extensions/engines/registry"
      );
      await initEngines(true);
      const images = getEngineMap()["searx-statics-engine"];
      const web = getEngineMap()["searx-pager-engine"];
      expect((images as unknown as { safeSearch: string }).safeSearch).toBe("moderate");
      expect((web as unknown as { safeSearch: string }).safeSearch).toBe("off");
      expect((web.settingsSchema ?? []).map((f) => f.key)).toContain("safeSearch");
      web.configure?.({ safeSearch: "strict" });
      expect((web as unknown as { safeSearch: string }).safeSearch).toBe("strict");
    });
  });

  test("time filters reach engines that support them and are withheld from those that do not", async () => {
    await withSearxEnv(async (dir) => {
      writeEngine(dir, "statics", STATIC_ENGINE);
      writeEngine(dir, "pager", PAGER_ENGINE);
      const { initEngines, getEngineMap } = await import(
        "../../src/server/extensions/engines/registry"
      );
      await initEngines(true);
      let seen = "";
      const capture = async (url: string): Promise<Response> => {
        seen = url;
        return new Response("<html></html>", { status: 200 });
      };
      await getEngineMap()["searx-pager-engine"].executeSearch("q", 1, "week", {
        fetch: capture,
      });
      expect(seen).toContain("range=week");
      await getEngineMap()["searx-statics-engine"].executeSearch("q", 1, "week", {
        fetch: capture,
      });
      expect(seen).not.toContain("range=week");
    });
  });

  test("cached values survive the trip back into a fresh engine process", async () => {
    await withSearxEnv(async (dir) => {
      writeEngine(dir, "pager", CACHING_ENGINE);
      const { initEngines, getEngineMap } = await import(
        "../../src/server/extensions/engines/registry"
      );
      await initEngines(true);
      const engine = getEngineMap()["searx-pager-engine"];
      const seen: string[] = [];
      const capture = async (url: string): Promise<Response> => {
        seen.push(url);
        return new Response("<html></html>", { status: 200 });
      };
      await engine.executeSearch("q", 1, "any", { fetch: capture });
      await engine.executeSearch("q", 1, "any", { fetch: capture });
      expect(seen[0]).toContain("id=abc&n=1");
      expect(seen[1]).toBe(seen[0]);
    });
  });

  test("a custom date range collapses onto the nearest supported bucket", async () => {
    await withSearxEnv(async (dir) => {
      writeEngine(dir, "pager", PAGER_ENGINE);
      const { initEngines, getEngineMap } = await import(
        "../../src/server/extensions/engines/registry"
      );
      await initEngines(true);
      let seen = "";
      await getEngineMap()["searx-pager-engine"].executeSearch("q", 1, "custom", {
        dateFrom: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        fetch: async (url: string) => {
          seen = url;
          return new Response("<html></html>", { status: 200 });
        },
      });
      expect(seen).toContain("range=week");
    });
  });
});

describe("SearX compatibility layer", () => {
  test("loads mounted Python engines from data/extensions/searx/engines", async () => {
    await withSearxEnv(async (dir) => {
      writeTinyEngine(dir);
      const { initEngines, listEngines, getEngineMap } = await import(
        "../../src/server/extensions/engines/registry"
      );
      await initEngines(true);
      const engines = await listEngines();
      const meta = engines.find((engine) => engine.id === "searx-tiny-engine");
      expect(meta?.displayName).toBe("Tiny");
      expect(meta?.searchTypes).toContain("web");
      const engine = getEngineMap()["searx-tiny-engine"];
      expect(engine.bangShortcut).toBe("tiny");
      const results = await engine.executeSearch("hello", 2, "any", {
        userAgent: () => "DegoogUA/1.0",
        buildAcceptLanguage: () => "it-IT,it;q=0.9",
        fetch: async (url, init) => {
          expect(url).toBe("https://example.com/search?q=hello&p=2");
          expect(init?.headers?.["User-Agent"]).toBe("DegoogUA/1.0");
          expect(init?.headers?.["Accept-Language"]).toBe("it-IT,it;q=0.9");
          expect(init?.headers?.Accept).toBe("text/html");
          expect(init?.headers?.Cookie).toBe("CONSENT=YES+");
          return new Response("<a class='result' href='https://result.test/'>Result title</a>", {
            status: 200,
          });
        },
      });
      expect(results).toEqual([
        {
          title: "Result title",
          url: "https://result.test/",
          snippet: "from compat",
          source: "Tiny",
        },
      ]);
    });
  });
});
