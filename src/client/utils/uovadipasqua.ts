import { logger } from "../../server/utils/logger";
import { getBase } from "./base-url";

interface UovadipasquaMatch {
  id: string;
  scriptUrl: string;
  styleUrl: string | null;
  waitForResults: boolean;
}

const _fired = new Set<string>();
const _injectedStyles = new Set<string>();
const RESULTS_READY_EVENT = "degoog-results-ready";
const RESULTS_WAIT_TIMEOUT_MS = 8000;

const _injectStyle = (href: string): void => {
  if (_injectedStyles.has(href)) return;
  _injectedStyles.add(href);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
};

const _resultsAlreadyRendered = (): boolean => {
  const list = document.getElementById("results-list");
  return !!list && list.querySelectorAll(".result-item").length > 0;
};

const _waitForResults = (): Promise<void> =>
  new Promise((resolve) => {
    if (_resultsAlreadyRendered()) {
      resolve();
      return;
    }
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      window.removeEventListener(RESULTS_READY_EVENT, finish);
      resolve();
    };
    window.addEventListener(RESULTS_READY_EVENT, finish, { once: true });
    window.setTimeout(finish, RESULTS_WAIT_TIMEOUT_MS);
  });

export async function triggerSearchQueryEggs(query: string): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed) return;
  try {
    const res = await fetch(
      `${getBase()}/api/uovadipasqua/match?q=${encodeURIComponent(trimmed)}`,
    );
    if (!res.ok) return;
    const data = (await res.json()) as { matches: UovadipasquaMatch[] };
    for (const match of data.matches) {
      const key = `${match.id}::${trimmed.toLowerCase()}`;
      if (_fired.has(key)) continue;
      _fired.add(key);
      if (match.styleUrl) _injectStyle(match.styleUrl);
      void (async () => {
        if (match.waitForResults) await _waitForResults();
        try {
          const mod = (await import(match.scriptUrl)) as {
            run?: (ctx: { query: string }) => void | Promise<void>;
          };
          if (typeof mod.run === "function") await mod.run({ query: trimmed });
        } catch (err) {
          logger.warn("uovadipasqua", `failed to run "${match.id}"`, err);
        }
      })();
    }
  } catch (err) {
    logger.warn("uovadipasqua", "match request failed", err);
  }
}
