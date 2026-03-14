import { join } from "path";
import type { SlotPlugin, SlotPanelPosition } from "../../types";
import {
  isDisabled,
} from "../../utils/plugin-settings";
import {
  loadPluginAssets,
  initPlugin,
  registerPluginSettingsId,
} from "../../utils/plugin-assets";
import { debug } from "../../utils/logger";

let slotPlugins: SlotPlugin[] = [];
const builtinsDir = join(
  process.cwd(),
  "src",
  "server",
  "extensions",
  "commands",
  "builtins",
);

function isSlotPlugin(val: unknown): val is SlotPlugin {
  return (
    typeof val === "object" &&
    val !== null &&
    "id" in val &&
    typeof (val as SlotPlugin).id === "string" &&
    "name" in val &&
    typeof (val as SlotPlugin).name === "string" &&
    "position" in val &&
    ["above-results", "below-results", "sidebar", "at-a-glance"].includes(
      (val as SlotPlugin).position as SlotPanelPosition,
    ) &&
    "trigger" in val &&
    typeof (val as SlotPlugin).trigger === "function" &&
    "execute" in val &&
    typeof (val as SlotPlugin).execute === "function"
  );
}

async function loadSlotsFromRoot(
  rootDir: string,
  source: "plugin" | "builtin",
): Promise<void> {
  const { readdir, stat } = await import("fs/promises");
  const { pathToFileURL } = await import("url");
  let entries: string[];
  try {
    entries = await readdir(rootDir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const entryPath = join(rootDir, entry);
    const entryStat = await stat(entryPath).catch(() => null);
    if (!entryStat?.isDirectory()) continue;

    let indexFile: string | undefined;
    for (const f of ["index.js", "index.ts", "index.mjs", "index.cjs"]) {
      const s = await stat(join(entryPath, f)).catch(() => null);
      if (s?.isFile()) {
        indexFile = f;
        break;
      }
    }
    if (!indexFile) continue;

    try {
      const fullPath = join(entryPath, indexFile);
      const url = pathToFileURL(fullPath).href;
      const mod = await import(url);
      const slot = mod.slot ?? mod.slotPlugin ?? mod.default?.slot;
      if (!slot || !isSlotPlugin(slot)) continue;

      const slotSettingsId = slot.settingsId ?? `slot-${slot.id}`;
      registerPluginSettingsId(entry, slotSettingsId);

      if (!(await isDisabled(slotSettingsId))) {
        const template = await loadPluginAssets(entryPath, entry, slotSettingsId, source);
        await initPlugin(slot, entryPath, slotSettingsId, template);
      }
      slotPlugins.push(slot);
    } catch (err) {
      debug("slots", `Failed to load slot plugin: ${entry}`, err);
    }
  }
}

export async function initSlotPlugins(): Promise<void> {
  const { pluginsDir } = await import("../../utils/paths");
  const pluginDir = pluginsDir();
  slotPlugins = [];
  await loadSlotsFromRoot(builtinsDir, "builtin");
  await loadSlotsFromRoot(pluginDir, "plugin");
}

export function getSlotPlugins(): SlotPlugin[] {
  return [...slotPlugins];
}

export function getSlotPluginById(slotId: string): SlotPlugin | null {
  return slotPlugins.find((p) => p.id === slotId) ?? null;
}

export async function reloadSlotPlugins(): Promise<void> {
  slotPlugins = [];
  await initSlotPlugins();
}
