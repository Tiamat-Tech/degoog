export interface SearxCatalogEntry {
  code: string;
  name: string;
  types: string[];
  deps?: string[];
}

export interface SearxCatalogItem extends SearxCatalogEntry {
  installed: boolean;
  missingDeps: string[];
}
