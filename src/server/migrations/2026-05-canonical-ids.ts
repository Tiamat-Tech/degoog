import { readFile, writeFile, mkdir, rename } from "fs/promises";
import { dirname, join } from "path";
import { logger } from "../utils/logger";
import { pluginSettingsFile } from "../utils/paths";
import {
  getStoreDir,
  readReposData,
} from "../extensions/store/persistence";
import { slugFromUrl } from "../extensions/store/repo-ops";
import { makeExtID, type ExtensionKind } from "../extensions/extension-id";
import type { RepoPackageJson } from "../../server/types";

export const MIGRATION_VERSION = 52026 as const;
const SCHEMA_KEY = "__schemaVersion";

type SettingsValue = string | string[] | boolean;
type SettingsStore = Record<string, Record<string, SettingsValue> | number | undefined> & {
  [SCHEMA_KEY]?: number;
};

interface ManifestEntry {
  path?: string;
  name?: string;
  legacyIds?: string[];
}

const KIND_BY_GROUP: Record<string, ExtensionKind> = {
  engines: "engine",
  themes: "theme",
  plugins: "command",
  transports: "transport",
  autocomplete: "uovadipasqua",
};

const GROUPS = [
  "engines",
  "themes",
  "plugins",
  "transports",
  "autocomplete",
] as const;

const _readJson = async <T,>(path: string): Promise<T | null> => {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      logger.warn("migration:canonical-ids", `failed to read ${path}`, err);
    }
    return null;
  }
};

const _writeAtomic = async (path: string, contents: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await writeFile(tmp, contents, "utf-8");
  await rename(tmp, path);
};

interface ResolvedMapping {
  legacyKey: string;
  canonicalId: string;
}

interface ItemContext {
  manifestPath: string;
  group: string;
  kind: ExtensionKind;
  itemFolder: string;
  authorRepoSlug: string;
}

const _itemKindOverride = (group: string, entry: ManifestEntry & { type?: string }): ExtensionKind => {
  if (group === "plugins" && entry.type) {
    const t = String(entry.type).toLowerCase();
    if (t === "slot") return "slot";
    if (t === "interceptor") return "middleware";
    if (t === "search-result-tab") return "tab";
  }
  return KIND_BY_GROUP[group] ?? "command";
};

const _collectMappings = async (
  storeDir: string,
  repos: { url: string; localPath?: string }[],
): Promise<{ map: Map<string, string[]>; canonicals: Set<string> }> => {
  const map = new Map<string, string[]>();
  const canonicals = new Set<string>();

  for (const repo of repos) {
    const local = repo.localPath ?? slugFromUrl(repo.url);
    const repoDir = join(storeDir, local);
    const pkg = await _readJson<RepoPackageJson>(join(repoDir, "package.json"));
    if (!pkg) continue;

    const slugParts = local.split("-");
    const repoSlug = local;
    const author = slugParts[0] ?? "anon";
    const repoName = slugParts.slice(1).join("-") || "repo";
    const authorRepoSlug = `${author}-${repoName}`;

    for (const group of GROUPS) {
      const entries = ((pkg as unknown as Record<string, ManifestEntry[]>)[group] ?? []) as (ManifestEntry & { type?: string })[];
      if (!Array.isArray(entries)) continue;
      for (const ent of entries) {
        if (!ent || typeof ent.path !== "string") continue;
        const itemFolder = ent.path.split("/").filter(Boolean).pop() ?? "";
        if (!itemFolder) continue;
        const kind = _itemKindOverride(group, ent);
        const folder = `${repoSlug}-${itemFolder}`;
        const canonicalId = makeExtID(folder, kind);
        canonicals.add(canonicalId);

        const candidates = new Set<string>();
        candidates.add(itemFolder);
        candidates.add(`${itemFolder}-${kind}`);
        candidates.add(`${kind}-${itemFolder}`);
        candidates.add(folder);
        if (Array.isArray(ent.legacyIds)) {
          for (const l of ent.legacyIds) {
            if (typeof l === "string" && l.trim()) candidates.add(l.trim());
          }
        }
        candidates.delete(canonicalId);

        for (const c of candidates) {
          const existing = map.get(c) ?? [];
          if (!existing.includes(canonicalId)) existing.push(canonicalId);
          map.set(c, existing);
        }
      }
    }
  }

  return { map, canonicals };
};

