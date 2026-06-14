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

async function clearHistoryForSite(site) {
  const results = await chrome.history.search({ text: site, maxResults: 1000, startTime: 0 });
  const toDelete = results.filter(({ url }) => {
    try {
      const { hostname, pathname } = new URL(url);
      const bare = hostname.replace(/^www\./, "");
      if (site.includes("/")) {
        const slash = site.indexOf("/");
        return bare === site.slice(0, slash) && pathname.startsWith(site.slice(slash));
      }
      return bare === site || bare.endsWith("." + site);
    } catch {
      return false;
    }
  });
  await Promise.all(toDelete.map(({ url }) => chrome.history.deleteUrl({ url })));
}

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
  module.exports = { buildUrlFilter, syncRules, migrate, clearHistoryForSite };
}
