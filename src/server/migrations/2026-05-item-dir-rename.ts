import { readFile, readdir, rename, stat, writeFile, mkdir } from "fs/promises";
import { dirname, join } from "path";
import { logger } from "../utils/logger";
import {
  autocompleteDir,
  enginesDir,
  pluginsDir,
  transportsDir,
} from "../utils/paths";
import {
  getStoreDir,
  readReposData,
} from "../extensions/store/persistence";
import { slugFromUrl } from "../extensions/store/repo-ops";
import type { RepoPackageJson } from "../../server/types";

export const MIGRATION_VERSION = 52026 as const;
const STAMP_FILE = "item-dir-rename.stamp";

interface ManifestEntry {
  path?: string;
  name?: string;
}

const REPO_GROUP_DIRS: { group: string; dir: () => string }[] = [
  { group: "engines", dir: enginesDir },
  { group: "autocomplete", dir: autocompleteDir },
  { group: "plugins", dir: pluginsDir },
  { group: "transports", dir: transportsDir },
];

const _readJson = async <T,>(path: string): Promise<T | null> => {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      logger.warn("migration:item-dir", `failed to read ${path}`, err);
    }
    return null;
  }
};

const _exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * Renames legacy bare-folder installs under data/{plugins,engines,autocomplete,transports}/
 * to their canonical `{repoSlug}-{itemFolder}` form when the bare folder name
 * matches an entry in an installed repo's manifest. Idempotent via stamp file
 * under the store dir.
 */
export const runItemDirRename052026 = async (): Promise<void> => {
  const storeDir = getStoreDir();
  const stampPath = join(storeDir, STAMP_FILE);
  if (await _exists(stampPath)) return;

  const repos = (await readReposData()).repos;
  if (repos.length === 0) return;

  const itemOwnership = new Map<string, { repoSlug: string; group: string }[]>();

  for (const repo of repos) {
    const local = repo.localPath ?? slugFromUrl(repo.url);
    const pkg = await _readJson<RepoPackageJson>(join(storeDir, local, "package.json"));
    if (!pkg) continue;

    for (const { group } of REPO_GROUP_DIRS) {
      const entries = ((pkg as unknown as Record<string, ManifestEntry[]>)[group] ?? []) as ManifestEntry[];
      if (!Array.isArray(entries)) continue;
      for (const ent of entries) {
        if (!ent || typeof ent.path !== "string") continue;
        const itemFolder = ent.path.split("/").filter(Boolean).pop() ?? "";
        if (!itemFolder) continue;
        const key = `${group}:${itemFolder}`;
        const list = itemOwnership.get(key) ?? [];
        list.push({ repoSlug: local, group });
        itemOwnership.set(key, list);
      }
    }
  }

  for (const { group, dir } of REPO_GROUP_DIRS) {
    const targetDir = dir();
    let entries: string[] = [];
    try {
      entries = await readdir(targetDir);
    } catch {
      continue;
    }

    for (const folder of entries) {
      const owners = itemOwnership.get(`${group}:${folder}`);
      if (!owners || owners.length === 0) continue;
      if (owners.length > 1) {
        logger.warn(
          "migration:item-dir",
          `legacy ${group} folder "${folder}" appears in multiple repos (${owners
            .map((o) => o.repoSlug)
            .join(", ")}); leaving in place`,
        );
        continue;
      }
      const owner = owners[0];
      const newName = `${owner.repoSlug}-${folder}`;
      if (newName === folder) continue;
      const src = join(targetDir, folder);
      const dst = join(targetDir, newName);
      if (await _exists(dst)) {
        logger.warn(
          "migration:item-dir",
          `target ${dst} already exists; leaving "${folder}" in place`,
        );
        continue;
      }
      try {
        await rename(src, dst);
        logger.info(
          "migration:item-dir",
          `renamed ${group}/${folder} -> ${group}/${newName}`,
        );
      } catch (err) {
        logger.error(
          "migration:item-dir",
          `failed to rename ${src} -> ${dst}`,
          err,
        );
      }
    }
  }

  try {
    await mkdir(dirname(stampPath), { recursive: true });
    await writeFile(stampPath, String(MIGRATION_VERSION), "utf-8");
  } catch (err) {
    logger.warn("migration:item-dir", "failed to write stamp file", err);
  }
};
