const flushPromises = () => new Promise((r) => setImmediate(r));

let buildUrlFilter, syncRules, migrate, clearHistoryForSite, urlMatchesSite, enforceBlockOnTab;

beforeEach(() => {
  jest.resetModules();
  ({ buildUrlFilter, syncRules, migrate, clearHistoryForSite, urlMatchesSite, enforceBlockOnTab } =
    require('../service_worker'));
});

// ─── buildUrlFilter ───────────────────────────────────────────────────────────

describe('buildUrlFilter', () => {
  test('domain only — one domain-anchored filter covering all subdomains', () => {
    expect(buildUrlFilter('facebook.com')).toEqual(['||facebook.com/']);
  });

  test('domain with path — domain-anchored filter with the path', () => {
    expect(buildUrlFilter('reddit.com/r/news')).toEqual(['||reddit.com/r/news']);
  });

  test('lowercases the pattern so mixed-case entries still match', () => {
    expect(buildUrlFilter('4KHD.COM')).toEqual(['||4khd.com/']);
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
    expect(call.addRules).toHaveLength(1); // one filter per entry
    expect(call.addRules[0]).toMatchObject({
      id: 1,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: { url: expect.stringContaining('blocked.html?site=facebook.com') },
      },
      condition: {
        urlFilter: '||facebook.com/',
        isUrlFilterCaseSensitive: false,
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
    expect(addRules.map((r) => r.id)).toEqual([1, 2]);
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

// ─── clearHistoryForSite ──────────────────────────────────────────────────────

describe('clearHistoryForSite', () => {
  test('deletes matching domain URLs and ignores non-matching ones', async () => {
    chrome.history.search.mockResolvedValue([
      { url: 'https://facebook.com/login' },
      { url: 'https://www.facebook.com/feed' },
      { url: 'https://m.facebook.com/home' },
      { url: 'https://notfacebook.com' },
    ]);

    await clearHistoryForSite('facebook.com');

    expect(chrome.history.deleteUrl).toHaveBeenCalledWith({ url: 'https://facebook.com/login' });
    expect(chrome.history.deleteUrl).toHaveBeenCalledWith({ url: 'https://www.facebook.com/feed' });
    expect(chrome.history.deleteUrl).toHaveBeenCalledWith({ url: 'https://m.facebook.com/home' });
    expect(chrome.history.deleteUrl).not.toHaveBeenCalledWith({ url: 'https://notfacebook.com' });
    expect(chrome.history.deleteUrl).toHaveBeenCalledTimes(3);
  });

  test('only deletes URLs matching the path prefix', async () => {
    chrome.history.search.mockResolvedValue([
      { url: 'https://reddit.com/r/news/article' },
      { url: 'https://reddit.com/r/other' },
    ]);

    await clearHistoryForSite('reddit.com/r/news');

    expect(chrome.history.deleteUrl).toHaveBeenCalledWith({ url: 'https://reddit.com/r/news/article' });
    expect(chrome.history.deleteUrl).toHaveBeenCalledTimes(1);
  });

  test('makes no deleteUrl calls when history search returns empty', async () => {
    chrome.history.search.mockResolvedValue([]);

    await clearHistoryForSite('facebook.com');

    expect(chrome.history.deleteUrl).not.toHaveBeenCalled();
  });

  test('does not throw on unparseable URLs', async () => {
    chrome.history.search.mockResolvedValue([{ url: 'not-a-valid-url' }]);

    await expect(clearHistoryForSite('facebook.com')).resolves.toBeUndefined();
    expect(chrome.history.deleteUrl).not.toHaveBeenCalled();
  });

  test('deletes all results when 1000 matching URLs are returned', async () => {
    const urls = Array.from({ length: 1000 }, (_, i) => ({
      url: `https://facebook.com/page/${i}`,
    }));
    chrome.history.search.mockResolvedValue(urls);

    await clearHistoryForSite('facebook.com');

    expect(chrome.history.deleteUrl).toHaveBeenCalledTimes(1000);
  });
});

// ─── onInstalled — history clearing ──────────────────────────────────────────

describe('onInstalled history clearing', () => {
  function getListener() {
    return chrome.runtime.onInstalled.addListener.mock.calls[0][0];
  }

  test('clears history for all blocked sites on install when clearHistory is true', async () => {
    const entries = [
      { site: 'facebook.com', blockedAt: 999 },
      { site: 'twitter.com', blockedAt: 999 },
    ];
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: entries, clearHistory: true });

    await getListener()();

    expect(chrome.history.search).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'facebook.com' })
    );
    expect(chrome.history.search).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'twitter.com' })
    );
  });

  test('does not clear history when clearHistory setting is false', async () => {
    const entries = [{ site: 'facebook.com', blockedAt: 999 }];
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: entries, clearHistory: false });

    await getListener()();

    expect(chrome.history.search).not.toHaveBeenCalled();
  });

  test('skips history clearing when block list is empty', async () => {
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [] });

    await getListener()();

    expect(chrome.history.search).not.toHaveBeenCalled();
  });
});

