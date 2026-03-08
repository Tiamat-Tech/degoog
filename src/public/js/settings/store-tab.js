function escapeHtml(str) {
  if (str == null) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function storeHeaders(getToken) {
  const token = getToken();
  return token ? { "Content-Type": "application/json", "x-settings-token": token } : { "Content-Type": "application/json" };
}

const OFFICIAL_REPO_URL = "https://github.com/fccview/fccview-degoog-extensions.git";

function normalizeRepoUrl(url) {
  const t = (url || "").trim();
  return t.endsWith(".git") ? t : t + (t.includes("?") || t.includes("#") ? "" : ".git");
}

function formatRelativeTime(iso) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const s = Math.round((now - d) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} hours ago`;
    return `${Math.floor(s / 86400)} days ago`;
  } catch {
    return "";
  }
}

function renderRepoList(repos, getToken, onRefresh) {
  if (!repos.length) {
    return "<p class=\"store-empty\">No repositories added. Add a git repository URL to browse its plugins, themes, and engines.</p>";
  }
  let html = "<ul class=\"store-repo-list\">";
  for (const repo of repos) {
    const err = repo.error ? `<span class=\"store-repo-error\">${escapeHtml(repo.error)}</span>` : "";
    const isOfficial = normalizeRepoUrl(repo.url) === normalizeRepoUrl(OFFICIAL_REPO_URL);
    const removeBtn = isOfficial
      ? ""
      : `<button class="store-btn store-btn-remove" type="button" data-url="${escapeHtml(repo.url)}">Remove</button>`;
    html += `
      <li class="store-repo-item" data-url="${escapeHtml(repo.url)}">
        <div class="store-repo-url">${escapeHtml(repo.url)}</div>
        <div class="store-repo-meta">
          Last updated: ${escapeHtml(formatRelativeTime(repo.lastFetched))}
          ${err}
        </div>
        <div class="store-repo-actions">
          <button class="store-btn store-btn-refresh" type="button" data-url="${escapeHtml(repo.url)}">Refresh</button>
          ${removeBtn}
        </div>
      </li>`;
  }
  html += "</ul>";
  return html;
}

function screenshotUrl(repoSlug, type, itemSlug, filename, token) {
  const q = token ? `?token=${encodeURIComponent(token)}` : "";
  return `/api/store/screenshots/${encodeURIComponent(repoSlug)}/${encodeURIComponent(type)}/${encodeURIComponent(itemSlug)}/${encodeURIComponent(filename)}${q}`;
}

function renderItemCard(item, getToken) {
  const itemSlug = item.path.split("/").pop();
  const token = getToken();
  const firstUrl = item.screenshots.length ? screenshotUrl(item.repoSlug, item.type, itemSlug, item.screenshots[0], token) : "";
  const thumb = item.screenshots.length
    ? `<img src="${firstUrl}" alt="" class="store-card-thumb" loading="lazy">`
    : `<div class="store-card-thumb store-card-thumb-placeholder"></div>`;
  const hasScreenshots = item.screenshots.length > 0;
  const clickableClass = hasScreenshots ? " store-card-thumb-wrap--clickable" : "";
  const screenshotsData = hasScreenshots
    ? ` data-screenshot-files="${escapeHtml(item.screenshots.join(","))}" data-repo-slug="${escapeHtml(item.repoSlug)}" data-item-type="${escapeHtml(item.type)}" data-item-slug="${escapeHtml(itemSlug)}" data-first-screenshot-url="${escapeHtml(firstUrl)}"`
    : "";
  const thumbA11y = hasScreenshots ? ' role="button" tabindex="0" aria-label="View screenshots"' : "";
  const author = item.author ? (item.author.url ? `<a href="${escapeHtml(item.author.url)}" target="_blank" rel="noopener">${escapeHtml(item.author.name)}</a>` : escapeHtml(item.author.name)) : "";
  const typeLabel = item.type === "plugin" ? "Plugin" : item.type === "theme" ? "Theme" : "Engine";
  const btn = item.installed
    ? `<span class="ext-configured-badge"></span><button class="store-btn store-btn-uninstall" type="button" data-repo-url="${escapeHtml(item.repoUrl)}" data-item-path="${escapeHtml(item.path)}" data-type="${escapeHtml(item.type)}">Uninstall</button>`
    : `<button class="store-btn store-btn-install" type="button" data-repo-url="${escapeHtml(item.repoUrl)}" data-item-path="${escapeHtml(item.path)}" data-type="${escapeHtml(item.type)}">Install</button>`;
  return `
    <div class="store-card" data-repo-url="${escapeHtml(item.repoUrl)}" data-item-path="${escapeHtml(item.path)}" data-type="${escapeHtml(item.type)}">
      <div class="store-card-thumb-wrap${clickableClass}"${screenshotsData}${thumbA11y}>${thumb}</div>
      <div class="store-card-body">
        <div class="store-card-main">
          <div class="store-card-name">${escapeHtml(item.name)}</div>
          <div class="store-card-meta">by ${author || "—"} · ${escapeHtml(item.repoName)}</div>
          <div class="store-card-desc">${escapeHtml(item.description || "")}</div>
          <div class="store-card-version">v${escapeHtml(item.version)}</div>
        </div>
        <div class="store-card-footer">
          <span class="store-type-badge store-type-${item.type}">${typeLabel}</span>
          <div class="store-card-actions">${btn}</div>
        </div>
      </div>
    </div>`;
}

