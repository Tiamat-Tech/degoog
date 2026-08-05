import { skeletonResults } from "../../animations/skeleton";
import { state } from "../../state";
import type { ScoredResult, SearchResponse } from "../../types";
import { getBase } from "../../utils/base-url";
import { getEngines, isImageSearchType } from "../../utils/engines";
import { appendSearchAuthParams, searchAuthHeaders } from "../../utils/request";
import { declaredPages } from "../../utils/search-helpers";
import { hasMorePages } from "../../utils/page-flow";
import { buildSearchBody, buildSearchUrl } from "../../utils/url";
import { appendResults } from "./render";

const SENTINEL_CLASS = "degoog-infinite";
const PULL_CLASS = "degoog-infinite__pull";
const SKELETON_CLASS = "degoog-infinite__skeleton";
const PULL_RATIOS = [0, 0.2, 0.4, 0.6, 0.8, 1];
const SKELETON_COUNT = 3;

let observer: IntersectionObserver | null = null;
let sentinel: HTMLElement | null = null;
let loading = false;
let exhausted = false;

const _sentinelHtml = (): string =>
  `<div class="${SENTINEL_CLASS}"><div class="${PULL_CLASS}"></div></div>`;

const _hasMorePages = (): boolean =>
  hasMorePages(state.currentPage, state.lastPage, exhausted);

export const teardownInfinite = (): void => {
  observer?.disconnect();
  observer = null;
  sentinel?.remove();
  sentinel = null;
  loading = false;
  exhausted = false;
};

const _setPull = (ratio: number): void => {
  sentinel?.style.setProperty("--degoog-pull", ratio.toFixed(3));
};

const _rearm = (): void => {
  if (!observer || !sentinel) return;
  observer.unobserve(sentinel);
  observer.observe(sentinel);
};

const _showSkeleton = (): void => {
  if (!sentinel) return;
  sentinel.classList.add(`${SENTINEL_CLASS}--loading`);
  sentinel.insertAdjacentHTML(
    "beforeend",
    `<div class="${SKELETON_CLASS}">${skeletonResults(SKELETON_COUNT)}</div>`,
  );
};

const _clearSkeleton = (): void => {
  if (!sentinel) return;
  sentinel.classList.remove(`${SENTINEL_CLASS}--loading`);
  sentinel.querySelector(`.${SKELETON_CLASS}`)?.remove();
};

const _fetchPage = async (page: number): Promise<SearchResponse | null> => {
  const engines = await getEngines();
  const url = buildSearchUrl(state.currentQuery, engines, state.currentType, page);
  const res = state.postMethodEnabled
    ? await fetch(`${getBase()}/api/search`, {
        method: "POST",
        body: JSON.stringify(
          buildSearchBody(state.currentQuery, engines, state.currentType, page),
        ),
        headers: {
          "Content-Type": "application/json",
          ...searchAuthHeaders(),
        },
      })
    : await fetch(appendSearchAuthParams(url));
  if (!res.ok) return null;
  return (await res.json()) as SearchResponse;
};

const _loadNext = async (): Promise<void> => {
  if (loading || !_hasMorePages()) return;
  loading = true;
  const nextPage = state.currentPage + 1;
  const startIndex = state.currentResults.length;
  _showSkeleton();

  try {
    const data = await _fetchPage(nextPage);
    const results: ScoredResult[] = data?.results ?? [];
    if (results.length === 0) {
      exhausted = true;
      teardownInfinite();
      return;
    }
    state.currentPage = nextPage;
    state.currentResults = state.currentResults.concat(results);
    if (state.currentData) state.currentData.results = state.currentResults;

    const declared = declaredPages(data?.totalPages);
    if (declared !== null) state.lastPage = Math.max(declared, nextPage);

    appendResults(results, startIndex);
    if (!_hasMorePages()) teardownInfinite();
  } catch (err) {
    console.warn("[infinite-scroll] next page failed", err);
    exhausted = true;
    teardownInfinite();
  } finally {
    loading = false;
    _clearSkeleton();
    _setPull(0);
    _rearm();
  }
};

export const setupInfinite = (type: string): void => {
  teardownInfinite();
  if (isImageSearchType(type)) return;

  const container = document.getElementById("results-list");
  if (!container || state.currentResults.length === 0) return;
  if (!_hasMorePages()) return;

  container.insertAdjacentHTML("afterend", _sentinelHtml());
  sentinel = document.querySelector<HTMLElement>(`.${SENTINEL_CLASS}`);
  if (!sentinel) return;

  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (!entry) return;
      _setPull(entry.intersectionRatio);
      if (entry.intersectionRatio >= 1 && !loading) void _loadNext();
    },
    { threshold: PULL_RATIOS },
  );
  observer.observe(sentinel);
};
