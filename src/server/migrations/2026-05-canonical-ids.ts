import { readFile, writeFile, mkdir, rename, readdir } from "fs/promises";
import { dirname, join } from "path";
import { logger } from "../utils/logger";
import {
  autocompleteDir,
  enginesDir,
  pluginsDir,
  pluginSettingsFile,
  transportsDir,
} from "../utils/paths";
import {
  getStoreDir,
  readReposData,
} from "../extensions/store/persistence";
import { slugFromUrl } from "../extensions/store/repo-ops";
import { makeExtID, type ExtensionKind } from "../extensions/extension-id";
import type { RepoPackageJson } from "../../server/types";

export const MIGRATION_VERSION = 52026 as const;
const SCHEMA_KEY = "__schemaVersion";

const COMMANDS_BUILTINS_DIR = join(
  process.cwd(),
  "src",
  "server",
  "extensions",
  "commands",
  "builtins",
);
const UOVADIPASQUA_BUILTINS_DIR = join(
  process.cwd(),
  "src",
  "server",
  "extensions",
  "uovadipasqua",
  "builtins",
);

const RESERVED_GLOBAL_KEYS = new Set<string>([
  "theme",
  "degoog-api-secret",
  "middleware",
]);

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
};

const REPO_GROUPS = ["engines", "themes", "plugins", "transports"] as const;

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

const _listDirs = async (path: string): Promise<string[]> => {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
};

interface ResolvedMapping {
  legacyKey: string;
  canonicalId: string;
}

const _kindFromManifest = (group: string, entry: ManifestEntry & { type?: string }): ExtensionKind => {
  if (group === "plugins" && entry.type) {
    const t = String(entry.type).toLowerCase();
    if (t === "slot") return "slot";
    if (t === "interceptor") return "middleware";
    if (t === "search-result-tab") return "tab";
  }
  return KIND_BY_GROUP[group] ?? "command";
};

