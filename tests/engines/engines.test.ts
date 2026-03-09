import { describe, test, expect } from "bun:test";
import { DuckDuckGoEngine } from "../../src/extensions/engines/duckduckgo";
import type { SearchResult } from "../../src/types";

const fixtureHtml = `
<html>
<body>
  <div class="result">
    <h2 class="result__title"><a href="https://example.com/page1">First Result</a></h2>
    <div class="result__snippet">Snippet one</div>
  </div>
  <div class="result">
    <h2 class="result__title"><a href="https://example.com/page2">Second Result</a></h2>
    <div class="result__snippet">Snippet two</div>
  </div>
</body>
</html>
`;

describe("engine execution", () => {
  test("DuckDuckGo executeSearch returns SearchResult[] with mocked fetch", async () => {
    const engine = new DuckDuckGoEngine();
    const mockFetch = async (): Promise<Response> =>
      new Response(fixtureHtml, {
        headers: { "Content-Type": "text/html" },
      });
    const results = await engine.executeSearch("test", 1, "any", {
      fetch: mockFetch,
    });
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(2);
    const [first, second] = results as SearchResult[];
    expect(first.title).toBe("First Result");
    expect(first.url).toBe("https://example.com/page1");
    expect(first.snippet).toBe("Snippet one");
    expect(first.source).toBe("DuckDuckGo");
    expect(second.title).toBe("Second Result");
    expect(second.url).toBe("https://example.com/page2");
  });

  test("DuckDuckGo executeSearch passes timeFilter into request", async () => {
    const engine = new DuckDuckGoEngine();
    let capturedUrl = "";
    const mockFetch = async (url: string): Promise<Response> => {
      capturedUrl = url;
      return new Response(
        '<html><body><div class="result"></div></body></html>',
      );
    };
    await engine.executeSearch("q", 1, "day", { fetch: mockFetch });
    expect(capturedUrl).toContain("df=d");
  });

  test("DuckDuckGo executeSearch passes page offset", async () => {
    const engine = new DuckDuckGoEngine();
    let capturedUrl = "";
    const mockFetch = async (url: string): Promise<Response> => {
      capturedUrl = url;
      return new Response("<html><body></body></html>");
    };
    await engine.executeSearch("q", 2, "any", { fetch: mockFetch });
    expect(capturedUrl).toContain("s=30");
    expect(capturedUrl).toContain("dc=31");
  });
});
