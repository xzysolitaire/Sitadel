const flushPromises = () => new Promise((r) => setImmediate(r));

const POPUP_DOM = `
  <span id="hostname">—</span>
  <div id="save-label" class="save-label hidden"></div>
  <button id="save-btn" class="btn btn-save" disabled><span class="btn-label">Save</span></button>
  <button id="block-btn" disabled><span class="btn-label">Block this site</span></button>
  <button id="options-btn">Options</button>
  <div id="deadline-picker" class="deadline-picker">
    <button class="pill" data-option="Tomorrow">Tomorrow</button>
    <button class="pill" data-option="3 days">3 days</button>
    <button class="pill" data-option="7 days">7 days</button>
    <button class="pill" data-option="30 days">30 days</button>
    <button class="pill" data-option="3 months">3 months</button>
    <button class="pill pill--none" data-option="none">No deadline</button>
  </div>
  <div id="feedback" class="feedback hidden"></div>
`;

function setupPopup(tabUrl, blockedSites = [], savedPages = []) {
  document.body.innerHTML = POPUP_DOM;
  chrome.tabs.query.mockResolvedValue(tabUrl ? [{ url: tabUrl, id: 1, title: 'Test Page Title' }] : [{}]);
  chrome.storage.sync.get.mockResolvedValue({ blockedSites, savedPages });
  jest.resetModules();
  require('../popup');
}

// ─── init ────────────────────────────────────────────────────────────────────

describe('popup init', () => {
  test('displays stripped hostname in the UI', async () => {
    setupPopup('https://www.facebook.com/feed');
    await flushPromises();

    expect(document.getElementById('hostname').textContent).toBe('facebook.com');
  });

  test('enables the block button for a blockable page', async () => {
    setupPopup('https://reddit.com/r/news');
    await flushPromises();

    expect(document.getElementById('block-btn').disabled).toBe(false);
  });

  test('marks button as already-blocked when site is in the list', async () => {
    setupPopup('https://reddit.com', [{ site: 'reddit.com', blockedAt: 0 }]);
    await flushPromises();

    const btn = document.getElementById('block-btn');
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('Blocked');
  });

  test('does nothing for non-http/https tabs', async () => {
    setupPopup('chrome://settings');
    await flushPromises();

    expect(document.getElementById('hostname').textContent).toBe('—');
    expect(document.getElementById('block-btn').disabled).toBe(true);
  });

  test('does nothing when tab has no URL', async () => {
    setupPopup(null);
    await flushPromises();

    expect(document.getElementById('block-btn').disabled).toBe(true);
  });
});

// ─── save button ─────────────────────────────────────────────────────────────

