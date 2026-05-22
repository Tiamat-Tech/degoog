export interface WizardStep {
  tab?: string;
  selector?: string;
  titleKey: string;
  bodyKey: string;
  onEnter?: () => void | Promise<void>;
  navigateOnNext?: () => string | null;
}

const setStoreFilter = (value: string): void => {
  const select =
    document.querySelector<HTMLSelectElement>(".store-filter-type");
  if (!select) return;
  if (select.value === value) return;
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
};

const settingsHref = (): string | null => {
  const link = document.getElementById(
    "nav-settings-top",
  ) as HTMLAnchorElement | null;
  if (!link) return null;
  return `${link.pathname}/store`;
};

export const HOME_STEPS: readonly WizardStep[] = [
  {
    titleKey: "settings-page.wizard.welcome-title",
    bodyKey: "settings-page.wizard.welcome-body",
  },
  {
    selector: "#search-input",
    titleKey: "settings-page.wizard.search-title",
    bodyKey: "settings-page.wizard.search-body",
  },
  {
    selector: "#nav-settings-top",
    titleKey: "settings-page.wizard.goto-settings-title",
    bodyKey: "settings-page.wizard.goto-settings-body",
    navigateOnNext: settingsHref,
  },
] as const;

export const SETTINGS_STEPS: readonly WizardStep[] = [
  {
    tab: "store",
    selector: ".store-repos-header .store-btn-add",
    titleKey: "settings-page.wizard.store-repos-title",
    bodyKey: "settings-page.wizard.store-repos-body",
  },
  {
    tab: "store",
    selector: ".store-filter-type",
    titleKey: "settings-page.wizard.store-engines-title",
    bodyKey: "settings-page.wizard.store-engines-body",
    onEnter: () => setStoreFilter("engine"),
  },
  {
    tab: "store",
    selector: ".store-filter-type",
    titleKey: "settings-page.wizard.store-autocomplete-title",
    bodyKey: "settings-page.wizard.store-autocomplete-body",
    onEnter: () => setStoreFilter("autocomplete"),
  },
  {
    tab: "engines",
    selector: '.settings-nav-item[data-tab="engines"]',
    titleKey: "settings-page.wizard.engines-title",
    bodyKey: "settings-page.wizard.engines-body",
  },
  {
    tab: "autocomplete",
    selector: '.settings-nav-item[data-tab="autocomplete"]',
    titleKey: "settings-page.wizard.autocomplete-title",
    bodyKey: "settings-page.wizard.autocomplete-body",
  },
  {
    tab: "themes",
    selector: '.settings-nav-item[data-tab="themes"]',
    titleKey: "settings-page.wizard.themes-title",
    bodyKey: "settings-page.wizard.themes-body",
  },
  {
    tab: "plugins",
    selector: '.settings-nav-item[data-tab="plugins"]',
    titleKey: "settings-page.wizard.plugins-title",
    bodyKey: "settings-page.wizard.plugins-body",
  },
  {
    tab: "server",
    selector: '.settings-nav-item[data-tab="server"]',
    titleKey: "settings-page.wizard.server-title",
    bodyKey: "settings-page.wizard.server-body",
  },
  {
    titleKey: "settings-page.wizard.done-title",
    bodyKey: "settings-page.wizard.done-body",
  },
] as const;
