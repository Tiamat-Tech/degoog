import { describe, test, expect, beforeAll } from "bun:test";
import {
  initPlugins,
  getFilteredCommandRegistry,
  getCommandInstanceById,
  matchBangCommand,
} from "../../src/extensions/commands/registry";

describe("commands registry", () => {
  beforeAll(async () => {
    const { initEngines } =
      await import("../../src/extensions/engines/registry");
    const origPlugins = process.env.DEGOOG_PLUGINS_DIR;
    const origEngines = process.env.DEGOOG_ENGINES_DIR;
    process.env.DEGOOG_PLUGINS_DIR = "/nonexistent-plugins-dir";
    process.env.DEGOOG_ENGINES_DIR = "/nonexistent-engines-dir";
    await initEngines();
    await initPlugins();
    if (origPlugins !== undefined) process.env.DEGOOG_PLUGINS_DIR = origPlugins;
    else delete process.env.DEGOOG_PLUGINS_DIR;
    if (origEngines !== undefined) process.env.DEGOOG_ENGINES_DIR = origEngines;
    else delete process.env.DEGOOG_ENGINES_DIR;
  });

  test("getFilteredCommandRegistry returns array", async () => {
    const reg = await getFilteredCommandRegistry();
    expect(Array.isArray(reg)).toBe(true);
    expect(reg.length).toBeGreaterThan(0);
  });

  test("getCommandInstanceById returns help command", () => {
    const cmd = getCommandInstanceById("help");
    expect(cmd).toBeDefined();
    expect(cmd!.trigger).toBe("help");
  });

  test("matchBangCommand parses !help", () => {
    const match = matchBangCommand("!help");
    expect(match).not.toBeNull();
    if (!match) return;
    expect(match.type).toBe("command");
    if (match.type === "command") {
      expect(match.command.trigger).toBe("help");
    }
  });

  test("matchBangCommand returns null for non-bang", () => {
    expect(matchBangCommand("help")).toBeNull();
    expect(matchBangCommand("foo")).toBeNull();
  });
});
