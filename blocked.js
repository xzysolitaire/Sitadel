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

  toreadListEl.textContent = "";
  for (const entry of presented) {
    const li = document.createElement("li");
    li.className = "toread-item";

    const title = document.createElement("div");
    title.className = "toread-title";
    title.textContent = entry.title || humaniseSite(entry.site);

    const meta = document.createElement("div");
    meta.className = "toread-meta";
    meta.textContent = `${humaniseSite(entry.site)} · ${formatDeadlineDate(entry.readBy)}`;

    li.appendChild(title);
    li.appendChild(meta);

    if (getDeadlineSection(entry.readBy) === "pastdue") {
      const days = daysOverdue(entry.readBy);
      const overdue = document.createElement("div");
      overdue.className = "toread-overdue";
      overdue.textContent = `${days} ${days === 1 ? "day" : "days"} overdue`;
      li.appendChild(overdue);
    }

    toreadListEl.appendChild(li);
  }

  toreadSection.hidden = false;
}

// Open the presented reading list straight away — no selection step.
openListBtn.addEventListener("click", async () => {
  if (presentedUrls.length > 0) await chrome.windows.create({ url: presentedUrls });
});

initToRead();
