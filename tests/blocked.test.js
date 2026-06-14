const flushPromises = () => new Promise((r) => setImmediate(r));

const DAY_MS = 24 * 60 * 60 * 1000;

const BLOCKED_DOM = `
  <div id="site-name"></div>
  <a id="options-link" href="#">Manage sites</a>
  <div id="toread-section" hidden>
    <h2>Your reading list</h2>
    <ul id="toread-list"></ul>
    <button id="open-list-btn">Open List</button>
  </div>
`;

const toreadEntry = (url, readBy) => ({
  url,
  site: 'github.com',
  pageType: 'article',
  savedAt: 1000,
  title: `Title ${url}`,
  readBy,
});

async function setupBlocked(savedPages) {
  document.body.innerHTML = BLOCKED_DOM;
  chrome.storage.sync.get.mockResolvedValue({ savedPages });
  jest.resetModules();
  require('../blocked');
  await flushPromises();
}

// ─── TO READ section ─────────────────────────────────────────────────────────

describe('blocked page TO READ section', () => {
  test('section stays hidden when no saved page has a deadline', async () => {
    await setupBlocked([
      { url: 'plain', site: 'x.com', pageType: 'article', savedAt: 1 },
    ]);

    expect(document.getElementById('toread-section').hidden).toBe(true);
  });

  test('section stays hidden when there are no saved pages', async () => {
    await setupBlocked([]);

    expect(document.getElementById('toread-section').hidden).toBe(true);
  });

  test('section becomes visible when TO READ items exist', async () => {
    await setupBlocked([toreadEntry('a', Date.now() + DAY_MS)]);

    expect(document.getElementById('toread-section').hidden).toBe(false);
  });

  test('renders at most 6 items, overdue first then soonest deadline', async () => {
    const entries = [
      toreadEntry('overdue', Date.now() - 2 * DAY_MS),
      ...[1, 2, 4, 8, 12, 20, 40].map((d, i) => toreadEntry(`u${i + 1}`, Date.now() + d * DAY_MS)),
    ];
    await setupBlocked(entries);

    const titles = [...document.querySelectorAll('.toread-item .toread-title')].map((el) => el.textContent);
    expect(titles).toEqual([
      'Title overdue', 'Title u1', 'Title u2', 'Title u3', 'Title u4', 'Title u5',
    ]);
  });

  test('item titles are plain text, not links', async () => {
    await setupBlocked([toreadEntry('a', Date.now() + DAY_MS)]);

    expect(document.querySelector('#toread-list a')).toBeNull();
  });

  test('meta line shows site and deadline date', async () => {
    const readBy = new Date('2026-06-15T12:00:00').getTime();
    await setupBlocked([toreadEntry('a', readBy)]);

    expect(document.querySelector('.toread-meta').textContent).toBe('Github · Jun 15, 2026');
  });

  test('overdue items show an overdue label', async () => {
    await setupBlocked([toreadEntry('a', Date.now() - 3 * DAY_MS)]);

    expect(document.querySelector('.toread-overdue').textContent).toMatch(/3 days overdue/);
  });

  test('non-overdue items have no overdue label', async () => {
    await setupBlocked([toreadEntry('a', Date.now() + DAY_MS)]);

    expect(document.querySelector('.toread-overdue')).toBeNull();
  });
});

// ─── Open List ───────────────────────────────────────────────────────────────

describe('blocked page Open List', () => {
  const entries = [
    toreadEntry('overdue', Date.now() - 2 * DAY_MS),
    ...[1, 2, 4, 8, 12, 20, 40].map((d, i) => toreadEntry(`u${i + 1}`, Date.now() + d * DAY_MS)),
  ];

  test('opens the presented list (top 6) directly in a new window, no selection step', async () => {
    await setupBlocked(entries);
    document.getElementById('open-list-btn').click();
    await flushPromises();

    expect(chrome.windows.create).toHaveBeenCalledWith({
      url: ['overdue', 'u1', 'u2', 'u3', 'u4', 'u5'],
    });
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  test('does not open a window when there is nothing to read', async () => {
    await setupBlocked([]);
    document.getElementById('open-list-btn').click();
    await flushPromises();

    expect(chrome.windows.create).not.toHaveBeenCalled();
  });
});
