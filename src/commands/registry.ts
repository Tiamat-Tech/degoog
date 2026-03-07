import type { BangCommand, ExtensionMeta, SlotPlugin, SlotPanelPosition, PluginContext } from "../types";
import { helpCommand } from "./builtins/help/index";
import { uuidCommand } from "./builtins/uuid/index";
import { ipCommand } from "./builtins/ip/index";
import { speedtestCommand } from "./builtins/speedtest/index";
import { jellyfinCommand, JELLYFIN_ID } from "./builtins/jellyfin/index";
import { meilisearchCommand, MEILISEARCH_ID } from "./builtins/meilisearch/index";
import { AI_SUMMARY_ID, aiSummarySettingsSchema } from "./builtins/ai-summary/index";
import { getEngineMap as getSearchEngineMap } from "../engines/registry";
import { getSettings, maskSecrets } from "../plugin-settings";
import { addPluginCss, registerPluginScript } from "../plugin-assets";
import { debug } from "../logger";

interface CommandEntry {
  id: string;
  trigger: string;
  displayName: string;
  instance: BangCommand;
}

const BUILTIN_COMMANDS: CommandEntry[] = [
  { id: "help", trigger: "help", displayName: "Help", instance: helpCommand },
  { id: "uuid", trigger: "uuid", displayName: "UUID Generator", instance: uuidCommand },
  { id: "ip", trigger: "ip", displayName: "IP Lookup", instance: ipCommand },
  { id: "speedtest", trigger: "speedtest", displayName: "Speed Test", instance: speedtestCommand },
  { id: JELLYFIN_ID, trigger: "jellyfin", displayName: "Jellyfin", instance: jellyfinCommand },
  { id: MEILISEARCH_ID, trigger: "meili", displayName: "Meilisearch", instance: meilisearchCommand },
];

interface PluginCommandEntry {
  id: string;
  trigger: string;
  displayName: string;
  instance: BangCommand;
}

let pluginCommands: PluginCommandEntry[] = [];
let userAliases: Record<string, string> = {};

function getEngineShortcuts(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [id, engine] of Object.entries(getSearchEngineMap())) {
    if (engine.bangShortcut) {
      map.set(engine.bangShortcut, id);
    }
  }
  return map;
}

function isBangCommand(val: unknown): val is BangCommand {
  return (
    typeof val === "object" &&
    val !== null &&
    "name" in val &&
    typeof (val as BangCommand).name === "string" &&
    "trigger" in val &&
    typeof (val as BangCommand).trigger === "string" &&
    "execute" in val &&
    typeof (val as BangCommand).execute === "function"
  );
}

export async function initPlugins(): Promise<void> {
  const { readdir, readFile, stat } = await import("fs/promises");
  const { join } = await import("path");
  const { pathToFileURL } = await import("url");
  const commandDir =
    process.env.DEGOOG_PLUGINS_DIR ?? join(process.cwd(), "data", "plugins");
  const seen = new Set<string>(BUILTIN_COMMANDS.map((c) => c.trigger));
  pluginCommands = [];

  try {
    const aliasPath = process.env.DEGOOG_ALIASES_FILE ?? join(process.cwd(), "data", "aliases.json");
    const raw = await readFile(aliasPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      userAliases = parsed as Record<string, string>;
    }
  } catch (err) {
    debug("commands", "Failed to load user aliases", err);
    userAliases = {};
  }

  try {
    const entries = await readdir(commandDir);
    for (const entry of entries) {
      const entryPath = join(commandDir, entry);
      const entryStat = await stat(entryPath).catch(() => null);
      if (!entryStat?.isDirectory()) continue;

      let indexFile: string | undefined;
      for (const f of ["index.js", "index.ts", "index.mjs", "index.cjs"]) {
        const s = await stat(join(entryPath, f)).catch(() => null);
        if (s?.isFile()) { indexFile = f; break; }
      }
      if (!indexFile) continue;

      const id = `plugin-${entry}`;

      try {
        const fullPath = join(entryPath, indexFile);
        const url = pathToFileURL(fullPath).href;
        const mod = await import(url);
        const Export = mod.default ?? mod.command ?? mod.Command;
        const instance: BangCommand =
          typeof Export === "function" ? new Export() : Export;
        if (!isBangCommand(instance)) continue;
        if (seen.has(instance.trigger)) continue;
        seen.add(instance.trigger);

        const template = await readFile(join(entryPath, "template.html"), "utf-8").catch(() => "");
        const css = await readFile(join(entryPath, "style.css"), "utf-8").catch(() => "");
        if (css) addPluginCss(id, css);
        const hasScript = await stat(join(entryPath, "script.js")).catch(() => null);
        if (hasScript?.isFile()) registerPluginScript(entry);

        if (instance.init) {
          const ctx: PluginContext = {
            dir: entryPath,
            template,
            readFile: (filename: string) => readFile(join(entryPath, filename), "utf-8"),
          };
          await Promise.resolve(instance.init(ctx));
        }

        if (instance.configure && instance.settingsSchema?.length) {
          const stored = await getSettings(id);
          if (Object.keys(stored).length > 0) instance.configure(stored);
        }
        pluginCommands.push({
          id,
          trigger: instance.trigger,
          displayName: instance.name,
          instance,
        });
      } catch (err) {
        debug("commands", `Failed to load plugin command: ${entry}`, err);
      }
    }
  } catch (err) {
    debug("commands", `Failed to read command plugin directory`, err);
  }
}

