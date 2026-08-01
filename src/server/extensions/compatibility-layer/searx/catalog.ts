import type { SearxCatalogEntry } from "./catalog-types";

export const SEARX_SOURCE_BASE_URL =
  "https://raw.githubusercontent.com/searxng/searxng/master/searx/engines";

export const SEARX_CATALOG: readonly SearxCatalogEntry[] = [
  { code: "360search_videos", name: "360Search Videos", types: ["videos"] },
  { code: "acfun", name: "Acfun", types: ["videos"] },
  { code: "ansa", name: "Ansa", types: ["news"] },
  { code: "apple_maps", name: "Apple Maps", types: ["map"], deps: ["openstreetmap", "wikidata", "wikipedia"] },
  { code: "artic", name: "Artic", types: ["images"] },
  { code: "artstation", name: "Artstation", types: ["images"] },
  { code: "baidu", name: "Baidu", types: ["other"] },
  { code: "bing_images", name: "Bing Images", types: ["images"], deps: ["bing"] },
  { code: "bing_news", name: "Bing News", types: ["news"], deps: ["bing"] },
  { code: "bing_videos", name: "Bing Videos", types: ["videos"], deps: ["bing", "bing_images"] },
  { code: "bitchute", name: "Bitchute", types: ["videos"] },
  { code: "boardreader", name: "Boardreader", types: ["web", "social media"], deps: ["json_engine"] },
  { code: "brave", name: "Brave", types: ["other"] },
  { code: "bt4g", name: "Bt4G", types: ["files"] },
  { code: "btdigg", name: "Btdigg", types: ["files"] },
  { code: "ccc_media", name: "Ccc Media", types: ["videos"] },
  { code: "chefkoch", name: "Chefkoch", types: ["other"] },
  { code: "core", name: "Core", types: ["science", "scientific publications"] },
  { code: "crossref", name: "Crossref", types: ["science", "scientific publications"] },
  { code: "deezer", name: "Deezer", types: ["music"] },
  { code: "demo_online", name: "Demo Online", types: ["images"] },
  { code: "docker_hub", name: "Docker Hub", types: ["it", "packages"] },
  { code: "duckduckgo_definitions", name: "Duckduckgo Definitions", types: ["other"] },
  { code: "duckduckgo_web", name: "Duckduckgo Web", types: ["web"] },
  { code: "findfiles", name: "Findfiles", types: ["files"] },
  { code: "findthatmeme", name: "Findthatmeme", types: ["images"] },
  { code: "flickr_noapi", name: "Flickr Noapi", types: ["images"] },
  { code: "frinkiac", name: "Frinkiac", types: ["images"] },
  { code: "genius", name: "Genius", types: ["music", "lyrics"] },
  { code: "giphy", name: "Giphy", types: ["images"] },
  { code: "github", name: "Github", types: ["it", "repos"] },
  { code: "gmx", name: "Gmx", types: ["web"] },
  { code: "goodreads", name: "Goodreads", types: ["other"] },
  { code: "google_cse", name: "Google Cse", types: ["web"], deps: ["google"] },
  { code: "google_images", name: "Google Images", types: ["images"], deps: ["google"] },
  { code: "google_play", name: "Google Play", types: ["other"] },
  { code: "grokipedia", name: "Grokipedia", types: ["web"] },
  { code: "hackernews", name: "Hackernews", types: ["it"] },
  { code: "huggingface", name: "Huggingface", types: ["it", "repos"] },
  { code: "il_post", name: "Il Post", types: ["news"] },
  { code: "imdb", name: "Imdb", types: ["movies"] },
  { code: "iqiyi", name: "Iqiyi", types: ["videos"] },
  { code: "jisho", name: "Jisho", types: ["dictionaries"] },
  { code: "mastodon", name: "Mastodon", types: ["social media"] },
  { code: "mediathekviewweb", name: "Mediathekviewweb", types: ["videos"] },
  { code: "mediawiki", name: "Mediawiki", types: ["web"] },
  { code: "microsoft_learn", name: "Microsoft Learn", types: ["it"] },
  { code: "mixcloud", name: "Mixcloud", types: ["music"] },
  { code: "mojeek", name: "Mojeek", types: ["web"] },
  { code: "mwmbl", name: "Mwmbl", types: ["web"] },
  { code: "naver", name: "Naver", types: ["other"] },
  { code: "neocities", name: "Neocities", types: ["web", "blogs"] },
  { code: "openalex", name: "Openalex", types: ["science", "scientific publications"] },
  { code: "openlibrary", name: "Openlibrary", types: ["web", "books"] },
  { code: "openverse", name: "Openverse", types: ["images"] },
  { code: "pexels", name: "Pexels", types: ["images"] },
  { code: "photon", name: "Photon", types: ["map"] },
  { code: "picjumbo", name: "Picjumbo", types: ["images"] },
  { code: "pinterest", name: "Pinterest", types: ["images"] },
  { code: "piratebay", name: "Piratebay", types: ["files"] },
  { code: "podchaser", name: "Podchaser", types: ["other"] },
  { code: "privacywall", name: "Privacywall", types: ["other"] },
  { code: "pubmed", name: "Pubmed", types: ["science", "scientific publications"] },
  { code: "quark", name: "Quark", types: ["other"] },
  { code: "resulthunter", name: "Resulthunter", types: ["other"], deps: ["brave"] },
  { code: "rottentomatoes", name: "Rottentomatoes", types: ["movies"] },
  { code: "senscritique", name: "Senscritique", types: ["movies"] },
  { code: "seznam", name: "Seznam", types: ["web"] },
  { code: "sogou", name: "Sogou", types: ["web"] },
  { code: "sogou_images", name: "Sogou Images", types: ["images"] },
  { code: "sogou_videos", name: "Sogou Videos", types: ["videos"] },
  { code: "sogou_wechat", name: "Sogou Wechat", types: ["news"] },
  { code: "soundcloud", name: "Soundcloud", types: ["music"] },
  { code: "stackexchange", name: "Stackexchange", types: ["other"] },
  { code: "startpagina", name: "Startpagina", types: ["web"] },
  { code: "tagesschau", name: "Tagesschau", types: ["web", "news"] },
  { code: "translated", name: "Translated", types: ["web", "translate"] },
  { code: "wolframalpha_noapi", name: "Wolframalpha Noapi", types: ["other"] },
  { code: "yahoo_news", name: "Yahoo News", types: ["news"], deps: ["yahoo"] },
  { code: "youtube_noapi", name: "Youtube Noapi", types: ["videos", "music"] },
];

const _byCode = new Map(SEARX_CATALOG.map((entry) => [entry.code, entry]));

const _supportFiles = new Set(
  SEARX_CATALOG.flatMap((entry) => entry.deps ?? []).filter(
    (code) => !_byCode.has(code),
  ),
);

export const catalogEntry = (code: string): SearxCatalogEntry | undefined =>
  _byCode.get(code);

export const catalogDeps = (code: string): string[] =>
  _byCode.get(code)?.deps ?? [];

export const isSupportFile = (code: string): boolean => _supportFiles.has(code);

export const dependants = (code: string): string[] =>
  SEARX_CATALOG.filter((entry) => entry.deps?.includes(code)).map(
    (entry) => entry.code,
  );
