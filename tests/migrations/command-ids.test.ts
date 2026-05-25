import { describe, test, expect, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runCommandIds052027 } from "../../src/server/migrations/2026-05-command-ids";

const withSettings = async (
  initial: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const dir = mkdtempSync(join(tmpdir(), "degoog-cmd-ids-"));
  const file = join(dir, "plugin-settings.json");
  const prev = process.env.DEGOOG_PLUGIN_SETTINGS_FILE;
  process.env.DEGOOG_PLUGIN_SETTINGS_FILE = file;
  try {
    writeFileSync(file, JSON.stringify(initial, null, 2));
    await runCommandIds052027();
    return JSON.parse(readFileSync(file, "utf-8")) as Record<string, unknown>;
  } finally {
    if (prev === undefined) delete process.env.DEGOOG_PLUGIN_SETTINGS_FILE;
    else process.env.DEGOOG_PLUGIN_SETTINGS_FILE = prev;
    rmSync(dir, { recursive: true, force: true });
  }
};

describe("command-ids migration", () => {
  afterEach(() => {});

  test("moves plugin-<folder> keys to <folder>-command", async () => {
    const out = await withSettings({
      "plugin-degoog-org-official-extensions-meilisearch": { host: "h" },
      "some-engine": { enabled: "true" },
    });
    expect(out["degoog-org-official-extensions-meilisearch-command"]).toEqual({
      host: "h",
    });
    expect(
      out["plugin-degoog-org-official-extensions-meilisearch"],
    ).toBeUndefined();
    expect(out["some-engine"]).toEqual({ enabled: "true" });
  });

  test("is idempotent and stamps the schema version", async () => {
    const first = await withSettings({ "plugin-acme-foo": { a: "1" } });
    expect(first["acme-foo-command"]).toEqual({ a: "1" });
    expect(first.__schemaVersion).toBe(52027);

    const second = await withSettings(first);
    expect(second["acme-foo-command"]).toEqual({ a: "1" });
    expect(second["plugin-acme-foo"]).toBeUndefined();
  });

  test("existing canonical values win when both keys exist", async () => {
    const out = await withSettings({
      "plugin-acme-foo": { a: "legacy", b: "legacy" },
      "acme-foo-command": { a: "current" },
    });
    expect(out["acme-foo-command"]).toEqual({ a: "current", b: "legacy" });
  });
});
