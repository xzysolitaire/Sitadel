const STORAGE_KEY = "blockedSites";

function buildUrlFilter(pattern) {
  // pattern examples: "facebook.com", "reddit.com/r/news"
  const hasPath = pattern.includes("/");
  if (hasPath) {
    return [`*://${pattern}*`, `*://www.${pattern}*`];
  }
  return [`*://${pattern}/*`, `*://www.${pattern}/*`];
}

async function syncRules(sites) {
  try {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const removeIds = existingRules.map((r) => r.id);

    const addRules = [];
    let ruleId = 1;

    for (const site of sites) {
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

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const data = await chrome.storage.sync.get(STORAGE_KEY);
    if (!data[STORAGE_KEY]) {
      await chrome.storage.sync.set({ [STORAGE_KEY]: [] });
    }
    const sites = data[STORAGE_KEY] || [];
    await syncRules(sites);
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
  }
});
