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
  process.env.DEGOOG_SEARX_EXTRA_ENGINES = "tiny";
  mkdirSync(process.env.DEGOOG_ENGINES_DIR, { recursive: true });
  mkdirSync(process.env.DEGOOG_TRANSPORTS_DIR, { recursive: true });
  mkdirSync(join(dir, "searx", "engines"), { recursive: true });
  writeFileSync(process.env.DEGOOG_PLUGIN_SETTINGS_FILE, "{}");
  writeFileSync(process.env.DEGOOG_SERVER_SETTINGS_FILE, JSON.stringify({ degoogIndexerEnabled: false }));
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
from lxml import html
from searx.result_types import EngineResults
from searx.utils import eval_xpath_list, extract_text

about = {"website": "https://example.com"}
base_url = None
categories = ["general", "web"]
paging = True

def request(query, params):
    params["url"] = base_url + "/search?" + urlencode({"q": query, "p": params["pageno"]})
    params["headers"]["Accept"] = "text/html"
    params["cookies"]["CONSENT"] = "YES+"

def response(resp):
    dom = html.fromstring(resp.text)
    results = EngineResults()
    for item in eval_xpath_list(dom, "//a[@class='result']"):
        results.append({"url": item.get("href"), "title": extract_text(item), "content": "from compat"})
    return results
`,
  );
};

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
