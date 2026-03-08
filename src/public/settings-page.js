import { initTheme } from "./js/theme.js";
import { initInstallPrompt } from "./js/installPrompt.js";
import { initGeneralTab } from "./js/settings/general-tab.js";
import { initEnginesTab } from "./js/settings/engines-tab.js";
import { initPluginsTab } from "./js/settings/plugins-tab.js";
import { initThemesTab } from "./js/settings/themes-tab.js";
import { initStoreTab } from "./js/settings/store-tab.js";
import "./js/settings/modal.js";

const TOKEN_KEY = "degoog-settings-token";

export function getStoredToken() {
  return sessionStorage.getItem(TOKEN_KEY) || null;
}

async function checkAuth() {
  const token = getStoredToken();
  const headers = token ? { "x-settings-token": token } : {};
  const res = await fetch("/api/settings/auth", { headers });
  return res.json();
}

function showAuthGate() {
  const page = document.querySelector(".settings-page");
  page.innerHTML = `
    <header class="settings-page-header">
      <a href="/" class="settings-page-back">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Back
      </a>
      <h1 class="settings-page-title">Settings</h1>
    </header>
    <div class="settings-auth-gate">
      <div class="settings-auth-gate-inner">
        <p class="settings-auth-desc">Enter the password to access settings.</p>
        <form class="settings-auth-form" id="settings-auth-form" autocomplete="off">
          <input
            class="settings-auth-input"
            type="password"
            id="settings-auth-input"
            placeholder="Password"
            autocomplete="current-password"
            autofocus
          >
          <button class="settings-auth-submit" type="submit">Unlock</button>
        </form>
        <p class="settings-auth-error" id="settings-auth-error"></p>
      </div>
    </div>`;

  document.getElementById("settings-auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = document.getElementById("settings-auth-input").value;
    const errorEl = document.getElementById("settings-auth-error");
    errorEl.textContent = "";
    try {
      const res = await fetch("/api/settings/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.ok && data.token) {
        sessionStorage.setItem(TOKEN_KEY, data.token);
        window.location.reload();
      } else {
        errorEl.textContent = "Incorrect password.";
      }
    } catch {
      errorEl.textContent = "Something went wrong. Please try again.";
    }
  });
}

function switchSettingsTab(value) {
  document.querySelectorAll(".settings-tab-panel").forEach((p) => p.classList.remove("active"));
  document.getElementById(`tab-${value}`)?.classList.add("active");
  document.querySelectorAll(".settings-tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === value);
  });
  const select = document.getElementById("settings-tab-select");
  if (select) select.value = value;
}

function initTabs() {
  const select = document.getElementById("settings-tab-select");
  const nav = document.getElementById("settings-tabs-nav");
  if (select) {
    select.addEventListener("change", () => switchSettingsTab(select.value));
  }
  if (nav) {
    nav.querySelectorAll(".settings-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => switchSettingsTab(btn.dataset.tab ?? "general"));
    });
  }
}

async function initSettings() {
  initTheme();
  initInstallPrompt();
  initTabs();
  initGeneralTab(getStoredToken);

  try {
    const [extRes, themesRes] = await Promise.all([
      fetch("/api/extensions", {
        headers: getStoredToken() ? { "x-settings-token": getStoredToken() } : {},
      }),
      fetch("/api/themes"),
    ]);
    const allExtensions = await extRes.json();
    const themesData = await themesRes.json();
    await initEnginesTab(allExtensions);
    initPluginsTab(allExtensions);
    await initThemesTab(themesData, allExtensions.themes ?? []);
    const storeEl = document.getElementById("store-content");
    if (storeEl) initStoreTab(storeEl, getStoredToken);
  } catch {
    document.getElementById("engines-content").innerHTML = "<p>Failed to load extensions.</p>";
    document.getElementById("plugins-content").innerHTML = "<p>Failed to load extensions.</p>";
    const themesEl = document.getElementById("themes-content");
    if (themesEl) themesEl.innerHTML = "<p>Failed to load themes.</p>";
  }
}

window.addEventListener("extensions-saved", async () => {
  try {
    const res = await fetch("/api/extensions", {
      headers: getStoredToken() ? { "x-settings-token": getStoredToken() } : {},
    });
    const allExtensions = await res.json();
    initPluginsTab(allExtensions);
  } catch (_) {}
});

async function init() {
  initTheme();
  const params = new URLSearchParams(window.location.search);
  const tokenFromUrl = params.get("token");
  if (tokenFromUrl) {
    sessionStorage.setItem(TOKEN_KEY, tokenFromUrl);
    window.history.replaceState({}, "", "/settings");
  }
  const auth = await checkAuth();
  if (auth.required && !auth.valid) {
    if (auth.loginUrl) {
      window.location.href = auth.loginUrl;
      return;
    }
    showAuthGate();
  } else {
    initSettings();
  }
}

init();
