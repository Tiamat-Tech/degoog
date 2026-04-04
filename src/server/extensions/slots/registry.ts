import { SlotPanelPosition, type SlotPlugin } from "../../types";
import { isDisabled } from "../../utils/plugin-settings";
import {
  loadPluginAssets,
  initPlugin,
  registerPluginSettingsId,
} from "../../utils/plugin-assets";
import { pluginsDir } from "../../utils/paths";
import { createRegistry } from "../registry-factory";

function isSlotPlugin(val: unknown): val is SlotPlugin {
  if (typeof val !== "object" || val === null) return false;
  const slot = val as SlotPlugin;
  const validPositions = new Set(Object.values(SlotPanelPosition));
  const positionOk =
    "position" in slot && validPositions.has(slot.position as SlotPanelPosition);
  const slotPositionsOk =
    !("slotPositions" in slot) ||
    (Array.isArray(slot.slotPositions) &&
      slot.slotPositions.length > 0 &&
      slot.slotPositions.every((p) => validPositions.has(p)));
  return (
    "id" in slot &&
    typeof slot.id === "string" &&
    "name" in slot &&
    typeof slot.name === "string" &&
    positionOk &&
    slotPositionsOk &&
    "trigger" in slot &&
    typeof slot.trigger === "function" &&
    "execute" in slot &&
    typeof slot.execute === "function"
  );
}

const registry = createRegistry<SlotPlugin>({
  dirs: () => [{ dir: pluginsDir(), source: "plugin" }],
  match: (mod) => {
    const s = mod.slot ?? mod.slotPlugin ?? (mod.default as Record<string, unknown>)?.slot;
    return isSlotPlugin(s) ? s : null;
  },
  onLoad: async (slot, { entryPath, folderName, source }) => {
    const settingsId = slot.settingsId ?? `slot-${slot.id}`;
    registerPluginSettingsId(folderName, settingsId);
    if (!(await isDisabled(settingsId))) {
      const template = await loadPluginAssets(entryPath, folderName, settingsId, source);
      await initPlugin(slot, entryPath, settingsId, template);
    }
  },
  debugTag: "slots",
});

export async function initSlotPlugins(): Promise<void> {
  await registry.init();
}

export function getSlotPlugins(): SlotPlugin[] {
  return registry.items();
}

export function getSlotPluginById(slotId: string): SlotPlugin | null {
  return registry.items().find((p) => p.id === slotId) ?? null;
}

export async function reloadSlotPlugins(): Promise<void> {
  await registry.reload();
}
