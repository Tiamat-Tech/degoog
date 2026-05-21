import { readFile, writeFile, mkdir, rename } from "fs/promises";
import { dirname } from "path";
import { logger } from "../utils/logger";
import { pluginSettingsFile } from "../utils/paths";
import {
  readServerSettings,
  writeServerSettings,
  type ServerSettingValue,
} from "../utils/server-settings";

export const MIGRATION_VERSION = 52026 as const;
const SCHEMA_KEY = "__serverSettingsExtractedAt";
const DEGOOG_INSTANCE_SETTINGS_ID = "degoog-settings";

type PluginStore = Record<string, unknown>;

const _writeAtomic = async (path: string, contents: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await writeFile(tmp, contents, "utf-8");
  await rename(tmp, path);
};

const _backupPath = (path: string): string => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${path}.bak-${stamp}`;
};

/**
 * Pulls the `degoog-settings` blob out of plugin-settings.json and into
 * server-settings.json under `settings`. Marks plugin-settings.json with
 * `__serverSettingsExtractedAt` to prevent re-running.
 *
 * Run once on server start before any consumers read settings.
 */
export const runServerSettingsExtract052026 = async (): Promise<void> => {
  const settingsPath = pluginSettingsFile();
  let raw: string;
  try {
    raw = await readFile(settingsPath, "utf-8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      logger.warn("migration:server-settings", "failed to read plugin-settings.json", err);
    }
    return;
  }

  let store: PluginStore;
  try {
    store = JSON.parse(raw) as PluginStore;
  } catch (err) {
    logger.error("migration:server-settings", "failed to parse plugin-settings.json", err);
    return;
  }

  const existingStamp = typeof store[SCHEMA_KEY] === "number" ? (store[SCHEMA_KEY] as number) : 0;
  if (existingStamp >= MIGRATION_VERSION) return;

  const blob = store[DEGOOG_INSTANCE_SETTINGS_ID];
  if (!blob || typeof blob !== "object" || Array.isArray(blob)) {
    store[SCHEMA_KEY] = MIGRATION_VERSION;
    await _writeAtomic(settingsPath, JSON.stringify(store, null, 2));
    return;
  }

  try {
    const backup = _backupPath(settingsPath);
    await writeFile(backup, raw, "utf-8");
    logger.info("migration:server-settings", `wrote backup ${backup}`);
  } catch (err) {
    logger.error("migration:server-settings", "failed to write backup, aborting", err);
    return;
  }

  const existing = await readServerSettings();
  const incoming = blob as Record<string, ServerSettingValue>;
  await writeServerSettings({
    settings: { ...incoming, ...existing.settings },
  });
  logger.info(
    "migration:server-settings",
    `moved degoog-settings (${Object.keys(incoming).length} keys) to server-settings.json`,
  );

  delete store[DEGOOG_INSTANCE_SETTINGS_ID];
  store[SCHEMA_KEY] = MIGRATION_VERSION;
  await _writeAtomic(settingsPath, JSON.stringify(store, null, 2));
};
