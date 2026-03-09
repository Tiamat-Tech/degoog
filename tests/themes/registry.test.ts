import { describe, test, expect, beforeAll } from "bun:test";
import {
  initThemes,
  getThemes,
  getActiveTheme,
  getActiveThemeId,
} from "../../src/extensions/themes/registry";

describe("themes registry", () => {
  beforeAll(async () => {
    const orig = process.env.DEGOOG_THEMES_DIR;
    process.env.DEGOOG_THEMES_DIR = "/nonexistent-themes-dir";
    await initThemes();
    if (orig !== undefined) process.env.DEGOOG_THEMES_DIR = orig;
    else delete process.env.DEGOOG_THEMES_DIR;
  });

  test("getThemes returns array", () => {
    const themes = getThemes();
    expect(Array.isArray(themes)).toBe(true);
  });

  test("getActiveThemeId returns string or null", () => {
    const id = getActiveThemeId();
    expect(id === null || typeof id === "string").toBe(true);
  });

  test("getActiveTheme returns null or theme when no theme active", () => {
    const theme = getActiveTheme();
    expect(theme === null || (typeof theme === "object" && "id" in theme)).toBe(
      true,
    );
  });
});
