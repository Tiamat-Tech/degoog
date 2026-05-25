import { rename, readdir, stat } from "fs/promises";
import { join } from "path";
import { logger } from "../utils/logger";
import {
  getStoreDir,
  readReposData,
  writeReposData,
} from "../extensions/store/persistence";
import { slugFromUrl } from "../extensions/store/repo-ops";

export const MIGRATION_VERSION = 52026 as const;

const LEGACY_HASH_DIR = /^[0-9a-f]{8}-/;

const _renameDir = async (storeDir: string, from: string, to: string): Promise<boolean> => {
  if (from === to) return false;
  const src = join(storeDir, from);
  const dest = join(storeDir, to);
  const destStat = await stat(dest).catch(() => null);
  if (destStat) {
    logger.warn("migration:store-dir", `target already exists, skipping rename: ${to}`);
    return false;
  }
  await rename(src, dest);
  logger.info("migration:store-dir", `renamed ${from} -> ${to}`);
  return true;
};

/**
 * Migrate store clone directories from hash-prefixed slugs ({8hex}-name)
 * to deterministic {author}-{repo} slugs. Updates repos.json localPath.
 * Idempotent.
 */
export const runStoreDirRename052026 = async (): Promise<void> => {
  const storeDir = getStoreDir();
  const existing = await readdir(storeDir).catch(() => null);
  if (!existing) return;

  const data = await readReposData();
  let changed = false;

  for (const repo of data.repos) {
    const desired = slugFromUrl(repo.url);
    const currentLocal = repo.localPath ?? desired;
    if (currentLocal === desired) continue;

    const currentExists = existing.includes(currentLocal);
    if (!currentExists) {
      repo.localPath = desired;
      changed = true;
      continue;
    }

    const renamed = await _renameDir(storeDir, currentLocal, desired);
    if (renamed) {
      repo.localPath = desired;
      changed = true;
    }
  }

  for (const dir of existing) {
    if (!LEGACY_HASH_DIR.test(dir)) continue;
    const matchingRepo = data.repos.find((r) => r.localPath === dir);
    if (matchingRepo) continue;
    logger.warn(
      "migration:store-dir",
      `legacy dir ${dir} has no matching repos.json entry, leaving in place`,
    );
  }

  if (changed) {
    await writeReposData(data);
    logger.info("migration:store-dir", "repos.json updated with deterministic localPath values");
  }
};
