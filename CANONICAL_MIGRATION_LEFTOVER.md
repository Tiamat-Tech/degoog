# Canonical ID migration — themes & transports leftover

Follow-up to the command standardization (`plugin-<folder>` -> `<folder>-command`,
migrations `2026-05-canonical-ids` + `2026-05-command-ids`). Engines, slots,
middleware, tabs and commands now use the clean `makeExtID(folder, kind)` suffix
scheme (`<folder>-<kind>`). **Themes and transports were left on their old
prefix scheme and are internally inconsistent.** This document is the plan to
finish them.

Do not start this until someone has read the "Risks" section. It touches the
active-theme selection and stored transport credentials.

---

## 1. The actual problem

There are three different key forms in play for these two kinds, and they do not
agree with each other.

### Transports

| Source | Key form | Example (`degoog-fplay` from official repo) |
| --- | --- | --- |
| Runtime settings key (`transports/registry.ts:50,89`, `_settingsId = transport-${t.name}`, `t.name = canonicalId = <folder>-transport`) | `transport-<folder>-transport` | `transport-degoog-org-official-extensions-degoog-fplay-transport` |
| `store-types.ts:76` (uninstall cleanup) | `transport-<folder>-transport` | matches runtime ✓ |
| `canonical-ids` **installed** mapping (`_collectInstalledMappings`) | `transport-<canonical>` | matches runtime ✓ |
| `canonical-ids` **repo** mapping (`_collectRepoMappings`, `makeExtID(folder,"transport")`) | `<folder>-transport` | **`...-degoog-fplay-transport` — NO `transport-` prefix ✗** |

`_resolve` checks the repo path **first**, so for any user who has the official
repo cloned, the migration rewrote transport settings to `<folder>-transport`
while the runtime reads `transport-<folder>-transport`. **Result: migrated
transport settings (incl. credentials) are silently orphaned.**

### Themes

Worse — `themes/registry.ts:112` sets `theme.id = entry.name` (the bare folder,
**no `-theme` suffix**), and `settingsId(themeId) = theme-${themeId}`.

| Source | Key form | Example (`catpuccin`) |
| --- | --- | --- |
| Runtime settings key (`themes/registry.ts:57,191`) | `theme-<folder>` | `theme-degoog-org-official-extensions-catpuccin` |
| `store-types.ts:64` | `theme-<folder>-theme` | `theme-...-catpuccin-theme` |
| `canonical-ids` repo mapping | `<folder>-theme` | `...-catpuccin-theme` |

Three different forms, none matching. Migrated theme settings land at
`<folder>-theme`, runtime reads `theme-<folder>`, uninstall cleanup looks for
`theme-<folder>-theme`. All orphaned / leaking.

### Why commands were easy and these are not

Commands had a single runtime key (`plugin-<folder>`) and one consumer family.
Themes/transports keep a **redundant kind prefix on top of the canonical**
(`transport-` / `theme-`), and themes additionally never adopted the `-theme`
suffix on `theme.id`. The half-finished standardization left the prefix in the
registries but the suffix-only form in the migration.

---

## 2. Target scheme (decision)

Adopt the same clean scheme as engines/slots/commands: **suffix-only canonical,
no redundant prefix.**

- Transport settings key: `<folder>-transport`
- Theme settings key: `<folder>-theme`

This is deliberately the form the `canonical-ids` **repo** path already emits, so
once the runtime is aligned, that migration becomes correct for repo-present
users with zero further change to it.

Autocomplete stays on `autocomplete-<folder>` (its prefix is the established,
documented form and there is no `-autocomplete` canonical; out of scope).

Keep `theme.id = entry.name` (the bare folder). Only the **settings key** moves
to `<folder>-theme`; the active-theme value and all `themes.find(t => t.id ===)`
lookups keep using the bare folder id. This keeps the blast radius small.

---

## 3. Code changes

### 3a. Transports — `src/server/extensions/transports/registry.ts`
- `_settingsId` (L89): `transport-${t.name}` -> `t.name` (which already equals the
  `<folder>-transport` canonical).