describe('save button', () => {
  const TAB_URL = 'https://github.com/anthropics/sdk';
  const SAVED_ENTRY = { url: TAB_URL, site: 'github.com', pageType: 'article', savedAt: 1000 };

  test('shows "Readlist" on init when URL is saved without a deadline', async () => {
    setupPopup(TAB_URL, [], [SAVED_ENTRY]);
    await flushPromises();

    const btn = document.getElementById('save-btn');
    expect(btn.querySelector('.btn-label').textContent).toBe('Readlist');
    expect(btn.disabled).toBe(false);
  });

  test('shows "Mark read" on init when URL is saved with a deadline', async () => {
    setupPopup(TAB_URL, [], [{ ...SAVED_ENTRY, readBy: Date.now() + 86400000 }]);
    await flushPromises();

    expect(document.querySelector('#save-btn .btn-label').textContent).toBe('Mark read');
  });

  test('shows "Save" on init when URL is not yet saved', async () => {
    setupPopup(TAB_URL);
    await flushPromises();

    expect(document.getElementById('save-btn').querySelector('.btn-label').textContent).toBe('Save');
  });

  test('clicking Save calls executeScript twice, stores entry, and shows "Undo"', async () => {
    setupPopup(TAB_URL);
    await flushPromises();

    chrome.storage.sync.get.mockResolvedValue({ savedPages: [] });
    document.getElementById('save-btn').click();
    await flushPromises();

    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(2);
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      savedPages: [expect.objectContaining({ url: TAB_URL, site: 'github.com', pageType: 'article', title: expect.any(String) })],
    });
    expect(document.getElementById('save-btn').querySelector('.btn-label').textContent).toBe('Undo');
  });

  test('clicking Unsave (after Mark read) removes entry from storage and shows "Save"', async () => {
    const dueEntry = { ...SAVED_ENTRY, readBy: Date.now() + 86400000 };
    setupPopup(TAB_URL, [], [dueEntry]);
    await flushPromises();

    chrome.storage.sync.get.mockResolvedValue({ savedPages: [dueEntry] });
    document.getElementById('save-btn').click(); // Mark read
    await flushPromises();

    chrome.storage.sync.get.mockResolvedValue({ savedPages: [SAVED_ENTRY] });
    document.getElementById('save-btn').click(); // Unsave
    await flushPromises();

    expect(chrome.storage.sync.set).toHaveBeenLastCalledWith({ savedPages: [] });
    expect(document.getElementById('save-btn').querySelector('.btn-label').textContent).toBe('Save');
  });

  test('falls back to pageType "article" when executeScript rejects', async () => {
    setupPopup(TAB_URL);
    await flushPromises();

    chrome.scripting.executeScript.mockRejectedValueOnce(new Error('not allowed'));
    chrome.storage.sync.get.mockResolvedValue({ savedPages: [] });
    document.getElementById('save-btn').click();
    await flushPromises();

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      savedPages: [expect.objectContaining({ pageType: 'article' })],
    });
  });

  test('save button stays disabled for non-http tabs', async () => {
    setupPopup('chrome://settings');
    await flushPromises();

    expect(document.getElementById('save-btn').disabled).toBe(true);
  });
});

// ─── save button — init (additional) ────────────────────────────────────────

describe('save button — init (additional)', () => {
  test('enables save button for https page', async () => {
    setupPopup('https://example.com');
    await flushPromises();

    expect(document.getElementById('save-btn').disabled).toBe(false);
  });

  test('enables save button for http page', async () => {
    setupPopup('http://example.com');
    await flushPromises();

    expect(document.getElementById('save-btn').disabled).toBe(false);
  });

  test('stays disabled when tab has no URL', async () => {
    setupPopup(null);
    await flushPromises();

    expect(document.getElementById('save-btn').disabled).toBe(true);
  });

  test('shows "Save" for a different URL on the same hostname (exact-URL dedup)', async () => {
    setupPopup(
      'https://github.com/foo',
      [],
      [{ url: 'https://github.com/bar', site: 'github.com', pageType: 'article', savedAt: 0 }],
    );
    await flushPromises();

    expect(document.querySelector('#save-btn .btn-label').textContent).toBe('Save');
  });
});

// ─── save action — additional ────────────────────────────────────────────────

describe('save action — additional', () => {
  beforeEach(async () => {
    setupPopup('https://www.github.com/anthropics/sdk');
    await flushPromises();
  });

  test('strips www from the stored site field', async () => {
    chrome.storage.sync.get.mockResolvedValue({ savedPages: [] });
    document.getElementById('save-btn').click();
    await flushPromises();

    const saved = chrome.storage.sync.set.mock.calls[0][0].savedPages[0];
    expect(saved.site).toBe('github.com');
  });

  test('stores savedAt as a number', async () => {
    chrome.storage.sync.get.mockResolvedValue({ savedPages: [] });
    document.getElementById('save-btn').click();
    await flushPromises();

    const saved = chrome.storage.sync.set.mock.calls[0][0].savedPages[0];
    expect(typeof saved.savedAt).toBe('number');
  });

  test('stores pageType returned by executeScript', async () => {
    chrome.scripting.executeScript
      .mockResolvedValueOnce([])                     // inject file
      .mockResolvedValueOnce([{ result: 'youtube' }]); // execute func
    chrome.storage.sync.get.mockResolvedValue({ savedPages: [] });
    document.getElementById('save-btn').click();
    await flushPromises();

    const saved = chrome.storage.sync.set.mock.calls[0][0].savedPages[0];
    expect(saved.pageType).toBe('youtube');
  });

  test('appends to existing savedPages without overwriting', async () => {
    const existing = { url: 'https://other.com', site: 'other.com', pageType: 'article', savedAt: 0 };
    chrome.storage.sync.get.mockResolvedValue({ savedPages: [existing] });
    document.getElementById('save-btn').click();
    await flushPromises();

    const saved = chrome.storage.sync.set.mock.calls[0][0].savedPages;
    expect(saved).toHaveLength(2);
  });

  test('save button stays enabled after saving', async () => {
    chrome.storage.sync.get.mockResolvedValue({ savedPages: [] });
    document.getElementById('save-btn').click();
    await flushPromises();

    expect(document.getElementById('save-btn').disabled).toBe(false);
  });

  test('shows "Saved!" feedback after saving', async () => {
    chrome.storage.sync.get.mockResolvedValue({ savedPages: [] });
    document.getElementById('save-btn').click();
    await flushPromises();

    const feedback = document.getElementById('feedback');
    expect(feedback.classList.contains('hidden')).toBe(false);
    expect(feedback.textContent).toBe('Saved!');
  });
});

