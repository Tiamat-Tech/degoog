import { beforeEach, describe, expect, test } from "bun:test";
import type { SearchResponse } from "../../src/server/types";
import {
  allEnginesFailed,
  clear,
  get,
  set,
  someEnginesFailed,
} from "../../src/server/utils/cache";

const mockResponse = (timings: { resultCount: number; status?: string }[]): SearchResponse => ({
  results: [],
  query: "test",
  totalTime: 0,
  type: "web",
  engineTimings: timings.map((t) => ({
    name: "e",
    time: 0,
    resultCount: t.resultCount,
    status: t.status,
  })),
  relatedSearches: [],
});

describe("cache", () => {
  beforeEach(async () => {
    await clear();
  });

  describe("get / set / clear", () => {
    test("returns null for missing key", async () => {
      expect(await get("missing")).toBe(null);
    });

    test("returns value after set", async () => {
      const res = mockResponse([{ resultCount: 5 }]);
      await set("k1", res);
      expect(await get("k1")).toEqual(res);
    });

    test("clear removes all entries", async () => {
      await set("k1", mockResponse([{ resultCount: 1 }]));
      await clear();
      expect(await get("k1")).toBe(null);
    });

    test("returns null after TTL expires", async () => {
      const res = mockResponse([{ resultCount: 1 }]);
      await set("k1", res, 50);
      expect(await get("k1")).toEqual(res);
      await Bun.sleep(60);
      expect(await get("k1")).toBe(null);
    });
  });

  describe("someEnginesFailed", () => {
    test("returns true when any engine has an error status", () => {
      expect(someEnginesFailed(mockResponse([{ resultCount: 5, status: "ok" }, { resultCount: 0, status: "timeout" }]))).toBe(true);
    });

    test("returns true when all engines have error statuses", () => {
      expect(someEnginesFailed(mockResponse([{ resultCount: 0, status: "network" }, { resultCount: 0, status: "timeout" }]))).toBe(true);
    });

    test("returns false when all engines succeeded even with 0 results", () => {
      expect(someEnginesFailed(mockResponse([{ resultCount: 0, status: "ok" }, { resultCount: 3, status: "ok" }]))).toBe(false);
    });

    test("returns false when all engines succeeded with results", () => {
      expect(someEnginesFailed(mockResponse([{ resultCount: 3, status: "ok" }, { resultCount: 2, status: "ok" }]))).toBe(false);
    });

    test("returns false when status is undefined (legacy timings treated as ok)", () => {
      expect(someEnginesFailed(mockResponse([{ resultCount: 0 }, { resultCount: 3 }]))).toBe(false);
    });

    test("returns false when no engines", () => {
      expect(someEnginesFailed(mockResponse([]))).toBe(false);
    });
  });

  describe("allEnginesFailed", () => {
    test("returns true when every engine has an error status", () => {
      expect(allEnginesFailed(mockResponse([{ resultCount: 0, status: "timeout" }, { resultCount: 0, status: "network" }]))).toBe(true);
    });

    test("returns false when at least one engine succeeded", () => {
      expect(allEnginesFailed(mockResponse([{ resultCount: 5, status: "ok" }, { resultCount: 0, status: "timeout" }]))).toBe(false);
    });

    test("returns false when engine has 0 results but status ok", () => {
      expect(allEnginesFailed(mockResponse([{ resultCount: 0, status: "ok" }, { resultCount: 0, status: "ok" }]))).toBe(false);
    });

    test("returns false when all engines have results", () => {
      expect(allEnginesFailed(mockResponse([{ resultCount: 3, status: "ok" }, { resultCount: 2, status: "ok" }]))).toBe(false);
    });

    test("returns false when no engines (vacuous case - nothing failed)", () => {
      expect(allEnginesFailed(mockResponse([]))).toBe(false);
    });
  });
});
