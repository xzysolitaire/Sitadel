const STORAGE_KEY = "blockedSites";
const LOCK_MS = 7 * 24 * 60 * 60 * 1000;

const urlInput = document.getElementById("url-input");
const addBtn = document.getElementById("add-btn");
const addError = document.getElementById("add-error");
const siteList = document.getElementById("site-list");
const emptyState = document.getElementById("empty-state");
const countEl = document.getElementById("count");

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

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes[STORAGE_KEY]) {
    renderList(changes[STORAGE_KEY].newValue || []);
  }
});

addBtn.addEventListener("click", addSite);
urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addSite();
});

load();
