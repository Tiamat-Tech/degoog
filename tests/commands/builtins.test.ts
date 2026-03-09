import { describe, test, expect, beforeAll } from "bun:test";
import { helpCommand } from "../../src/extensions/commands/builtins/help/index";
import { uuidCommand } from "../../src/extensions/commands/builtins/uuid/index";

describe("commands builtins", () => {
  beforeAll(async () => {
    const { initPlugins } =
      await import("../../src/extensions/commands/registry");
    const { initEngines } =
      await import("../../src/extensions/engines/registry");
    const orig = process.env.DEGOOG_PLUGINS_DIR;
    process.env.DEGOOG_PLUGINS_DIR = "/nonexistent";
    process.env.DEGOOG_ENGINES_DIR = "/nonexistent";
    await initEngines();
    await initPlugins();
    if (orig !== undefined) process.env.DEGOOG_PLUGINS_DIR = orig;
    else delete process.env.DEGOOG_PLUGINS_DIR;
    delete process.env.DEGOOG_ENGINES_DIR;
  });

  test("helpCommand.execute returns title and html with command list", async () => {
    const result = await helpCommand.execute("");
    expect(result.title).toBe("Available Commands");
    expect(result.html).toContain("command-help-table");
    expect(result.html).toContain("!help");
  });

  test("uuidCommand.execute returns title and html with UUIDs", async () => {
    const result = await uuidCommand.execute("");
    expect(result.title).toBe("Generated UUIDs");
    expect(result.html).toContain("uuid-value");
    const uuidMatch = result.html.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    expect(uuidMatch).not.toBeNull();
  });
});
