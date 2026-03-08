import { state } from "./state.js";
import { getEngines } from "./engines.js";
import { buildSearchUrl, proxyImageUrl } from "./url.js";
import { escapeHtml, cleanHostname } from "./utils.js";

let mediaObserver = null;
let appendMediaCardsRef = null;

export function registerAppendMediaCards(fn) {
  appendMediaCardsRef = fn;
}

export function destroyMediaObserver() {
  if (mediaObserver) {
    mediaObserver.disconnect();
    mediaObserver = null;
  }
}

export function setupMediaObserver(type) {
  destroyMediaObserver();
  const sentinel = document.querySelector(".media-scroll-sentinel");
  if (!sentinel) return;

  mediaObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !state.mediaLoading) {
      loadMoreMedia(type);
    }
  }, { rootMargin: "400px" });

  mediaObserver.observe(sentinel);
}

export async function loadMoreMedia(type) {
  const page = type === "images" ? state.imagePage : state.videoPage;
  const lastPg = type === "images" ? state.imageLastPage : state.videoLastPage;
  const nextPage = page + 1;
  if (nextPage > lastPg || state.mediaLoading) return;

  state.mediaLoading = true;
  const sentinel = document.querySelector(".media-scroll-sentinel");
  if (sentinel) sentinel.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';

  const engines = await getEngines();
  const url = buildSearchUrl(state.currentQuery, engines, type, nextPage);
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.results.length === 0) {
      if (type === "images") state.imageLastPage = page;
      else state.videoLastPage = page;
    } else {
      state.currentResults = state.currentResults.concat(data.results);
      if (type === "images") state.imagePage = nextPage;
      else state.videoPage = nextPage;

      const container = document.getElementById("results-list");
      const grid = container.querySelector(type === "images" ? ".image-grid" : ".video-grid");
      if (grid && appendMediaCardsRef) appendMediaCardsRef(grid, data.results, type === "images" ? "image" : "video");
    }
  } finally {
    state.mediaLoading = false;
    if (sentinel) sentinel.innerHTML = "";
  }
}

export function openMediaPreview(item, idx, cardSelector) {
  const panel = document.getElementById("media-preview-panel");
  const img = document.getElementById("media-preview-img");
  const info = document.getElementById("media-preview-info");

  img.src = proxyImageUrl(item.thumbnail || "") || "";
  info.innerHTML = `
    <h3 class="media-preview-title">${escapeHtml(item.title)}</h3>
    <a class="media-preview-link" href="${escapeHtml(item.url)}" target="_blank">${escapeHtml(cleanHostname(item.url))}</a>
    <a class="media-preview-visit" href="${escapeHtml(item.url)}" target="_blank">Visit page</a>
  `;

  panel.classList.add("open");

  document.querySelectorAll(cardSelector).forEach((c) => c.classList.remove("selected"));
  const selected = document.querySelector(`${cardSelector}[data-idx="${idx}"]`);
  if (selected) selected.classList.add("selected");
}

export function closeMediaPreview() {
  const panel = document.getElementById("media-preview-panel");
  panel.classList.remove("open");
  document.querySelectorAll(".image-card, .video-card").forEach((c) => c.classList.remove("selected"));
}
