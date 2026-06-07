const flushPromises = () => new Promise((r) => setImmediate(r));

const POPUP_DOM = `
  <span id="hostname">—</span>
  <button id="save-btn" class="btn btn-save" disabled><span class="btn-label">Save</span></button>
  <button id="block-btn" disabled><span class="btn-label">Block this site</span></button>
  <button id="options-btn">Options</button>
  <div id="feedback" class="feedback hidden"></div>
`;

function setupPopup(tabUrl, blockedSites = [], savedPages = []) {
  document.body.innerHTML = POPUP_DOM;
  chrome.tabs.query.mockResolvedValue(tabUrl ? [{ url: tabUrl, id: 1 }] : [{}]);
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
    expect(btn.textContent).toBe('Already blocked');
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

  test('shows "Unsave" on init when URL is already saved', async () => {
    setupPopup(TAB_URL, [], [SAVED_ENTRY]);
    await flushPromises();

    const btn = document.getElementById('save-btn');
    expect(btn.querySelector('.btn-label').textContent).toBe('Unsave');
    expect(btn.disabled).toBe(false);
  });

  test('shows "Save" on init when URL is not yet saved', async () => {
    setupPopup(TAB_URL);
    await flushPromises();

    expect(document.getElementById('save-btn').querySelector('.btn-label').textContent).toBe('Save');
  });

  test('clicking Save calls executeScript twice, stores entry, and shows "Unsave"', async () => {
    setupPopup(TAB_URL);
    await flushPromises();

    chrome.storage.sync.get.mockResolvedValue({ savedPages: [] });
    document.getElementById('save-btn').click();
    await flushPromises();

    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(2);
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      savedPages: [expect.objectContaining({ url: TAB_URL, site: 'github.com', pageType: 'article' })],
    });
    expect(document.getElementById('save-btn').querySelector('.btn-label').textContent).toBe('Unsave');
  });

  test('clicking Unsave removes entry from storage and shows "Save"', async () => {
    setupPopup(TAB_URL, [], [SAVED_ENTRY]);
    await flushPromises();

    chrome.storage.sync.get.mockResolvedValue({ savedPages: [SAVED_ENTRY] });
    document.getElementById('save-btn').click();
    await flushPromises();

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ savedPages: [] });
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
    expect(btn.textContent).toBe('Already blocked');
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
