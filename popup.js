const STORAGE_KEY = "blockedSites";
const SAVED_KEY = "savedPages";
const UNDO_WINDOW_MS = 2000;

// In the browser these helpers are globals loaded via <script src="readlist-utils.js">
if (typeof module !== "undefined") {
  Object.assign(globalThis, require("./readlist-utils.js"));
}

const hostnameEl = document.getElementById("hostname");
const pageTitleEl = document.getElementById("page-title");
const faviconEl = document.getElementById("favicon");
const blockBtn = document.getElementById("block-btn");
const saveBtn = document.getElementById("save-btn");
const saveLabelEl = document.getElementById("save-label");
const deadlinePicker = document.getElementById("deadline-picker");
const optionsBtn = document.getElementById("options-btn");
const feedbackEl = document.getElementById("feedback");

let currentHostname = null;
let currentTab = null;
let siteBlocked = false;
let saveState = "save"; // save | undo | readlist | markread | unsave
let undoTimer = null;

const SAVE_BTN_CONTENT = {
  save: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg><span class="btn-label">Save</span>`,
  undo: `<span class="btn-label">Undo</span>`,
  readlist: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span class="btn-label">Readlist</span><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`,
  markread: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg><span class="btn-label">Mark read</span>`,
};

const SECONDARY_BTN_CONTENT = {
  block: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg><span class="btn-label">Block</span>`,
  unsave: `<span class="btn-label">Unsave</span>`,
};

let saveStateInitialised = false;
let secondaryState = "block"; // block | unsave
const ghostTimers = new Map();

// Swap a button's content in place: the old content lives on in an absolutely
// positioned ghost that fades out, then the new content fades in (ease-in-out).
function swapButtonContent(btn, html, animate) {
  clearTimeout(ghostTimers.get(btn));
  btn.querySelector(".btn-ghost")?.remove();
  const previousContent = btn.innerHTML;

  btn.innerHTML = html;
  if (!animate) return;

  const ghost = document.createElement("span");
  ghost.className = "btn-ghost";
  ghost.innerHTML = previousContent;
  btn.appendChild(ghost);
  btn.classList.add("btn-swapping");
  ghostTimers.set(btn, setTimeout(() => {
    ghost.remove();
    btn.classList.remove("btn-swapping");
  }, 320));
}

function setSaveState(state) {
  saveState = state;
  swapButtonContent(saveBtn, SAVE_BTN_CONTENT[state], saveStateInitialised);
  updateSecondaryButton(saveStateInitialised);
  saveStateInitialised = true;
}

// The secondary slot is contextual: Block while the page is not saved
// (disabled during the Undo window so two delete actions never show at once),
// Unsave while it is.
function updateSecondaryButton(animate) {
  const next = saveState === "readlist" || saveState === "markread" ? "unsave" : "block";
  if (next !== secondaryState) {
    swapButtonContent(blockBtn, SECONDARY_BTN_CONTENT[next], animate);
    secondaryState = next;
  }
  blockBtn.classList.toggle("btn-unsave", next === "unsave");

  if (next === "block") {
    if (siteBlocked) {
      blockBtn.querySelector(".btn-label").textContent = "Blocked";
      blockBtn.disabled = true;
    } else {
      blockBtn.disabled = saveState === "undo" || !currentTab;
    }
  } else {
    blockBtn.disabled = false;
  }
}

function showSaveLabel(entry, { crossfade = false } = {}) {
  if (!saveLabelEl) return;
  const { text, colorClass } = formatDueLabel(entry.readBy, entry.savedAt);
  saveLabelEl.textContent = text;
  saveLabelEl.className = `save-label ${colorClass}`;
  if (crossfade) {
    void saveLabelEl.offsetWidth;
    saveLabelEl.classList.add("label-fade");
  }
}

function hideSaveLabel() {
  if (!saveLabelEl) return;
  saveLabelEl.textContent = "";
  saveLabelEl.className = "save-label hidden";
}

function openPicker() {
  deadlinePicker?.classList.add("open");
}

function closePicker() {
  deadlinePicker?.classList.remove("open");
}

function setFavicon(favIconUrl) {
  const wrap = document.getElementById("favicon-wrap");
  if (!wrap || !favIconUrl) return;
  faviconEl.src = favIconUrl;
  faviconEl.onload = () => { wrap.style.display = "block"; };
  faviconEl.onerror = () => { wrap.style.display = "none"; };
}

let feedbackTimer = null;

function showFeedback(msg, type) {
  feedbackEl.textContent = msg;
  feedbackEl.className = `feedback ${type}`;
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    feedbackEl.classList.add("feedback-out");
    feedbackTimer = setTimeout(() => {
      feedbackEl.className = "feedback hidden";
    }, 200);
  }, 2300);
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;

  try {
    const url = new URL(tab.url);
    if (!["http:", "https:"].includes(url.protocol)) return;
    currentTab = tab;
    currentHostname = url.hostname.replace(/^www\./, "");
    hostnameEl.textContent = currentHostname;
    if (pageTitleEl) pageTitleEl.textContent = tab.title || currentHostname;
    setFavicon(tab.favIconUrl || "");
    blockBtn.disabled = false;
    saveBtn.disabled = false;

    const { [STORAGE_KEY]: entries = [], [SAVED_KEY]: savedPages = [] } =
      await chrome.storage.sync.get([STORAGE_KEY, SAVED_KEY]);

    siteBlocked = entries.some((e) => e.site === currentHostname);

    const entry = savedPages.find((p) => p.url === tab.url);
    if (entry) {
      setSaveState(entry.readBy != null ? "markread" : "readlist");
      showSaveLabel(entry);
    } else {
      setSaveState("save");
    }
  } catch {
    // non-navigable tab
  }
}

