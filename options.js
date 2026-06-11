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
const unsaveOnRemoveToggle = document.getElementById("unsave-on-remove-toggle");

const savedList = document.getElementById("saved-list");
const savedEmptyState = document.getElementById("saved-empty-state");
const savedCountEl = document.getElementById("saved-count");
const sortSelect = document.getElementById("sort-select");
const filterSiteSelect = document.getElementById("filter-site-select");
const filterTypeSelect = document.getElementById("filter-type-select");

const toreadSectionsEl = document.getElementById("toread-sections");
const toreadEmptyState = document.getElementById("toread-empty-state");
const toreadBadge = document.getElementById("toread-badge");
const openListArea = document.getElementById("open-list-area");
const openListPickerEl = document.getElementById("open-list-picker");
const openListBtn = document.getElementById("open-list-btn");

let savedEntries = [];
let unblockCooldown = true;
let unsaveOnReadlistRemove = false;

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
  ["pastdue", "Past due"],
  ["week", "Within one week"],
  ["month", "Within one month"],
  ["later", "One month+"],
  ["backlog", "Backlog"],
];

// Roller options for a row that already has a deadline: roll it forward by a
// fixed amount, leave it (—), or drop the deadline entirely.
function adjustDeadlineOptions(entry) {
  return [
    { label: "—", variant: "noop" },
    { label: "+1 day", run: () => applyRollerDays(entry.url, 1) },
    { label: "+3 days", run: () => applyRollerDays(entry.url, 3) },
    { label: "+7 days", run: () => applyRollerDays(entry.url, 7) },
    { label: "+30 days", run: () => applyRollerDays(entry.url, 30) },
    { label: "Remove deadline", variant: "remove", run: () => removeDeadline(entry.url) },
  ];
}

// Roller options for a Backlog row (no deadline yet): the Add-to-readlist
// options minus "No deadline".
const ADD_DEADLINE_OPTIONS = ["Tomorrow", "3 days", "7 days", "30 days", "3 months"];

function addDeadlineOptions(entry) {
  return ADD_DEADLINE_OPTIONS.map((option) => ({
    label: option,
    run: () => setPageDeadline(entry.url, option),
  }));
}

// URLs present in the previous render — rows already on screen must not
// replay the entry animation when the list is rebuilt.
let renderedToReadUrls = new Set();

// Section collapse state, preserved across re-renders. Backlog starts collapsed.
let collapsedSections = new Set(["backlog"]);

const CHEVRON_SVG = `<svg class="collapse-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`;

