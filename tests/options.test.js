const flushPromises = () => new Promise((r) => setImmediate(r));

const OPTIONS_DOM = `
  <div class="segmented">
    <button class="seg-btn seg-btn--active" data-tab="saved">Saved</button>
    <button class="seg-btn" data-tab="blocked">Blocked</button>
  </div>

  <div id="tab-saved" class="tab-panel">
    <select id="filter-site-select"><option value="">All sites</option></select>
    <select id="sort-select">
      <option value="savedAt">Newest first</option>
      <option value="name">Name A-Z</option>
    </select>
    <select id="filter-type-select">
      <option value="">All types</option>
      <option value="article">Article</option>
      <option value="video">Video</option>
      <option value="audio">Audio</option>
      <option value="paper">Paper</option>
      <option value="docs">Docs</option>
      <option value="page">Page</option>
    </select>
    <span id="saved-count">0</span>
    <ul id="saved-list">
      <li id="saved-empty-state" class="empty-state">No pages saved yet.</li>
    </ul>
  </div>

  <div id="tab-blocked" class="tab-panel hidden">
    <input id="url-input" />
    <button id="add-btn">Add</button>
    <span id="add-error" class="hidden"></span>
    <section id="blocked-list-section" class="list-section collapsed">
      <h2 class="list-section-toggle" role="button" tabindex="0">
        Blocked sites <span id="count">0</span>
      </h2>
      <div class="collapsible-body">
        <ul id="site-list">
          <li id="empty-state" style="display:none"></li>
        </ul>
      </div>
    </section>
    <input type="checkbox" id="clear-history-toggle" />
    <input type="checkbox" id="unblock-cooldown-toggle" />
  </div>
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

// ─── tab switching ───────────────────────────────────────────────────────────

describe('tab switching', () => {
  beforeEach(async () => {
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [], savedPages: [] });
    jest.resetModules();
    require('../options');
    await flushPromises();
  });

  test('saved tab is active and blocked tab is hidden on load', () => {
    expect(document.getElementById('tab-saved').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('tab-blocked').classList.contains('hidden')).toBe(true);
  });

  test('clicking Blocked tab hides saved panel and shows blocked panel', () => {
    document.querySelector('.seg-btn[data-tab="blocked"]').click();
    expect(document.getElementById('tab-blocked').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('tab-saved').classList.contains('hidden')).toBe(true);
  });

  test('clicking Saved tab after Blocked restores saved panel', () => {
    document.querySelector('.seg-btn[data-tab="blocked"]').click();
    document.querySelector('.seg-btn[data-tab="saved"]').click();
    expect(document.getElementById('tab-saved').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('tab-blocked').classList.contains('hidden')).toBe(true);
  });
});

// ─── humaniseSite ────────────────────────────────────────────────────────────

describe('humaniseSite', () => {
  let humaniseSite;
  beforeEach(() => {
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [], savedPages: [] });
    jest.resetModules();
    ({ humaniseSite } = require('../options'));
  });

  test('capitalises the domain name for a two-part hostname', () => {
    expect(humaniseSite('github.com')).toBe('Github');
  });

  test('works with another two-part hostname', () => {
    expect(humaniseSite('reddit.com')).toBe('Reddit');
  });

  test('uses the domain name, not the subdomain, for subdomains', () => {
    expect(humaniseSite('code.claude.com')).toBe('Claude');
  });

  test('single-word hostname', () => {
    expect(humaniseSite('localhost')).toBe('Localhost');
  });
});

// ─── renderSavedList ──────────────────────────────────────────────────────────

describe('renderSavedList', () => {
  let renderSavedList;

  const e1 = { url: 'https://github.com/foo', site: 'github.com', pageType: 'article', savedAt: 2000 };
  const e2 = { url: 'https://arxiv.org/bar', site: 'arxiv.org', pageType: 'pdf', savedAt: 1000 };
  const e3 = { url: 'https://youtube.com/watch?v=abc', site: 'youtube.com', pageType: 'youtube', savedAt: 3000 };

  beforeEach(() => {
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [], savedPages: [] });
    jest.resetModules();
    ({ renderSavedList } = require('../options'));
  });

  test('renders newest first by default', () => {
    renderSavedList([e1, e2, e3]);
    const names = [...document.querySelectorAll('.saved-entry .entry-site')].map((el) => el.textContent);
    expect(names).toEqual(['Youtube', 'Github', 'Arxiv']);
  });

  test('renders alphabetically when sort is name', () => {
    document.getElementById('sort-select').value = 'name';
    renderSavedList([e1, e2, e3]);
    const names = [...document.querySelectorAll('.saved-entry .entry-site')].map((el) => el.textContent);
    expect(names).toEqual(['Arxiv', 'Github', 'Youtube']);
  });

  test('filters by site', () => {
    const opt = document.createElement('option');
    opt.value = 'github.com';
    document.getElementById('filter-site-select').appendChild(opt);
    document.getElementById('filter-site-select').value = 'github.com';

    renderSavedList([e1, e2, e3]);
    const items = document.querySelectorAll('.saved-entry');
    expect(items.length).toBe(1);
    expect(items[0].querySelector('.entry-site').textContent).toBe('Github');
  });

  test('filters by content type via type select', () => {
    document.getElementById('filter-type-select').value = 'paper';

    const entries = [
      { ...e1, pageType: 'article' },
      { ...e2, pageType: 'paper' },
      { ...e3, pageType: 'video' },
    ];
    renderSavedList(entries);
    const items = document.querySelectorAll('.saved-entry');
    expect(items.length).toBe(1);
    expect(items[0].querySelector('.entry-site').textContent).toBe('Arxiv');
  });

  test('updates saved count badge', () => {
    renderSavedList([e1, e2]);
    expect(document.getElementById('saved-count').textContent).toBe('2');
  });

  test('shows empty state when list is empty', () => {
    renderSavedList([]);
    const emptyState = document.getElementById('saved-empty-state');
    expect(emptyState.style.display).not.toBe('none');
    expect(emptyState.textContent).toBe('No pages saved yet.');
  });

  test('shows no-match message when filters eliminate all entries', () => {
    const opt = document.createElement('option');
    opt.value = 'github.com';
    document.getElementById('filter-site-select').appendChild(opt);
    document.getElementById('filter-site-select').value = 'github.com';

    renderSavedList([e2]); // only arxiv, filtered for github → nothing matches
    expect(document.getElementById('saved-empty-state').textContent).toBe('No pages match the current filters.');
  });

  test('populates site filter with unique sites from entries', () => {
    renderSavedList([e1, e2, e3]);
    const values = [...document.getElementById('filter-site-select').options].map((o) => o.value);
    expect(values).toContain('github.com');
    expect(values).toContain('arxiv.org');
    expect(values).toContain('youtube.com');
  });

  test('each entry has a favicon img with the correct src', () => {
    renderSavedList([e1]);
    const img = document.querySelector('.favicon-wrap img');
    expect(img).not.toBeNull();
    expect(img.src).toContain('github.com');
  });
});

// ─── renderSavedList — entry structure ───────────────────────────────────────

describe('renderSavedList — entry structure', () => {
  let renderSavedList;
  const entry = { url: 'https://github.com/anthropics/sdk', site: 'github.com', pageType: 'article', savedAt: 1748995200000, title: 'anthropic/anthropic-sdk-python' };

  beforeEach(() => {
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [], savedPages: [] });
    jest.resetModules();
    ({ renderSavedList } = require('../options'));
  });

  test('entry link href matches the saved URL', () => {
    renderSavedList([entry]);
    const link = document.querySelector('.saved-link');
    expect(link.getAttribute('href')).toBe(entry.url);
  });

  test('entry link opens in a new tab', () => {
    renderSavedList([entry]);
    const link = document.querySelector('.saved-link');
    expect(link.target).toBe('_blank');
  });

  test('entry-site shows the page title', () => {
    renderSavedList([entry]);
    expect(document.querySelector('.entry-site').textContent).toBe('anthropic/anthropic-sdk-python');
  });

  test('entry-path is not rendered', () => {
    renderSavedList([entry]);
    expect(document.querySelector('.entry-path')).toBeNull();
  });

  test('entry-meta contains the pageType', () => {
    renderSavedList([entry]);
    expect(document.querySelector('.entry-meta').textContent).toContain('article');
  });

  test('entry-meta contains the · separator', () => {
    renderSavedList([entry]);
    expect(document.querySelector('.entry-meta').textContent).toContain('·');
  });

  test('empty state is hidden when entries are present', () => {
    renderSavedList([entry]);
    expect(document.getElementById('saved-empty-state').style.display).toBe('none');
  });

  test('site filter option text is humanized', () => {
    renderSavedList([entry]);
    const opts = [...document.getElementById('filter-site-select').options];
    const githubOpt = opts.find((o) => o.value === 'github.com');
    expect(githubOpt.textContent).toBe('Github');
  });
});

// ─── renderSavedList — sort (additional) ─────────────────────────────────────

describe('renderSavedList — sort (additional)', () => {
  let renderSavedList;
  const e1 = { url: 'https://github.com/foo', site: 'github.com', pageType: 'article', savedAt: 2000 };
  const e2 = { url: 'https://arxiv.org/bar', site: 'arxiv.org', pageType: 'pdf', savedAt: 1000 };
  const e3 = { url: 'https://youtube.com/watch?v=abc', site: 'youtube.com', pageType: 'youtube', savedAt: 3000 };

  beforeEach(() => {
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [], savedPages: [] });
    jest.resetModules();
    ({ renderSavedList } = require('../options'));
  });

  test('Name A-Z sort is case-insensitive', () => {
    const mixed = [
      { url: 'https://zebra.com', site: 'zebra.com', pageType: 'article', savedAt: 3 },
      { url: 'https://apple.com', site: 'apple.com', pageType: 'article', savedAt: 2 },
      { url: 'https://mango.com', site: 'mango.com', pageType: 'article', savedAt: 1 },
    ];
    document.getElementById('sort-select').value = 'name';
    renderSavedList(mixed);

    const names = [...document.querySelectorAll('.saved-entry .entry-site')].map((el) => el.textContent);
    expect(names).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  test('switching sort back to newest first restores savedAt order', () => {
    document.getElementById('sort-select').value = 'name';
    renderSavedList([e1, e2, e3]);

    document.getElementById('sort-select').value = 'savedAt';
    renderSavedList([e1, e2, e3]);

    const names = [...document.querySelectorAll('.saved-entry .entry-site')].map((el) => el.textContent);
    expect(names).toEqual(['Youtube', 'Github', 'Arxiv']);
  });
});

// ─── renderSavedList — filter (additional) ───────────────────────────────────

describe('renderSavedList — filter (additional)', () => {
  let renderSavedList;
  const e1 = { url: 'https://github.com/foo', site: 'github.com', pageType: 'article', savedAt: 2000 };
  const e2 = { url: 'https://arxiv.org/bar', site: 'arxiv.org', pageType: 'pdf', savedAt: 1000 };
  const e3 = { url: 'https://youtube.com/watch?v=abc', site: 'youtube.com', pageType: 'youtube', savedAt: 3000 };

  beforeEach(() => {
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [], savedPages: [] });
    jest.resetModules();
    ({ renderSavedList } = require('../options'));
  });

  test('resetting site filter to "All sites" shows all entries', () => {
    const opt = document.createElement('option');
    opt.value = 'github.com';
    document.getElementById('filter-site-select').appendChild(opt);
    document.getElementById('filter-site-select').value = 'github.com';
    renderSavedList([e1, e2, e3]);

    document.getElementById('filter-site-select').value = '';
    renderSavedList([e1, e2, e3]);

    expect(document.querySelectorAll('.saved-entry').length).toBe(3);
  });

  test('count reflects filtered count, not total', () => {
    const opt = document.createElement('option');
    opt.value = 'github.com';
    document.getElementById('filter-site-select').appendChild(opt);
    document.getElementById('filter-site-select').value = 'github.com';

    renderSavedList([e1, e2, e3]);

    expect(document.getElementById('saved-count').textContent).toBe('1');
  });

  test('site and type filters combine as intersection', () => {
    const entries = [
      { url: 'https://github.com/a', site: 'github.com', pageType: 'article', savedAt: 4 },
      { url: 'https://github.com/b', site: 'github.com', pageType: 'youtube', savedAt: 3 },
      { url: 'https://reddit.com/a', site: 'reddit.com', pageType: 'article', savedAt: 2 },
    ];

    const opt = document.createElement('option');
    opt.value = 'github.com';
    document.getElementById('filter-site-select').appendChild(opt);
    document.getElementById('filter-site-select').value = 'github.com';
    document.getElementById('filter-type-select').value = 'article';

    renderSavedList(entries);

    const items = document.querySelectorAll('.saved-entry');
    expect(items.length).toBe(1);
    expect(items[0].querySelector('.entry-site').textContent).toBe('Github');
  });
});

// ─── count badge after removal ───────────────────────────────────────────────

describe('count badge after removal', () => {
  const e1 = { url: 'https://github.com/foo', site: 'github.com', pageType: 'article', savedAt: 2000 };
  const e2 = { url: 'https://reddit.com/bar', site: 'reddit.com', pageType: 'article', savedAt: 1000 };

  beforeEach(async () => {
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [], savedPages: [e1, e2] });
    jest.resetModules();
    require('../options');
    await flushPromises();
  });

  test('count decrements when a remove button is clicked', async () => {
    const removeBtn = document.querySelector('.saved-entry .remove-btn');
    removeBtn.click();
    await flushPromises();

    expect(document.getElementById('saved-count').textContent).toBe('1');
  });
});

// ─── removeSavedPage ─────────────────────────────────────────────────────────

describe('removeSavedPage', () => {
  let removeSavedPage;
  const entry = { url: 'https://github.com/foo', site: 'github.com', pageType: 'article', savedAt: 1000 };

  beforeEach(async () => {
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [], savedPages: [entry] });
    jest.resetModules();
    ({ removeSavedPage } = require('../options'));
    await flushPromises();
  });

  test('removes the entry from storage', async () => {
    chrome.storage.sync.set.mockClear();
    await removeSavedPage(entry.url);
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ savedPages: [] });
  });

  test('re-renders the list after removal', async () => {
    await removeSavedPage(entry.url);
    expect(document.querySelectorAll('.saved-entry').length).toBe(0);
  });
});

// ─── clearHistory toggle ──────────────────────────────────────────────────────

describe('clearHistory toggle', () => {
  beforeEach(async () => {
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [], clearHistory: true });
    jest.resetModules();
    require('../options');
    await flushPromises();
  });

  test('checkbox is checked when clearHistory is true', () => {
    expect(document.getElementById('clear-history-toggle').checked).toBe(true);
  });

  test('checkbox is unchecked when clearHistory is false', async () => {
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [], clearHistory: false });
    jest.resetModules();
    require('../options');
    await flushPromises();

    expect(document.getElementById('clear-history-toggle').checked).toBe(false);
  });

  test('clicking checkbox saves new value to storage', () => {
    const toggle = document.getElementById('clear-history-toggle');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ clearHistory: false });
  });
});

// ─── unblockCooldown toggle ───────────────────────────────────────────────────

describe('unblockCooldown toggle', () => {
  beforeEach(async () => {
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [], unblockCooldown: true });
    jest.resetModules();
    require('../options');
    await flushPromises();
  });

  test('checkbox is checked by default (unblockCooldown: true)', () => {
    expect(document.getElementById('unblock-cooldown-toggle').checked).toBe(true);
  });

  test('checkbox is unchecked when unblockCooldown is false', async () => {
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [], unblockCooldown: false });
    jest.resetModules();
    require('../options');
    await flushPromises();

    expect(document.getElementById('unblock-cooldown-toggle').checked).toBe(false);
  });

  test('toggling off saves unblockCooldown: false to storage', () => {
    const toggle = document.getElementById('unblock-cooldown-toggle');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ unblockCooldown: false });
  });

  test('when cooldown is off, locked sites render with enabled Remove button', async () => {
    const LOCKED_ENTRY = { site: 'twitter.com', blockedAt: Date.now() + 9999999 };
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [LOCKED_ENTRY], unblockCooldown: false });
    jest.resetModules();
    require('../options');
    await flushPromises();

    const buttons = document.querySelectorAll('.remove-btn');
    expect([...buttons].every((b) => !b.disabled)).toBe(true);
  });
});
