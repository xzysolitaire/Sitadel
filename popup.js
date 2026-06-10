const STORAGE_KEY = "blockedSites";
const SAVED_KEY = "savedPages";

const hostnameEl = document.getElementById("hostname");
const pageTitleEl = document.getElementById("page-title");
const faviconEl = document.getElementById("favicon");
const blockBtn = document.getElementById("block-btn");
const blockLabel = blockBtn.querySelector(".btn-label");
const saveBtn = document.getElementById("save-btn");
const saveLabel = saveBtn.querySelector(".btn-label");
const optionsBtn = document.getElementById("options-btn");
const feedbackEl = document.getElementById("feedback");

let currentHostname = null;
let currentTab = null;
let pageSaved = false;
let siteBlocked = false;
let unblockCooldown = true;


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

    const { [STORAGE_KEY]: entries = [], [SAVED_KEY]: savedPages = [], unblockCooldown: cooldown = true } =
      await chrome.storage.sync.get([STORAGE_KEY, SAVED_KEY, "unblockCooldown"]);
    unblockCooldown = cooldown;

    if (entries.some((e) => e.site === currentHostname)) {
      siteBlocked = true;
      if (unblockCooldown) {
        blockLabel.textContent = "Blocked";
        blockBtn.disabled = true;
      } else {
        blockLabel.textContent = "Unblock";
      }
    }

    if (savedPages.some((p) => p.url === tab.url)) {
      pageSaved = true;
      saveLabel.textContent = "Unsave";
    }
  } catch {
    // non-navigable tab
  }
}

saveBtn.addEventListener("click", async () => {
  if (!currentTab) return;

  if (pageSaved) {
    const { [SAVED_KEY]: saved = [] } = await chrome.storage.sync.get(SAVED_KEY);
    await chrome.storage.sync.set({
      [SAVED_KEY]: saved.filter((p) => p.url !== currentTab.url),
    });
    pageSaved = false;
    saveLabel.textContent = "Save";
    showFeedback("Unsaved", "success");
    return;
  }

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
  pageSaved = true;
  saveLabel.textContent = "Unsave";
  showFeedback("Saved!", "success");
});

blockBtn.addEventListener("click", async () => {
  if (!currentHostname) return;
  const { [STORAGE_KEY]: entries = [] } = await chrome.storage.sync.get(STORAGE_KEY);

  if (siteBlocked && !unblockCooldown) {
    const updated = entries.filter((e) => e.site !== currentHostname);
    await chrome.storage.sync.set({ [STORAGE_KEY]: updated });
    siteBlocked = false;
    blockLabel.textContent = "Block";
    showFeedback(`Unblocked ${currentHostname}`, "success");
    return;
  }

  if (entries.some((e) => e.site === currentHostname)) {
    showFeedback("Already in block list", "error");
    return;
  }
  const newEntry = { site: currentHostname, blockedAt: Date.now() };
  await chrome.storage.sync.set({ [STORAGE_KEY]: [...entries, newEntry] });
  siteBlocked = true;
  if (unblockCooldown) {
    blockLabel.textContent = "Blocked";
    blockBtn.disabled = true;
  } else {
    blockLabel.textContent = "Unblock";
  }
  showFeedback(`Blocked ${currentHostname}`, "success");
});

optionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

init();
