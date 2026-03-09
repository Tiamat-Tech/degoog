import { describe, test, expect, beforeAll } from "bun:test";
import {
  initMiddlewareRegistry,
  getMiddleware,
} from "../../src/extensions/middleware/registry";

describe("middleware registry", () => {
  beforeAll(async () => {
    const orig = process.env.DEGOOG_PLUGINS_DIR;
    process.env.DEGOOG_PLUGINS_DIR = "/nonexistent-middleware-dir";
    await initMiddlewareRegistry();
    if (orig !== undefined) process.env.DEGOOG_PLUGINS_DIR = orig;
    else delete process.env.DEGOOG_PLUGINS_DIR;
  });

  test("getMiddleware returns null for unknown id", () => {
    expect(getMiddleware("unknown-id")).toBeNull();
  });
});
