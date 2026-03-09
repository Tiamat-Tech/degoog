import { describe, test, expect, beforeAll } from "bun:test";
import {
  initSearchBarActions,
  getSearchBarActions,
} from "../../src/extensions/search-bar/registry";

describe("search-bar registry", () => {
  beforeAll(async () => {
    const orig = process.env.DEGOOG_PLUGINS_DIR;
    process.env.DEGOOG_PLUGINS_DIR = "/nonexistent-search-bar-dir";
    await initSearchBarActions();
    if (orig !== undefined) process.env.DEGOOG_PLUGINS_DIR = orig;
    else delete process.env.DEGOOG_PLUGINS_DIR;
  });

  test("getSearchBarActions returns array", async () => {
    const actions = await getSearchBarActions();
    expect(Array.isArray(actions)).toBe(true);
  });
});