const _detectBuiltinKinds = async (
  indexPath: string,
): Promise<{ command: boolean; slot: boolean }> => {
  let src = "";
  try {
    src = await readFile(indexPath, "utf-8");
  } catch {
    return { command: false, slot: false };
  }
  const slot = /export\s+const\s+slot\s*=|export\s+const\s+slotPlugin\s*=/.test(src);
  const command =
    /export\s+default\s+\w*[Cc]ommand|export\s+const\s+\w*[Cc]ommand\s*:\s*BangCommand/.test(
      src,
    ) ||
    /export\s+default\s+\{[\s\S]*trigger\s*:/.test(src);
  return { command, slot };
};

interface BuiltinMappings {
  canonicals: Set<string>;
  map: Map<string, string[]>;
}

const _collectBuiltinMappings = async (): Promise<BuiltinMappings> => {
  const canonicals = new Set<string>();
  const map = new Map<string, string[]>();

  const addCandidate = (legacy: string, canonical: string): void => {
    if (legacy === canonical) return;
    const existing = map.get(legacy) ?? [];
    if (!existing.includes(canonical)) existing.push(canonical);
    map.set(legacy, existing);
  };

  for (const folder of await _listDirs(COMMANDS_BUILTINS_DIR)) {
    const indexCandidates = ["index.ts", "index.js", "index.mjs", "index.cjs"];
    let detected = { command: false, slot: false };
    for (const f of indexCandidates) {
      const p = join(COMMANDS_BUILTINS_DIR, folder, f);
      try {
        const probe = await _detectBuiltinKinds(p);
        if (probe.command || probe.slot) {
          detected = probe;
          break;
        }
      } catch {
        continue;
      }
    }
    if (detected.command) {
      canonicals.add(folder);
    }
    if (detected.slot) {
      const slotCanonical = makeExtID(folder, "slot");
      canonicals.add(slotCanonical);
      addCandidate(folder, slotCanonical);
      addCandidate(`slot-${folder}`, slotCanonical);
      addCandidate(`slot-builtin-${folder}`, slotCanonical);
      addCandidate(`slot-builtin-${folder}-slot`, slotCanonical);
    }
  }

  for (const folder of await _listDirs(UOVADIPASQUA_BUILTINS_DIR)) {
    const canonical = makeExtID(folder, "uovadipasqua");
    canonicals.add(canonical);
    addCandidate(folder, canonical);
    addCandidate(`uovadipasqua-${folder}`, canonical);
  }

  return { canonicals, map };
};

const _collectInstalledMappings = async (): Promise<BuiltinMappings> => {
  const canonicals = new Set<string>();
  const map = new Map<string, string[]>();

  const addCandidate = (legacy: string, canonical: string): void => {
    if (legacy === canonical) return;
    const existing = map.get(legacy) ?? [];
    if (!existing.includes(canonical)) existing.push(canonical);
    map.set(legacy, existing);
  };

  for (const folder of await _listDirs(enginesDir())) {
    const id = makeExtID(folder, "engine");
    canonicals.add(id);
    addCandidate(folder, id);
    addCandidate(`engine-${folder}`, id);
  }
  for (const folder of await _listDirs(autocompleteDir())) {
    const id = `autocomplete-${folder}`;
    canonicals.add(id);
    addCandidate(folder, id);
  }
  for (const folder of await _listDirs(transportsDir())) {
    const canonical = makeExtID(folder, "transport");
    const settingsId = `transport-${canonical}`;
    canonicals.add(settingsId);
    canonicals.add(canonical);
    addCandidate(`transport-${folder}`, settingsId);
    addCandidate(folder, settingsId);
  }
  for (const folder of await _listDirs(pluginsDir())) {
    const cmdId = `plugin-${folder}`;
    const slotId = makeExtID(folder, "slot");
    const middlewareId = makeExtID(folder, "middleware");
    const tabId = makeExtID(folder, "tab");
    canonicals.add(cmdId);
    canonicals.add(slotId);
    canonicals.add(middlewareId);
    canonicals.add(tabId);
    addCandidate(`command-${folder}`, cmdId);
    addCandidate(`slot-${folder}`, slotId);
    addCandidate(`middleware-${folder}`, middlewareId);
    addCandidate(`interceptor-${folder}`, middlewareId);
    addCandidate(`tab-${folder}`, tabId);
    addCandidate(`search-result-tab-${folder}`, tabId);
    addCandidate(folder, cmdId);
    addCandidate(folder, slotId);
  }

  return { canonicals, map };
};

const _collectRepoMappings = async (
  storeDir: string,
  repos: { url: string; localPath?: string }[],
): Promise<BuiltinMappings> => {
  const map = new Map<string, string[]>();
  const canonicals = new Set<string>();

  for (const repo of repos) {
    const local = repo.localPath ?? slugFromUrl(repo.url);
    const repoDir = join(storeDir, local);
    const pkg = await _readJson<RepoPackageJson>(join(repoDir, "package.json"));
    if (!pkg) continue;

    for (const group of REPO_GROUPS) {
      const entries = ((pkg as unknown as Record<string, ManifestEntry[]>)[group] ?? []) as (ManifestEntry & { type?: string })[];
      if (!Array.isArray(entries)) continue;
      for (const ent of entries) {
        if (!ent || typeof ent.path !== "string") continue;
        const itemFolder = ent.path.split("/").filter(Boolean).pop() ?? "";
        if (!itemFolder) continue;
        const kind = _kindFromManifest(group, ent);
        const folder = `${local}-${itemFolder}`;
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

    const acEntries = ((pkg as unknown as Record<string, ManifestEntry[]>)["autocomplete"] ?? []) as ManifestEntry[];
    if (Array.isArray(acEntries)) {
      for (const ent of acEntries) {
        if (!ent || typeof ent.path !== "string") continue;
        const itemFolder = ent.path.split("/").filter(Boolean).pop() ?? "";
        if (!itemFolder) continue;
        const folder = `${local}-${itemFolder}`;
        const runtimeId = `autocomplete-${folder}`;
        canonicals.add(runtimeId);

        const candidates = new Set<string>([
          `autocomplete-${itemFolder}`,
          `autocomplete-builtin-${itemFolder}`,
          itemFolder,
        ]);
        if (Array.isArray(ent.legacyIds)) {
          for (const l of ent.legacyIds) {
            if (typeof l === "string" && l.trim()) candidates.add(l.trim());
          }
        }
        candidates.delete(runtimeId);
        for (const c of candidates) {
          const existing = map.get(c) ?? [];
          if (!existing.includes(runtimeId)) existing.push(runtimeId);
          map.set(c, existing);
        }
      }
    }
  }

  return { canonicals, map };
};

const _backupPath = (path: string): string => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${path}.bak-${stamp}`;
};

/**
 * Rewrite plugin-settings.json keys to canonical IDs derived from:
 *   - repos.json + each repo's package.json (manifest legacyIds honoured)
 *   - built-in extensions shipped in the source tree
 *   - extensions already installed under data/{plugins,engines,autocomplete,transports}/
 *
 * Reserved global keys (`theme`, `degoog-api-secret`, `middleware`) and any
 * key prefixed with `__` are left untouched. Unresolved keys are left verbatim
 * with a WARN. Idempotent. Stamps `__schemaVersion: MIGRATION_VERSION` when done.
 */
export const runCanonicalIds052026 = async (): Promise<void> => {
  const settingsPath = pluginSettingsFile();
  const store = await _readJson<SettingsStore>(settingsPath);
  if (!store) return;

  const existingVersion = typeof store[SCHEMA_KEY] === "number" ? (store[SCHEMA_KEY] as number) : 0;
  if (existingVersion >= MIGRATION_VERSION) return;

  const repos = (await readReposData()).repos;
  const storeDir = getStoreDir();

  const builtin = await _collectBuiltinMappings();
  const installed = await _collectInstalledMappings();
  const repoMappings = repos.length > 0
    ? await _collectRepoMappings(storeDir, repos)
    : { canonicals: new Set<string>(), map: new Map<string, string[]>() };

  const canonicals = new Set<string>([
    ...builtin.canonicals,
    ...installed.canonicals,
    ...repoMappings.canonicals,
  ]);

  const _resolve = (legacy: string): string[] => {
    const fromRepo = repoMappings.map.get(legacy);
    if (fromRepo && fromRepo.length > 0) return fromRepo;
    const fromBuiltin = builtin.map.get(legacy);
    if (fromBuiltin && fromBuiltin.length > 0) return fromBuiltin;
    return installed.map.get(legacy) ?? [];
  };

  const keys = Object.keys(store).filter((k) => !k.startsWith("__"));
  const rewrites: ResolvedMapping[] = [];
  const unresolved: string[] = [];

  for (const key of keys) {
    if (RESERVED_GLOBAL_KEYS.has(key)) continue;
    if (canonicals.has(key)) continue;
    const candidates = _resolve(key);
    if (candidates.length === 0) {
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

  if (unresolved.length > 0) {
    logger.info(
      "migration:canonical-ids",
      `left ${unresolved.length} orphan key(s) verbatim: ${unresolved.join(", ")}`,
    );
  }

  store[SCHEMA_KEY] = MIGRATION_VERSION;
  await _writeAtomic(settingsPath, JSON.stringify(store, null, 2));
};
