import type {
  SearchEngine,
  SearchResult,
  TimeFilter,
  EngineContext,
} from "../../types";

const GSA_USER_AGENTS = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/406.0.862495628 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/406.0.862495628 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/398.0.833143299 Mobile/15E148 Safari/604.1",
];

interface GoogleImageResult {
  result?: {
    page_title?: string;
    referrer_url?: string;
    site_title?: string;
  };
  original_image?: {
    url?: string;
    width?: number;
    height?: number;
  };
  thumbnail?: {
    url?: string;
  };
}

export class GoogleImagesEngine implements SearchEngine {
  name = "Google Images";

  async executeSearch(
    query: string,
    page: number = 1,
    timeFilter?: TimeFilter,
    context?: EngineContext,
  ): Promise<SearchResult[]> {
    const ijn = page - 1;
    const params = new URLSearchParams({
      q: query,
      tbm: "isch",
      asearch: "isch",
      async: `_fmt:json,p:1,ijn:${ijn}`,
    });

    if (timeFilter && timeFilter !== "any") {
      const tbsMap: Record<string, string> = {
        hour: "qdr:h",
        day: "qdr:d",
        week: "qdr:w",
        month: "qdr:m",
        year: "qdr:y",
      };
      if (tbsMap[timeFilter]) params.set("tbs", tbsMap[timeFilter]);
    }

    const ua =
      GSA_USER_AGENTS[Math.floor(Math.random() * GSA_USER_AGENTS.length)];
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(
      `https://www.google.com/search?${params.toString()}`,
      {
        headers: {
          "User-Agent": ua,
          Accept: "*/*",
          Cookie: "CONSENT=YES+",
        },
      },
    );

    const text = await response.text();
    const jsonStart = text.indexOf('{"ischj":');
    if (jsonStart < 0) return [];

    const data = JSON.parse(text.substring(jsonStart)) as {
      ischj?: { metadata?: GoogleImageResult[] };
    };
    const metadata = data.ischj?.metadata || [];
    const results: SearchResult[] = [];

    for (const item of metadata) {
      const title = item.result?.page_title?.replace(/<[^>]+>/g, "") || "";
      const url = item.result?.referrer_url || "";
      const thumbnail = item.thumbnail?.url || "";

      if (title && url) {
        results.push({
          title,
          url,
          snippet: item.result?.site_title || "",
          source: this.name,
          thumbnail,
        });
      }
    }

    return results;
  }
}
