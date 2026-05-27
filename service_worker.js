const STORAGE_KEY = "blockedSites";

function buildUrlFilter(pattern) {
  // pattern examples: "facebook.com", "reddit.com/r/news"
  const hasPath = pattern.includes("/");
  if (hasPath) {
    return [`*://${pattern}*`, `*://www.${pattern}*`];
  }
  return [`*://${pattern}/*`, `*://www.${pattern}/*`];
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
    console.error("[BlockSites] syncRules failed:", err);
  }
}

// Migrate legacy string[] entries to {site, blockedAt} objects.
// Legacy entries get blockedAt:0 so they are immediately removable.
function migrate(raw) {
  return raw.map((entry) =>
    typeof entry === "string" ? { site: entry, blockedAt: 0 } : entry
  );
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
  } catch (err) {
    console.error("[BlockSites] onInstalled setup failed:", err);
  }
});

let syncTimer = null;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes[STORAGE_KEY]) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(
      () => syncRules(changes[STORAGE_KEY].newValue || []),
      50
    );
    // newValue is already {site, blockedAt}[] — no migration needed here
  }
});

if (typeof module !== "undefined") {
  module.exports = { buildUrlFilter, syncRules, migrate };
}
