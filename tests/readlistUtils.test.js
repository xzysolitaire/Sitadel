const {
  deadlineFromOption,
  getDeadlineSection,
  computeImminentSet,
  daysOverdue,
  formatDueLabel,
} = require('../readlist-utils');

const DAY_MS = 24 * 60 * 60 * 1000;

afterEach(() => jest.restoreAllMocks());

// ─── deadlineFromOption ──────────────────────────────────────────────────────

describe('deadlineFromOption', () => {
  const NOW = new Date('2026-06-10T12:00:00').getTime();

  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));

  test.each([
    ['Tomorrow', 1],
    ['3 days', 3],
    ['7 days', 7],
    ['30 days', 30],
    ['3 months', 90],
  ])('"%s" maps to %i days from now', (option, days) => {
    expect(deadlineFromOption(option)).toBe(NOW + days * DAY_MS);
  });

  test('unknown option returns null', () => {
    expect(deadlineFromOption('Next year')).toBeNull();
  });

  test('undefined option returns null', () => {
    expect(deadlineFromOption(undefined)).toBeNull();
  });
});

// ─── getDeadlineSection ──────────────────────────────────────────────────────

describe('getDeadlineSection', () => {
  // Noon, so start-of-today is NOW - 12h
  const NOW = new Date('2026-06-10T12:00:00').getTime();

  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));

  test('no readBy returns null', () => {
    expect(getDeadlineSection(undefined)).toBeNull();
    expect(getDeadlineSection(null)).toBeNull();
  });

  test('before start of today is overdue', () => {
    expect(getDeadlineSection(NOW - 13 * 60 * 60 * 1000)).toBe('overdue');
  });

  test('earlier today (after midnight) is not overdue', () => {
    expect(getDeadlineSection(NOW - 1 * 60 * 60 * 1000)).toBe('tomorrow');
  });

  test('due within 1 day falls in tomorrow', () => {
    expect(getDeadlineSection(NOW + 1 * DAY_MS)).toBe('tomorrow');
  });

  test('due just past 1 day falls in 3days', () => {
    expect(getDeadlineSection(NOW + 1 * DAY_MS + 1000)).toBe('3days');
  });

  test('due at 3 days falls in 3days', () => {
    expect(getDeadlineSection(NOW + 3 * DAY_MS)).toBe('3days');
  });

  test('due at 7 days falls in 7days', () => {
    expect(getDeadlineSection(NOW + 7 * DAY_MS)).toBe('7days');
  });

  test('due at 30 days falls in 30days', () => {
    expect(getDeadlineSection(NOW + 30 * DAY_MS)).toBe('30days');
  });

  test('due at 90 days falls in 3months', () => {
    expect(getDeadlineSection(NOW + 90 * DAY_MS)).toBe('3months');
  });
});

// ─── computeImminentSet ──────────────────────────────────────────────────────

describe('computeImminentSet', () => {
  const NOW = new Date('2026-06-10T12:00:00').getTime();

  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));

  const entry = (url, readBy) => ({ url, site: 'x.com', readBy });

  test('empty array returns []', () => {
    expect(computeImminentSet([])).toEqual([]);
  });

  test('ignores entries without readBy', () => {
    const result = computeImminentSet([
      { url: 'a', site: 'x.com' },
      entry('b', NOW + DAY_MS),
    ]);
    expect(result.map((e) => e.url)).toEqual(['b']);
  });

  test('overdue items come first, most overdue at the front', () => {
    const result = computeImminentSet([
      entry('soon', NOW + DAY_MS),
      entry('very-overdue', NOW - 5 * DAY_MS),
      entry('overdue', NOW - 1 * DAY_MS),
    ]);
    expect(result.map((e) => e.url)).toEqual(['very-overdue', 'overdue', 'soon']);
  });

  test('fills to max=6 across buckets and truncates the rest', () => {
    const entries = [1, 2, 3, 4, 5, 6, 7, 8].map((d) => entry(`u${d}`, NOW + d * DAY_MS));
    const result = computeImminentSet(entries);
    expect(result).toHaveLength(6);
    expect(result.map((e) => e.url)).toEqual(['u1', 'u2', 'u3', 'u4', 'u5', 'u6']);
  });

  test('returns all items when fewer than max', () => {
    const entries = [entry('a', NOW + DAY_MS), entry('b', NOW + 2 * DAY_MS)];
    expect(computeImminentSet(entries)).toHaveLength(2);
  });

  test('respects a custom max', () => {
    const entries = [1, 2, 3].map((d) => entry(`u${d}`, NOW + d * DAY_MS));
    expect(computeImminentSet(entries, 2)).toHaveLength(2);
  });

  test('does not mutate the input array', () => {
    const entries = [entry('b', NOW + 2 * DAY_MS), entry('a', NOW + DAY_MS)];
    computeImminentSet(entries);
    expect(entries[0].url).toBe('b');
  });
});

// ─── formatDueLabel ──────────────────────────────────────────────────────────

describe('formatDueLabel', () => {
  const NOW = new Date('2026-06-10T12:00:00').getTime();

  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));

  test('no deadline shows saved date with label-saved class', () => {
    const savedAt = new Date('2026-06-01T09:00:00').getTime();
    expect(formatDueLabel(undefined, savedAt)).toEqual({
      text: 'Saved Jun 1, 2026',
      colorClass: 'label-saved',
    });
  });

  test('future deadline shows due-in text with label-due class', () => {
    const readBy = NOW + 3 * DAY_MS;
    expect(formatDueLabel(readBy, 0)).toEqual({
      text: 'Due in 3 days · Jun 13, 2026',
      colorClass: 'label-due',
    });
  });

  test('singular day for a deadline one day out', () => {
    expect(formatDueLabel(NOW + DAY_MS, 0).text).toBe('Due in 1 day · Jun 11, 2026');
  });

  test('overdue deadline shows days-overdue text with label-overdue class', () => {
    const readBy = new Date('2026-06-08T12:00:00').getTime();
    expect(formatDueLabel(readBy, 0)).toEqual({
      text: '2 days overdue · Jun 8, 2026',
      colorClass: 'label-overdue',
    });
  });

  test('singular day overdue for yesterday', () => {
    const readBy = new Date('2026-06-09T18:00:00').getTime();
    expect(formatDueLabel(readBy, 0).text).toBe('1 day overdue · Jun 9, 2026');
  });

  test('readBy earlier today is due today, not overdue', () => {
    const readBy = new Date('2026-06-10T08:00:00').getTime();
    expect(formatDueLabel(readBy, 0)).toEqual({
      text: 'Due today · Jun 10, 2026',
      colorClass: 'label-due',
    });
  });
});

// ─── daysOverdue ─────────────────────────────────────────────────────────────

describe('daysOverdue', () => {
  const NOW = new Date('2026-06-10T12:00:00').getTime();

  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));

  test('yesterday is 1 day overdue', () => {
    expect(daysOverdue(new Date('2026-06-09T18:00:00').getTime())).toBe(1);
  });

  test('three days ago is 3 days overdue', () => {
    expect(daysOverdue(new Date('2026-06-07T12:00:00').getTime())).toBe(3);
  });
});
