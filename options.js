const STORAGE_KEY = "blockedSites";
const SAVED_KEY = "savedPages";
const LOCK_MS = 7 * 24 * 60 * 60 * 1000;

// In the browser these helpers are globals loaded via <script src="readlist-utils.js">
if (typeof module !== "undefined") {
  Object.assign(globalThis, require("./readlist-utils.js"));
}

const urlInput = document.getElementById("url-input");
const addBtn = document.getElementById("add-btn");
const addError = document.getElementById("add-error");
const siteList = document.getElementById("site-list");
const emptyState = document.getElementById("empty-state");
const countEl = document.getElementById("count");
const clearHistoryToggle = document.getElementById("clear-history-toggle");
const unblockCooldownToggle = document.getElementById("unblock-cooldown-toggle");

const savedList = document.getElementById("saved-list");
const savedEmptyState = document.getElementById("saved-empty-state");
const savedCountEl = document.getElementById("saved-count");
const sortSelect = document.getElementById("sort-select");
const filterSiteSelect = document.getElementById("filter-site-select");
const filterTypeSelect = document.getElementById("filter-type-select");

const toreadSectionsEl = document.getElementById("toread-sections");
const toreadEmptyState = document.getElementById("toread-empty-state");
const toreadBadge = document.getElementById("toread-badge");

let savedEntries = [];
let unblockCooldown = true;

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
  const parts = site.split(".");
  const name = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
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
  return filterTypeSelect ? filterTypeSelect.value : "";
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
    const locked = unblockCooldown && remaining > 0;

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
  } else if (sort === "savedAtAsc") {
    filtered = [...filtered].sort((a, b) => a.savedAt - b.savedAt);
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

// ── TO READ tab ──

const TOREAD_SECTIONS = [
  ["overdue", "Overdue"],
  ["tomorrow", "Tomorrow"],
  ["3days", "3 days"],
  ["7days", "7 days"],
  ["30days", "30 days"],
  ["3months", "3 months"],
];

const DEADLINE_OPTIONS = ["Tomorrow", "3 days", "7 days", "30 days", "3 months"];

function renderToReadList(entries) {
  if (!toreadSectionsEl) return;

  const toread = entries.filter((p) => p.readBy != null);

  if (toreadBadge) {
    toreadBadge.textContent = toread.length;
    toreadBadge.classList.toggle("hidden", toread.length === 0);
  }
  toreadEmptyState.style.display = toread.length === 0 ? "block" : "none";
  toreadSectionsEl.textContent = "";

  for (const [key, label] of TOREAD_SECTIONS) {
    const items = toread
      .filter((p) => getDeadlineSection(p.readBy) === key)
      .sort((a, b) => a.readBy - b.readBy);
    if (items.length === 0) continue;

    const section = document.createElement("section");
    section.className = `toread-section toread-section--${key}`;

    const header = document.createElement("h2");
    header.className = "toread-section-header";
    header.textContent = `${label} (${items.length})`;
    section.appendChild(header);

    const ul = document.createElement("ul");
    ul.className = "toread-list";
    for (const entry of items) ul.appendChild(buildToReadItem(entry, key));
    section.appendChild(ul);

    toreadSectionsEl.appendChild(section);
  }
}

function buildToReadItem(entry, sectionKey) {
  const li = document.createElement("li");
  li.className = "toread-entry";

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
  meta.textContent = `${humaniseSite(entry.site)} · ${entry.pageType} · ${formatDate(entry.readBy)}`;

  link.appendChild(titleEl);
  link.appendChild(meta);

  if (sectionKey === "overdue") {
    const days = daysOverdue(entry.readBy);
    const overdueLabel = document.createElement("div");
    overdueLabel.className = "overdue-label";
    overdueLabel.textContent = `${days} ${days === 1 ? "day" : "days"} overdue`;
    link.appendChild(overdueLabel);
  }

  const actions = document.createElement("div");
  actions.className = "toread-actions";

  const chip = document.createElement("button");
  chip.className = "deadline-chip";
  chip.title = "Change deadline";
  chip.textContent = new Date(entry.readBy).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  chip.addEventListener("click", () => expandDeadlinePills(chip, entry));

  const markReadBtn = document.createElement("button");
  markReadBtn.className = "mark-read-btn";
  markReadBtn.textContent = "Mark read";
  markReadBtn.addEventListener("click", () => markPageRead(entry.url));

  const removeBtn = document.createElement("button");
  removeBtn.className = "remove-btn";
  removeBtn.title = "Remove";
  removeBtn.textContent = "×";
  removeBtn.addEventListener("click", () => removeSavedPage(entry.url));

  actions.appendChild(chip);
  actions.appendChild(markReadBtn);
  actions.appendChild(removeBtn);

  li.appendChild(faviconWrap);
  li.appendChild(link);
  li.appendChild(actions);
  return li;
}

function expandDeadlinePills(chip, entry) {
  const pills = document.createElement("div");
  pills.className = "deadline-pills";

  for (const option of DEADLINE_OPTIONS) {
    const btn = document.createElement("button");
    btn.className = "deadline-pill";
    btn.textContent = option;
    btn.addEventListener("click", () => setPageDeadline(entry.url, option));
    pills.appendChild(btn);
  }

  const cancel = document.createElement("button");
  cancel.className = "deadline-pill deadline-pill--cancel";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => pills.replaceWith(chip));
  pills.appendChild(cancel);

  chip.replaceWith(pills);
}

