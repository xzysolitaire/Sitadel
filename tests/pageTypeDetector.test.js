const { detectPageType } = require('../pageTypeDetector');

function makeDoc(html = '') {
  document.body.innerHTML = html;
  return document;
}

const emptyDoc = () => makeDoc('');

// ─── YouTube detection ────────────────────────────────────────────────────────

describe('detectPageType — YouTube', () => {
  test('detects standard watch URL', () => {
    expect(detectPageType('https://www.youtube.com/watch?v=abc123', emptyDoc())).toBe('youtube');
  });

  test('detects youtu.be short link', () => {
    expect(detectPageType('https://youtu.be/abc123', emptyDoc())).toBe('youtube');
  });

  test('detects watch URL with extra query params', () => {
    expect(detectPageType('https://www.youtube.com/watch?v=abc123&t=30s', emptyDoc())).toBe('youtube');
  });

  test('does not match YouTube Shorts (not in pattern — falls through)', () => {
    expect(detectPageType('https://www.youtube.com/shorts/abc123', emptyDoc())).toBe('article');
  });

  test('does not match YouTube embed URL', () => {
    expect(detectPageType('https://www.youtube.com/embed/abc123', emptyDoc())).toBe('article');
  });

  test('does not match unrelated site containing "youtube" in domain', () => {
    expect(detectPageType('https://www.youtubedownloader.com', emptyDoc())).toBe('article');
  });
});

// ─── PDF detection ────────────────────────────────────────────────────────────

describe('detectPageType — PDF', () => {
  test('detects URL ending in .pdf', () => {
    expect(detectPageType('https://example.com/report.pdf', emptyDoc())).toBe('pdf');
  });

  test('detects PDF URL with query params after extension', () => {
    expect(detectPageType('https://example.com/doc.pdf?version=2', emptyDoc())).toBe('pdf');
  });

  test('detects PDF URL with hash fragment after extension', () => {
    expect(detectPageType('https://example.com/doc.pdf#page=3', emptyDoc())).toBe('pdf');
  });

  test('detects PDF via embedded <embed> element when URL has no .pdf', () => {
    const doc = makeDoc('<embed type="application/pdf" src="/file" />');
    expect(detectPageType('https://example.com/viewer', doc)).toBe('pdf');
  });

  test('detects PDF via <iframe src ending in .pdf>', () => {
    const doc = makeDoc('<iframe src="/file.pdf"></iframe>');
    expect(detectPageType('https://example.com/viewer', doc)).toBe('pdf');
  });

  test('does not detect PDF on plain page with no PDF signals', () => {
    expect(detectPageType('https://example.com/about', emptyDoc())).not.toBe('pdf');
  });
});

// ─── Article detection (Open Graph) ──────────────────────────────────────────

describe('detectPageType — article via og:type', () => {
  test('detects article when og:type is "article"', () => {
    const doc = makeDoc('<meta property="og:type" content="article" />');
    expect(detectPageType('https://example.com/post', doc)).toBe('article');
  });

  test('does not treat og:type "website" as article', () => {
    const doc = makeDoc('<meta property="og:type" content="website" />');
    expect(detectPageType('https://example.com', doc)).toBe('article'); // falls to fallback
  });

  test('falls back gracefully when og:type meta tag is absent', () => {
    expect(detectPageType('https://example.com/post', emptyDoc())).toBe('article');
  });
});

// ─── Video page detection ─────────────────────────────────────────────────────

describe('detectPageType — video (non-YouTube)', () => {
  test('detects page with <video> element', () => {
    const doc = makeDoc('<video src="/clip.mp4"></video>');
    expect(detectPageType('https://vimeo.com/123', doc)).toBe('video');
  });

  test('detects autoplay muted decorative <video> as video type', () => {
    const doc = makeDoc('<video autoplay muted loop></video>');
    expect(detectPageType('https://example.com', doc)).toBe('video');
  });

  test('does not return video when page has no <video> element', () => {
    expect(detectPageType('https://example.com', emptyDoc())).not.toBe('video');
  });
});

// ─── Fallback ─────────────────────────────────────────────────────────────────

describe('detectPageType — fallback', () => {
  test('returns article for plain blog post with no signals', () => {
    const doc = makeDoc('<h1>Hello</h1><p>Some text.</p>');
    expect(detectPageType('https://myblog.com/post', doc)).toBe('article');
  });

  test('returns article for a homepage with no signals', () => {
    expect(detectPageType('https://news.ycombinator.com', emptyDoc())).toBe('article');
  });

  test('does not throw on empty document body', () => {
    expect(() => detectPageType('https://example.com', emptyDoc())).not.toThrow();
  });
});

// ─── Priority / ordering ──────────────────────────────────────────────────────

describe('detectPageType — priority ordering', () => {
  test('YouTube URL beats og:type=article', () => {
    const doc = makeDoc('<meta property="og:type" content="article" />');
    expect(detectPageType('https://www.youtube.com/watch?v=abc', doc)).toBe('youtube');
  });

  test('.pdf URL beats <video> in DOM', () => {
    const doc = makeDoc('<video src="/clip.mp4"></video>');
    expect(detectPageType('https://example.com/file.pdf', doc)).toBe('pdf');
  });

  test('og:type=article beats <video> in DOM', () => {
    const doc = makeDoc('<meta property="og:type" content="article" /><video src="/clip.mp4"></video>');
    expect(detectPageType('https://example.com/post', doc)).toBe('article');
  });

  test('YouTube URL beats <embed type="application/pdf">', () => {
    const doc = makeDoc('<embed type="application/pdf" />');
    expect(detectPageType('https://www.youtube.com/watch?v=abc', doc)).toBe('youtube');
  });
});
