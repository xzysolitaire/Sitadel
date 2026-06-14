const flushPromises = () => new Promise((r) => setImmediate(r));

const POPUP_DOM = `
  <span id="hostname">—</span>
  <span id="page-title" class="page-title">—</span>
  <div id="save-label" class="save-label hidden"></div>
  <button id="save-btn" class="btn btn-save" disabled><span class="btn-label">Save</span></button>
  <button id="block-btn" disabled><span class="btn-label">Block this site</span></button>
  <button id="options-btn">Options</button>
  <div id="deadline-picker" class="deadline-picker">
    <div class="deadline-picker-inner">
      <button class="pill" data-option="Tomorrow">Tomorrow</button>
      <button class="pill" data-option="3 days">3 days</button>
      <button class="pill" data-option="7 days">7 days</button>
      <button class="pill" data-option="30 days">30 days</button>
      <button class="pill" data-option="3 months">3 months</button>
      <button class="pill pill--backlog" data-option="backlog">Backlog</button>
    </div>
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

  test('disables Save on a blocked site (mutually exclusive with blocking)', async () => {
    setupPopup('https://reddit.com', [{ site: 'reddit.com', blockedAt: 0 }]);
    await flushPromises();

    expect(document.getElementById('save-btn').disabled).toBe(true);
  });

  test('blocking the current site disables Save live', async () => {
    setupPopup('https://reddit.com', []);
    await flushPromises();
    expect(document.getElementById('save-btn').disabled).toBe(false);

    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [] });
    document.getElementById('block-btn').click();
    await flushPromises();

    expect(document.getElementById('save-btn').disabled).toBe(true);
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

  test('clicking Unsave (secondary) removes entry from storage and restores Save · Block', async () => {
    setupPopup(TAB_URL, [], [SAVED_ENTRY]);
    await flushPromises();

    chrome.storage.sync.get.mockResolvedValue({ savedPages: [SAVED_ENTRY] });
    document.getElementById('block-btn').click(); // Unsave
    await flushPromises();

    expect(chrome.storage.sync.set).toHaveBeenLastCalledWith({ savedPages: [] });
    expect(document.querySelector('#save-btn .btn-label').textContent).toBe('Save');
    expect(document.querySelector('#block-btn .btn-label').textContent).toBe('Block');
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
  const entry = { url: TAB_URL, site: 'github.com', pageType: 'article', savedAt: 1 };

  beforeEach(async () => {
    // Saved page → secondary slot shows Unsave
    setupPopup(TAB_URL, [], [entry]);
    await flushPromises();
  });

  test('does not remove other URLs on the same hostname', async () => {
    chrome.storage.sync.get.mockResolvedValue({
      savedPages: [entry, { url: OTHER_URL, site: 'github.com', pageType: 'article', savedAt: 2 }],
    });
    document.getElementById('block-btn').click(); // Unsave
    await flushPromises();

    const saved = chrome.storage.sync.set.mock.calls[0][0].savedPages;
    expect(saved).toHaveLength(1);
    expect(saved[0].url).toBe(OTHER_URL);
  });

  test('shows "Unsaved" feedback after unsaving', async () => {
    chrome.storage.sync.get.mockResolvedValue({ savedPages: [entry] });
    document.getElementById('block-btn').click(); // Unsave
    await flushPromises();

    const feedback = document.getElementById('feedback');
    expect(feedback.classList.contains('hidden')).toBe(false);
    expect(feedback.textContent).toBe('Unsaved');
  });

  test('save button stays enabled after unsaving', async () => {
    chrome.storage.sync.get.mockResolvedValue({ savedPages: [entry] });
    document.getElementById('block-btn').click(); // Unsave
    await flushPromises();

    expect(document.getElementById('save-btn').disabled).toBe(false);
  });
});

// ─── editable page name ──────────────────────────────────────────────────────

describe('editable page name', () => {
  const TAB_URL = 'https://github.com/foo';
  const entry = { url: TAB_URL, site: 'github.com', pageType: 'article', savedAt: 1, title: 'Stored Name' };
  const titleEl = () => document.getElementById('page-title');

  const edit = (text) => {
    titleEl().click();              // enter edit mode
    titleEl().textContent = text;   // simulate typing
    titleEl().dispatchEvent(new Event('blur')); // commit
  };

  test('shows the live tab title on init', async () => {
    setupPopup(TAB_URL);
    await flushPromises();

    expect(titleEl().textContent).toBe('Test Page Title');
  });

  test('prefers a saved entry’s stored title over the live one', async () => {
    setupPopup(TAB_URL, [], [entry]);
    await flushPromises();

    expect(titleEl().textContent).toBe('Stored Name');
  });

  test('clicking the name puts it into edit mode', async () => {
    setupPopup(TAB_URL);
    await flushPromises();

    titleEl().click();
    expect(titleEl().getAttribute('contenteditable')).toBe('true');
    expect(titleEl().classList.contains('editing')).toBe(true);
  });

  test('Save uses the edited name', async () => {
    setupPopup(TAB_URL);
    await flushPromises();

    edit('My Custom Name');
    await flushPromises();

    chrome.storage.sync.get.mockResolvedValue({ savedPages: [] });
    document.getElementById('save-btn').click();
    await flushPromises();

    const saved = chrome.storage.sync.set.mock.calls.at(-1)[0].savedPages[0];
    expect(saved.title).toBe('My Custom Name');
  });

  test('renaming an already-saved page persists the new title', async () => {
    setupPopup(TAB_URL, [], [entry]);
    await flushPromises();

    chrome.storage.sync.get.mockResolvedValue({ savedPages: [entry] });
    edit('Renamed Page');
    await flushPromises();

    const saved = chrome.storage.sync.set.mock.calls.at(-1)[0].savedPages[0];
    expect(saved.title).toBe('Renamed Page');
    expect(saved.url).toBe(TAB_URL);
  });

  test('an empty edit snaps back to the previous name', async () => {
    setupPopup(TAB_URL);
    await flushPromises();

    edit('   ');
    await flushPromises();

    expect(titleEl().textContent).toBe('Test Page Title');
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  test('does not write storage when the name is unchanged', async () => {
    setupPopup(TAB_URL, [], [entry]);
    await flushPromises();

    chrome.storage.sync.get.mockResolvedValue({ savedPages: [entry] });
    edit('Stored Name'); // same as current
    await flushPromises();

    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
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

  test('navigates the current tab to the blocked page only after the 2s delay', async () => {
    // window.close() destroys the jsdom window, so stub it for this test too.
    const closeSpy = jest.spyOn(window, 'close').mockImplementation(() => {});
    jest.useFakeTimers();

    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [] });
    document.getElementById('block-btn').click();
    await flushMicrotasks();

    expect(chrome.tabs.update).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2000);
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, {
      url: 'chrome-extension://fakeid/blocked.html?site=twitter.com',
    });

    jest.useRealTimers();
    closeSpy.mockRestore();
  });

  test('auto-dismisses the popup ~2s after blocking', async () => {
    const closeSpy = jest.spyOn(window, 'close').mockImplementation(() => {});
    jest.useFakeTimers();

    chrome.storage.sync.get.mockResolvedValue({ blockedSites: [] });
    document.getElementById('block-btn').click();
    await flushMicrotasks();

    expect(closeSpy).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2000);
    expect(closeSpy).toHaveBeenCalled();

    jest.useRealTimers();
    closeSpy.mockRestore();
  });
});

// ─── readlist: undo flow ─────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const saveLabelText = () => document.querySelector('#save-btn .btn-label').textContent;
// Fake-timer-safe flush: drains microtasks only (flushPromises relies on setImmediate)
const flushMicrotasks = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('readlist: undo flow', () => {
  const TAB_URL = 'https://github.com/foo';

  afterEach(() => jest.useRealTimers());

  test('Save tap writes the entry immediately and shows Undo', async () => {
    setupPopup(TAB_URL);
    await flushPromises();

    chrome.storage.sync.get.mockResolvedValue({ savedPages: [] });
    document.getElementById('save-btn').click();
    await flushPromises();

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      savedPages: [expect.objectContaining({ url: TAB_URL })],
    });
    expect(saveLabelText()).toBe('Undo');
  });

  test('Undo tap deletes the entry and returns to Save', async () => {
    setupPopup(TAB_URL);
    await flushPromises();

    chrome.storage.sync.get.mockResolvedValue({ savedPages: [] });
    document.getElementById('save-btn').click(); // Save
    await flushPromises();

    const written = chrome.storage.sync.set.mock.calls[0][0].savedPages;
    chrome.storage.sync.get.mockResolvedValue({ savedPages: written });
    chrome.storage.sync.set.mockClear();

    document.getElementById('save-btn').click(); // Undo
    await flushPromises();

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ savedPages: [] });
    expect(saveLabelText()).toBe('Save');
    expect(document.getElementById('save-label').classList.contains('hidden')).toBe(true);
  });

  test('Undo window expiry transitions the button to Readlist', async () => {
    jest.useFakeTimers();
    setupPopup(TAB_URL);
    await flushMicrotasks();

    chrome.storage.sync.get.mockResolvedValue({ savedPages: [] });
    document.getElementById('save-btn').click();
    await flushMicrotasks();
    expect(saveLabelText()).toBe('Undo');

    jest.advanceTimersByTime(2000);
    expect(saveLabelText()).toBe('Readlist');
  });
});

// ─── readlist: deadline picker ───────────────────────────────────────────────

describe('readlist: deadline picker', () => {
  const TAB_URL = 'https://github.com/foo';
  const entry = { url: TAB_URL, site: 'github.com', pageType: 'article', savedAt: 1 };

  beforeEach(async () => {
    setupPopup(TAB_URL, [], [entry]);
    await flushPromises();
  });

  test('tapping Readlist expands the picker', () => {
    document.getElementById('save-btn').click();
    expect(document.getElementById('deadline-picker').classList.contains('open')).toBe(true);
  });

  test('selecting a deadline writes readBy and transitions to Mark read', async () => {
    document.getElementById('save-btn').click();

    chrome.storage.sync.get.mockResolvedValue({ savedPages: [entry] });
    document.querySelector('.pill[data-option="7 days"]').click();
    await flushPromises();

    const saved = chrome.storage.sync.set.mock.calls[0][0].savedPages[0];
    expect(saved.readBy).toBeGreaterThan(Date.now() + 6.9 * DAY_MS);
    expect(saved.readBy).toBeLessThanOrEqual(Date.now() + 7 * DAY_MS);
    expect(saveLabelText()).toBe('Mark read');
    expect(document.getElementById('deadline-picker').classList.contains('open')).toBe(false);
  });

  test('Backlog adds the page to the readlist and transitions to Mark read', async () => {
    document.getElementById('save-btn').click();

    chrome.storage.sync.get.mockResolvedValue({ savedPages: [entry] });
    document.querySelector('.pill[data-option="backlog"]').click();
    await flushPromises();

    const saved = chrome.storage.sync.set.mock.calls[0][0].savedPages[0];
    expect(saved.onReadlist).toBe(true);
    expect(saved).not.toHaveProperty('readBy');
    expect(saveLabelText()).toBe('Mark read');
    expect(document.getElementById('deadline-picker').classList.contains('open')).toBe(false);
  });
});

// ─── readlist: mark read & unsave ────────────────────────────────────────────

describe('readlist: mark read', () => {
  const TAB_URL = 'https://github.com/foo';
  const entry = { url: TAB_URL, site: 'github.com', pageType: 'article', savedAt: 1, readBy: Date.now() + DAY_MS };

  beforeEach(async () => {
    setupPopup(TAB_URL, [], [entry]);
    await flushPromises();
  });

  test('Mark read tap takes the page off the readlist and shows Readlist again', async () => {
    chrome.storage.sync.get.mockResolvedValue({ savedPages: [entry] });
    document.getElementById('save-btn').click();
    await flushPromises();

    const saved = chrome.storage.sync.set.mock.calls[0][0].savedPages;
    expect(saved).toHaveLength(1);
    expect(saved[0]).not.toHaveProperty('readBy');
    expect(saved[0]).not.toHaveProperty('onReadlist');
    expect(saveLabelText()).toBe('Readlist');
    expect(document.querySelector('#block-btn .btn-label').textContent).toBe('Unsave');
  });

  test('a Backlog page (on the readlist, no deadline) opens as Mark read', async () => {
    const backlog = { url: TAB_URL, site: 'github.com', pageType: 'article', savedAt: 1, onReadlist: true };
    setupPopup(TAB_URL, [], [backlog]);
    await flushPromises();

    expect(saveLabelText()).toBe('Mark read');
    expect(document.querySelector('#block-btn .btn-label').textContent).toBe('Unsave');
  });

  test('a plain saved page (not on the readlist) opens as Readlist', async () => {
    const plain = { url: TAB_URL, site: 'github.com', pageType: 'article', savedAt: 1 };
    setupPopup(TAB_URL, [], [plain]);
    await flushPromises();

    expect(saveLabelText()).toBe('Readlist');
  });

  test('label crossfades from due text to saved text on Mark read', async () => {
    expect(document.getElementById('save-label').textContent).toMatch(/^Due in/);

    chrome.storage.sync.get.mockResolvedValue({ savedPages: [entry] });
    document.getElementById('save-btn').click();
    await flushPromises();

    expect(document.getElementById('save-label').textContent).toMatch(/^Saved /);
    expect(document.getElementById('save-label').classList.contains('label-saved')).toBe(true);
  });
});

// ─── readlist: due-date label ────────────────────────────────────────────────

describe('readlist: due-date label', () => {
  const TAB_URL = 'https://github.com/foo';
  const base = { url: TAB_URL, site: 'github.com', pageType: 'article', savedAt: new Date('2026-06-01T09:00:00').getTime() };
  const labelEl = () => document.getElementById('save-label');

  test('hidden when the page is not saved', async () => {
    setupPopup(TAB_URL);
    await flushPromises();

    expect(labelEl().classList.contains('hidden')).toBe(true);
  });

  test('shows saved date with label-saved when saved without deadline', async () => {
    setupPopup(TAB_URL, [], [base]);
    await flushPromises();

    expect(labelEl().textContent).toBe('Saved Jun 1, 2026');
    expect(labelEl().classList.contains('label-saved')).toBe(true);
  });

  test('shows due-in text with label-due for a future deadline', async () => {
    setupPopup(TAB_URL, [], [{ ...base, readBy: Date.now() + 3 * DAY_MS }]);
    await flushPromises();

    expect(labelEl().textContent).toMatch(/^Due in 3 days · /);
    expect(labelEl().classList.contains('label-due')).toBe(true);
  });

  test('shows overdue text with label-overdue for a past deadline', async () => {
    setupPopup(TAB_URL, [], [{ ...base, readBy: Date.now() - 2 * DAY_MS }]);
    await flushPromises();

    expect(labelEl().textContent).toMatch(/2 days overdue · /);
    expect(labelEl().classList.contains('label-overdue')).toBe(true);
  });

  test('stays hidden after a Save tap in the same session', async () => {
    setupPopup(TAB_URL);
    await flushPromises();

    chrome.storage.sync.get.mockResolvedValue({ savedPages: [] });
    document.getElementById('save-btn').click();
    await flushPromises();

    expect(labelEl().classList.contains('hidden')).toBe(true);
  });

  test('appears once a deadline is picked after saving', async () => {
    setupPopup(TAB_URL);
    await flushPromises();

    chrome.storage.sync.get.mockResolvedValue({ savedPages: [] });
    document.getElementById('save-btn').click(); // Save → Undo state
    await flushPromises();

    const written = chrome.storage.sync.set.mock.calls[0][0].savedPages;
    chrome.storage.sync.get.mockResolvedValue({ savedPages: written });
    document.querySelector('.pill[data-option="3 days"]').click();
    await flushPromises();

    expect(labelEl().classList.contains('hidden')).toBe(false);
    expect(labelEl().textContent).toMatch(/^Due in 3 days · /);
  });
});

// ─── contextual secondary button (Block ↔ Unsave) ────────────────────────────

describe('secondary button shows Unsave while the page is saved', () => {
  const TAB_URL = 'https://github.com/foo';
  const entry = { url: TAB_URL, site: 'github.com', pageType: 'article', savedAt: 1 };
  const blockBtn = () => document.getElementById('block-btn');
  const secondaryLabel = () => document.querySelector('#block-btn .btn-label').textContent;

  afterEach(() => jest.useRealTimers());

  test('shows Unsave on init when the page is saved without a deadline', async () => {
    setupPopup(TAB_URL, [], [entry]);
    await flushPromises();

    expect(secondaryLabel()).toBe('Unsave');
    expect(blockBtn().disabled).toBe(false);
  });

  test('shows Unsave on init when the page is saved with a deadline', async () => {
    setupPopup(TAB_URL, [], [{ ...entry, readBy: Date.now() + DAY_MS }]);
    await flushPromises();

    expect(secondaryLabel()).toBe('Unsave');
  });

  test('stays as disabled Block during the Undo window', async () => {
    setupPopup(TAB_URL);
    await flushPromises();
    expect(blockBtn().disabled).toBe(false);

    chrome.storage.sync.get.mockResolvedValue({ savedPages: [] });
    document.getElementById('save-btn').click(); // Save → Undo window
    await flushPromises();

    expect(secondaryLabel()).not.toBe('Unsave');
    expect(blockBtn().disabled).toBe(true);
  });

  test('re-enables Block after Undo', async () => {
    setupPopup(TAB_URL);
    await flushPromises();

    chrome.storage.sync.get.mockResolvedValue({ savedPages: [] });
    document.getElementById('save-btn').click(); // Save
    await flushPromises();
    document.getElementById('save-btn').click(); // Undo
    await flushPromises();

    expect(blockBtn().disabled).toBe(false);
    expect(secondaryLabel()).not.toBe('Unsave');
  });

  test('transitions to Unsave when the Undo window expires', async () => {
    jest.useFakeTimers();
    setupPopup(TAB_URL);
    await flushMicrotasks();

    chrome.storage.sync.get.mockResolvedValue({ savedPages: [] });
    document.getElementById('save-btn').click();
    await flushMicrotasks();

    jest.advanceTimersByTime(2000);

    expect(saveLabelText()).toBe('Readlist');
    expect(secondaryLabel()).toBe('Unsave');
    expect(blockBtn().disabled).toBe(false);
  });

  test('Unsave tap deletes the entry and restores Save · Block', async () => {
    setupPopup(TAB_URL, [], [entry]);
    await flushPromises();

    chrome.storage.sync.get.mockResolvedValue({ savedPages: [entry] });
    blockBtn().click(); // Unsave
    await flushPromises();

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ savedPages: [] });
    expect(saveLabelText()).toBe('Save');
    expect(secondaryLabel()).toBe('Block');
    expect(blockBtn().disabled).toBe(false);
  });

  test('restores disabled Blocked state after Unsave when the site is blocked', async () => {
    setupPopup(TAB_URL, [{ site: 'github.com', blockedAt: 0 }], [entry]);
    await flushPromises();

    expect(secondaryLabel()).toBe('Unsave');
    expect(blockBtn().disabled).toBe(false);

    chrome.storage.sync.get.mockResolvedValue({ savedPages: [entry] });
    blockBtn().click(); // Unsave
    await flushPromises();

    expect(secondaryLabel()).toBe('Blocked');
    expect(blockBtn().disabled).toBe(true);
  });
});
