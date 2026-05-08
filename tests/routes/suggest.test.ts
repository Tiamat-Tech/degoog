import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { getServerKeyHex, initServerKey } from "../../src/server/utils/server-key";
import { getAutocompleteProviderById, getSuggestionsFromProviders } from "../../src/server/extensions/autocomplete/registry";
import { clear as clearServerCache } from "../../src/server/utils/cache";

let suggestRouter: {
  request: (req: Request | string) => Response | Promise<Response>;
};

type SuggestFn = (query: string, context?: unknown) => Promise<unknown[]>;
const _originalSuggestFns = new Map<string, SuggestFn>();

beforeAll(async () => {
  await initServerKey();
  const mod = await import("../../src/server/routes/suggest");
  suggestRouter = mod.default;
});

afterAll(() => {
  for (const [id, fn] of _originalSuggestFns) {
    const p = getAutocompleteProviderById(id) as { getSuggestions?: SuggestFn } | undefined;
    if (p?.getSuggestions) p.getSuggestions = fn;
  }
  _originalSuggestFns.clear();
});

beforeEach(() => {
  clearServerCache();
});

const _authHeaders = (): Record<string, string> => {
  const key = getServerKeyHex();
  if (!key) throw new Error("server key not loaded");
  return { Authorization: `Bearer ${key}` };
};

function _stubProvider(id: string, impl: SuggestFn): void {
  const p = getAutocompleteProviderById(id) as { getSuggestions?: SuggestFn } | undefined;
  if (!p || typeof p.getSuggestions !== "function")
    throw new Error(`provider not found: ${id}`);
  if (!_originalSuggestFns.has(id)) _originalSuggestFns.set(id, p.getSuggestions);
  p.getSuggestions = impl;
}

describe("routes/suggest", () => {
  test("GET /api/suggest returns 200 and array", async () => {
    const res = await suggestRouter.request(
      new Request("http://localhost/api/suggest?q=test", {
        headers: _authHeaders(),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("GET /api/suggest/opensearch returns 200 and [query, suggestions]", async () => {
    const res = await suggestRouter.request(
      new Request("http://localhost/api/suggest/opensearch?q=foo", {
        headers: _authHeaders(),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain(
      "application/x-suggestions",
    );
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
    expect(body[0]).toBe("foo");
  });

  test("getSuggestionsFromProviders merges, dedupes, caps, and aggregates sources", async () => {
    let googleCalls = 0;
    let ddgCalls = 0;

    _stubProvider("autocomplete-builtin-google", async () => {
      googleCalls++;
      return [
        "alpha",
        "shared",
        "g1",
        "g2",
        "g3",
        "g4",
        "g5",
        "g6",
        "g7",
        "g8",
        "g9",
        "g10",
      ];
    });

    _stubProvider("autocomplete-builtin-duckduckgo", async () => {
      ddgCalls++;
      return [
        "shared",
        "beta",
        "d1",
        "d2",
        "d3",
        "d4",
        "d5",
        "d6",
        "d7",
        "d8",
        "d9",
        "d10",
      ];
    });

    const out = await getSuggestionsFromProviders("query");
    expect(googleCalls).toBe(1);
    expect(ddgCalls).toBe(1);

    expect(out.length).toBe(10);
    expect(out[0]?.text).toBe("alpha");
    expect(out.some((r) => r.text === "beta")).toBe(true);

    const shared = out.find((r) => r.text === "shared");
    expect(shared).toBeTruthy();
    expect(shared!.source).toContain("Google");
    expect(shared!.source).toContain("DuckDuckGo");
  });

  test("getSuggestionsFromProviders uses cache for repeated query", async () => {
    let googleCalls = 0;
    let ddgCalls = 0;

    _stubProvider("autocomplete-builtin-google", async () => {
      googleCalls++;
      return ["alpha", "shared"];
    });
    _stubProvider("autocomplete-builtin-duckduckgo", async () => {
      ddgCalls++;
      return ["shared", "beta"];
    });

    const a = await getSuggestionsFromProviders("same");
    const b = await getSuggestionsFromProviders("same");

    expect(a).toEqual(b);
    expect(googleCalls).toBe(1);
    expect(ddgCalls).toBe(1);
  });
});
