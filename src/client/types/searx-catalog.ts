export interface SearxCatalogItem {
  code: string;
  name: string;
  types: string[];
  installed: boolean;
  missingDeps: string[];
}

export interface SearxCatalogGroup {
  key: string;
  label: string;
  items: SearxCatalogItem[];
}