// ─── unsave action — additional ──────────────────────────────────────────────

describe('unsave action — additional', () => {
  const TAB_URL = 'https://github.com/foo';
  const OTHER_URL = 'https://github.com/bar';
  // Saved with a deadline so the popup opens in the Mark read state;
  // the first click marks read, the second unsaves.
  const entry = { url: TAB_URL, site: 'github.com', pageType: 'article', savedAt: 1, readBy: Date.now() + 86400000 };
  const plainEntry = { url: TAB_URL, site: 'github.com', pageType: 'article', savedAt: 1 };

  beforeEach(async () => {
    setupPopup(TAB_URL, [], [entry]);
    await flushPromises();

    chrome.storage.sync.get.mockResolvedValue({ savedPages: [entry] });
    document.getElementById('save-btn').click(); // Mark read → Unsave state
    await flushPromises();
    chrome.storage.sync.set.mockClear();
  });

  test('does not remove other URLs on the same hostname', async () => {
    chrome.storage.sync.get.mockResolvedValue({
      savedPages: [plainEntry, { url: OTHER_URL, site: 'github.com', pageType: 'article', savedAt: 2 }],
    });
    document.getElementById('save-btn').click();
    await flushPromises();

    const saved = chrome.storage.sync.set.mock.calls[0][0].savedPages;
    expect(saved).toHaveLength(1);
    expect(saved[0].url).toBe(OTHER_URL);
  });

  test('shows "Unsaved" feedback after unsaving', async () => {
    chrome.storage.sync.get.mockResolvedValue({ savedPages: [plainEntry] });
    document.getElementById('save-btn').click();
    await flushPromises();

    const feedback = document.getElementById('feedback');
    expect(feedback.classList.contains('hidden')).toBe(false);
    expect(feedback.textContent).toBe('Unsaved');
  });

  test('save button stays enabled after unsaving', async () => {
    chrome.storage.sync.get.mockResolvedValue({ savedPages: [plainEntry] });
    document.getElementById('save-btn').click();
    await flushPromises();

    expect(document.getElementById('save-btn').disabled).toBe(false);
  });
});

// ─── block button ────────────────────────────────────────────────────────────

describe('block button', () => {
  beforeEach(async () => {
    setupPopup('https://twitter.com/home');
    await flushPromises();
  });

  test('saves {site, blockedAt} to storage when clicked', async () => {
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [] });
    document.getElementById('block-btn').click();
    await flushPromises();

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      blockedSites: [{ site: 'twitter.com', blockedAt: expect.any(Number) }],
    });
  });

  test('disables button and updates label after blocking', async () => {
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [] });
    document.getElementById('block-btn').click();
    await flushPromises();

    const btn = document.getElementById('block-btn');
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('Blocked');
  });

  test('shows feedback error and does not save when site is already blocked', async () => {
    chrome.storage.sync.get.mockResolvedValue({
      blockedSites: [{ site: 'twitter.com', blockedAt: 0 }],
    });
    document.getElementById('block-btn').click();
    await flushPromises();

    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    expect(document.getElementById('feedback').classList.contains('hidden')).toBe(false);
  });
});
