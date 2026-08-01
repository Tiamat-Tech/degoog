import type { SearxCatalogEntry, SearxSharedFile } from "./catalog-types";
import { PythonLib } from "./python-deps";

export const SEARX_SOURCE_BASE_URL =
  "https://raw.githubusercontent.com/searxng/searxng/master/searx/engines";

const { Babel, DateUtil, Lxml } = PythonLib;

export const SEARX_CATALOG: readonly SearxCatalogEntry[] = [
  { code: "360search_videos", name: "360Search Videos", types: ["videos"] },
  { code: "acfun", name: "Acfun", types: ["videos"], libs: [Lxml] },
  { code: "ansa", name: "Ansa", types: ["news"], libs: [Lxml] },
  { code: "apple_maps", name: "Apple Maps", types: ["map"], deps: ["openstreetmap", "wikidata", "wikipedia"] },
  { code: "artic", name: "Artic", types: ["images"] },
  { code: "artstation", name: "Artstation", types: ["images"] },
  { code: "baidu", name: "Baidu", types: ["other"] },
  { code: "bing_images", name: "Bing Images", types: ["images"], deps: ["bing"], libs: [Lxml] },
  { code: "bing_news", name: "Bing News", types: ["news"], deps: ["bing"], libs: [Lxml] },
  { code: "bing_videos", name: "Bing Videos", types: ["videos"], deps: ["bing", "bing_images"], libs: [Lxml] },
  { code: "bitchute", name: "Bitchute", types: ["videos"] },
  { code: "boardreader", name: "Boardreader", types: ["web", "social media"], deps: ["json_engine"], libs: [Babel] },
  { code: "brave", name: "Brave", types: ["other"], libs: [Babel, DateUtil, Lxml] },
  { code: "bt4g", name: "Bt4G", types: ["files"], libs: [Lxml] },
  { code: "btdigg", name: "Btdigg", types: ["files"], libs: [Lxml] },
  { code: "ccc_media", name: "Ccc Media", types: ["videos"], libs: [DateUtil] },
  { code: "chefkoch", name: "Chefkoch", types: ["other"] },
  { code: "core", name: "Core", types: ["science", "scientific publications"] },
  { code: "crossref", name: "Crossref", types: ["science", "scientific publications"] },
  { code: "deezer", name: "Deezer", types: ["music"] },
  { code: "demo_online", name: "Demo Online", types: ["images"] },
  { code: "docker_hub", name: "Docker Hub", types: ["it", "packages"], libs: [DateUtil] },
  { code: "duckduckgo_definitions", name: "Duckduckgo Definitions", types: ["other"], libs: [Lxml] },
  { code: "duckduckgo_web", name: "Duckduckgo Web", types: ["web"], libs: [Lxml] },
  { code: "findfiles", name: "Findfiles", types: ["files"], libs: [Lxml] },
  { code: "findthatmeme", name: "Findthatmeme", types: ["images"] },
  { code: "flickr_noapi", name: "Flickr Noapi", types: ["images"] },
  { code: "frinkiac", name: "Frinkiac", types: ["images"] },
  { code: "genius", name: "Genius", types: ["music", "lyrics"] },
  { code: "giphy", name: "Giphy", types: ["images"], libs: [Lxml] },
  { code: "github", name: "Github", types: ["it", "repos"], libs: [DateUtil] },
  { code: "gmx", name: "Gmx", types: ["web"], libs: [Lxml] },
  { code: "goodreads", name: "Goodreads", types: ["other"], libs: [Lxml] },
  { code: "google_cse", name: "Google Cse", types: ["web"], deps: ["google"] },
  { code: "google_images", name: "Google Images", types: ["images"], deps: ["google"] },
  { code: "google_play", name: "Google Play", types: ["other"], libs: [Lxml] },
  { code: "grokipedia", name: "Grokipedia", types: ["web"] },
  { code: "hackernews", name: "Hackernews", types: ["it"], libs: [DateUtil] },
  { code: "huggingface", name: "Huggingface", types: ["it", "repos"] },
  { code: "il_post", name: "Il Post", types: ["news"] },
  { code: "imdb", name: "Imdb", types: ["movies"] },
  { code: "iqiyi", name: "Iqiyi", types: ["videos"] },
  { code: "jisho", name: "Jisho", types: ["dictionaries"] },
  { code: "mastodon", name: "Mastodon", types: ["social media"] },
  { code: "mediathekviewweb", name: "Mediathekviewweb", types: ["videos"] },
  { code: "mediawiki", name: "Mediawiki", types: ["web"] },
  { code: "microsoft_learn", name: "Microsoft Learn", types: ["it"] },
  { code: "mixcloud", name: "Mixcloud", types: ["music"], libs: [DateUtil] },
  { code: "mojeek", name: "Mojeek", types: ["web"], libs: [Babel, DateUtil, Lxml] },
  { code: "mwmbl", name: "Mwmbl", types: ["web"] },
  { code: "naver", name: "Naver", types: ["other"], libs: [Lxml] },
  { code: "neocities", name: "Neocities", types: ["web", "blogs"], libs: [Lxml] },
  { code: "openalex", name: "Openalex", types: ["science", "scientific publications"] },
  { code: "openlibrary", name: "Openlibrary", types: ["web", "books"], libs: [DateUtil] },
  { code: "openverse", name: "Openverse", types: ["images"] },
  { code: "pexels", name: "Pexels", types: ["images"], libs: [Lxml] },
  { code: "photon", name: "Photon", types: ["map"] },
  { code: "picjumbo", name: "Picjumbo", types: ["images"], libs: [Lxml] },
  { code: "pinterest", name: "Pinterest", types: ["images"] },
  { code: "piratebay", name: "Piratebay", types: ["files"] },
  { code: "podchaser", name: "Podchaser", types: ["other"] },
  { code: "privacywall", name: "Privacywall", types: ["other"], libs: [Babel, Lxml] },
  { code: "pubmed", name: "Pubmed", types: ["science", "scientific publications"], libs: [Lxml] },
  { code: "quark", name: "Quark", types: ["other"] },
  { code: "resulthunter", name: "Resulthunter", types: ["other"], deps: ["brave"], libs: [Lxml] },
  { code: "rottentomatoes", name: "Rottentomatoes", types: ["movies"], libs: [Lxml] },
  { code: "senscritique", name: "Senscritique", types: ["movies"] },
  { code: "seznam", name: "Seznam", types: ["web"], libs: [Lxml] },
  { code: "sogou", name: "Sogou", types: ["web"], libs: [Lxml] },
  { code: "sogou_images", name: "Sogou Images", types: ["images"] },
  { code: "sogou_videos", name: "Sogou Videos", types: ["videos"] },
  { code: "sogou_wechat", name: "Sogou Wechat", types: ["news"], libs: [Lxml] },
  { code: "soundcloud", name: "Soundcloud", types: ["music"], libs: [DateUtil, Lxml] },
  { code: "stackexchange", name: "Stackexchange", types: ["other"] },
  { code: "startpagina", name: "Startpagina", types: ["web"], libs: [DateUtil] },
  { code: "tagesschau", name: "Tagesschau", types: ["web", "news"] },
  { code: "translated", name: "Translated", types: ["web", "translate"] },
  { code: "wolframalpha_noapi", name: "Wolframalpha Noapi", types: ["other"] },
  { code: "yahoo_news", name: "Yahoo News", types: ["news"], deps: ["yahoo"], libs: [DateUtil, Lxml] },
  { code: "youtube_noapi", name: "Youtube Noapi", types: ["videos", "music"] },
];

