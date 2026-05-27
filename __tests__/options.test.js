const flushPromises = () => new Promise((r) => setImmediate(r));

const OPTIONS_DOM = `
  <input id="url-input" />
  <button id="add-btn">Add</button>
  <span id="add-error" class="hidden"></span>
  <ul id="site-list">
    <li id="empty-state" style="display:none"></li>
  </ul>
  <span id="count">0</span>
`;

// ─── pure helpers (exported) ──────────────────────────────────────────────────

describe('normalise', () => {
  let normalise;
  beforeEach(() => {
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [] });
    jest.resetModules();
    ({ normalise } = require('../options'));
  });

  test('strips https:// prefix', () => {
    expect(normalise('https://facebook.com')).toBe('facebook.com');
  });

  test('strips http:// prefix', () => {
    expect(normalise('http://reddit.com')).toBe('reddit.com');
  });

  test('strips www. prefix', () => {
    expect(normalise('www.twitter.com')).toBe('twitter.com');
  });

  test('strips trailing slashes', () => {
    expect(normalise('youtube.com/')).toBe('youtube.com');
  });

  test('lowercases input', () => {
    expect(normalise('Facebook.COM')).toBe('facebook.com');
  });

  test('trims whitespace', () => {
    expect(normalise('  facebook.com  ')).toBe('facebook.com');
  });
});

describe('daysLeft', () => {
  let daysLeft;
  const LOCK_MS = 7 * 24 * 60 * 60 * 1000;

  beforeEach(() => {
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [] });
    jest.resetModules();
    ({ daysLeft } = require('../options'));
  });

  test('returns positive days when lock has not expired', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const blockedAt = now - 2 * 24 * 60 * 60 * 1000; // 2 days ago
    expect(daysLeft(blockedAt)).toBe(5);
  });

  test('returns 0 when lock has expired', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const blockedAt = now - LOCK_MS - 1000; // just past the lock
    expect(daysLeft(blockedAt)).toBe(0);
  });

  afterEach(() => jest.restoreAllMocks());
});

// ─── addSite (via DOM interaction) ───────────────────────────────────────────

describe('addSite', () => {
  beforeEach(async () => {
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [] });
    jest.resetModules();
    require('../options');
    await flushPromises();
  });

  test('saves a new site to storage', async () => {
    document.getElementById('url-input').value = 'reddit.com';
    document.getElementById('add-btn').click();
    await flushPromises();

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      blockedSites: [{ site: 'reddit.com', blockedAt: expect.any(Number) }],
    });
  });

  test('normalises URL before saving', async () => {
    document.getElementById('url-input').value = 'https://www.Facebook.com/';
    document.getElementById('add-btn').click();
    await flushPromises();

    const saved = chrome.storage.sync.set.mock.calls[0][0].blockedSites[0].site;
    expect(saved).toBe('facebook.com');
  });

  test('shows error and does not save when input is empty', async () => {
    document.getElementById('url-input').value = '';
    document.getElementById('add-btn').click();
    await flushPromises();

    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    expect(document.getElementById('add-error').classList.contains('hidden')).toBe(false);
  });

  test('shows error for duplicate site', async () => {
    chrome.storage.sync.get.mockResolvedValue({
      blockedSites: [{ site: 'reddit.com', blockedAt: 1000 }],
    });

    document.getElementById('url-input').value = 'reddit.com';
    document.getElementById('add-btn').click();
    await flushPromises();

    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    expect(document.getElementById('add-error').textContent).toContain('reddit.com');
  });

  test('clears input after successful add', async () => {
    const input = document.getElementById('url-input');
    input.value = 'reddit.com';
    document.getElementById('add-btn').click();
    await flushPromises();

    expect(input.value).toBe('');
  });
});

// ─── removeSite (via DOM interaction) ────────────────────────────────────────

describe('removeSite', () => {
  const UNLOCKED_ENTRY = { site: 'reddit.com', blockedAt: 0 }; // epoch → always unlocked
  const LOCKED_ENTRY = { site: 'twitter.com', blockedAt: Date.now() + 9999999 }; // future → always locked

  beforeEach(async () => {
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({
      blockedSites: [UNLOCKED_ENTRY, LOCKED_ENTRY],
    });
    jest.resetModules();
    require('../options');
    await flushPromises();
  });

  test('renders an enabled Remove button for unlocked sites', () => {
    const buttons = document.querySelectorAll('.remove-btn');
    const unlocked = [...buttons].find((b) => !b.disabled);
    expect(unlocked).toBeTruthy();
    expect(unlocked.textContent).toBe('Remove');
  });

  test('renders a disabled countdown button for locked sites', () => {
    const buttons = document.querySelectorAll('.remove-btn');
    const locked = [...buttons].find((b) => b.disabled);
    expect(locked).toBeTruthy();
    expect(locked.textContent).toMatch(/days? left/);
  });

  test('removes unlocked site from storage when Remove is clicked', async () => {
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [UNLOCKED_ENTRY, LOCKED_ENTRY] });

    const removeBtn = [...document.querySelectorAll('.remove-btn')].find((b) => !b.disabled);
    removeBtn.click();
    await flushPromises();

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      blockedSites: [LOCKED_ENTRY],
    });
  });
});
