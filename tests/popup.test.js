const flushPromises = () => new Promise((r) => setImmediate(r));

const POPUP_DOM = `
  <span id="hostname">—</span>
  <button id="block-btn" disabled><span class="btn-label">Block this site</span></button>
  <button id="options-btn">Options</button>
  <div id="feedback" class="feedback hidden"></div>
`;

function setupPopup(tabUrl, blockedSites = []) {
  document.body.innerHTML = POPUP_DOM;
  chrome.tabs.query.mockResolvedValue(tabUrl ? [{ url: tabUrl }] : [{}]);
  chrome.storage.sync.get.mockResolvedValue({ blockedSites });
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
