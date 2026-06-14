// In the browser these helpers are globals loaded via <script src="readlist-utils.js">
if (typeof module !== "undefined") {
  Object.assign(globalThis, require("./readlist-utils.js"));
}

const params = new URLSearchParams(window.location.search);
const site = params.get("site") || "this site";

document.getElementById("site-name").textContent = site;
document.getElementById("options-link").href = chrome.runtime.getURL("options.html");

const toreadSection = document.getElementById("toread-section");
const toreadListEl = document.getElementById("toread-list");
const openListBtn = document.getElementById("open-list-btn");

let toreadEntries = [];
// URLs of the pages shown in the list — Open List opens exactly these.
let presentedUrls = [];

function humaniseSite(hostname) {
  const parts = hostname.split(".");
  const name = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

async function initToRead() {
  const { savedPages = [] } = await chrome.storage.sync.get("savedPages");
  toreadEntries = savedPages.filter((p) => p.readBy != null);
  if (toreadEntries.length === 0) return;

  const presented = computeImminentSet(toreadEntries);
  presentedUrls = presented.map((p) => p.url);

  const dayMs = 24 * 60 * 60 * 1000;
  toreadListEl.textContent = "";
  for (const entry of presented) {
    const li = document.createElement("li");
    li.className = "toread-item";

    const favWrap = document.createElement("div");
    favWrap.className = "favicon-wrap";
    const img = document.createElement("img");
    img.src = `https://www.google.com/s2/favicons?domain=${entry.site}&sz=32`;
    img.alt = "";
    favWrap.appendChild(img);

    const text = document.createElement("div");
    text.className = "toread-text";
    const title = document.createElement("div");
    title.className = "toread-title";
    title.textContent = entry.title || humaniseSite(entry.site);
    const meta = document.createElement("div");
    meta.className = "toread-meta";
    meta.textContent = humaniseSite(entry.site);
    text.appendChild(title);
    text.appendChild(meta);

    // Due-days chip, matching the Readlist tab: orange when overdue, blue otherwise.
    const chip = document.createElement("span");
    chip.className = "toread-chip";
    if (getDeadlineSection(entry.readBy) === "pastdue") {
      const days = daysOverdue(entry.readBy);
      chip.classList.add("over");
      chip.textContent = `${days} ${days === 1 ? "day" : "days"} overdue`;
    } else {
      const daysLeft = Math.ceil((entry.readBy - Date.now()) / dayMs);
      chip.textContent = daysLeft <= 0 ? "Due today" : `Due in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`;
    }

    li.appendChild(favWrap);
    li.appendChild(text);
    li.appendChild(chip);
    toreadListEl.appendChild(li);
  }

  toreadSection.hidden = false;
}

// Open the presented reading list straight away — no selection step.
openListBtn.addEventListener("click", async () => {
  if (presentedUrls.length > 0) await chrome.windows.create({ url: presentedUrls });
});

initToRead();
