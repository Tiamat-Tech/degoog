import { SlotPanelPosition, TranslateFunction, type SlotPlugin } from "../../../../types";

const TIMEOUT_MS = 5_000;
const USER_AGENT = "degoog/1.0 (+https://github.com/fccview/degoog)";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface WikiPage {
  title: string;
  extract: string;
  thumbnail?: { source: string };
  fullurl?: string;
  pageid: number;
}

let _cache: { query: string | null; page: WikiPage | null } = {
  query: null,
  page: null,
};

async function _fetchWikipedia(query: string): Promise<WikiPage | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const params = new URLSearchParams({
      action: "query",
      titles: query,
      prop: "extracts|pageimages|info",
      exintro: "1",
      explaintext: "1",
      pithumbsize: "300",
      inprop: "url",
      format: "json",
      redirects: "1",
    });
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?${params.toString()}`,
      {
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          "Api-User-Agent": USER_AGENT,
        },
      },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      query: { pages: Record<string, WikiPage & { missing?: "" }> };
    };
    const page = Object.values(data.query?.pages ?? {})[0];
    if (
      !page ||
      page.pageid === undefined ||
      "missing" in page ||
      !page.extract
    )
      return null;
    return page;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

const wikipediaSlot: SlotPlugin = {
  id: "wikipedia",
  get name(): string {
    return this.t!("wikipedia.name");
  },
  get description(): string {
    return this.t!("wikipedia.description");
  },
  position: SlotPanelPosition.KnowledgePanel,

  t: TranslateFunction,

  async trigger(query: string): Promise<boolean> {
    const q = query.trim();
    if (q.length < 2 || q.length > 100) return false;
    const page = await _fetchWikipedia(q);
    _cache = { query: q, page };
    return page !== null;
  },

  async execute(query: string): Promise<{ title?: string; html: string }> {
    const q = query.trim();
    let page = _cache.query === q ? _cache.page : null;
    if (!page) {
      page = await _fetchWikipedia(q);
      _cache = { query: q, page };
    }
    if (!page) return { html: "" };

    const title = escapeHtml(page.title);
    const description = escapeHtml(page.extract.substring(0, 500));
    const url = escapeHtml(
      page.fullurl ||
        `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
    );

    let html = "";
    if (page.thumbnail?.source) {
      html += `<img class="kp-image" src="${escapeHtml(page.thumbnail.source)}" alt="${title}">`;
    }
    html += `<h3 class="kp-title">${title}</h3>`;
    html += `<p class="kp-description">${description}</p>`;
    html += `<a class="kp-link" href="${url}" target="_blank">${this.t!("wikipedia.read-more")}</a>`;

    return { title: page.title, html };
  },
};

export const slot = wikipediaSlot;
