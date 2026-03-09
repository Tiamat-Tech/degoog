import { describe, test, expect } from "bun:test";
import {
  aggregateAndScore,
  mergeNewResults,
  resolveEngine,
} from "../../src/search";
import type { SearchResult, ScoredResult } from "../../src/types";

const result = (
  url: string,
  source: string,
  title = "t",
  snippet = "s",
): SearchResult => ({
  title,
  url,
  snippet,
  source,
});

const scored = (
  r: SearchResult,
  score: number,
  sources: string[],
): ScoredResult => ({ ...r, score, sources });

describe("search", () => {
  describe("aggregateAndScore", () => {
    test("merges results from multiple engines and dedupes by URL", () => {
      const engine1 = [
        result("https://a.com", "E1"),
        result("https://b.com", "E1"),
      ];
      const engine2 = [
        result("https://a.com", "E2"),
        result("https://c.com", "E2"),
      ];
      const out = aggregateAndScore([engine1, engine2]);
      expect(out.length).toBe(3);
      const a = out.find((r) => r.url === "https://a.com");
      expect(a).toBeDefined();
      expect(a!.sources).toContain("E1");
      expect(a!.sources).toContain("E2");
      expect(a!.score).toBeGreaterThan(1);
    });

    test("sorts by score descending", () => {
      const engine1 = [result("https://first.com", "E1")];
      const engine2 = [
        result("https://second.com", "E2"),
        result("https://first.com", "E2"),
      ];
      const out = aggregateAndScore([engine1, engine2]);
      expect(out[0].url).toBe("https://first.com");
    });

    test("returns empty array for empty input", () => {
      expect(aggregateAndScore([])).toEqual([]);
      expect(aggregateAndScore([[], []])).toEqual([]);
    });

    test("prefers longer snippet when merging same URL", () => {
      const r1 = result("https://x.com", "E1", "t", "short");
      const r2 = result("https://x.com", "E2", "t", "much longer snippet");
      const out = aggregateAndScore([[r1], [r2]]);
      expect(out.length).toBe(1);
      expect(out[0].snippet).toBe("much longer snippet");
    });
  });

  describe("mergeNewResults", () => {
    test("merges new results into existing scored list", () => {
      const existing: ScoredResult[] = [
        scored(result("https://a.com", "E1"), 10, ["E1"]),
      ];
      const newResults = [
        result("https://b.com", "E2"),
        result("https://a.com", "E2"),
      ];
      const out = mergeNewResults(existing, newResults);
      expect(out.length).toBe(2);
      const a = out.find((r) => r.url === "https://a.com");
      expect(a!.sources).toContain("E1");
      expect(a!.sources).toContain("E2");
    });

    test("returns sorted by score", () => {
      const existing = [scored(result("https://a.com", "E1"), 5, ["E1"])];
      const newResults = [result("https://a.com", "E2")];
      const out = mergeNewResults(existing, newResults);
      expect(out[0].url).toBe("https://a.com");
    });
  });

  describe("resolveEngine", () => {
    test("returns engine by id when registry is initialized", async () => {
      const { initEngines } =
        await import("../../src/extensions/engines/registry");
      const orig = process.env.DEGOOG_ENGINES_DIR;
      process.env.DEGOOG_ENGINES_DIR = "/nonexistent-empty-dir-12345";
      await initEngines();
      const engine = resolveEngine("duckduckgo");
      expect(engine).not.toBeNull();
      expect(engine!.name).toBe("DuckDuckGo");
      if (orig !== undefined) process.env.DEGOOG_ENGINES_DIR = orig;
      else delete process.env.DEGOOG_ENGINES_DIR;
    });

    test("returns null for unknown engine name", async () => {
      const { initEngines } =
        await import("../../src/extensions/engines/registry");
      const orig = process.env.DEGOOG_ENGINES_DIR;
      process.env.DEGOOG_ENGINES_DIR = "/nonexistent-empty-dir-12345";
      await initEngines();
      expect(resolveEngine("nonexistent-engine-xyz")).toBeNull();
      if (orig !== undefined) process.env.DEGOOG_ENGINES_DIR = orig;
      else delete process.env.DEGOOG_ENGINES_DIR;
    });
  });
});
