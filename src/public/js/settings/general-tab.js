import { idbGet, idbSet } from "../db.js";
import { SETTINGS_KEY, THEME_KEY } from "../constants.js";
import { applyTheme } from "../theme.js";
import { requestInstallPrompt } from "../installPrompt.js";

function authHeaders(getToken) {
  const token = getToken ? getToken() : null;
  return token ? { "x-settings-token": token } : {};
}

export async function initGeneralTab(getToken) {
  const themeSelect = document.getElementById("theme-select");
  if (themeSelect) {
    const saved = await idbGet(THEME_KEY);
    themeSelect.value = saved || "system";
  }

  const proxyEnabled = document.getElementById("settings-proxy-enabled");
  const proxyUrlsWrap = document.getElementById("settings-proxy-urls-wrap");
  const proxyUrls = document.getElementById("settings-proxy-urls");
  if (proxyEnabled && proxyUrlsWrap && proxyUrls) {
    try {
      const res = await fetch("/api/settings/general", { headers: authHeaders(getToken) });
      if (res.ok) {
        const data = await res.json();
        proxyEnabled.checked = data.proxyEnabled === "true";
        proxyUrls.value = data.proxyUrls ?? "";
        proxyUrlsWrap.style.display = proxyEnabled.checked ? "block" : "none";
      }
    } catch (_) {}
    proxyEnabled.addEventListener("change", () => {
      proxyUrlsWrap.style.display = proxyEnabled.checked ? "block" : "none";
    });
  }

  document.getElementById("settings-save").addEventListener("click", async () => {
    if (themeSelect) {
      await idbSet(THEME_KEY, themeSelect.value);
      applyTheme(themeSelect.value);
    }
    if (proxyEnabled && proxyUrls) {
      try {
        await fetch("/api/settings/general", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders(getToken) },
          body: JSON.stringify({
            proxyEnabled: proxyEnabled.checked ? "true" : "false",
            proxyUrls: proxyUrls.value.trim(),
          }),
        });
      } catch (_) {}
    }
    const btn = document.getElementById("settings-save");
    const prev = btn.textContent;
    btn.textContent = "Saved";
    setTimeout(() => { btn.textContent = prev; }, 1200);
  });

  document.getElementById("settings-cache-clear").addEventListener("click", async () => {
    const btn = document.getElementById("settings-cache-clear");
    try {
      await fetch("/api/cache/clear", { method: "POST" });
      const prev = btn.textContent;
      btn.textContent = "Cleared";
      setTimeout(() => { btn.textContent = prev; }, 1500);
    } catch {
      btn.textContent = "Failed";
    }
  });

  const installPromptBtn = document.getElementById("settings-install-prompt");
  if (installPromptBtn) {
    installPromptBtn.addEventListener("click", () => requestInstallPrompt());
  }
}