function filterItems(items, typeFilter, searchQuery) {
  let out = items;
  if (typeFilter && typeFilter !== "all") {
    out = out.filter((i) => i.type === typeFilter);
  }
  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    out = out.filter((i) => (i.name && i.name.toLowerCase().includes(q)) || (i.description && i.description.toLowerCase().includes(q)));
  }
  return out;
}

export async function initStoreTab(container, getToken) {
  if (!container) return;

  let repos = [];
  let items = [];
  let typeFilter = "all";
  let searchQuery = "";

  async function loadRepos() {
    const res = await fetch("/api/store/repos", { headers: storeHeaders(getToken) });
    if (!res.ok) return;
    const data = await res.json();
    repos = data.repos || [];
  }

  async function loadItems() {
    const res = await fetch("/api/store/items", { headers: storeHeaders(getToken) });
    if (!res.ok) return;
    const data = await res.json();
    items = data.items || [];
  }

  async function render() {
    const repoSection = container.querySelector(".store-repos-section");
    if (repoSection) {
      const listEl = repoSection.querySelector(".store-repo-list-wrap");
      if (listEl) listEl.innerHTML = renderRepoList(repos, getToken, render);
    }
    const catalogSection = container.querySelector(".store-catalog-section");
    if (catalogSection) {
      const filtered = filterItems(items, typeFilter, searchQuery);
      const grid = catalogSection.querySelector(".store-catalog-grid");
      if (grid) {
        grid.innerHTML = filtered.map((item) => renderItemCard(item, getToken)).join("");
        grid.querySelectorAll(".store-btn-install").forEach((btn) => {
          btn.addEventListener("click", () => handleInstall(btn));
        });
        grid.querySelectorAll(".store-btn-uninstall").forEach((btn) => {
          btn.addEventListener("click", () => handleUninstall(btn));
        });
      }
    }
  }

  function showError(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.classList.add("store-error-visible");
    setTimeout(() => el.classList.remove("store-error-visible"), 4000);
  }

  async function handleAddRepo(inputEl, addBtn, errorEl) {
    const url = inputEl?.value?.trim();
    if (!url) return;
    addBtn.disabled = true;
    errorEl.textContent = "";
    try {
      const res = await fetch("/api/store/repos", {
        method: "POST",
        headers: storeHeaders(getToken),
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError(errorEl, data.error || "Failed to add repository");
        return;
      }
      inputEl.value = "";
      await loadRepos();
      await loadItems();
      render();
    } catch (e) {
      showError(errorEl, "Network error");
    } finally {
      addBtn.disabled = false;
    }
  }

  async function handleRefresh(url) {
    const res = await fetch("/api/store/repos/refresh", {
      method: "POST",
      headers: storeHeaders(getToken),
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return;
    await loadRepos();
    await loadItems();
    render();
  }

  async function handleRemove(url) {
    const fromRepo = repos.find((r) => r.url === url);
    if (!fromRepo) return;
    const res = await fetch("/api/store/repos", {
      method: "DELETE",
      headers: storeHeaders(getToken),
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Failed to remove repository");
      return;
    }
    await loadRepos();
    await loadItems();
    render();
  }

  function handleInstall(btn) {
    const repoUrl = btn.dataset.repoUrl;
    const itemPath = btn.dataset.itemPath;
    const type = btn.dataset.type;
    if (type === "plugin" && !confirm("This plugin will run code on your server. Only install from sources you trust. Continue?")) return;
    btn.disabled = true;
    fetch("/api/store/install", {
      method: "POST",
      headers: storeHeaders(getToken),
      body: JSON.stringify({ repoUrl, itemPath, type }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) alert(data.error || "Install failed");
        else { await loadItems(); render(); }
      })
      .catch(() => alert("Network error"))
      .finally(() => { btn.disabled = false; });
  }

  function handleUninstall(btn) {
    const repoUrl = btn.dataset.repoUrl;
    const itemPath = btn.dataset.itemPath;
    const type = btn.dataset.type;
    if (!confirm(`Uninstall this ${type}?`)) return;
    btn.disabled = true;
    fetch("/api/store/uninstall", {
      method: "POST",
      headers: storeHeaders(getToken),
      body: JSON.stringify({ repoUrl, itemPath, type }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) alert(data.error || "Uninstall failed");
        else { await loadItems(); render(); }
      })
      .catch(() => alert("Network error"))
      .finally(() => { btn.disabled = false; });
  }

  container.innerHTML = `
    <section class="store-repos-section settings-section">
      <div class="store-repos-header">
        <h2 class="settings-section-heading">Repositories</h2>
        <button class="store-btn store-btn-add" type="button">Add</button>
      </div>
      <div class="store-add-repo-wrap" style="display:none">
        <input type="text" class="store-input-url" placeholder="https://github.com/user/repo.git">
        <button class="store-btn store-btn-add-confirm" type="button">Add repository</button>
        <span class="store-inline-error"></span>
      </div>
      <p class="settings-desc">Add a git repository URL to browse and install plugins, themes, and engines from it.</p>
      <div class="store-repo-list-wrap"></div>
      <div class="store-repos-actions">
        <button class="store-btn store-btn-refresh-all" type="button">Refresh All</button>
      </div>
    </section>
    <section class="store-catalog-section settings-section">
      <h2 class="settings-section-heading">Store</h2>
      <div class="store-catalog-filters">
        <div class="store-filter-btns">
          <button class="store-filter-btn active" data-filter="all" type="button">All</button>
          <button class="store-filter-btn" data-filter="plugin" type="button">Plugins</button>
          <button class="store-filter-btn" data-filter="theme" type="button">Themes</button>
          <button class="store-filter-btn" data-filter="engine" type="button">Engines</button>
        </div>
        <input type="text" class="store-search-input" placeholder="Search…">
      </div>
      <div class="store-catalog-grid"></div>
    </section>
    <div class="store-lightbox" id="store-lightbox" aria-hidden="true" role="dialog" aria-modal="true" aria-label="Screenshot gallery">
      <div class="store-lightbox-backdrop"></div>
      <button class="store-lightbox-close" type="button" aria-label="Close">&times;</button>
      <button class="store-lightbox-prev" type="button" aria-label="Previous">&larr;</button>
      <div class="store-lightbox-img-wrap">
        <img class="store-lightbox-img" src="" alt="">
      </div>
      <button class="store-lightbox-next" type="button" aria-label="Next">&rarr;</button>
      <div class="store-lightbox-counter"></div>
    </div>`;

  let lightboxUrls = [];
  let lightboxIndex = 0;

  function openLightbox(wrap) {
    let urls = [];
    const rawFiles = wrap.dataset.screenshotFiles;
    if (rawFiles && rawFiles.trim()) {
      const files = rawFiles.split(",").map((f) => f.trim()).filter(Boolean);
      if (files.length > 0) {
        const repoSlug = wrap.dataset.repoSlug;
        const type = wrap.dataset.itemType;
        const itemSlug = wrap.dataset.itemSlug;
        const token = getToken();
        urls = files.map((f) => screenshotUrl(repoSlug, type, itemSlug, f, token));
      }
    }
    if (urls.length === 0 && wrap.dataset.firstScreenshotUrl) {
      urls = [wrap.dataset.firstScreenshotUrl];
    }
    if (!urls.length) return;
    lightboxUrls = urls;
    lightboxIndex = 0;
    const lb = container.querySelector("#store-lightbox");
    const img = lb.querySelector(".store-lightbox-img");
    const counter = lb.querySelector(".store-lightbox-counter");
    const prevBtn = lb.querySelector(".store-lightbox-prev");
    const nextBtn = lb.querySelector(".store-lightbox-next");
    function showSlide() {
      img.src = lightboxUrls[lightboxIndex] || "";
      counter.textContent = lightboxUrls.length > 1 ? `${lightboxIndex + 1} / ${lightboxUrls.length}` : "";
      prevBtn.style.visibility = lightboxUrls.length > 1 ? "visible" : "hidden";
      nextBtn.style.visibility = lightboxUrls.length > 1 ? "visible" : "hidden";
    }
    function onKey(e) {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") { lightboxIndex = (lightboxIndex - 1 + lightboxUrls.length) % lightboxUrls.length; showSlide(); }
      if (e.key === "ArrowRight") { lightboxIndex = (lightboxIndex + 1) % lightboxUrls.length; showSlide(); }
    }
    function closeLightbox() {
      lb.classList.remove("store-lightbox--open");
      lb.setAttribute("aria-hidden", "true");
      document.removeEventListener("keydown", onKey);
    }
    lb.classList.add("store-lightbox--open");
    lb.setAttribute("aria-hidden", "false");
    showSlide();
    document.addEventListener("keydown", onKey);
    lb.querySelector(".store-lightbox-close").onclick = closeLightbox;
    lb.querySelector(".store-lightbox-backdrop").onclick = closeLightbox;
    prevBtn.onclick = () => { lightboxIndex = (lightboxIndex - 1 + lightboxUrls.length) % lightboxUrls.length; showSlide(); };
    nextBtn.onclick = () => { lightboxIndex = (lightboxIndex + 1) % lightboxUrls.length; showSlide(); };
  }

  const addWrap = container.querySelector(".store-add-repo-wrap");
  const addBtn = container.querySelector(".store-btn-add");
  const addConfirmBtn = container.querySelector(".store-btn-add-confirm");
  const urlInput = container.querySelector(".store-input-url");
  const addErrorEl = container.querySelector(".store-inline-error");

  addBtn.addEventListener("click", () => {
    addWrap.style.display = addWrap.style.display === "none" ? "block" : "none";
  });
  addConfirmBtn.addEventListener("click", () => handleAddRepo(urlInput, addConfirmBtn, addErrorEl));

  container.querySelector(".store-btn-refresh-all")?.addEventListener("click", async () => {
    const btn = container.querySelector(".store-btn-refresh-all");
    btn.disabled = true;
    try {
      await fetch("/api/store/repos/refresh", { method: "POST", headers: storeHeaders(getToken), body: JSON.stringify({}) });
      await loadRepos();
      await loadItems();
      render();
    } finally {
      btn.disabled = false;
    }
  });

  const grid = container.querySelector(".store-catalog-grid");
  if (grid) {
    grid.addEventListener("click", (e) => {
      const wrap = e.target.closest(".store-card-thumb-wrap");
      if (wrap && (wrap.dataset.screenshotFiles || wrap.dataset.firstScreenshotUrl)) {
        e.preventDefault();
        e.stopPropagation();
        openLightbox(wrap);
        return;
      }
    });
    grid.addEventListener("keydown", (e) => {
      const wrap = e.target.closest(".store-card-thumb-wrap");
      if (wrap && (wrap.dataset.screenshotFiles || wrap.dataset.firstScreenshotUrl) && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        openLightbox(wrap);
      }
    });
  }

  container.addEventListener("click", (e) => {
    const refreshBtn = e.target.closest(".store-btn-refresh");
    const removeBtn = e.target.closest(".store-btn-remove");
    if (refreshBtn) handleRefresh(refreshBtn.dataset.url);
    if (removeBtn) {
      if (confirm("Remove this repository? You must uninstall any installed items first.")) handleRemove(removeBtn.dataset.url);
    }
  });

  container.querySelectorAll(".store-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".store-filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      typeFilter = btn.dataset.filter || "all";
      render();
    });
  });

  const searchInput = container.querySelector(".store-search-input");
  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value || "";
    render();
  });

  try {
    await loadRepos();
    await loadItems();
    render();
  } catch {
    container.querySelector(".store-repo-list-wrap").innerHTML = "<p class=\"store-empty\">Failed to load store.</p>";
  }
}
