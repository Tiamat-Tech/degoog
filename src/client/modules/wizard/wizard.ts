import { getBase } from "../../utils/base-url";
import { getStoredToken, switchSettingsTab } from "../settings/settings";
import { HOME_STEPS, SETTINGS_STEPS, type WizardStep } from "./steps";

const SERVER_SETTINGS_URL = "/api/server-settings";
const HOME_DONE_KEY = "degoog-wizard-home-done";
const POPOVER_MARGIN = 12;
const POPOVER_WIDTH = 320;
const POPOVER_HEIGHT_GUESS = 180;
const SCROLL_PADDING = 80;

const t = window.scopedT("core");

interface ServerSettingsResponse {
  wizard: boolean;
}

let active = false;

const fetchWizardDone = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${getBase()}${SERVER_SETTINGS_URL}`);
    if (!res.ok) return true;
    const data = (await res.json()) as ServerSettingsResponse;
    return data.wizard === true;
  } catch (err) {
    console.warn("[wizard] failed to read server-settings", err);
    return true;
  }
};

const patchServerWizard = async (wizard: boolean): Promise<void> => {
  const token = getStoredToken();
  try {
    await fetch(`${getBase()}${SERVER_SETTINGS_URL}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-settings-token": token } : {}),
      },
      body: JSON.stringify({ wizard }),
    });
  } catch (err) {
    console.warn("[wizard] failed to update wizard flag", err);
  }
};

const markServerDone = (): void => {
  void patchServerWizard(true);
};

const waitFor = (selector: string, timeoutMs = 1500): Promise<Element | null> =>
  new Promise((resolve) => {
    const found = document.querySelector(selector);
    if (found) return resolve(found);
    const start = Date.now();
    const id = setInterval(() => {
      const el = document.querySelector(selector);
      if (el || Date.now() - start > timeoutMs) {
        clearInterval(id);
        resolve(el);
      }
    }, 60);
  });

const buildRoot = (): HTMLElement => {
  const root = document.createElement("div");
  root.className = "degoog-wizard";
  root.innerHTML = `
    <div class="degoog-wizard__mask degoog-wizard__mask--top"></div>
    <div class="degoog-wizard__mask degoog-wizard__mask--right"></div>
    <div class="degoog-wizard__mask degoog-wizard__mask--bottom"></div>
    <div class="degoog-wizard__mask degoog-wizard__mask--left"></div>
    <div class="degoog-wizard__ring"></div>
    <div class="degoog-wizard__popover degoog-panel" role="dialog" aria-modal="true">
      <div class="degoog-wizard__progress"></div>
      <h2 class="degoog-wizard__title"></h2>
      <p class="degoog-wizard__body"></p>
      <div class="degoog-wizard__footer">
        <button type="button" class="degoog-btn degoog-wizard__skip"></button>
        <div class="degoog-wizard__nav">
          <button type="button" class="degoog-btn degoog-btn--secondary degoog-wizard__back"></button>
          <button type="button" class="degoog-btn degoog-btn--primary degoog-wizard__next"></button>
        </div>
      </div>
    </div>`;
  return root;
};

interface Placement {
  top: number;
  left: number;
  arrow: "top" | "bottom" | "left" | "right" | "none";
  arrowOffset: number;
}

const computePlacement = (
  rect: DOMRect | null,
  vw: number,
  vh: number,
): Placement => {
  if (!rect) {
    return {
      top: vh / 2 - POPOVER_HEIGHT_GUESS / 2,
      left: vw / 2 - POPOVER_WIDTH / 2,
      arrow: "none",
      arrowOffset: 0,
    };
  }
  const spaceBelow = vh - rect.bottom;
  const spaceAbove = rect.top;
  const placeBelow =
    spaceBelow >= POPOVER_HEIGHT_GUESS + POPOVER_MARGIN ||
    spaceBelow >= spaceAbove;
  const top = placeBelow
    ? rect.bottom + POPOVER_MARGIN
    : rect.top - POPOVER_HEIGHT_GUESS - POPOVER_MARGIN;
  let left = rect.left + rect.width / 2 - POPOVER_WIDTH / 2;
  left = Math.max(
    POPOVER_MARGIN,
    Math.min(left, vw - POPOVER_WIDTH - POPOVER_MARGIN),
  );
  const arrowCenter = rect.left + rect.width / 2 - left;
  const arrowOffset = Math.max(20, Math.min(arrowCenter, POPOVER_WIDTH - 20));
  return {
    top: Math.max(
      POPOVER_MARGIN,
      Math.min(top, vh - POPOVER_HEIGHT_GUESS - POPOVER_MARGIN),
    ),
    left,
    arrow: placeBelow ? "top" : "bottom",
    arrowOffset,
  };
};