async function handleSave() {
  let pageType = "article";
  try {
    await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      files: ["pageTypeDetector.js"],
    });
    [{ result: pageType }] = await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: () => detectPageType(window.location.href, document),
    });
  } catch { /* leave pageType as 'article' */ }

  const newEntry = {
    url: currentTab.url,
    site: currentHostname,
    pageType,
    savedAt: Date.now(),
    title: currentTab.title || currentHostname,
  };
  const { [SAVED_KEY]: saved = [] } = await chrome.storage.sync.get(SAVED_KEY);
  await chrome.storage.sync.set({ [SAVED_KEY]: [...saved, newEntry] });
  showFeedback("Saved!", "success");
  setSaveState("undo");
  undoTimer = setTimeout(() => {
    undoTimer = null;
    setSaveState("readlist");
  }, UNDO_WINDOW_MS);
}

async function handleUndo() {
  clearTimeout(undoTimer);
  undoTimer = null;
  const { [SAVED_KEY]: saved = [] } = await chrome.storage.sync.get(SAVED_KEY);
  await chrome.storage.sync.set({
    [SAVED_KEY]: saved.filter((p) => p.url !== currentTab.url),
  });
  hideSaveLabel();
  setSaveState("save");
}

async function handleDeadlineOption(option) {
  closePicker();
  if (option === "none") return; // keep the page saved without a deadline

  const readBy = deadlineFromOption(option);
  if (readBy == null) return;

  const { [SAVED_KEY]: saved = [] } = await chrome.storage.sync.get(SAVED_KEY);
  let updatedEntry = null;
  const updated = saved.map((p) => {
    if (p.url !== currentTab.url) return p;
    updatedEntry = { ...p, readBy };
    return updatedEntry;
  });
  await chrome.storage.sync.set({ [SAVED_KEY]: updated });
  if (updatedEntry) showSaveLabel(updatedEntry, { crossfade: true });
  setSaveState("markread");
}

async function handleMarkRead() {
  const { [SAVED_KEY]: saved = [], autoUnsaveOnRead = false } =
    await chrome.storage.sync.get([SAVED_KEY, "autoUnsaveOnRead"]);

  if (autoUnsaveOnRead) {
    await chrome.storage.sync.set({
      [SAVED_KEY]: saved.filter((p) => p.url !== currentTab.url),
    });
    hideSaveLabel();
    setSaveState("save");
    showFeedback("Marked read", "success");
    return;
  }

  let plainEntry = null;
  const updated = saved.map((p) => {
    if (p.url !== currentTab.url) return p;
    const { readBy, ...rest } = p;
    plainEntry = rest;
    return rest;
  });
  await chrome.storage.sync.set({ [SAVED_KEY]: updated });
  if (plainEntry) showSaveLabel(plainEntry, { crossfade: true });
  // Unsave already occupies the secondary slot, so offer Readlist again —
  // a chance to put the page straight back on the reading list.
  setSaveState("readlist");
}

async function handleUnsave() {
  const { [SAVED_KEY]: saved = [] } = await chrome.storage.sync.get(SAVED_KEY);
  await chrome.storage.sync.set({
    [SAVED_KEY]: saved.filter((p) => p.url !== currentTab.url),
  });
  hideSaveLabel();
  setSaveState("save");
  showFeedback("Unsaved", "success");
}

saveBtn.addEventListener("click", async () => {
  if (!currentTab) return;

  switch (saveState) {
    case "save": await handleSave(); break;
    case "undo": await handleUndo(); break;
    case "readlist": deadlinePicker?.classList.contains("open") ? closePicker() : openPicker(); break;
    case "markread": await handleMarkRead(); break;
  }
});

deadlinePicker?.addEventListener("click", (e) => {
  const pill = e.target.closest("[data-option]");
  if (!pill || !currentTab) return;
  handleDeadlineOption(pill.dataset.option);
});

blockBtn.addEventListener("click", async () => {
  if (secondaryState === "unsave") {
    if (!currentTab) return;
    await handleUnsave();
    return;
  }

  if (!currentHostname) return;
  const { [STORAGE_KEY]: entries = [] } = await chrome.storage.sync.get(STORAGE_KEY);
  if (entries.some((e) => e.site === currentHostname)) {
    showFeedback("Already in block list", "error");
    return;
  }
  const newEntry = { site: currentHostname, blockedAt: Date.now() };
  await chrome.storage.sync.set({ [STORAGE_KEY]: [...entries, newEntry] });
  siteBlocked = true;
  updateSecondaryButton(false);
  showFeedback(`Blocked ${currentHostname}`, "success");
});

optionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

init();
