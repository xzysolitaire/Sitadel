const STORAGE_KEY = "blockedSites";

const hostnameEl = document.getElementById("hostname");
const blockBtn = document.getElementById("block-btn");
const optionsBtn = document.getElementById("options-btn");
const feedbackEl = document.getElementById("feedback");

let currentHostname = null;

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
    currentHostname = url.hostname.replace(/^www\./, "");
    hostnameEl.textContent = currentHostname;
    blockBtn.disabled = false;

    const { [STORAGE_KEY]: entries = [] } = await chrome.storage.sync.get(STORAGE_KEY);
    if (entries.some((e) => e.site === currentHostname)) {
      blockBtn.textContent = "Already blocked";
      blockBtn.disabled = true;
    }
  } catch {
    // non-navigable tab
  }
}

blockBtn.addEventListener("click", async () => {
  if (!currentHostname) return;
  const { [STORAGE_KEY]: entries = [] } = await chrome.storage.sync.get(STORAGE_KEY);
  if (entries.some((e) => e.site === currentHostname)) {
    showFeedback("Already in block list", "error");
    return;
  }
  const newEntry = { site: currentHostname, blockedAt: Date.now() };
  await chrome.storage.sync.set({ [STORAGE_KEY]: [...entries, newEntry] });
  blockBtn.textContent = "Already blocked";
  blockBtn.disabled = true;
  showFeedback(`Blocked ${currentHostname}`, "success");
});

optionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

init();
