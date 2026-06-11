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

function humaniseSite(hostname) {
  const parts = hostname.split(".");
  const name = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

async function initToRead() {
  const { savedPages = [] } = await chrome.storage.sync.get("savedPages");
  const toread = savedPages.filter((p) => p.readBy != null);
  if (toread.length === 0) return;

  toreadListEl.textContent = "";
  for (const entry of computeImminentSet(toread)) {
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

    if (getDeadlineSection(entry.readBy) === "overdue") {
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

initToRead();