const _backupPath = (path: string): string => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${path}.bak-${stamp}`;
};

/**
 * Rewrite plugin-settings.json keys to canonical IDs derived from repos.json
 * + each repo's package.json. Legacy keys that cannot be resolved are left
 * verbatim with a WARN. Idempotent. Stamps `__schemaVersion: ${MIGRATION_VERSION}`
 * when complete.
 *
 * Safe to re-run on every repo add/remove.
 */
export const runCanonicalIds052026 = async (): Promise<void> => {
  const settingsPath = pluginSettingsFile();
  const store = await _readJson<SettingsStore>(settingsPath);
  if (!store) return;

  const existingVersion = typeof store[SCHEMA_KEY] === "number" ? (store[SCHEMA_KEY] as number) : 0;
  if (existingVersion >= MIGRATION_VERSION) return;

  const repos = (await readReposData()).repos;
  if (repos.length === 0) {
    store[SCHEMA_KEY] = MIGRATION_VERSION;
    await _writeAtomic(settingsPath, JSON.stringify(store, null, 2));
    return;
  }

  const storeDir = getStoreDir();
  const { map, canonicals } = await _collectMappings(storeDir, repos);

  const keys = Object.keys(store).filter((k) => k !== SCHEMA_KEY);
  const rewrites: ResolvedMapping[] = [];
  const unresolved: string[] = [];

  for (const key of keys) {
    if (canonicals.has(key)) continue;
    const candidates = map.get(key);
    if (!candidates || candidates.length === 0) {
      unresolved.push(key);
      continue;
    }
    if (candidates.length > 1) {
      logger.warn(
        "migration:canonical-ids",
        `legacy key "${key}" maps to multiple canonical IDs (${candidates.join(", ")}); leaving verbatim`,
      );
      continue;
    }
    rewrites.push({ legacyKey: key, canonicalId: candidates[0] });
  }

  if (rewrites.length === 0 && unresolved.length === 0) {
    store[SCHEMA_KEY] = MIGRATION_VERSION;
    await _writeAtomic(settingsPath, JSON.stringify(store, null, 2));
    return;
  }

  if (rewrites.length > 0) {
    const backup = _backupPath(settingsPath);
    try {
      const raw = await readFile(settingsPath, "utf-8");
      await writeFile(backup, raw, "utf-8");
      logger.info("migration:canonical-ids", `wrote backup ${backup}`);
    } catch (err) {
      logger.error("migration:canonical-ids", "failed to write backup, aborting rewrite", err);
      return;
    }

    for (const { legacyKey, canonicalId } of rewrites) {
      const legacyVal = store[legacyKey] as Record<string, SettingsValue> | undefined;
      const canonicalVal = (store[canonicalId] as Record<string, SettingsValue> | undefined) ?? {};
      if (!legacyVal) continue;
      store[canonicalId] = { ...legacyVal, ...canonicalVal };
      delete store[legacyKey];
      logger.info("migration:canonical-ids", `rewrote "${legacyKey}" -> "${canonicalId}"`);
    }
  }

  for (const key of unresolved) {
    logger.warn(
      "migration:canonical-ids",
      `key "${key}" has no matching extension in any installed repo; left verbatim (will resolve when repo is added)`,
    );
  }

  store[SCHEMA_KEY] = MIGRATION_VERSION;
  await _writeAtomic(settingsPath, JSON.stringify(store, null, 2));
};