async function setPageDeadline(url, option) {
  const readBy = deadlineFromOption(option);
  if (readBy == null) return;
  savedEntries = savedEntries.map((p) => (p.url === url ? { ...p, readBy } : p));
  await chrome.storage.sync.set({ [SAVED_KEY]: savedEntries });
  renderToReadList(savedEntries);
  renderSavedList(savedEntries);
}

async function markPageRead(url) {
  savedEntries = savedEntries.map((p) => {
    if (p.url !== url) return p;
    const { readBy, ...rest } = p;
    return rest;
  });
  await chrome.storage.sync.set({ [SAVED_KEY]: savedEntries });
  renderToReadList(savedEntries);
  renderSavedList(savedEntries);
}

async function removeSavedPage(url) {
  savedEntries = savedEntries.filter((p) => p.url !== url);
  await chrome.storage.sync.set({ [SAVED_KEY]: savedEntries });
  renderToReadList(savedEntries);
  renderSavedList(savedEntries);
}

async function loadSaved() {
  const { [SAVED_KEY]: entries = [] } = await chrome.storage.sync.get(SAVED_KEY);
  savedEntries = entries;
  renderSavedList(savedEntries);
  renderToReadList(savedEntries);
  activateTab(savedEntries.some((p) => p.readBy != null) ? "toread" : "saved");
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
  const { clearHistory = true, unblockCooldown: cooldown = true } =
    await chrome.storage.sync.get(["clearHistory", "unblockCooldown"]);
  clearHistoryToggle.checked = clearHistory;
  unblockCooldownToggle.checked = cooldown;
  unblockCooldown = cooldown;
}

// Tab switching
function activateTab(name) {
  document.querySelectorAll(".seg-btn").forEach((b) =>
    b.classList.toggle("seg-btn--active", b.dataset.tab === name)
  );
  document.querySelectorAll(".tab-panel").forEach((panel) =>
    panel.classList.toggle("hidden", panel.id !== `tab-${name}`)
  );
}

document.querySelectorAll(".seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
});

// Filter and sort controls
[sortSelect, filterSiteSelect, filterTypeSelect].forEach((el) =>
  el?.addEventListener("change", () => renderSavedList(savedEntries))
);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes[STORAGE_KEY]) renderList(changes[STORAGE_KEY].newValue || []);
  if (changes[SAVED_KEY]) {
    savedEntries = changes[SAVED_KEY].newValue || [];
    renderSavedList(savedEntries);
    renderToReadList(savedEntries);
  }
});

clearHistoryToggle.addEventListener("change", () => {
  chrome.storage.sync.set({ clearHistory: clearHistoryToggle.checked });
});

unblockCooldownToggle.addEventListener("change", () => {
  unblockCooldown = unblockCooldownToggle.checked;
  chrome.storage.sync.set({ unblockCooldown });
  chrome.storage.sync.get(STORAGE_KEY).then(({ [STORAGE_KEY]: entries = [] }) => {
    renderList(entries);
  });
});

const blockedListSection = document.getElementById("blocked-list-section");
blockedListSection.querySelector(".list-section-toggle").addEventListener("click", () => {
  blockedListSection.classList.toggle("collapsed");
});
blockedListSection.querySelector(".list-section-toggle").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    blockedListSection.classList.toggle("collapsed");
  }
});

addBtn.addEventListener("click", addSite);
urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addSite();
});

loadSettings().then(load);
loadSaved();

if (typeof module !== "undefined") {
  module.exports = {
    normalise,
    daysLeft,
    humaniseSite,
    renderSavedList,
    removeSavedPage,
    renderToReadList,
    setPageDeadline,
    markPageRead,
  };
}