// ─── storage.onChanged — history clearing ────────────────────────────────────

describe('storage.onChanged history clearing', () => {
  function getListener() {
    return chrome.storage.onChanged.addListener.mock.calls[0][0];
  }

  test('calls clearHistoryForSite for each newly added site', async () => {
    chrome.storage.sync.get.mockResolvedValue({ clearHistory: true });

    getListener()(
      {
        blockedSites: {
          oldValue: [{ site: 'existing.com', blockedAt: 0 }],
          newValue: [
            { site: 'existing.com', blockedAt: 0 },
            { site: 'new1.com', blockedAt: 100 },
            { site: 'new2.com', blockedAt: 200 },
          ],
        },
      },
      'sync'
    );

    await flushPromises();

    expect(chrome.history.search).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'new1.com' })
    );
    expect(chrome.history.search).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'new2.com' })
    );
    expect(chrome.history.search).not.toHaveBeenCalledWith(
      expect.objectContaining({ text: 'existing.com' })
    );
  });

  test('does not clear history when no new sites are added', async () => {
    getListener()(
      {
        blockedSites: {
          oldValue: [{ site: 'facebook.com', blockedAt: 0 }],
          newValue: [{ site: 'facebook.com', blockedAt: 0 }],
        },
      },
      'sync'
    );

    await flushPromises();

    expect(chrome.history.search).not.toHaveBeenCalled();
  });

  test('does not clear history when clearHistory setting is false', async () => {
    chrome.storage.sync.get.mockResolvedValue({ clearHistory: false });

    getListener()(
      {
        blockedSites: {
          oldValue: [],
          newValue: [{ site: 'facebook.com', blockedAt: 0 }],
        },
      },
      'sync'
    );

    await flushPromises();

    expect(chrome.history.search).not.toHaveBeenCalled();
  });
});

// ─── urlMatchesSite ───────────────────────────────────────────────────────────

describe('urlMatchesSite', () => {
  test('matches the bare domain and subdomains (www, m, mobile)', () => {
    expect(urlMatchesSite('https://x.com/home', 'x.com')).toBe(true);
    expect(urlMatchesSite('https://www.x.com/home', 'x.com')).toBe(true);
    expect(urlMatchesSite('https://mobile.x.com/x', 'x.com')).toBe(true);
  });

  test('does not match look-alike or suffix domains', () => {
    expect(urlMatchesSite('https://notx.com/', 'x.com')).toBe(false);
    expect(urlMatchesSite('https://x.com.evil.com/', 'x.com')).toBe(false);
  });

  test('path entries require a path prefix match', () => {
    expect(urlMatchesSite('https://reddit.com/r/news/abc', 'reddit.com/r/news')).toBe(true);
    expect(urlMatchesSite('https://reddit.com/r/other', 'reddit.com/r/news')).toBe(false);
  });

  test('is case-insensitive on the stored site and ignores non-http(s) / invalid URLs', () => {
    expect(urlMatchesSite('https://x.com/home', 'X.COM')).toBe(true);
    expect(urlMatchesSite('chrome://settings', 'settings')).toBe(false);
    expect(urlMatchesSite('not-a-url', 'x.com')).toBe(false);
  });
});

// ─── tab-level enforcement (SPA / already-open tabs) ──────────────────────────

describe('enforceBlockOnTab', () => {
  test('redirects a tab whose URL lands on a blocked site', async () => {
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [{ site: 'x.com', blockedAt: 0 }] });

    await enforceBlockOnTab(7, 'https://x.com/home');

    expect(chrome.tabs.update).toHaveBeenCalledWith(7, {
      url: expect.stringContaining('blocked.html?site=x.com'),
    });
  });

  test('leaves non-blocked tabs alone', async () => {
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [{ site: 'x.com', blockedAt: 0 }] });

    await enforceBlockOnTab(7, 'https://example.com/');

    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });

  test('the tabs.onUpdated listener enforces only on URL changes', async () => {
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [{ site: 'x.com', blockedAt: 0 }] });
    const listener = chrome.tabs.onUpdated.addListener.mock.calls[0][0];

    listener(7, { status: 'loading' }); // no url change → ignored
    await flushPromises();
    expect(chrome.tabs.update).not.toHaveBeenCalled();

    listener(7, { url: 'https://x.com/home' });
    await flushPromises();
    expect(chrome.tabs.update).toHaveBeenCalledWith(7, {
      url: expect.stringContaining('blocked.html?site=x.com'),
    });
  });
});