- `onLoad` (L48-51): `getSettings(\`transport-${name}\`)` -> `getSettings(name)`;
  `registerExtensionFolder(\`transport-${name}\`, folderName)` ->
  `registerExtensionFolder(name, folderName)`.
- Audit any other `transport-${...}` settings reads/writes in this file.

### 3b. Transports — consumers
- `src/server/routes/extensions.ts`
  - `:319` `if (id.startsWith("transport-"))` + `id.slice(10)` ->
    `if (id.endsWith("-transport"))` and pass `id` straight to `getTransport(id)`
    (the transport `name` is now the full canonical).
  - `:153` matcher: transport branch `transport-${makeExtID(i.installedAs,"transport")}`
    -> `makeExtID(i.installedAs, "transport")`.
- `src/server/extensions/store/store-types.ts:76`:
  `[\`transport-${makeExtID(id,"transport")}\`]` -> `[makeExtID(id,"transport")]`.
- `src/client/modules/modals/settings-modal/modal.ts:208-209`:
  `ext.id.startsWith("transport-")` + `ext.id.slice(10)` ->
  `ext.id.endsWith("-transport")` and use `ext.id` (or `folderFromExtID(ext.id,"transport")`
  if the test endpoint expects the bare folder — verify against the
  `/api/.../test-connection` handler and `data-transport` consumer). Rebuild client.

### 3c. Themes — `src/server/extensions/themes/registry.ts`
- `settingsId` (L57): `return \`theme-${themeId}\`` ->
  `return makeExtID(themeId, "theme")` (import `makeExtID` from `../extension-id`).
- Confirm `THEME_SETTINGS_ID = "theme"` (the active-theme reserved key) is
  **unchanged** — it stores `{ active: <theme.id> }` and `theme.id` stays the bare
  folder. Do not touch it.

### 3d. Themes — consumers
- `src/server/routes/extensions.ts:153` matcher: theme branch
  `theme-${makeExtID(i.installedAs,"theme")}` -> `makeExtID(i.installedAs,"theme")`.
- `src/server/extensions/store/store-types.ts:64`:
  `[\`theme-${makeExtID(id,"theme")}\`]` -> `[makeExtID(id,"theme")]`.
- `src/client/settings/themes-tab.ts:10`:
  `extId.startsWith("theme-") ? extId.slice(6) : extId` ->
  `extId.endsWith("-theme") ? extId.slice(0, -"-theme".length) : extId`
  (verify what this folder value is used for first). Rebuild client.

### 3e. `extension-docs.ts`
Already suffix-based (`endsWith("-theme")` / `endsWith("-transport")`), so it
keeps working. No change needed, but re-verify the `_folderById` fallback regex
covers the new keys.

### 3f. `canonical-ids` migration alignment — `2026-05-canonical-ids.ts`
The repo path is already correct. Fix the **installed** mapping so it agrees
(otherwise installed-only users still get the prefixed form):
- Transports loop (`_collectInstalledMappings`, ~L290-300): drop
  `settingsId = \`transport-${canonical}\``; map candidates to `canonical`
  (`<folder>-transport`) only. Remove the `canonicals.add(settingsId)` /
  `transport-`-prefixed candidate targets.
- There is no themes loop in `_collectInstalledMappings` today; the repo path
  handles themes and already emits `<folder>-theme`. Verify no other branch
  emits `theme-<...>`.
- `OFFICIAL_STORE_OVERRIDES` already targets `<folder>-theme` / `<folder>-transport`
  (suffix-only) — correct, leave as-is.

---

## 4. New migration — `src/server/migrations/2026-05-theme-transport-ids.ts`

`MIGRATION_VERSION = 52028`, shares `__schemaVersion`, runs **after**
`command-ids` (52027) and **before** `builtin-migrations` in
`migrations/index.ts`. Mirror the structure of `2026-05-command-ids.ts`
(backup + atomic write + idempotent + gated on `existingVersion >= 52028`).

Rewrites (merge into target, existing target wins, same as command-ids):

