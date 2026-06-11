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
const openListPickerEl = document.getElementById("open-list-picker");

let toreadEntries = [];

function humaniseSite(hostname) {
  const parts = hostname.split(".");
  const name = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

async function initToRead() {
  const { savedPages = [] } = await chrome.storage.sync.get("savedPages");
  toreadEntries = savedPages.filter((p) => p.readBy != null);
  if (toreadEntries.length === 0) return;

  toreadListEl.textContent = "";
  for (const entry of computeImminentSet(toreadEntries)) {
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

function openOpenListPicker() {
  const sorted = [...toreadEntries].sort((a, b) => a.readBy - b.readBy);
  const imminent = new Set(computeImminentSet(sorted).map((p) => p.url));

  openListPickerEl.textContent = "";

  const list = document.createElement("ul");
  list.className = "open-list-choices";
  for (const entry of sorted) {
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
  confirmBtn.style.marginTop = "0";
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
  openListPickerEl.hidden = false;
}

function updateOpenSelectedLabel() {
  const count = openListPickerEl.querySelectorAll("input:checked").length;
  const btn = openListPickerEl.querySelector("#open-selected-btn");
  if (btn) btn.textContent = `Open Selected (${count})`;
}

function closeOpenListPicker() {
  openListPickerEl.textContent = "";
  openListPickerEl.hidden = true;
}

openListBtn.addEventListener("click", openOpenListPicker);

initToRead();
