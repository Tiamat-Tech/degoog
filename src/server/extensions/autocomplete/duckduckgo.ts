import type { AutocompleteProvider, AutocompleteContext } from "../../types";

export class DuckDuckGoAutocompleteProvider implements AutocompleteProvider {
  name = "DuckDuckGo";

  async getSuggestions(query: string, context?: AutocompleteContext): Promise<string[]> {
    const doFetch = context?.fetch ?? fetch;
    const encoded = encodeURIComponent(query);
    try {
      const res = await doFetch(
        `https://duckduckgo.com/ac/?q=${encoded}&type=list`,
      );
      const data = (await res.json()) as [unknown, string[]];
      return data[1] ?? [];
    } catch {
      return [];
    }
  }
}
