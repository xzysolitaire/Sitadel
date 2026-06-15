const STORAGE_KEY = "blockedSites";

function buildUrlFilter(pattern) {
  // pattern examples: "facebook.com", "reddit.com/r/news"
  // Lowercase: request URL hosts are always lowercase and DNR matches the
  // urlFilter against them, so a mixed/upper-case entry would never match.
  const p = pattern.toLowerCase();
  // `||` anchors at a domain-label boundary, so one filter covers the bare
  // host, www, and any other subdomain across http/https. For a domain-only
  // entry the trailing `/` matches the homepage and every path beneath it.
  return p.includes("/") ? [`||${p}`] : [`||${p}/`];
}

// entries: Array<{site: string, blockedAt: number}>
async function syncRules(entries) {
  try {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const removeIds = existingRules.map((r) => r.id);

    const addRules = [];
    let ruleId = 1;

    for (const { site } of entries) {
      const filters = buildUrlFilter(site);
      for (const urlFilter of filters) {
        addRules.push({
          id: ruleId++,
          priority: 1,
          action: {
            type: "redirect",
            redirect: {
              url: chrome.runtime.getURL(
                `blocked.html?site=${encodeURIComponent(site)}`
              ),
            },
          },
          condition: {
            urlFilter,
            isUrlFilterCaseSensitive: false,
            resourceTypes: ["main_frame", "sub_frame"],
          },
        });
      }
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: removeIds,
      addRules,
    });
  } catch (err) {
    console.error("[Sitadel] syncRules failed:", err);
  }
}

// Migrate legacy string[] entries to {site, blockedAt} objects.
// Legacy entries get blockedAt:0 so they are immediately removable.
function migrate(raw) {
  return raw.map((entry) =>
    typeof entry === "string" ? { site: entry, blockedAt: 0 } : entry
  );
}

// Does an http(s) URL fall under a blocked entry? Matches the bare domain and
// any subdomain (www, m, mobile, …); for path entries, the path must prefix-match.
function urlMatchesSite(url, site) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const bare = parsed.hostname.replace(/^www\./, "");
  const s = site.toLowerCase();
  if (s.includes("/")) {
    const slash = s.indexOf("/");
    const host = s.slice(0, slash);
    return (bare === host || bare.endsWith("." + host)) && parsed.pathname.startsWith(s.slice(slash));
  }
  return bare === s || bare.endsWith("." + s);
}

async function clearHistoryForSite(site) {
  const results = await chrome.history.search({ text: site, maxResults: 1000, startTime: 0 });
  const toDelete = results.filter(({ url }) => urlMatchesSite(url, site));
  await Promise.all(toDelete.map(({ url }) => chrome.history.deleteUrl({ url })));
}

// In-memory cache of the block list, kept fresh by the storage listener below.
// Reloaded lazily after the service worker restarts.
let blockedCache = null;
async function getBlockedEntries() {
  if (blockedCache === null) {
    const { [STORAGE_KEY]: entries = [] } = await chrome.storage.sync.get(STORAGE_KEY);
    blockedCache = entries;
  }
  return blockedCache;
}

// declarativeNetRequest only catches real network navigations. Single-page apps
// (e.g. x.com) change URL client-side and serve from a service worker, so a
// blocked page can stay visible. Catch those by redirecting any tab whose URL
// lands on a blocked site — tabs.onUpdated fires on SPA history changes too.
async function enforceBlockOnTab(tabId, url) {
  const entries = await getBlockedEntries();
  const hit = entries.find((e) => urlMatchesSite(url, e.site));
  if (hit) {
    chrome.tabs.update(tabId, {
      url: chrome.runtime.getURL(`blocked.html?site=${encodeURIComponent(hit.site)}`),
    });
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) enforceBlockOnTab(tabId, changeInfo.url);
});

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const data = await chrome.storage.sync.get(STORAGE_KEY);
    const raw = data[STORAGE_KEY];
    const entries = raw ? migrate(raw) : [];
    if (!raw || entries.some((e, i) => e !== raw[i])) {
      await chrome.storage.sync.set({ [STORAGE_KEY]: entries });
    }
    await syncRules(entries);
    if (entries.length > 0) {
      const { clearHistory = true } = await chrome.storage.sync.get("clearHistory");
      if (clearHistory) {
        await Promise.all(entries.map(({ site }) => clearHistoryForSite(site)));
      }
    }
  } catch (err) {
    console.error("[Sitadel] onInstalled setup failed:", err);
  }
});

let syncTimer = null;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes[STORAGE_KEY]) return;

  const { newValue = [], oldValue = [] } = changes[STORAGE_KEY];
  blockedCache = newValue; // keep tab-enforcement in sync

  const added = newValue.filter((n) => !oldValue.some((o) => o.site === n.site));
  if (added.length > 0) {
    chrome.storage.sync.get("clearHistory").then(({ clearHistory = true }) => {
      if (clearHistory) {
        Promise.all(added.map(({ site }) => clearHistoryForSite(site)));
      }
    });
  }

  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncRules(newValue), 50);
});

if (typeof module !== "undefined") {
  module.exports = { buildUrlFilter, syncRules, migrate, clearHistoryForSite, urlMatchesSite, enforceBlockOnTab };
}
