import { escapeHtml } from "../../utils/dom";
import { typeLabel } from "./type-label";
import type { SearxCatalogGroup, SearxCatalogItem } from "../../types/searx-catalog";

const t = window.scopedT("core");

const WEB_TYPE = "web";

export const searxFilter = (
  items: SearxCatalogItem[],
  query: string,
): SearxCatalogItem[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(needle) ||
      item.code.toLowerCase().includes(needle),
  );
};

export const searxGroups = (items: SearxCatalogItem[]): SearxCatalogGroup[] => {
  const map = new Map<string, SearxCatalogItem[]>();
  for (const item of items) {
    const key = (item.types[0] ?? WEB_TYPE).toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return [...map.keys()]
    .sort((a, b) => {
      if (a === WEB_TYPE) return -1;
      if (b === WEB_TYPE) return 1;
      return a.localeCompare(b);
    })
    .map((key) => ({
      key,
      label: typeLabel(key),
      items: (map.get(key) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    }));
};

const _extraTypes = (item: SearxCatalogItem): string => {
  const primary = (item.types[0] ?? WEB_TYPE).toLowerCase();
  const extras = item.types.filter((type) => type.toLowerCase() !== primary);
  if (!extras.length) return "";
  return extras
    .map(
      (type) =>
        `<span class="degoog-badge degoog-badge--engine-type">${escapeHtml(typeLabel(type.toLowerCase()))}</span>`,
    )
    .join("");
};

const _depsBadge = (item: SearxCatalogItem): string => {
  if (item.installed || !item.missingDeps.length) return "";
  const label = t("settings-page.extensions.searx-deps-badge", {
    count: String(item.missingDeps.length),
  });
  return `<span class="degoog-badge degoog-badge--deps" title="${escapeHtml(item.missingDeps.join(", "))}">${escapeHtml(label)}</span>`;
};

const _card = (item: SearxCatalogItem): string => {
  const action = item.installed
    ? `<button class="btn btn--secondary degoog-btn degoog-btn--secondary searx-btn-uninstall" type="button" data-code="${escapeHtml(item.code)}">${escapeHtml(t("settings-page.extensions.searx-uninstall"))}</button>`
    : `<button class="btn btn--primary degoog-btn degoog-btn--primary searx-btn-install" type="button" data-code="${escapeHtml(item.code)}">${escapeHtml(t("settings-page.extensions.searx-install"))}</button>`;
  const installed = item.installed
    ? '<span class="ext-configured-badge"></span>'
    : "";
  const badges = `${_extraTypes(item)}${_depsBadge(item)}`;
  const meta = badges ? `<div class="searx-card-meta">${badges}</div>` : "";
  return `
    <div class="searx-card" data-code="${escapeHtml(item.code)}">
      <div class="searx-card-info">
        <div class="searx-card-name">${escapeHtml(item.name)}</div>
        ${meta}
      </div>
      <div class="searx-card-actions">${installed}${action}</div>
    </div>`;
};

export const searxListHtml = (items: SearxCatalogItem[]): string => {
  if (!items.length) {
    return `<p class="searx-empty">${escapeHtml(t("settings-page.extensions.searx-empty"))}</p>`;
  }
  return searxGroups(items)
    .map(
      (group) => `
      <div class="searx-group">
        <h3 class="searx-group-label">${escapeHtml(group.label)}</h3>
        <div class="searx-grid">${group.items.map(_card).join("")}</div>
      </div>`,
    )
    .join("");
};

export const searxShellHtml = (): string => `
  <div class="searx-modal">
    <input type="text" class="searx-search-input degoog-search-bar degoog-search-bar--square-advanced" id="searx-search-input" placeholder="${escapeHtml(t("settings-page.extensions.searx-search"))}" autocomplete="off">
    <div class="searx-status" id="searx-status" role="status"></div>
    <div class="searx-list" id="searx-list"></div>
  </div>`;
