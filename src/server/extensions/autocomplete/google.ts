import type { AutocompleteProvider, AutocompleteContext } from "../../types";

export class GoogleAutocompleteProvider implements AutocompleteProvider {
  name = "Google";

  async getSuggestions(query: string, context?: AutocompleteContext): Promise<string[]> {
    const doFetch = context?.fetch ?? fetch;
    const encoded = encodeURIComponent(query);
    try {
      const res = await doFetch(
        `https://suggestqueries.google.com/complete/search?client=firefox&q=${encoded}`,
      );
      const buf = await res.arrayBuffer();
      const data = JSON.parse(
        new TextDecoder("iso-8859-1").decode(buf),
      ) as [unknown, string[]];
      return data[1] ?? [];
    } catch {
      return [];
    }
  }
}