const setMaskRects = (root: HTMLElement, rect: DOMRect | null): void => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const top = root.querySelector<HTMLElement>(".degoog-wizard__mask--top");
  const right = root.querySelector<HTMLElement>(".degoog-wizard__mask--right");
  const bottom = root.querySelector<HTMLElement>(
    ".degoog-wizard__mask--bottom",
  );
  const left = root.querySelector<HTMLElement>(".degoog-wizard__mask--left");
  const ring = root.querySelector<HTMLElement>(".degoog-wizard__ring");
  if (!top || !right || !bottom || !left || !ring) return;
  if (!rect) {
    top.style.cssText = `top:0;left:0;width:100vw;height:100vh`;
    right.style.cssText = `display:none`;
    bottom.style.cssText = `display:none`;
    left.style.cssText = `display:none`;
    ring.style.display = "none";
    return;
  }
  const r = 6;
  const x = rect.left;
  const y = rect.top;
  const w = rect.width;
  const h = rect.height;
  top.style.cssText = `top:0;left:0;width:100vw;height:${Math.max(0, y - r)}px`;
  bottom.style.cssText = `top:${y + h + r}px;left:0;width:100vw;height:${Math.max(0, vh - (y + h + r))}px`;
  left.style.cssText = `top:${Math.max(0, y - r)}px;left:0;width:${Math.max(0, x - r)}px;height:${Math.min(vh, h + r * 2)}px`;
  right.style.cssText = `top:${Math.max(0, y - r)}px;left:${x + w + r}px;width:${Math.max(0, vw - (x + w + r))}px;height:${Math.min(vh, h + r * 2)}px`;
  ring.style.cssText = `top:${y - r}px;left:${x - r}px;width:${w + r * 2}px;height:${h + r * 2}px;display:block`;
};

const placePopover = (root: HTMLElement, rect: DOMRect | null): void => {
  const pop = root.querySelector<HTMLElement>(".degoog-wizard__popover");
  if (!pop) return;
  const placement = computePlacement(
    rect,
    window.innerWidth,
    window.innerHeight,
  );
  pop.style.top = `${placement.top}px`;
  pop.style.left = `${placement.left}px`;
  pop.dataset.arrow = placement.arrow;
  pop.style.setProperty("--arrow-offset", `${placement.arrowOffset}px`);
};

const ensureInView = async (el: Element): Promise<void> => {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  if (r.top >= SCROLL_PADDING && r.bottom <= vh - SCROLL_PADDING) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  await new Promise((resolve) => setTimeout(resolve, 350));
};

const runTour = async (
  steps: readonly WizardStep[],
  onFinish: () => void,
): Promise<void> => {
  if (active) return;
  active = true;
  document.documentElement.classList.add("degoog-wizard-open");
  const root = buildRoot();
  document.body.appendChild(root);

  let index = 0;
  let target: Element | null = null;

  const skipBtn = root.querySelector<HTMLButtonElement>(".degoog-wizard__skip");
  const backBtn = root.querySelector<HTMLButtonElement>(".degoog-wizard__back");
  const nextBtn = root.querySelector<HTMLButtonElement>(".degoog-wizard__next");
  const titleEl = root.querySelector<HTMLElement>(".degoog-wizard__title");
  const bodyEl = root.querySelector<HTMLElement>(".degoog-wizard__body");
  const progressEl = root.querySelector<HTMLElement>(
    ".degoog-wizard__progress",
  );
  if (skipBtn) skipBtn.textContent = t("settings-page.wizard.skip");

  const teardown = (): void => {
    window.removeEventListener("resize", reposition);
    window.removeEventListener("scroll", reposition, true);
    root.remove();
    document.documentElement.classList.remove("degoog-wizard-open");
    active = false;
    onFinish();
  };

  const reposition = (): void => {
    const rect = target ? target.getBoundingClientRect() : null;
    setMaskRects(root, rect);
    placePopover(root, rect);
  };

  const render = async (): Promise<void> => {
    const step = steps[index];
    if (!step) return teardown();
    if (step.tab) switchSettingsTab(step.tab, false);
    target = step.selector ? await waitFor(step.selector) : null;
    if (step.onEnter) await step.onEnter();
    if (target) await ensureInView(target);
    if (titleEl) titleEl.textContent = t(step.titleKey);
    if (bodyEl) bodyEl.textContent = t(step.bodyKey);
    if (progressEl)
      progressEl.textContent = t("settings-page.wizard.progress")
        .replace("{current}", String(index + 1))
        .replace("{total}", String(steps.length));
    if (backBtn) {
      backBtn.textContent = t("settings-page.wizard.back");
      backBtn.style.display = index === 0 ? "none" : "";
    }
    if (nextBtn) {
      nextBtn.textContent =
        index === steps.length - 1
          ? t("settings-page.wizard.done")
          : t("settings-page.wizard.next");
    }
    reposition();
    requestAnimationFrame(() => nextBtn?.focus());
  };

  skipBtn?.addEventListener("click", teardown);
  backBtn?.addEventListener("click", () => {
    if (index > 0) {
      index--;
      void render();
    }
  });
  nextBtn?.addEventListener("click", () => {
    const step = steps[index];
    const href = step?.navigateOnNext?.();
    if (href) {
      onFinish();
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      root.remove();
      document.documentElement.classList.remove("degoog-wizard-open");
      active = false;
      window.location.href = href;
      return;
    }
    if (index >= steps.length - 1) return teardown();
    index++;
    void render();
  });

  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, true);

  await render();
};

export const initHomeWizard = async (): Promise<void> => {
  if (active) return;
  if (!document.getElementById("search-input")) return;
  if (localStorage.getItem(HOME_DONE_KEY) === "true") return;
  const done = await fetchWizardDone();
  if (done) return;
  await runTour(HOME_STEPS, () => {
    localStorage.setItem(HOME_DONE_KEY, "true");
  });
};

export const restartWizard = (): void => {
  if (active) return;
  localStorage.removeItem(HOME_DONE_KEY);
  void patchServerWizard(false).finally(() => {
    window.location.href = `${getBase()}/`;
  });
};

export const initSettingsWizard = async (): Promise<void> => {
  if (active) return;
  const done = await fetchWizardDone();
  if (done) return;
  void runTour(SETTINGS_STEPS, () => {
    localStorage.removeItem(HOME_DONE_KEY);
    void markServerDone();
  });
};