1. **Transports**: any key `transport-<X>` where `X` ends with `-transport`
   -> `X`. (Handles the runtime form `transport-<folder>-transport`.)
   Also a bare legacy `transport-<folder>` (pre-canonical) -> `<folder>-transport`
   only if `<folder>` does not already end in `-transport` — be careful not to
   double-strip. Safer: detect via installed `transportsDir()` folder list and
   map both `transport-<folder>` and `transport-<folder>-transport` to
   `makeExtID(folder,"transport")`.
2. **Themes**: any key `theme-<X>` -> `makeExtID(X, "theme")`
   (`theme-<folder>` -> `<folder>-theme`). If `X` already ends in `-theme`
   (a previously double-formed key), `makeExtID` is idempotent so this is safe.

Edge cases to handle explicitly:
- Keys that are already canonical (`<folder>-transport`, `<folder>-theme`) — skip.
- The reserved `theme` key (active selection) — never rewrite; it is in
  `RESERVED_GLOBAL_KEYS` and holds `{ active: <folder> }`, not a settings map.
- Users who already ran `canonical-ids` with the repo present already have
  `<folder>-theme` / `<folder>-transport` (repo path). This migration is a no-op
  for them — and once 3a-3d land, the runtime finally reads those keys. That is
  the actual fix for the "settings disappeared" reports.

Register and wrap in `try/catch` exactly like the others in
`migrations/index.ts`.

---

## 5. Tests

- `tests/store/uninstall-settings.test.ts`: update the theme and transport
  assertions:
  - transport: expect `acme-bar-transport`, `not.toContain("transport-acme-bar-transport")`.
  - theme: expect `acme-zen-theme`, `not.toContain("theme-acme-zen-theme")`.
- New `tests/migrations/theme-transport-ids.test.ts` (mirror
  `tests/migrations/command-ids.test.ts`): cover
  `transport-<folder>-transport -> <folder>-transport`,
  `theme-<folder> -> <folder>-theme`, idempotency, schema stamp, and
  "existing canonical wins on merge".
- Add a transport/theme registry characterization test asserting the settings
  key the registry reads equals `makeExtID(folder, kind)`.
- Run the full suite + `bunx tsc --noEmit` + `bun run build.ts` + lint.

---

## 6. Risks

- **Transport credentials**: transport settings often hold secrets (proxy
  creds, tokens). A wrong key move = silent auth failure, not a crash. The
  merge must not drop the source map. Verify with a real `degoog-fplay` /
  `camoufox` config before/after.
- **Active theme reset**: if the `theme` reserved key or `theme.id` semantics are
  touched by accident, every user's selected theme resets to default on boot
  (`registry.ts:131-133` nulls an unknown `activeThemeId`). Keep `theme.id` = bare
  folder; only move the *settings* key.
- **Transport `name` is the matcher key**: `getTransport(name)` matches `t.name`,
  and `t.name` is set to the canonical in `onLoad`. After dropping the
  `transport-` settings prefix, double-check every caller passes the canonical
  (`<folder>-transport`), not the bare folder.
- **Built-in transports**: `_builtins` (flaresolverr/browserless/etc.) — confirm
  their `name`/settings-key handling matches the new scheme; they short-circuit
  in `onLoad` (`registry.ts:46`).
- **Docs**: `docs/transports.html` (`transport-<name>`) and `docs/themes.html`
  (`theme-<id>`) become wrong once the prefix is dropped — update them to the
  `<name>-transport` / `<id>-theme` suffix form as part of this change. (`docs/`
  is a separate git repo; commit there too.)

---

## 7. Verification checklist

1. Fresh boot with a stale `data/plugin-settings.json` containing
   `transport-<folder>-transport` and `theme-<folder>` keys -> migration logs the
   rewrites, settings survive, transport test-connection still authenticates,
   selected theme persists.
2. Repo-present user who already ran `canonical-ids` (`<folder>-theme` /
   `<folder>-transport` already present) -> migration no-op, runtime now reads
   the settings, theme/transport configured state shows in Settings.
3. Uninstall a themed/transport extension -> `store-types` cleanup removes the
   correct `<folder>-<kind>` key.
4. `bunx tsc --noEmit`, full `bun test`, `bun run build.ts`, `bunx eslint` all green.
</content>
