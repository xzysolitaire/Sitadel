const flushPromises = () => new Promise((r) => setImmediate(r));

const OPTIONS_DOM = `
  <div class="segmented">
    <button class="seg-btn" data-tab="toread">Readlist <span id="toread-badge" class="seg-badge hidden">0</span></button>
    <button class="seg-btn seg-btn--active" data-tab="saved">Saved</button>
    <button class="seg-btn" data-tab="blocked">Blocked</button>
  </div>

  <div id="tab-toread" class="tab-panel hidden">
    <div id="toread-sections"></div>
    <div id="toread-empty-state" class="empty-state">No pages with a read-by deadline yet.</div>
    <div id="open-list-area" class="open-list-area hidden">
      <div id="open-list-picker" class="open-list-picker hidden"></div>
      <button id="open-list-btn">Open List</button>
    </div>
    <input type="checkbox" id="unsave-on-remove-toggle" />
  </div>

  <div id="tab-saved" class="tab-panel">
    <select id="filter-site-select"><option value="">All sites</option></select>
    <select id="sort-select">
      <option value="savedAt">Newest first</option>
      <option value="savedAtAsc">Earliest first</option>
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

  test('clicking TO READ tab shows toread panel and hides the others', () => {
    document.querySelector('.seg-btn[data-tab="toread"]').click();
    expect(document.getElementById('tab-toread').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('tab-saved').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('tab-blocked').classList.contains('hidden')).toBe(true);
    expect(
      document.querySelector('.seg-btn[data-tab="toread"]').classList.contains('seg-btn--active'),
    ).toBe(true);
  });
});

// ─── default tab logic ───────────────────────────────────────────────────────

describe('default tab on load', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  async function loadWith(savedPages) {
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [], savedPages });
    jest.resetModules();
    require('../options');
    await flushPromises();
  }

  test('activates TO READ tab when an entry has a readBy deadline', async () => {
    await loadWith([
      { url: 'https://a.com', site: 'a.com', pageType: 'article', savedAt: 1, readBy: Date.now() + DAY_MS },
    ]);

    expect(document.getElementById('tab-toread').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('tab-saved').classList.contains('hidden')).toBe(true);
  });

  test('activates Saved tab when no entry has a readBy deadline', async () => {
    await loadWith([
      { url: 'https://a.com', site: 'a.com', pageType: 'article', savedAt: 1 },
    ]);

    expect(document.getElementById('tab-saved').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('tab-toread').classList.contains('hidden')).toBe(true);
  });

  test('activates Saved tab when there are no saved pages at all', async () => {
    await loadWith([]);

    expect(document.getElementById('tab-saved').classList.contains('hidden')).toBe(false);
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

  test('earliest first sort renders oldest entry first', () => {
    document.getElementById('sort-select').value = 'savedAtAsc';
    renderSavedList([e1, e2, e3]);

    const names = [...document.querySelectorAll('.saved-entry .entry-site')].map((el) => el.textContent);
    expect(names).toEqual(['Arxiv', 'Github', 'Youtube']);
  });

  test('earliest first is the reverse of newest first', () => {
    document.getElementById('sort-select').value = 'savedAt';
    renderSavedList([e1, e2, e3]);
    const newest = [...document.querySelectorAll('.saved-entry .entry-site')].map((el) => el.textContent);

    document.getElementById('sort-select').value = 'savedAtAsc';
    renderSavedList([e1, e2, e3]);
    const earliest = [...document.querySelectorAll('.saved-entry .entry-site')].map((el) => el.textContent);

    expect(earliest).toEqual([...newest].reverse());
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

// ─── renderToReadList ────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

const toreadEntry = (url, readBy, extra = {}) => ({
  url,
  site: 'github.com',
  pageType: 'article',
  savedAt: 1000,
  title: `Title ${url}`,
  readBy,
  ...extra,
});

describe('renderToReadList', () => {
  let renderToReadList;

  beforeEach(() => {
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [], savedPages: [] });
    jest.resetModules();
    ({ renderToReadList } = require('../options'));
  });

  test('groups entries into deadline sections with count pills in headers', () => {
    renderToReadList([
      toreadEntry('a', Date.now() - 2 * DAY_MS),
      toreadEntry('b', Date.now() - 3 * DAY_MS),
      toreadEntry('c', Date.now() + 5 * DAY_MS),
    ]);

    const headers = [...document.querySelectorAll('.toread-section-header')].map((h) => ({
      label: h.firstChild.textContent,
      count: h.querySelector('.count.count--blue').textContent,
    }));
    expect(headers).toEqual([
      { label: 'Past due', count: '2' },
      { label: 'Within one week', count: '1' },
    ]);
  });

  test('empty sections are not rendered', () => {
    renderToReadList([toreadEntry('a', Date.now() + 5 * DAY_MS)]);

    expect(document.querySelectorAll('.toread-section')).toHaveLength(1);
    expect(document.querySelector('.toread-section--week')).not.toBeNull();
  });

  test('entries without readBy appear in the Backlog section', () => {
    renderToReadList([
      { url: 'plain', site: 'github.com', pageType: 'article', savedAt: 1 },
      toreadEntry('a', Date.now() + DAY_MS / 2),
    ]);

    expect(document.querySelectorAll('.toread-entry')).toHaveLength(2);
    expect(document.querySelector('.toread-section--backlog')).not.toBeNull();
  });

  test('within a section items are sorted by deadline ascending', () => {
    renderToReadList([
      toreadEntry('later', Date.now() + 6 * DAY_MS),
      toreadEntry('sooner', Date.now() + 4 * DAY_MS),
    ]);

    const titles = [...document.querySelectorAll('.toread-entry .entry-site')].map((el) => el.textContent);
    expect(titles).toEqual(['Title sooner', 'Title later']);
  });

  test('tab badge shows total TO READ count and becomes visible', () => {
    renderToReadList([
      toreadEntry('a', Date.now() + DAY_MS / 2),
      toreadEntry('b', Date.now() + 5 * DAY_MS),
    ]);

    const badge = document.getElementById('toread-badge');
    expect(badge.textContent).toBe('2');
    expect(badge.classList.contains('hidden')).toBe(false);
  });

  test('tab badge is hidden only when there are no entries at all', () => {
    renderToReadList([]);
    expect(document.getElementById('toread-badge').classList.contains('hidden')).toBe(true);
  });

  test('tab badge counts backlog entries too', () => {
    renderToReadList([{ url: 'plain', site: 'x.com', pageType: 'article', savedAt: 1 }]);
    const badge = document.getElementById('toread-badge');
    expect(badge.textContent).toBe('1');
    expect(badge.classList.contains('hidden')).toBe(false);
  });

  test('empty state is hidden when there are only Backlog entries', () => {
    renderToReadList([{ url: 'plain', site: 'x.com', pageType: 'article', savedAt: 1 }]);

    expect(document.getElementById('toread-empty-state').style.display).toBe('none');
  });

  test('empty state is shown only when there are no TO READ items', () => {
    renderToReadList([]);
    expect(document.getElementById('toread-empty-state').style.display).toBe('block');

    renderToReadList([toreadEntry('a', Date.now() + DAY_MS / 2)]);
    expect(document.getElementById('toread-empty-state').style.display).toBe('none');
  });

  test('overdue items show a days-overdue label', () => {
    renderToReadList([toreadEntry('a', Date.now() - 3 * DAY_MS)]);

    expect(document.querySelector('.overdue-label').textContent).toMatch(/3 days overdue/);
  });

  test('non-overdue items have no overdue label', () => {
    renderToReadList([toreadEntry('a', Date.now() + 5 * DAY_MS)]);

    expect(document.querySelector('.overdue-label')).toBeNull();
  });

  test('item title links to the URL and opens in a new tab', () => {
    renderToReadList([toreadEntry('https://github.com/foo', Date.now() + DAY_MS / 2)]);

    const link = document.querySelector('.toread-entry a');
    expect(link.getAttribute('href')).toBe('https://github.com/foo');
    expect(link.target).toBe('_blank');
  });

  test('meta line shows site, pageType and the saved date (not the due date)', () => {
    const readBy = new Date('2026-06-15T12:00:00').getTime();
    const savedAt = new Date('2026-06-01T09:00:00').getTime();
    renderToReadList([toreadEntry('a', readBy, { savedAt })]);

    expect(document.querySelector('.toread-entry .entry-meta').textContent).toBe(
      'Github · article · Jun 1, 2026',
    );
  });

  test('rows animate in on their first render', () => {
    renderToReadList([toreadEntry('a', Date.now() + DAY_MS / 2)]);

    expect(
      document.querySelector('.toread-entry').classList.contains('toread-entry--entering'),
    ).toBe(true);
  });

  test('surviving rows do not replay the entry animation on re-render', () => {
    const a = toreadEntry('a', Date.now() + DAY_MS / 2);
    const b = toreadEntry('b', Date.now() + 5 * DAY_MS);
    renderToReadList([a, b]);
    renderToReadList([a]); // b removed → a re-rendered but already on screen

    const row = document.querySelector('.toread-entry');
    expect(row.classList.contains('toread-entry--entering')).toBe(false);
  });

  test('a newly added row animates in while existing rows stay static', () => {
    const a = toreadEntry('a', Date.now() + DAY_MS / 2);
    const b = toreadEntry('b', Date.now() + 5 * DAY_MS);
    renderToReadList([a]);
    renderToReadList([a, b]);

    const entering = [...document.querySelectorAll('.toread-entry--entering')];
    expect(entering).toHaveLength(1);
    expect(entering[0].querySelector('.entry-site').textContent).toBe('Title b');
  });

  test('each deadlined item renders favicon, deadline chip, Mark read and Remove buttons', () => {
    renderToReadList([toreadEntry('a', Date.now() + DAY_MS / 2)]);

    const item = document.querySelector('.toread-entry');
    expect(item.querySelector('.favicon-wrap img').src).toContain('github.com');
    expect(item.querySelector('.deadline-chip')).not.toBeNull();
    const markRead = item.querySelector('.mark-read-btn');
    expect(markRead.textContent).toBe('✓');
    expect(markRead.title).toBe('Mark read');
    expect(item.querySelector('.remove-btn')).not.toBeNull();
  });

  test('chip shows "Due in N days" for week-section items', () => {
    renderToReadList([toreadEntry('a', Date.now() + 3 * DAY_MS)]);
    const chip = document.querySelector('.deadline-chip');
    expect(chip).not.toBeNull();
    expect(chip.textContent).toMatch(/Due in 3 days/);
  });

  test('chip shows "Snooze" for past-due items', () => {
    renderToReadList([toreadEntry('a', Date.now() - 2 * DAY_MS)]);
    const chip = document.querySelector('.deadline-chip');
    expect(chip).not.toBeNull();
    expect(chip.textContent).toBe('Snooze');
  });

  test('chip is hidden for month/later sections', () => {
    renderToReadList([toreadEntry('a', Date.now() + 15 * DAY_MS)]);
    expect(document.querySelector('.deadline-chip')).toBeNull();
  });

  test('backlog items have no chip and no mark-read button', () => {
    renderToReadList([{ url: 'b', site: 'x.com', pageType: 'article', savedAt: 1 }]);
    const item = document.querySelector('.toread-entry');
    expect(item.querySelector('.deadline-chip')).toBeNull();
    expect(item.querySelector('.mark-read-btn')).toBeNull();
    expect(item.querySelector('.remove-btn')).not.toBeNull();
  });
});

// ─── rolling days picker ──────────────────────────────────────────────────────

describe('rolling days picker', () => {
  const entry = toreadEntry('https://github.com/foo', Date.now() + DAY_MS / 2);

  beforeEach(async () => {
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [], savedPages: [entry] });
    jest.resetModules();
    require('../options');
    await flushPromises();
  });

  test('clicking the chip opens a roller with the expected options', () => {
    document.querySelector('.deadline-chip').click();

    const options = [...document.querySelectorAll('.deadline-roller-option')].map((o) => o.textContent);
    expect(options).toEqual(['—', '+1 day', '+3 days', '+7 days', '+30 days', 'Remove deadline']);
  });

  test('"—" closes the roller without writing to storage', async () => {
    document.querySelector('.deadline-chip').click();
    document.querySelector('.deadline-roller-option--noop').click();
    await flushPromises();

    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    expect(document.querySelector('.deadline-roller')).toBeNull();
  });

  test('selecting "+7 days" sets readBy to 7 days from now', async () => {
    document.querySelector('.deadline-chip').click();
    [...document.querySelectorAll('.deadline-roller-option')]
      .find((o) => o.textContent === '+7 days').click();
    await flushPromises();

    const saved = chrome.storage.sync.set.mock.calls[0][0].savedPages[0];
    expect(saved.readBy).toBeGreaterThan(Date.now() + 6.9 * DAY_MS);
    expect(saved.readBy).toBeLessThanOrEqual(Date.now() + 7 * DAY_MS);
  });

  test('selecting "+7 days" closes the roller and re-renders the chip', async () => {
    document.querySelector('.deadline-chip').click();
    [...document.querySelectorAll('.deadline-roller-option')]
      .find((o) => o.textContent === '+7 days').click();
    await flushPromises();

    expect(document.querySelector('.deadline-roller')).toBeNull();
    expect(document.querySelector('.deadline-chip')).not.toBeNull();
  });

  test('"Remove deadline" clears readBy and re-renders', async () => {
    document.querySelector('.deadline-chip').click();
    document.querySelector('.deadline-roller-option--remove').click();
    await flushPromises();

    const saved = chrome.storage.sync.set.mock.calls[0][0].savedPages[0];
    expect(saved).not.toHaveProperty('readBy');
    expect(document.querySelector('.deadline-roller')).toBeNull();
  });

  test('tapping the chip again dismisses the picker', () => {
    document.querySelector('.deadline-chip').click();
    expect(document.querySelector('.deadline-roller')).not.toBeNull();
    document.querySelector('.deadline-chip').click();
    expect(document.querySelector('.deadline-roller')).toBeNull();
  });

  test('opening a second roller closes the first', () => {
    const entries2 = [
      toreadEntry('u1', Date.now() + DAY_MS / 2),
      toreadEntry('u2', Date.now() + 2 * DAY_MS),
    ];
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [], savedPages: entries2 });
    jest.resetModules();
    require('../options');
    return flushPromises().then(() => {
      const chips = document.querySelectorAll('.deadline-chip');
      chips[0].click();
      expect(document.querySelectorAll('.deadline-roller')).toHaveLength(1);
      chips[1].click();
      expect(document.querySelectorAll('.deadline-roller')).toHaveLength(1);
    });
  });
});

// ─── Mark read & Remove on TO READ tab ───────────────────────────────────────

describe('TO READ Mark read and Remove', () => {
  const entry = toreadEntry('https://github.com/foo', Date.now() + DAY_MS / 2);

  // The row-exit animation (300 ms jsdom fallback) runs before storage updates
  const waitForRowExit = () => new Promise((r) => setTimeout(r, 350));

  beforeEach(async () => {
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [], savedPages: [entry] });
    jest.resetModules();
    require('../options');
    await flushPromises();
  });

  test('Mark read tags the leaving row for the exit animation', () => {
    const row = document.querySelector('.toread-entry');
    document.querySelector('.mark-read-btn').click();

    expect(row.classList.contains('toread-entry--leaving')).toBe(true);
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  test('Mark read removes readBy from storage but keeps the entry', async () => {
    document.querySelector('.mark-read-btn').click();
    await waitForRowExit();
    await flushPromises();

    const saved = chrome.storage.sync.set.mock.calls[0][0].savedPages;
    expect(saved).toHaveLength(1);
    expect(saved[0].url).toBe(entry.url);
    expect(saved[0]).not.toHaveProperty('readBy');
  });

  test('Mark read removes the item from TO READ but keeps it in Saved', async () => {
    document.querySelector('.mark-read-btn').click();
    await waitForRowExit();
    await flushPromises();

    expect(document.querySelectorAll('.toread-entry')).toHaveLength(0);
    expect(document.querySelectorAll('.saved-entry')).toHaveLength(1);
  });

  test('× takes the page off the read list but keeps it in storage by default', async () => {
    document.querySelector('.toread-entry .remove-btn').click();
    await waitForRowExit();
    await flushPromises();

    const saved = chrome.storage.sync.set.mock.calls[0][0].savedPages;
    expect(saved).toHaveLength(1);
    expect(saved[0]).not.toHaveProperty('readBy');
  });

  test('× clears the item from the Readlist tab but not from Saved by default', async () => {
    document.querySelector('.toread-entry .remove-btn').click();
    await waitForRowExit();
    await flushPromises();

    expect(document.querySelectorAll('.toread-entry')).toHaveLength(0);
    expect(document.querySelectorAll('.saved-entry')).toHaveLength(1);
  });
});

// ─── Mark read — surgical removal, no full re-render (flash fix) ────────────

describe('Mark read removes only the affected row', () => {
  // Three entries in the same 7-days bucket so the section survives removal
  const e1 = toreadEntry('u1', Date.now() + 4 * DAY_MS);
  const e2 = toreadEntry('u2', Date.now() + 5 * DAY_MS);
  const e3 = toreadEntry('u3', Date.now() + 6 * DAY_MS);

  const waitForRowExit = () => new Promise((r) => setTimeout(r, 350));

  beforeEach(async () => {
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [], savedPages: [e1, e2, e3] });
    jest.resetModules();
    require('../options');
    await flushPromises();
  });

  test('sibling rows keep their exact DOM nodes (no rebuild)', async () => {
    const rowsBefore = [...document.querySelectorAll('.toread-entry')];
    rowsBefore[1].querySelector('.mark-read-btn').click(); // middle row
    await waitForRowExit();
    await flushPromises();

    const rowsAfter = [...document.querySelectorAll('.toread-entry')];
    expect(rowsAfter).toHaveLength(2);
    expect(rowsAfter[0]).toBe(rowsBefore[0]);
    expect(rowsAfter[1]).toBe(rowsBefore[2]);
  });

  test('section count pill updates in place', async () => {
    document.querySelectorAll('.mark-read-btn')[1].click();
    await waitForRowExit();
    await flushPromises();

    expect(document.querySelector('.toread-section-header .count').textContent).toBe('2');
    // Badge counts all entries including the one moved to Backlog
    expect(document.getElementById('toread-badge').textContent).toBe('3');
  });

  test("the page's own storage echo does not rebuild the list", async () => {
    const rowsBefore = [...document.querySelectorAll('.toread-entry')];
    rowsBefore[1].querySelector('.mark-read-btn').click();
    await waitForRowExit();
    await flushPromises();

    // Simulate chrome.storage.onChanged firing for our own write
    const written = chrome.storage.sync.set.mock.calls[0][0].savedPages;
    const listener = chrome.storage.onChanged.addListener.mock.calls[0][0];
    listener({ savedPages: { newValue: written } }, 'sync');

    const rowsAfter = [...document.querySelectorAll('.toread-entry')];
    expect(rowsAfter[0]).toBe(rowsBefore[0]);
    expect(rowsAfter[1]).toBe(rowsBefore[2]);
  });

  test('an external storage change still re-renders the list', async () => {
    const listener = chrome.storage.onChanged.addListener.mock.calls[0][0];
    listener({ savedPages: { newValue: [e1] } }, 'sync');

    expect(document.querySelectorAll('.toread-entry')).toHaveLength(1);
  });

  test('the section disappears when its last row is marked read', async () => {
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [], savedPages: [e1] });
    jest.resetModules();
    require('../options');
    await flushPromises();

    document.querySelector('.mark-read-btn').click();
    await waitForRowExit();
    await flushPromises();

    expect(document.querySelectorAll('.toread-section')).toHaveLength(0);
    // Item moved to Backlog (no readBy): totalCount=1, empty state hidden, badge shows 1
    expect(document.getElementById('toread-empty-state').style.display).toBe('none');
    expect(document.getElementById('toread-badge').textContent).toBe('1');
    expect(document.getElementById('toread-badge').classList.contains('hidden')).toBe(false);
  });
});

// ─── unsave on readlist removal ──────────────────────────────────────────────

describe('unsave on readlist removal setting', () => {
  const entry = toreadEntry('https://github.com/foo', Date.now() + DAY_MS / 2);
  const waitForRowExit = () => new Promise((r) => setTimeout(r, 350));

  async function loadOptions({ unsaveOnReadlistRemove, savedPages = [entry] } = {}) {
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [], savedPages, unsaveOnReadlistRemove });
    jest.resetModules();
    require('../options');
    await flushPromises();
  }

  test('toggle is unchecked by default', async () => {
    await loadOptions();
    expect(document.getElementById('unsave-on-remove-toggle').checked).toBe(false);
  });

  test('toggle reflects a stored true value', async () => {
    await loadOptions({ unsaveOnReadlistRemove: true });
    expect(document.getElementById('unsave-on-remove-toggle').checked).toBe(true);
  });

  test('toggling on persists unsaveOnReadlistRemove: true', async () => {
    await loadOptions();

    const toggle = document.getElementById('unsave-on-remove-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ unsaveOnReadlistRemove: true });
  });

  test('× deletes the entry entirely when the setting is on', async () => {
    await loadOptions({ unsaveOnReadlistRemove: true });

    document.querySelector('.toread-entry .remove-btn').click();
    await waitForRowExit();
    await flushPromises();

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ savedPages: [] });
    expect(document.querySelectorAll('.toread-entry')).toHaveLength(0);
    expect(document.querySelectorAll('.saved-entry')).toHaveLength(0);
  });

  test('× only takes the page off the read list when the setting is off', async () => {
    await loadOptions({ unsaveOnReadlistRemove: false });

    document.querySelector('.toread-entry .remove-btn').click();
    await waitForRowExit();
    await flushPromises();

    const saved = chrome.storage.sync.set.mock.calls[0][0].savedPages;
    expect(saved).toHaveLength(1);
    expect(saved[0]).not.toHaveProperty('readBy');
    expect(document.querySelectorAll('.toread-entry')).toHaveLength(0);
    expect(document.querySelectorAll('.saved-entry')).toHaveLength(1);
  });

  test('Mark read keeps the page in Saved even when the setting is on', async () => {
    await loadOptions({ unsaveOnReadlistRemove: true });

    document.querySelector('.mark-read-btn').click();
    await waitForRowExit();
    await flushPromises();

    const saved = chrome.storage.sync.set.mock.calls[0][0].savedPages;
    expect(saved).toHaveLength(1);
    expect(saved[0]).not.toHaveProperty('readBy');
    expect(document.querySelectorAll('.saved-entry')).toHaveLength(1);
  });
});

// ─── Open List ───────────────────────────────────────────────────────────────

describe('Open List', () => {
  // 8 TO READ entries with ascending deadlines: u1 overdue, the rest spread out
  const entries = [
    toreadEntry('u1', Date.now() - 2 * DAY_MS),
    ...[1, 2, 4, 8, 12, 20, 40].map((d, i) => toreadEntry(`u${i + 2}`, Date.now() + d * DAY_MS)),
    { url: 'plain', site: 'x.com', pageType: 'article', savedAt: 1 },
  ];

  beforeEach(async () => {
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [], savedPages: entries });
    jest.resetModules();
    require('../options');
    await flushPromises();
  });

  test('Open List area is visible when TO READ items exist', () => {
    expect(document.getElementById('open-list-area').classList.contains('hidden')).toBe(false);
  });

  test('clicking Open List lists all TO READ items with the imminent set pre-checked', () => {
    document.getElementById('open-list-btn').click();

    const checkboxes = [...document.querySelectorAll('#open-list-picker input[type="checkbox"]')];
    expect(checkboxes).toHaveLength(8);
    const checked = checkboxes.filter((c) => c.checked).map((c) => c.value);
    expect(checked).toEqual(['u1', 'u2', 'u3', 'u4', 'u5', 'u6']);
  });

  test('confirm button label shows the selected count and updates on change', () => {
    document.getElementById('open-list-btn').click();

    const confirmBtn = document.getElementById('open-selected-btn');
    expect(confirmBtn.textContent).toBe('Open Selected (6)');

    const firstChecked = document.querySelector('#open-list-picker input:checked');
    firstChecked.checked = false;
    firstChecked.dispatchEvent(new Event('change'));

    expect(confirmBtn.textContent).toBe('Open Selected (5)');
  });

  test('confirm opens a new window with the selected URLs and closes the picker', async () => {
    document.getElementById('open-list-btn').click();
    document.getElementById('open-selected-btn').click();
    await flushPromises();

    expect(chrome.windows.create).toHaveBeenCalledWith({
      url: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'],
    });
    expect(document.getElementById('open-list-picker').classList.contains('hidden')).toBe(true);
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  test('Cancel closes the picker without opening a window', () => {
    document.getElementById('open-list-btn').click();
    document.querySelector('.open-list-cancel').click();

    expect(chrome.windows.create).not.toHaveBeenCalled();
    expect(document.getElementById('open-list-picker').classList.contains('hidden')).toBe(true);
  });

  test('Open List area is hidden when no TO READ items exist', async () => {
    document.body.innerHTML = OPTIONS_DOM;
    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [], savedPages: [] });
    jest.resetModules();
    require('../options');
    await flushPromises();

    expect(document.getElementById('open-list-area').classList.contains('hidden')).toBe(true);
  });
});
