import { mkdir, rename, writeFile } from "fs/promises";
import { dirname } from "path";

/**
 * Write pretty JSON to a temp file in the same directory, then rename over
 * the target. The rename is atomic on the same filesystem, so a crash or
 * concurrent write cannot leave a half-written file at `path`.
 */
export const writeJsonAtomic = async (
  path: string,
  value: unknown,
): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, JSON.stringify(value, null, 2), "utf-8");
  await rename(tmp, path);
};