const CLOCK_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>`;

// A collapsible section shell matching the Blocked list pattern. The caller
// fills the inner `.toread-list`.
function buildToReadSection(key, label, count) {
  const section = document.createElement("section");
  section.className = `toread-section toread-section--${key} list-section`;
  section.dataset.sectionKey = key;

  const header = document.createElement("h2");
  header.className = "toread-section-header list-section-toggle";
  header.setAttribute("role", "button");

  const headerLabel = document.createElement("span");
  headerLabel.textContent = label;
  const headerCount = document.createElement("span");
  headerCount.className = "count count--blue";
  headerCount.textContent = count;
  const chevronWrap = document.createElement("span");
  chevronWrap.innerHTML = CHEVRON_SVG;
  header.append(headerLabel, headerCount, chevronWrap.firstElementChild);

  const body = document.createElement("div");
  body.className = "collapsible-body";
  const ul = document.createElement("ul");
  ul.className = "toread-list";
  body.appendChild(ul);

  section.append(header, body);

  const toggle = () => {
    // An empty section has no content to reveal — its chevron stays collapsed
    // and the toggle is inert.
    if (section.classList.contains("toread-section--empty")) return;
    section.classList.toggle("collapsed");
    if (section.classList.contains("collapsed")) collapsedSections.add(key);
    else collapsedSections.delete(key);
  };
  header.addEventListener("click", toggle);
  header.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  });

  syncSectionState(section, count);
  return section;
}

// Reflect a section's collapsed/empty state for the given row count. An empty
// section is forced collapsed (chevron points right) and made non-interactive;
// a populated one restores its tracked collapse state and keyboard focus.
function syncSectionState(section, count) {
  const header = section.querySelector(".toread-section-header");
  const key = section.dataset.sectionKey;
  if (count === 0) {
    section.classList.add("toread-section--empty", "collapsed");
    header.setAttribute("aria-disabled", "true");
    header.removeAttribute("tabindex");
  } else {
    section.classList.remove("toread-section--empty");
    header.removeAttribute("aria-disabled");
    header.tabIndex = 0;
    section.classList.toggle("collapsed", collapsedSections.has(key));
  }
}

function renderToReadList(entries) {
  if (!toreadSectionsEl) return;

  const deadlinedCount = entries.filter((p) => p.readBy != null).length;
  const previousUrls = renderedToReadUrls;
  renderedToReadUrls = new Set(entries.map((p) => p.url));

  updateToReadChrome(deadlinedCount, entries.length);
  toreadSectionsEl.textContent = "";

  // Nothing saved at all — leave the empty state to carry the message.
  if (entries.length === 0) return;

  // Every section is always shown so the buckets stay legible even when empty.
  for (const [key, label] of TOREAD_SECTIONS) {
    const items = entries
      .filter((p) => getDeadlineSection(p.readBy) === key)
      .sort((a, b) => key === "backlog" ? b.savedAt - a.savedAt : a.readBy - b.readBy);

    const section = buildToReadSection(key, label, items.length);
    const ul = section.querySelector(".toread-list");
    for (const entry of items) {
      ul.appendChild(buildToReadItem(entry, key, !previousUrls.has(entry.url)));
    }
    toreadSectionsEl.appendChild(section);
  }
}

// Badge and Open List track deadlined items only; empty state tracks all items
function updateToReadChrome(deadlinedCount, totalCount) {
  if (toreadBadge) {
    toreadBadge.textContent = totalCount;
    toreadBadge.classList.toggle("hidden", totalCount === 0);
  }
  toreadEmptyState.style.display = totalCount === 0 ? "block" : "none";
  if (openListArea) {
    openListArea.classList.toggle("hidden", deadlinedCount === 0);
    if (deadlinedCount === 0) closeOpenListPicker();
  }
}

function updateSectionCount(section) {
  const n = section.querySelectorAll(".toread-entry").length;
  section.querySelector(".toread-section-header .count").textContent = n;
  syncSectionState(section, n);
}

// Remove a single row in place — never rebuild the list for a removal, the
// full re-render repaints every surviving row and reads as a screen flash.
// Sections are kept even when empty (they are always shown); only when the
// list is now fully empty do we clear them so the empty state can take over.
function removeToReadRow(url) {
  if (!toreadSectionsEl) return;
  renderedToReadUrls.delete(url);

  const row = [...toreadSectionsEl.querySelectorAll(".toread-entry")]
    .find((el) => el.dataset.url === url);
  if (row) {
    const section = row.closest(".toread-section");
    row.remove();
    updateSectionCount(section);
  }

  if (savedEntries.length === 0) toreadSectionsEl.textContent = "";

  const deadlined = savedEntries.filter((p) => p.readBy != null).length;
  updateToReadChrome(deadlined, savedEntries.length);
}

// Insert a freshly de-deadlined row into the Backlog section in savedAt-desc
// order, animating it in — the surgical counterpart of a move to Backlog.
function addBacklogRow(entry) {
  if (!toreadSectionsEl) return;
  renderedToReadUrls.add(entry.url);

  const section = toreadSectionsEl.querySelector(".toread-section--backlog");
  if (!section) return;

  const ul = section.querySelector(".toread-list");
  const row = buildToReadItem(entry, "backlog", true);
  const before = [...ul.querySelectorAll(".toread-entry")]
    .find((el) => Number(el.dataset.savedAt) < entry.savedAt);
  ul.insertBefore(row, before || null);
  updateSectionCount(section);
}

function buildToReadItem(entry, sectionKey, isNew) {
  const li = document.createElement("li");
  li.className = isNew ? "toread-entry toread-entry--entering" : "toread-entry";
  li.dataset.url = entry.url;
  li.dataset.savedAt = entry.savedAt;

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
  meta.textContent = `${humaniseSite(entry.site)} · ${entry.pageType} · ${formatDate(entry.savedAt)}`;

  link.appendChild(titleEl);
  link.appendChild(meta);

  if (sectionKey === "pastdue") {
    const days = daysOverdue(entry.readBy);
    const overdueLabel = document.createElement("div");
    overdueLabel.className = "overdue-label";
    overdueLabel.textContent = `${days} ${days === 1 ? "day" : "days"} overdue`;
    link.appendChild(overdueLabel);
  }

  const actions = document.createElement("div");
  actions.className = "toread-actions";

  // Chip shown only for urgent sections; text reflects urgency
  if (sectionKey === "pastdue" || sectionKey === "week") {
    const chip = document.createElement("button");
    chip.className = "deadline-chip";
    chip.title = "Adjust deadline";
    if (sectionKey === "pastdue") {
      chip.textContent = "Snooze";
    } else {
      const daysLeft = Math.ceil((entry.readBy - Date.now()) / (24 * 60 * 60 * 1000));
      chip.textContent = daysLeft <= 0 ? "Due today" : `Due in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`;
    }
    chip.addEventListener("click", () => openRollingPicker(chip, adjustDeadlineOptions(entry)));
    actions.appendChild(chip);
  }

  // ✓ Mark read: not shown for Backlog (nothing to demote)
  if (sectionKey !== "backlog") {
    const markReadBtn = document.createElement("button");
    markReadBtn.className = "mark-read-btn";
    markReadBtn.title = "Mark read";
    markReadBtn.textContent = "✓";
    markReadBtn.addEventListener("click", async () => {
      await animateRowOut(li);
      markPageRead(entry.url);
    });
    actions.appendChild(markReadBtn);
  }

  // 🕐 Add deadline: only for Backlog rows — promotes the page onto the list
  if (sectionKey === "backlog") {
    const addDeadlineBtn = document.createElement("button");
    addDeadlineBtn.className = "add-deadline-btn";
    addDeadlineBtn.title = "Add deadline";
    addDeadlineBtn.innerHTML = CLOCK_SVG;
    addDeadlineBtn.addEventListener("click", () =>
      openRollingPicker(addDeadlineBtn, addDeadlineOptions(entry))
    );
    actions.appendChild(addDeadlineBtn);
  }

  const removeBtn = document.createElement("button");
  removeBtn.className = "remove-btn";
  removeBtn.title = "Remove";
  removeBtn.textContent = "×";
  removeBtn.addEventListener("click", async () => {
    await animateRowOut(li);
    if (sectionKey === "backlog") {
      removeSavedPage(entry.url);
    } else {
      removeFromReadlist(entry.url);
    }
  });
  actions.appendChild(removeBtn);

  li.appendChild(faviconWrap);
  li.appendChild(link);
  li.appendChild(actions);
  return li;
}

// Collapse the row out before mutating storage, so the re-render doesn't
// cut the animation short (storage.onChanged re-renders immediately).
function animateRowOut(li) {
  return new Promise((resolve) => {
    li.style.height = `${li.offsetHeight}px`;
    void li.offsetHeight;
    li.classList.add("toread-entry--leaving");
    li.addEventListener("transitionend", () => resolve(), { once: true });
    setTimeout(resolve, 300); // fallback when transitions don't run (e.g. jsdom)
  });
}

let activeRoller = null;
let activeChip = null;
let activeRollerCloseHandler = null;

// Fade/scale the roller out, then drop it from the DOM. transitionend drives
// removal in the browser; the timeout is a fallback for jsdom and interrupted
// transitions. Pass animate=false to remove instantly (e.g. when one picker
// replaces another, so the two never overlap on screen).
function dismissRoller(roller, animate) {
  if (!animate) {
    roller.remove();
    return;
  }
  roller.classList.remove("deadline-roller--open");
  const done = () => roller.remove();
  roller.addEventListener("transitionend", done, { once: true });
  setTimeout(done, 200);
}

function closeRollingPicker(animate = true) {
  if (activeRoller) {
    dismissRoller(activeRoller, animate);
    activeRoller = null;
    activeChip = null;
  }
  if (activeRollerCloseHandler) {
    document.removeEventListener("click", activeRollerCloseHandler, true);
    activeRollerCloseHandler = null;
  }
}

function openRollingPicker(anchor, options) {
  // Tapping the same anchor again toggles the picker closed
  if (activeChip === anchor) {
    closeRollingPicker();
    return;
  }
  closeRollingPicker(false);

  const roller = document.createElement("div");
  roller.className = "deadline-roller";

  const rect = anchor.getBoundingClientRect();
  roller.style.top = `${rect.bottom + 4 + window.scrollY}px`;
  roller.style.left = `${rect.left + window.scrollX}px`;

  for (const opt of options) {
    const btn = document.createElement("button");
    btn.className = "deadline-roller-option";
    if (opt.variant === "noop") btn.classList.add("deadline-roller-option--noop");
    if (opt.variant === "remove") btn.classList.add("deadline-roller-option--remove");
    btn.textContent = opt.label;
    btn.addEventListener("click", () => {
      closeRollingPicker();
      opt.run?.();
    });
    roller.appendChild(btn);
  }

  document.body.appendChild(roller);
  // Force a reflow so the starting (hidden) state is committed before we add
  // the open class — otherwise the browser skips straight to the end state.
  void roller.offsetWidth;
  roller.classList.add("deadline-roller--open");
  activeRoller = roller;
  activeChip = anchor;

  const onOutside = (e) => {
    // anchor.contains covers anchors that wrap inner nodes (e.g. an SVG icon),
    // so a second tap on the trigger reaches the toggle instead of being
    // treated as an outside click that immediately reopens the picker.
    if (!roller.contains(e.target) && !anchor.contains(e.target)) {
      closeRollingPicker();
    }
  };
  activeRollerCloseHandler = onOutside;
  // Use capture so the handler runs before any other click handlers
  setTimeout(() => document.addEventListener("click", onOutside, true), 0);
}

async function applyRollerDays(url, days) {
  const readBy = Date.now() + days * 24 * 60 * 60 * 1000;
  savedEntries = savedEntries.map((p) => (p.url === url ? { ...p, readBy } : p));
  await chrome.storage.sync.set({ [SAVED_KEY]: savedEntries });
  renderToReadList(savedEntries);
  renderSavedList(savedEntries);
}

async function removeDeadline(url) {
  savedEntries = savedEntries.map((p) => {
    if (p.url !== url) return p;
    const { readBy, ...rest } = p;
    return rest;
  });
  await chrome.storage.sync.set({ [SAVED_KEY]: savedEntries });
  renderToReadList(savedEntries);
  renderSavedList(savedEntries);
}

function openOpenListPicker() {
  const toread = savedEntries
    .filter((p) => p.readBy != null)
    .sort((a, b) => a.readBy - b.readBy);
  const imminent = new Set(computeImminentSet(toread).map((p) => p.url));

  openListPickerEl.textContent = "";

  const list = document.createElement("ul");
  list.className = "open-list-choices";
  for (const entry of toread) {
    const li = document.createElement("li");
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = entry.url;
    checkbox.checked = imminent.has(entry.url);
    checkbox.addEventListener("change", updateOpenSelectedLabel);
    const title = document.createElement("span");
    title.textContent = entry.title || humaniseSite(entry.site);
    label.appendChild(checkbox);
    label.appendChild(title);
    li.appendChild(label);
    list.appendChild(li);
  }
  openListPickerEl.appendChild(list);

  const row = document.createElement("div");
  row.className = "open-list-confirm-row";

  const confirmBtn = document.createElement("button");
  confirmBtn.id = "open-selected-btn";
  confirmBtn.className = "btn btn-open-list";
  confirmBtn.addEventListener("click", async () => {
    const urls = [...openListPickerEl.querySelectorAll("input:checked")].map((c) => c.value);
    if (urls.length > 0) await chrome.windows.create({ url: urls });
    closeOpenListPicker();
  });

  const cancelLink = document.createElement("button");
  cancelLink.className = "open-list-cancel";
  cancelLink.textContent = "Cancel";
  cancelLink.addEventListener("click", closeOpenListPicker);

  row.appendChild(confirmBtn);
  row.appendChild(cancelLink);
  openListPickerEl.appendChild(row);

  updateOpenSelectedLabel();
  openListPickerEl.classList.remove("hidden");
}

function updateOpenSelectedLabel() {
  const count = openListPickerEl.querySelectorAll("input:checked").length;
  const btn = openListPickerEl.querySelector("#open-selected-btn");
  if (btn) btn.textContent = `Open Selected (${count})`;
}

function closeOpenListPicker() {
  if (!openListPickerEl) return;
  openListPickerEl.textContent = "";
  openListPickerEl.classList.add("hidden");
}

openListBtn?.addEventListener("click", openOpenListPicker);

async function setPageDeadline(url, option) {
  const readBy = deadlineFromOption(option);
  if (readBy == null) return;
  savedEntries = savedEntries.map((p) => (p.url === url ? { ...p, readBy } : p));
  await chrome.storage.sync.set({ [SAVED_KEY]: savedEntries });
  renderToReadList(savedEntries);
  renderSavedList(savedEntries);
}

// Mark read always keeps the page in Saved — it just clears the deadline,
// which moves the row out of its deadline bucket and into Backlog.
async function markPageRead(url) {
  let updatedEntry = null;
  savedEntries = savedEntries.map((p) => {
    if (p.url !== url) return p;
    const { readBy, ...rest } = p;
    updatedEntry = rest;
    return rest;
  });
  await chrome.storage.sync.set({ [SAVED_KEY]: savedEntries });
  removeToReadRow(url);
  if (updatedEntry) addBacklogRow(updatedEntry);
  renderSavedList(savedEntries);
}

// × on a Readlist row: take the page off the read list; the setting decides
// whether it is also deleted from Saved
async function removeFromReadlist(url) {
  if (unsaveOnReadlistRemove) {
    await removeSavedPage(url);
  } else {
    await markPageRead(url);
  }
}

async function removeSavedPage(url) {
  savedEntries = savedEntries.filter((p) => p.url !== url);
  await chrome.storage.sync.set({ [SAVED_KEY]: savedEntries });
  removeToReadRow(url);
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
  const { clearHistory = true, unblockCooldown: cooldown = true, unsaveOnReadlistRemove: unsaveOnRemove = false } =
    await chrome.storage.sync.get(["clearHistory", "unblockCooldown", "unsaveOnReadlistRemove"]);
  clearHistoryToggle.checked = clearHistory;
  unblockCooldownToggle.checked = cooldown;
  unblockCooldown = cooldown;
  if (unsaveOnRemoveToggle) unsaveOnRemoveToggle.checked = unsaveOnRemove;
  unsaveOnReadlistRemove = unsaveOnRemove;
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
    const next = changes[SAVED_KEY].newValue || [];
    // onChanged also fires for this page's own writes; the UI was already
    // updated surgically, and a full re-render here would rebuild every
    // row — a visible flash. Only re-render for external changes.
    if (JSON.stringify(next) !== JSON.stringify(savedEntries)) {
      savedEntries = next;
      renderSavedList(savedEntries);
      renderToReadList(savedEntries);
    }
  }
});

clearHistoryToggle.addEventListener("change", () => {
  chrome.storage.sync.set({ clearHistory: clearHistoryToggle.checked });
});

unsaveOnRemoveToggle?.addEventListener("change", () => {
  unsaveOnReadlistRemove = unsaveOnRemoveToggle.checked;
  chrome.storage.sync.set({ unsaveOnReadlistRemove });
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
