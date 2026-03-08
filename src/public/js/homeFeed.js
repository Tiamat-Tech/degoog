import { proxyImageUrl } from "./url.js";
import { escapeHtml, cleanHostname } from "./utils.js";
import { getEngines } from "./engines.js";

const RSS_NEWS_ENGINE_ID = "rss-news";

let feedPage = 1;
let loading = false;
let exhausted = false;
let observer = null;

function renderCard(item) {
  const thumb = item.thumbnail
    ? `<img class="home-feed-card-img" src="${escapeHtml(proxyImageUrl(item.thumbnail))}" alt="" loading="lazy" onerror="this.parentElement.querySelector('.home-feed-card-img')?.remove()">`
    : "";
  const source = (item.sources && item.sources[0]) || cleanHostname(item.url);
  return `<a class="home-feed-card" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">
    ${thumb}
    <div class="home-feed-card-body">
      <div class="home-feed-card-source">${escapeHtml(source)}</div>
      <div class="home-feed-card-title">${escapeHtml(item.title)}</div>
    </div>
  </a>`;
}

async function fetchPage(page) {
  const res = await fetch(`/api/search?type=news&q=&page=${page}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.results || [];
}

async function loadMore(container) {
  if (loading || exhausted) return;
  loading = true;

  const items = await fetchPage(feedPage);
  if (items.length === 0) {
    exhausted = true;
    const sentinel = container.querySelector(".home-feed-sentinel");
    if (sentinel) sentinel.remove();
    loading = false;
    return;
  }

  const sentinel = container.querySelector(".home-feed-sentinel");
  const fragment = document.createDocumentFragment();
  const temp = document.createElement("div");
  temp.innerHTML = items.map(renderCard).join("");
  while (temp.firstChild) fragment.appendChild(temp.firstChild);
  container.insertBefore(fragment, sentinel);

  feedPage++;
  loading = false;
}

const isDesktop = () => window.matchMedia("(min-width: 768px)").matches;

export async function initHomeFeed() {
  const container = document.getElementById("home-news-feed");
  const main = document.getElementById("main-home");
  if (!container || !main) return;

  const engines = await getEngines();
  if (engines[RSS_NEWS_ENGINE_ID] === false) {
    if (!isDesktop()) container.remove();
    return;
  }

  if (!isDesktop()) main.classList.add("has-feed");

  try {
    const items = await fetchPage(1);
    if (items.length === 0) {
      if (!isDesktop()) main.classList.remove("has-feed");
      return;
    }

    container.innerHTML = items.map(renderCard).join("") +
      `<div class="home-feed-sentinel"></div>`;
    feedPage = 2;

    const sentinel = container.querySelector(".home-feed-sentinel");
    observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMore(container);
    }, { rootMargin: "400px" });
    observer.observe(sentinel);
  } catch {
    if (!isDesktop()) main.classList.remove("has-feed");
  }
}
