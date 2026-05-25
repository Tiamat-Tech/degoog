# Test Redundancy Report (`./tests`)

## Methodology

Analysis was limited to the `./tests` directory only (51 files). Each file was read or scanned for `describe`/`test` structure. Redundancy was flagged when tests appeared to assert the same behavior, hit the same code path without added assertions, duplicated integration coverage already present at a lower layer, or repeated smoke checks superseded by broader route tests. Confidence is **high**, **medium**, or **low** when overlap was explicit, inferred from shared endpoints/helpers, or uncertain without reading implementation outside `./tests`. No secrets or non-test paths were inspected.

---

## Not Resolved (Gemini: NOT VALID)

These were reviewed and kept as-is - Gemini determined they cover distinct behavior.

| File | Test / block | Reason kept |
|------|-------------|-------------|
| `tests/routes/api-key-guard.test.ts` | `guardApiKey - POST body attacks when protection disabled` - `missing query field → returns empty array` | POST body parsing vs GET URL query parsing - different code paths |
| `tests/routes/suggest.test.ts` | `GET /api/suggest returns 200 and array` | Asserts response body shape, not just guard status |
| `tests/routes/suggest.test.ts` | `GET /api/suggest/opensearch returns 200 and [query, suggestions]` | Unique content-type headers and array shape not covered elsewhere |
| `tests/routes/proxy.test.ts` | `signed URL to a private IP is blocked` (502) | Integration check that the route actually applies SSRF checks |
| `tests/unit/ssrf.test.ts` | `isSafeHost` - `rejects private IP literals` | Unit-level check for raw IP parsing without DNS resolution |
| `tests/routes/plugin-assets.test.ts` | `resolveContained` - `rejects parent-escape attempts` | Core security helper must be tested directly for varied path inputs |
| `tests/extensions/extension-meta.test.ts` | `masks secret fields and keeps non-secret values` | Tests integration between `buildExtensionMeta` and `maskSecrets`, including `configurable` field |
| `tests/unit/blocklist.test.ts` | `checkBlocked` - `added ip → blocked` | Ensures blocklist actually blocks an added IP - `addEntry` tests do not cover `checkBlocked` |
| `tests/commands/registry.test.ts` | `getFilteredCommandRegistry returns array` + `getCommandInstanceById returns help command` | Covers regex command matching and duplicate trigger prevention not in HTTP route tests |

---

## Additional (Gemini: specific-extension) - Deferred

| File | Test / block |
|------|-------------|
| `tests/slots/registry.test.ts` | `built-in wikipedia slot has position knowledge-panel` |
| `tests/slots/registry.test.ts` | `built-in wikipedia slot trigger returns false for very short queries` |
| `tests/slots/registry.test.ts` | `built-in wikipedia slot execute returns empty html when no page cached` |

---

## SOLVED

All entries below were verified as redundant and removed.

### Rate limiting

| File | Test removed | Action |
|------|-------------|--------|
| `tests/stress/rate-limit.test.ts` | `GET /api/rate-limit/test when rate limit enabled returns 200 then 429 after burst exceeded` | Removed - unit tests cover burst limit math |
| `tests/unit/rate-limit.test.ts` | 20-iteration loop in `checkRateLimit disabled` | Removed loop, kept 2 assertions |

### API key guard

| File | Test removed | Action |
|------|-------------|--------|
| `tests/routes/api-key-guard.test.ts` | `guardApiKey - bearer token edge cases` - `no Authorization header → 401` | Removed - covered by `protection enabled - no auth → 401` |
| `tests/routes/api-key-guard.test.ts` | `protection enabled - boolean true (not string) still gates` describe block | Removed - `_enable()` already passes boolean true |
| `tests/routes/api-key-guard.test.ts` | `protection enabled - boolean false allows through` describe block | Removed - covered by `protection disabled` matrix |
| `tests/routes/api-key-guard.test.ts` | `guardApiKey - suggest endpoints` - POST and opensearch endpoint variants (6 tests) | Removed - middleware is per-router, kept GET only |
| `tests/routes/api-key-guard.test.ts` | `guardApiKey - search endpoints` - POST, retry, stream variants (12 tests) | Removed - kept GET /api/search only per scenario |

### Public instance / settings auth