export async function reloadCommands(): Promise<void> {
  pluginCommands = [];
  await initPlugins();
}

export function getCommandInstanceById(id: string): BangCommand | undefined {
  return [...BUILTIN_COMMANDS, ...pluginCommands].find((c) => c.id === id)?.instance;
}

export function getCommandMap(): Map<string, { instance: BangCommand; id: string }> {
  const map = new Map<string, { instance: BangCommand; id: string }>();
  for (const cmd of BUILTIN_COMMANDS) {
    map.set(cmd.trigger, { instance: cmd.instance, id: cmd.id });
    for (const alias of cmd.instance.aliases ?? []) {
      map.set(alias, { instance: cmd.instance, id: cmd.id });
    }
  }
  for (const cmd of pluginCommands) {
    map.set(cmd.trigger, { instance: cmd.instance, id: cmd.id });
    for (const alias of cmd.instance.aliases ?? []) {
      map.set(alias, { instance: cmd.instance, id: cmd.id });
    }
  }
  for (const [alias, cmd] of Object.entries(userAliases)) {
    if (!map.has(alias)) {
      const target = map.get(cmd);
      if (target) map.set(alias, target);
    }
  }
  return map;
}

export function getCommandRegistry(): { trigger: string; name: string; description: string; aliases: string[] }[] {
  const all = [...BUILTIN_COMMANDS, ...pluginCommands];
  const registry = all.map((c) => {
    const builtinAliases = c.instance.aliases ?? [];
    const extraAliases = Object.entries(userAliases)
      .filter(([, target]) => target === c.trigger)
      .map(([alias]) => alias);
    return {
      trigger: c.instance.trigger,
      name: c.instance.name,
      description: c.instance.description,
      aliases: [...builtinAliases, ...extraAliases],
    };
  });

  for (const [shortcut, engineId] of getEngineShortcuts()) {
    const engine = getSearchEngineMap()[engineId];
    if (engine) {
      registry.push({
        trigger: shortcut,
        name: `${engine.name} only`,
        description: `Search only ${engine.name}`,
        aliases: [],
      });
    }
  }

  return registry;
}

export async function getFilteredCommandRegistry(): Promise<{ trigger: string; name: string; description: string; aliases: string[] }[]> {
  const full = getCommandRegistry();
  const all = [...BUILTIN_COMMANDS, ...pluginCommands];

  const configuredTriggers = new Set<string>();
  await Promise.all(
    all.map(async (entry) => {
      const settings = await getSettings(entry.id);
      if (settings["disabled"] === "true") return;
      const configured = entry.instance.isConfigured
        ? await entry.instance.isConfigured()
        : true;
      if (configured) configuredTriggers.add(entry.instance.trigger);
    }),
  );

  for (const [shortcut] of getEngineShortcuts()) {
    configuredTriggers.add(shortcut);
  }

  return full.filter((c) => configuredTriggers.has(c.trigger));
}

export async function getPluginExtensionMeta(): Promise<ExtensionMeta[]> {
  const all = [...BUILTIN_COMMANDS, ...pluginCommands];
  const results: ExtensionMeta[] = [];

  for (const entry of all) {
    const schema = entry.instance.settingsSchema ?? [];
    const rawSettings = (schema.length > 0 || entry.id.startsWith("plugin-")) ? await getSettings(entry.id) : {};
    const maskedSettings = maskSecrets(rawSettings, schema);
    if (rawSettings["disabled"]) maskedSettings["disabled"] = rawSettings["disabled"];
    results.push({
      id: entry.id,
      displayName: entry.displayName,
      description: entry.instance.description,
      type: "command",
      configurable: schema.length > 0,
      settingsSchema: schema,
      settings: maskedSettings,
    });
  }

  const aiRawSettings = await getSettings(AI_SUMMARY_ID);
  const aiMaskedSettings = maskSecrets(aiRawSettings, aiSummarySettingsSchema);
  if (aiRawSettings["disabled"]) aiMaskedSettings["disabled"] = aiRawSettings["disabled"];
  results.push({
    id: AI_SUMMARY_ID,
    displayName: "AI Summary",
    description: "Replaces At a Glance with a brief AI-generated summary using any OpenAI-compatible provider",
    type: "command",
    configurable: true,
    settingsSchema: aiSummarySettingsSchema,
    settings: aiMaskedSettings,
  });

  return results;
}

export type BangMatch =
  | { type: "command"; command: BangCommand; commandId: string; args: string }
  | { type: "engine"; engineId: string; query: string };

export function matchBangCommand(query: string): BangMatch | null {
  const trimmed = query.trim();
  if (!trimmed.startsWith("!")) return null;
  const withoutBang = trimmed.slice(1);
  const spaceIdx = withoutBang.indexOf(" ");
  const trigger = spaceIdx === -1 ? withoutBang : withoutBang.slice(0, spaceIdx);
  const args = spaceIdx === -1 ? "" : withoutBang.slice(spaceIdx + 1);
  const lowerTrigger = trigger.toLowerCase();

  const map = getCommandMap();
  const entry = map.get(lowerTrigger);
  if (entry) return { type: "command", command: entry.instance, commandId: entry.id, args };

  const engineId = getEngineShortcuts().get(lowerTrigger);
  if (engineId) return { type: "engine", engineId, query: args };

  return null;
}