export const SEARX_SHARED_FILES: readonly SearxSharedFile[] = [
  { code: "bing", libs: [Babel, Lxml] },
  { code: "google", libs: [Babel, Lxml] },
  { code: "json_engine" },
  { code: "openstreetmap" },
  { code: "wikidata", libs: [Babel, DateUtil] },
  { code: "wikipedia", libs: [Babel, Lxml] },
  { code: "yahoo", libs: [Lxml] },
];

const _byCode = new Map(SEARX_CATALOG.map((entry) => [entry.code, entry]));

const _shared = new Map(SEARX_SHARED_FILES.map((file) => [file.code, file]));

const _extraEngines = (): string[] =>
  (process.env.DEGOOG_SEARX_EXTRA_ENGINES ?? "")
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);

export const catalogEntry = (code: string): SearxCatalogEntry | undefined =>
  _byCode.get(code);

export const catalogDeps = (code: string): string[] =>
  _byCode.get(code)?.deps ?? [];

export const isSupportFile = (code: string): boolean => _shared.has(code);

export const isSupportedEngine = (code: string): boolean =>
  _byCode.has(code) || _extraEngines().includes(code);

export const dependants = (code: string): string[] =>
  SEARX_CATALOG.filter((entry) => entry.deps?.includes(code)).map(
    (entry) => entry.code,
  );

const _fileLibs = (code: string): readonly PythonLib[] =>
  _byCode.get(code)?.libs ?? _shared.get(code)?.libs ?? [];

export const engineLibs = (code: string): PythonLib[] => {
  const needed = new Set<PythonLib>(_fileLibs(code));
  for (const dep of catalogDeps(code)) {
    for (const lib of _fileLibs(dep)) needed.add(lib);
  }
  return Object.values(PythonLib).filter((lib) => needed.has(lib));
};
