const flushPromises = () => new Promise((r) => setImmediate(r));

let buildUrlFilter, syncRules, migrate;

beforeEach(() => {
  jest.resetModules();
  ({ buildUrlFilter, syncRules, migrate } = require('../service_worker'));
});

// ─── buildUrlFilter ───────────────────────────────────────────────────────────

describe('buildUrlFilter', () => {
  test('domain only — returns two wildcard patterns', () => {
    expect(buildUrlFilter('facebook.com')).toEqual([
      '*://facebook.com/*',
      '*://www.facebook.com/*',
    ]);
  });

  test('domain with path — uses prefix wildcard instead of /* suffix', () => {
    expect(buildUrlFilter('reddit.com/r/news')).toEqual([
      '*://reddit.com/r/news*',
      '*://www.reddit.com/r/news*',
    ]);
  });
});

// ─── migrate ──────────────────────────────────────────────────────────────────

describe('migrate', () => {
  test('converts string entries to objects with blockedAt 0', () => {
    expect(migrate(['facebook.com', 'reddit.com'])).toEqual([
      { site: 'facebook.com', blockedAt: 0 },
      { site: 'reddit.com', blockedAt: 0 },
    ]);
  });

  test('leaves object entries unchanged (same reference)', () => {
    const entry = { site: 'x.com', blockedAt: 1000 };
    const result = migrate([entry]);
    expect(result[0]).toBe(entry);
  });

  test('handles mixed string and object array', () => {
    const obj = { site: 'x.com', blockedAt: 999 };
    expect(migrate(['facebook.com', obj])).toEqual([
      { site: 'facebook.com', blockedAt: 0 },
      obj,
    ]);
  });
});

// ─── syncRules ────────────────────────────────────────────────────────────────

describe('syncRules', () => {
  test('removes existing rules and adds new ones for each entry', async () => {
    chrome.declarativeNetRequest.getDynamicRules.mockResolvedValue([
      { id: 1 },
      { id: 2 },
    ]);

    await syncRules([{ site: 'facebook.com', blockedAt: 0 }]);

    const call = chrome.declarativeNetRequest.updateDynamicRules.mock.calls[0][0];
    expect(call.removeRuleIds).toEqual([1, 2]);
    expect(call.addRules).toHaveLength(2); // one per filter pattern
    expect(call.addRules[0]).toMatchObject({
      id: 1,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: { url: expect.stringContaining('blocked.html?site=facebook.com') },
      },
      condition: {
        urlFilter: '*://facebook.com/*',
        resourceTypes: ['main_frame', 'sub_frame'],
      },
    });
  });

  test('passes empty addRules when entries array is empty', async () => {
    chrome.declarativeNetRequest.getDynamicRules.mockResolvedValue([{ id: 5 }]);

    await syncRules([]);

    expect(chrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledWith({
      removeRuleIds: [5],
      addRules: [],
    });
  });

  test('assigns sequential unique IDs across all filters', async () => {
    await syncRules([
      { site: 'facebook.com', blockedAt: 0 },
      { site: 'twitter.com', blockedAt: 0 },
    ]);

    const { addRules } = chrome.declarativeNetRequest.updateDynamicRules.mock.calls[0][0];
    expect(addRules.map((r) => r.id)).toEqual([1, 2, 3, 4]);
  });

  test('redirect URL encodes the site name', async () => {
    await syncRules([{ site: 'a b.com', blockedAt: 0 }]);

    const { addRules } = chrome.declarativeNetRequest.updateDynamicRules.mock.calls[0][0];
    expect(addRules[0].action.redirect.url).toContain(encodeURIComponent('a b.com'));
  });
});

// ─── onInstalled listener ────────────────────────────────────────────────────

describe('onInstalled listener', () => {
  function getListener() {
    return chrome.runtime.onInstalled.addListener.mock.calls[0][0];
  }

  test('migrates legacy string array and writes it back to storage', async () => {
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: ['facebook.com'] });

    await getListener()();

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      blockedSites: [{ site: 'facebook.com', blockedAt: 0 }],
    });
    expect(chrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalled();
  });

  test('skips storage write when data is already in new format', async () => {
    const entries = [{ site: 'facebook.com', blockedAt: 999 }];
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: entries });

    await getListener()();

    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  test('handles completely empty storage on fresh install', async () => {
    chrome.storage.sync.get.mockResolvedValue({});

    await getListener()();

    expect(chrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledWith({
      removeRuleIds: [],
      addRules: [],
    });
  });
});

// ─── storage.onChanged debounce ───────────────────────────────────────────────

describe('storage.onChanged debounce', () => {
  function getListener() {
    return chrome.storage.onChanged.addListener.mock.calls[0][0];
  }

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('does not call syncRules before the 50 ms window elapses', () => {
    getListener()({ blockedSites: { newValue: [] } }, 'sync');

    jest.advanceTimersByTime(49);
    expect(chrome.declarativeNetRequest.getDynamicRules).not.toHaveBeenCalled();
  });

  test('calls syncRules after 50 ms', () => {
    getListener()({ blockedSites: { newValue: [{ site: 'x.com', blockedAt: 0 }] } }, 'sync');

    jest.advanceTimersByTime(50);
    // getDynamicRules is the first thing syncRules calls (before any await)
    expect(chrome.declarativeNetRequest.getDynamicRules).toHaveBeenCalledTimes(1);
  });

  test('debounces rapid successive calls into one syncRules invocation', () => {
    const listener = getListener();
    listener({ blockedSites: { newValue: [{ site: 'a.com', blockedAt: 0 }] } }, 'sync');
    listener({ blockedSites: { newValue: [{ site: 'b.com', blockedAt: 0 }] } }, 'sync');
    listener({ blockedSites: { newValue: [{ site: 'c.com', blockedAt: 0 }] } }, 'sync');

    jest.advanceTimersByTime(50);
    expect(chrome.declarativeNetRequest.getDynamicRules).toHaveBeenCalledTimes(1);
  });

  test('ignores changes from non-sync storage areas', () => {
    getListener()({ blockedSites: { newValue: [] } }, 'local');

    jest.advanceTimersByTime(100);
    expect(chrome.declarativeNetRequest.getDynamicRules).not.toHaveBeenCalled();
  });
});