| File | Test removed | Action |
|------|-------------|--------|
| `tests/routes/gated-apis.test.ts` | `GET /api/settings/general returns 401` | Removed - pen-test covers it |
| `tests/routes/gated-apis.test.ts` | `POST /api/settings/general returns 401` | Removed - pen-test covers it |
| `tests/routes/gated-apis.test.ts` | `POST /api/settings/auth returns 401` | Removed - pen-test covers it |
| `tests/routes/settings-pen-test.test.ts` | `GET /settings still returns public settings HTML` (password-set block) | Removed - identical to no-password block test |
| `tests/routes/settings-pen-test.test.ts` | `public settings HTML has no reference to the admin path even with password set` | Removed - identical assertion in no-password block |
| `tests/routes/settings-auth.test.ts` | `canBalrogPass returns token from x-settings-token header` | Removed - pen-test integration covers header extraction |

### SSRF / proxy / path traversal

| File | Test removed | Action |
|------|-------------|--------|
| `tests/routes/plugin-assets.test.ts` | `GET /plugins/folder/.. returns 404` | Removed - encoded traversal tests cover the security concern |

### Registry smoke vs route integration

| File | Test removed | Action |
|------|-------------|--------|
| `tests/search-bar/registry.test.ts` | `getSearchBarActions returns array` | Deleted entire file - route test subsumes |
| `tests/themes/registry.test.ts` | `getThemes returns array`, `getActiveThemeId returns string or null`, `getActiveTheme returns null or theme` | Deleted entire file - all weak type smokes covered at route level |
| `tests/engines/registry.test.ts` | `registry is empty with no installed engines` | Removed - subsumed by `no built-in engines remain` |
| `tests/engines/registry.test.ts` | `getEnginesForSearchType returns empty list with no engines installed` | Removed - same empty-state premise |
| `tests/unit/search.test.ts` | `resolveEngine` - `returns null for unknown engine name` | Removed - same empty registry premise as engines/registry.test.ts |
| `tests/plugin-routes/registry.test.ts` | `findPluginRoute returns null for unknown plugin`, `getPluginRoutes returns empty array for unknown plugin` | Deleted entire file - HTTP 404 test subsumes both |

### Plugin assets / extension meta / settings masking

| File | Test removed | Action |
|------|-------------|--------|
| `tests/plugin-assets.test.ts` | `buildApiBase uses the installed folder ID` | Removed - `initPlugin` test already asserts `ctx.apiBase` |
| `tests/unit/plugin-settings.test.ts` | `maskSecrets` - `leaves non-secret fields unchanged` | Removed - subset of first mask test |

### Honeypot / logger / client smoke / outgoing / search merge

| File | Test removed | Action |
|------|-------------|--------|
| `tests/routes/honeypot.test.ts` | `/.git/config`, `/package.json`, `/Dockerfile`, `/server.js`, `/api/supersearch`, `/api/allengines` enabled trap tests (6 tests) | Removed - kept 3 representative traps with distinct body checks |
| `tests/routes/honeypot.test.ts` | `/sitemap.xml returns 404 when disabled`, `/.env returns 404 when disabled` | Removed - one disabled trap test sufficient |
| `tests/unit/logger.test.ts` | 4 LOG_LEVEL-specific `not.toThrow` tests | Collapsed into single parameterized test |
| `tests/public/constants-state-timeFilter.test.ts` | `DB_VERSION is number`, `STORE_NAME and SETTINGS_KEY are strings` | Removed - typeof-only assertions with no behavioral value |
| `tests/unit/translation.test.ts` | `prefers en-US over it when locale is en but only non-en bundles exist besides en` | Removed - virtually identical to the forced-en variant below it |
| `tests/unit/user-agents.test.ts` | `multiple calls return valid strings` (20-iteration loop) | Removed - adds nothing over the non-empty string assertion |
| `tests/stress/outgoing-proxy.test.ts` | `proxy receives the correct target URL` | Removed - subset of `request routes through proxy when enabled` |
| `tests/unit/search.test.ts` | `mergeNewResults` - `returns sorted by score` | Removed - single-element list, sorting logic never exercised |
| `tests/unit/cache.test.ts` | `TTL constants` - `exports expected TTL constants` | Removed - typeof/ordering assertions with no behavioral value |
