export interface RepoInfo {
  url: string;
  localPath: string;
  addedAt: string;
  lastFetched: string;
  name: string;
  description: string;
  error: string | null;
}

export interface StoreItem {
  repoUrl: string;
  repoSlug: string;
  repoName: string;
  type: "plugin" | "theme" | "engine";
  path: string;
  name: string;
  description: string;
  version: string;
  author: {
    name: string;
    url?: string;
    avatar?: string;
  } | null;
  screenshots: string[];
  installed: boolean;
  installedVersion?: string;
}

export interface InstalledItem {
  repoUrl: string;
  type: "plugin" | "theme" | "engine";
  itemPath: string;
  installedAs: string;
  installedAt: string;
  version: string;
}

export interface ReposData {
  repos: RepoInfo[];
  installed: InstalledItem[];
}

export interface RepoPackageJson {
  name?: string;
  description?: string;
  author?: string;
  plugins?: Array<{ path: string; name: string; description?: string; version?: string; type?: string }>;
  themes?: Array<{ path: string; name: string; description?: string; version?: string }>;
  engines?: Array<{ path: string; name: string; description?: string; version?: string }>;
}

export interface AuthorJson {
  name: string;
  url?: string;
  avatar?: string;
}
