import { describe, test, expect, beforeAll } from "bun:test";
import {
  initPluginRoutes,
  findPluginRoute,
  getPluginRoutes,
} from "../../src/extensions/plugin-routes/registry";

describe("plugin-routes registry", () => {
  beforeAll(async () => {
    const orig = process.env.DEGOOG_PLUGINS_DIR;
    process.env.DEGOOG_PLUGINS_DIR = "/nonexistent-plugin-routes-dir";
    await initPluginRoutes();
    if (orig !== undefined) process.env.DEGOOG_PLUGINS_DIR = orig;
    else delete process.env.DEGOOG_PLUGINS_DIR;
  });

  test("findPluginRoute returns null for unknown plugin", () => {
    expect(findPluginRoute("unknown", "get", "/")).toBeNull();
  });

  test("getPluginRoutes returns empty array for unknown plugin", () => {
    expect(getPluginRoutes("unknown")).toEqual([]);
  });
});
