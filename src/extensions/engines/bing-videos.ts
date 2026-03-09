import * as cheerio from "cheerio";
import type {
  SearchEngine,
  SearchResult,
  TimeFilter,
  EngineContext,
} from "../../types";
import { getRandomUserAgent } from "../../user-agents";

export class BingVideosEngine implements SearchEngine {
  name = "Bing Videos";

  async executeSearch(
    query: string,
    page: number = 1,
    timeFilter?: TimeFilter,
    context?: EngineContext,
  ): Promise<SearchResult[]> {
    const first = (page - 1) * 40;
    let url = `https://www.bing.com/videos/search?q=${encodeURIComponent(query)}&count=40&first=${first}`;
    if (timeFilter && timeFilter !== "any") {
      const freshMap: Record<string, string> = {
        hour: "Hour",
        day: "Day",
        week: "Week",
        month: "Month",
        year: "Year",
      };
      if (freshMap[timeFilter])
        url += `&qft=+filterui:videoage-lt${freshMap[timeFilter].toLowerCase()}`;
    }
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(url, {
      headers: { "User-Agent": getRandomUserAgent() },
    });
    const html = await response.text();
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $(".mc_vtvc, .dg_u").each((_, el) => {
      const meta =
        $(el).attr("data-video") ||
        $(el).find("[data-video]").attr("data-video") ||
        "";
      try {
        const data = JSON.parse(meta);
        if (data.murl || data.vurl) {
          results.push({
            title: data.title || data.t || "",
            url: data.murl || data.vurl || "",
            snippet: data.desc || "",
            source: this.name,
            thumbnail: data.turl || data.imgurl || "",
            duration: data.dur || "",
          });
        }
      } catch {}
    });

    if (results.length === 0) {
      $(".mc_vtvc_meta, .vrhdata").each((_, el) => {
        const title = $(el)
          .find(".mc_vtvc_title, .mc_vtvc_meta_row")
          .text()
          .trim();
        const link = $(el).closest("a").attr("href") || "";
        const thumb = $(el).closest(".mc_vtvc").find("img").attr("src") || "";
        if (title && link) {
          results.push({
            title,
            url: link.startsWith("http") ? link : `https://www.bing.com${link}`,
            snippet: "",
            source: this.name,
            thumbnail: thumb,
          });
        }
      });
    }

    return results;
  }
}
