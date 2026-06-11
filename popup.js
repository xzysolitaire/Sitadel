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
const blockLabel = blockBtn.querySelector(".btn-label");
const saveBtn = document.getElementById("save-btn");
const saveLabelEl = document.getElementById("save-label");
const deadlinePicker = document.getElementById("deadline-picker");
const optionsBtn = document.getElementById("options-btn");
const feedbackEl = document.getElementById("feedback");

let currentHostname = null;
let currentTab = null;
let saveState = "save"; // save | undo | readlist | markread | unsave
let undoTimer = null;

const SAVE_BTN_CONTENT = {
  save: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg><span class="btn-label">Save</span>`,
  undo: `<span class="btn-label">Undo</span>`,
  readlist: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span class="btn-label">Readlist</span><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`,
  markread: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg><span class="btn-label">Mark read</span>`,
  unsave: `<span class="btn-label">Unsave</span>`,
};

let saveStateInitialised = false;
let ghostCleanupTimer = null;

// Swap the button content in place: the old content lives on in an absolutely
// positioned ghost that fades out, then the new content fades in (ease-in-out).
function setSaveState(state) {
  saveState = state;

  clearTimeout(ghostCleanupTimer);
  saveBtn.querySelector(".btn-ghost")?.remove();
  const previousContent = saveBtn.innerHTML;

  saveBtn.innerHTML = SAVE_BTN_CONTENT[state];

  if (saveStateInitialised) {
    const ghost = document.createElement("span");
    ghost.className = "btn-ghost";
    ghost.innerHTML = previousContent;
    saveBtn.appendChild(ghost);
    saveBtn.classList.add("btn-swapping");
    ghostCleanupTimer = setTimeout(() => {
      ghost.remove();
      saveBtn.classList.remove("btn-swapping");
    }, 320);
  }
  saveStateInitialised = true;
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

function showFeedback(msg, type) {
  feedbackEl.textContent = msg;
  feedbackEl.className = `feedback ${type}`;
  setTimeout(() => {
    feedbackEl.className = "feedback hidden";
  }, 2500);
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

    if (entries.some((e) => e.site === currentHostname)) {
      blockLabel.textContent = "Blocked";
      blockBtn.disabled = true;
    }

    const entry = savedPages.find((p) => p.url === tab.url);
    if (entry) {
      setSaveState(entry.readBy != null ? "markread" : "readlist");
      showSaveLabel(entry);
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
  showSaveLabel(newEntry);
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
  const { [SAVED_KEY]: saved = [] } = await chrome.storage.sync.get(SAVED_KEY);
  let plainEntry = null;
  const updated = saved.map((p) => {
    if (p.url !== currentTab.url) return p;
    const { readBy, ...rest } = p;
    plainEntry = rest;
    return rest;
  });
  await chrome.storage.sync.set({ [SAVED_KEY]: updated });
  if (plainEntry) showSaveLabel(plainEntry, { crossfade: true });
  setSaveState("unsave");
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
    case "unsave": await handleUnsave(); break;
  }
});

deadlinePicker?.addEventListener("click", (e) => {
  const pill = e.target.closest("[data-option]");
  if (!pill || !currentTab) return;
  handleDeadlineOption(pill.dataset.option);
});

blockBtn.addEventListener("click", async () => {
  if (!currentHostname) return;
  const { [STORAGE_KEY]: entries = [] } = await chrome.storage.sync.get(STORAGE_KEY);
  if (entries.some((e) => e.site === currentHostname)) {
    showFeedback("Already in block list", "error");
    return;
  }
  const newEntry = { site: currentHostname, blockedAt: Date.now() };
  await chrome.storage.sync.set({ [STORAGE_KEY]: [...entries, newEntry] });
  blockLabel.textContent = "Blocked";
  blockBtn.disabled = true;
  showFeedback(`Blocked ${currentHostname}`, "success");
});

optionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

init();
