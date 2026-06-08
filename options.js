const STORAGE_KEY = "blockedSites";
const SAVED_KEY = "savedPages";
const LOCK_MS = 7 * 24 * 60 * 60 * 1000;

const urlInput = document.getElementById("url-input");
const addBtn = document.getElementById("add-btn");
const addError = document.getElementById("add-error");
const siteList = document.getElementById("site-list");
const emptyState = document.getElementById("empty-state");
const countEl = document.getElementById("count");
const clearHistoryToggle = document.getElementById("clear-history-toggle");

const savedList = document.getElementById("saved-list");
const savedEmptyState = document.getElementById("saved-empty-state");
const savedCountEl = document.getElementById("saved-count");
const sortSelect = document.getElementById("sort-select");
const filterSiteSelect = document.getElementById("filter-site-select");

let savedEntries = [];

function normalise(raw) {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//i, "");
  s = s.replace(/^www\./i, "");
  s = s.replace(/\/+$/, "");
  return s;
}

function daysLeft(blockedAt) {
  const ms = blockedAt + LOCK_MS - Date.now();
  return ms > 0 ? Math.ceil(ms / (24 * 60 * 60 * 1000)) : 0;
}

function humaniseSite(site) {
  const name = site.split(".")[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function activeTypeFilter() {
  const active = document.querySelector(".chip.chip--active");
  return active ? active.dataset.type : "";
}

function showError(msg) {
  addError.textContent = msg;
  addError.classList.remove("hidden");
}

function clearError() {
  addError.classList.add("hidden");
}

function renderList(entries) {
  siteList.querySelectorAll(".site-entry").forEach((el) => el.remove());

  countEl.textContent = entries.length;
  emptyState.style.display = entries.length === 0 ? "block" : "none";

  for (const entry of entries) {
    const remaining = daysLeft(entry.blockedAt);
    const locked = remaining > 0;

    const li = document.createElement("li");
    li.className = "site-entry";

    const name = document.createElement("span");
    name.className = "site-name";
    name.textContent = entry.site;

    const removeBtn = document.createElement("button");
    removeBtn.className = locked ? "remove-btn remove-btn--locked" : "remove-btn";
    removeBtn.textContent = locked
      ? `${remaining} ${remaining === 1 ? "day" : "days"} left`
      : "Remove";
    removeBtn.disabled = locked;
    if (!locked) {
      removeBtn.addEventListener("click", () => removeSite(entry.site));
    }

    li.appendChild(name);
    li.appendChild(removeBtn);
    siteList.insertBefore(li, emptyState);
  }
}

function renderSavedList(entries) {
  const siteFilter = filterSiteSelect.value;
  const typeFilter = activeTypeFilter();
  const sort = sortSelect.value;

  let filtered = entries;
  if (siteFilter) filtered = filtered.filter((p) => p.site === siteFilter);
  if (typeFilter) filtered = filtered.filter((p) => p.pageType === typeFilter);

  if (sort === "name") {
    filtered = [...filtered].sort((a, b) =>
      (a.title || humaniseSite(a.site)).localeCompare(b.title || humaniseSite(b.site))
    );
  } else {
    filtered = [...filtered].sort((a, b) => b.savedAt - a.savedAt);
  }

  savedList.querySelectorAll(".saved-entry").forEach((el) => el.remove());
  savedCountEl.textContent = filtered.length;

  if (filtered.length === 0) {
    const msg = entries.length === 0 || (!siteFilter && !typeFilter)
      ? "No pages saved yet."
      : "No pages match the current filters.";
    savedEmptyState.textContent = msg;
    savedEmptyState.style.display = "block";
  } else {
    savedEmptyState.style.display = "none";
  }

  for (const entry of filtered) {
    const li = document.createElement("li");
    li.className = "saved-entry";

    const faviconWrap = document.createElement("div");
    faviconWrap.className = "favicon-wrap";
    const img = document.createElement("img");
    img.src = `https://www.google.com/s2/favicons?domain=${entry.site}&sz=32`;
    img.alt = "";
    faviconWrap.appendChild(img);

    const link = document.createElement("a");
    link.className = "saved-link";
    link.href = entry.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    const titleEl = document.createElement("div");
    titleEl.className = "entry-site";
    titleEl.textContent = entry.title || humaniseSite(entry.site);

    const meta = document.createElement("div");
    meta.className = "entry-meta";
    meta.textContent = `${entry.pageType} · ${formatDate(entry.savedAt)}`;

    link.appendChild(titleEl);
    link.appendChild(meta);

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.title = "Remove";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => removeSavedPage(entry.url));

    li.appendChild(faviconWrap);
    li.appendChild(link);
    li.appendChild(removeBtn);
    savedList.insertBefore(li, savedEmptyState);
  }

  // Repopulate site filter, preserving current selection
  const prevSite = filterSiteSelect.value;
  const uniqueSites = [...new Set(entries.map((p) => p.site))].sort();
  while (filterSiteSelect.options.length > 1) filterSiteSelect.remove(1);
  for (const site of uniqueSites) {
    const opt = document.createElement("option");
    opt.value = site;
    opt.textContent = humaniseSite(site);
    filterSiteSelect.appendChild(opt);
  }
  filterSiteSelect.value = prevSite;
}

async function removeSavedPage(url) {
  savedEntries = savedEntries.filter((p) => p.url !== url);
  await chrome.storage.sync.set({ [SAVED_KEY]: savedEntries });
  renderSavedList(savedEntries);
}

async function loadSaved() {
  const { [SAVED_KEY]: entries = [] } = await chrome.storage.sync.get(SAVED_KEY);
  savedEntries = entries;
  renderSavedList(savedEntries);
}

async function load() {
  const { [STORAGE_KEY]: entries = [] } = await chrome.storage.sync.get(STORAGE_KEY);
  renderList(entries);
}

async function addSite() {
  clearError();
  const raw = urlInput.value;
  const site = normalise(raw);

  if (!site) {
    showError("Please enter a URL.");
    return;
  }

  if (!/^[a-z0-9.-]/.test(site)) {
    showError("Invalid URL format.");
    return;
  }

  const { [STORAGE_KEY]: entries = [] } = await chrome.storage.sync.get(STORAGE_KEY);

  if (entries.some((e) => e.site === site)) {
    showError(`${site} is already in the block list.`);
    return;
  }

  const updated = [...entries, { site, blockedAt: Date.now() }];
  await chrome.storage.sync.set({ [STORAGE_KEY]: updated });
  urlInput.value = "";
  renderList(updated);
}

async function removeSite(site) {
  const { [STORAGE_KEY]: entries = [] } = await chrome.storage.sync.get(STORAGE_KEY);
  const updated = entries.filter((e) => e.site !== site);
  await chrome.storage.sync.set({ [STORAGE_KEY]: updated });
  renderList(updated);
}

async function loadSettings() {
  const { clearHistory = true } = await chrome.storage.sync.get("clearHistory");
  clearHistoryToggle.checked = clearHistory;
}

// Tab switching
document.querySelectorAll(".seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".seg-btn").forEach((b) =>
      b.classList.toggle("seg-btn--active", b === btn)
    );
    document.querySelectorAll(".tab-panel").forEach((panel) =>
      panel.classList.toggle("hidden", panel.id !== `tab-${btn.dataset.tab}`)
    );
  });
});

// Type chip switching
document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("chip--active"));
    chip.classList.add("chip--active");
    renderSavedList(savedEntries);
  });
});

// Sort and site filter
[sortSelect, filterSiteSelect].forEach((el) =>
  el.addEventListener("change", () => renderSavedList(savedEntries))
);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes[STORAGE_KEY]) renderList(changes[STORAGE_KEY].newValue || []);
  if (changes[SAVED_KEY]) {
    savedEntries = changes[SAVED_KEY].newValue || [];
    renderSavedList(savedEntries);
  }
});

clearHistoryToggle.addEventListener("change", () => {
  chrome.storage.sync.set({ clearHistory: clearHistoryToggle.checked });
});

addBtn.addEventListener("click", addSite);
urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addSite();
});

load();
loadSaved();
loadSettings();

if (typeof module !== "undefined") {
  module.exports = { normalise, daysLeft, humaniseSite, renderSavedList, removeSavedPage };
}
