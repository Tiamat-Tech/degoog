import type {
  SearchEngine,
  SearchResult,
  SettingField,
  TimeFilter,
} from "../../types";
import { searchNews } from "../../news-rss";

export class RssNewsEngine implements SearchEngine {
  name = "RSS Feeds";

  settingsSchema: SettingField[] = [
    {
      key: "urls",
      label: "Feed URLs",
      type: "textarea",
      description:
        "One RSS/Atom feed URL per line. Leave empty to use default tech news feeds.",
      placeholder:
        "https://news.ycombinator.com/rss\nhttps://techcrunch.com/feed/",
    },
  ];

  private feedUrls: string[] = [];

  configure(settings: Record<string, string | string[]>): void {
    const urlsVal = settings.urls;
    if (Array.isArray(urlsVal)) {
      this.feedUrls = urlsVal.filter((u) => {
        if (typeof u !== "string" || !u.startsWith("http")) return false;
        try {
          new URL(u);
          return true;
        } catch {
          return false;
        }
      });
      return;
    }
    const raw = (urlsVal ?? "").trim();
    let parsed: string[] = [];
    if (raw) {
      try {
        const json = JSON.parse(raw) as unknown;
        if (Array.isArray(json)) {
          parsed = (json as unknown[]).filter((u): u is string => {
            if (typeof u !== "string" || !u.startsWith("http")) return false;
            try {
              new URL(u);
              return true;
            } catch {
              return false;
            }
          });
        }
      } catch {
        parsed = raw
          .split("\n")
          .map((u) => u.trim())
          .filter((u) => {
            try {
              return u.startsWith("http") && !!new URL(u);
            } catch {
              return false;
            }
          });
      }
    }
    this.feedUrls = parsed;
  }

  async executeSearch(
    query: string,
    page: number = 1,
    _timeFilter?: TimeFilter,
  ): Promise<SearchResult[]> {
    return searchNews(query, page, this.feedUrls);
  }
}
