import { mkdir, readdir, rename, unlink, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join, resolve } from "path";
import { logger } from "../../../utils/logger";
import {
  SEARX_CATALOG,
  SEARX_SOURCE_BASE_URL,
  catalogDeps,
  catalogEntry,
  dependants,
  isSupportFile,
} from "./catalog";
import type { SearxCatalogItem } from "./catalog-types";
import { searxEnginesDir } from "./paths";

const NS = "searx-install";
const PYCACHE_DIR = "__pycache__";
const DOWNLOAD_TIMEOUT_MS = 20_000;

const _enginePath = (code: string): string => join(resolve(searxEnginesDir()), `${code}.py`);

const _isInstalled = (code: string): boolean => existsSync(_enginePath(code));

const _known = (code: string): string => {
  const entry = catalogEntry(code);
  if (!entry) throw new Error(`Unknown SearX engine "${code}"`);
  return entry.code;
};

const _dropCache = async (code: string): Promise<void> => {
  const dir = join(resolve(searxEnginesDir()), PYCACHE_DIR);
  try {
    const names = await readdir(dir);
    const stale = names.filter((name) => name.startsWith(`${code}.cpython-`));
    await Promise.all(stale.map((name) => unlink(join(dir, name))));
  } catch (err) {
    logger.debug(NS, `no bytecode cache to clear for ${code}`, err);
  }
};

const _download = async (code: string): Promise<string> => {
  const url = `${SEARX_SOURCE_BASE_URL}/${code}.py`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!resp.ok) throw new Error(`Download failed with HTTP ${resp.status}`);
  const source = await resp.text();
  if (!source.trim()) throw new Error("Downloaded engine file was empty");
  return source;
};

const _missingDeps = (code: string): string[] =>
  catalogDeps(code).filter((dep) => !_isInstalled(dep));

const _fetchFile = async (code: string, dir: string): Promise<void> => {
  const target = _enginePath(code);
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    const source = await _download(code);
    await mkdir(dir, { recursive: true });
    await writeFile(tmp, source, "utf-8");
    await rename(tmp, target);
    await _dropCache(code);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
};

const _orphanDeps = (code: string): string[] =>
  catalogDeps(code).filter(
    (dep) =>
      isSupportFile(dep) &&
      _isInstalled(dep) &&
      !dependants(dep).some((other) => other !== code && _isInstalled(other)),
  );

export const listSearxItems = async (): Promise<SearxCatalogItem[]> =>
  SEARX_CATALOG.map((entry) => ({
    ...entry,
    installed: _isInstalled(entry.code),
    missingDeps: _missingDeps(entry.code),
  }));

export const installSearx = async (code: string): Promise<void> => {
  const engine = _known(code);
  const dir = resolve(searxEnginesDir());
  const queue = [..._missingDeps(engine), engine];
  try {
    for (const file of queue) await _fetchFile(file, dir);
    logger.info(NS, `installed SearX engine ${engine} (${queue.join(", ")})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(NS, `install of SearX engine ${engine} failed: ${message}`);
    throw new Error(message);
  }
};

export const uninstallSearx = async (code: string): Promise<void> => {
  const engine = _known(code);
  if (!_isInstalled(engine)) return;
  const queue = [engine, ..._orphanDeps(engine)];
  try {
    for (const file of queue) {
      await unlink(_enginePath(file));
      await _dropCache(file);
    }
    logger.info(NS, `uninstalled SearX engine ${engine} (${queue.join(", ")})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(NS, `uninstall of SearX engine ${engine} failed: ${message}`);
    throw new Error(message);
  }
};
