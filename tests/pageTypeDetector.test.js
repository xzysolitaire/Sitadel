const { detectPageType } = require('../pageTypeDetector');

function makeDoc(html = '') {
  document.body.innerHTML = html;
  return document;
}

const emptyDoc = () => makeDoc('');

// ─── Video detection ──────────────────────────────────────────────────────────

describe('detectPageType — video (platforms)', () => {
  test('detects YouTube watch URL', () => {
    expect(detectPageType('https://www.youtube.com/watch?v=abc123', emptyDoc())).toBe('video');
  });

  test('detects YouTube Shorts URL', () => {
    expect(detectPageType('https://www.youtube.com/shorts/abc123', emptyDoc())).toBe('video');
  });

  test('detects YouTube embed URL', () => {
    expect(detectPageType('https://www.youtube.com/embed/abc123', emptyDoc())).toBe('video');
  });

  test('detects youtu.be short link', () => {
    expect(detectPageType('https://youtu.be/abc123', emptyDoc())).toBe('video');
  });

  test('detects Vimeo video URL (numeric path)', () => {
    expect(detectPageType('https://vimeo.com/123456789', emptyDoc())).toBe('video');
  });

  test('detects Twitch channel URL', () => {
    expect(detectPageType('https://www.twitch.tv/ninja', emptyDoc())).toBe('video');
  });

  test('detects Dailymotion video URL', () => {
    expect(detectPageType('https://www.dailymotion.com/video/x9abc12', emptyDoc())).toBe('video');
  });

  test('does not match unrelated domain containing "youtube"', () => {
    expect(detectPageType('https://www.youtubedownloader.com', emptyDoc())).toBe('page');
  });

  test('detects og:type video.movie', () => {
    const doc = makeDoc('<meta property="og:type" content="video.movie" />');
    expect(detectPageType('https://example.com/film', doc)).toBe('video');
  });

  test('detects og:type video.episode', () => {
    const doc = makeDoc('<meta property="og:type" content="video.episode" />');
    expect(detectPageType('https://example.com/show/ep1', doc)).toBe('video');
  });

  test('detects content <video> element', () => {
    const doc = makeDoc('<video src="/clip.mp4"></video>');
    expect(detectPageType('https://example.com/media', doc)).toBe('video');
  });

  test('skips decorative video (autoplay + muted + loop, no controls)', () => {
    const doc = makeDoc('<video autoplay muted loop></video>');
    expect(detectPageType('https://example.com', doc)).toBe('page');
  });

  test('counts autoplay+muted+loop video WITH controls as content', () => {
    const doc = makeDoc('<video autoplay muted loop controls></video>');
    expect(detectPageType('https://example.com', doc)).toBe('video');
  });
});

// ─── Audio detection ──────────────────────────────────────────────────────────

describe('detectPageType — audio', () => {
  test('detects Spotify track URL', () => {
    expect(detectPageType('https://open.spotify.com/track/abc123', emptyDoc())).toBe('audio');
  });

  test('detects Spotify album URL', () => {
    expect(detectPageType('https://open.spotify.com/album/abc123', emptyDoc())).toBe('audio');
  });

  test('detects Spotify episode (podcast) URL', () => {
    expect(detectPageType('https://open.spotify.com/episode/abc123', emptyDoc())).toBe('audio');
  });

  test('detects SoundCloud track URL', () => {
    expect(detectPageType('https://soundcloud.com/artist/trackname', emptyDoc())).toBe('audio');
  });

  test('detects Apple Music URL', () => {
    expect(detectPageType('https://music.apple.com/album/xyz/123', emptyDoc())).toBe('audio');
  });

  test('detects og:type music.song', () => {
    const doc = makeDoc('<meta property="og:type" content="music.song" />');
    expect(detectPageType('https://example.com/song', doc)).toBe('audio');
  });

  test('detects og:type music.album', () => {
    const doc = makeDoc('<meta property="og:type" content="music.album" />');
    expect(detectPageType('https://example.com/album', doc)).toBe('audio');
  });

  test('detects page with <audio> element', () => {
    const doc = makeDoc('<audio src="/podcast.mp3"></audio>');
    expect(detectPageType('https://example.com/episode', doc)).toBe('audio');
  });
});

// ─── Paper detection ──────────────────────────────────────────────────────────

describe('detectPageType — paper', () => {
  test('detects arXiv abstract URL', () => {
    expect(detectPageType('https://arxiv.org/abs/2401.12345', emptyDoc())).toBe('paper');
  });

  test('detects arXiv PDF URL', () => {
    expect(detectPageType('https://arxiv.org/pdf/2401.12345', emptyDoc())).toBe('paper');
  });

  test('detects PubMed article URL', () => {
    expect(detectPageType('https://pubmed.ncbi.nlm.nih.gov/12345678/', emptyDoc())).toBe('paper');
  });

  test('detects bioRxiv preprint URL', () => {
    expect(detectPageType('https://www.biorxiv.org/content/10.1101/2024.01.01.123456', emptyDoc())).toBe('paper');
  });

  test('detects SSRN abstract URL', () => {
    expect(detectPageType('https://ssrn.com/abstract=4567890', emptyDoc())).toBe('paper');
  });

  test('detects DOI resolver URL', () => {
    expect(detectPageType('https://doi.org/10.1038/nature12345', emptyDoc())).toBe('paper');
  });

  test('detects URL ending in .pdf', () => {
    expect(detectPageType('https://example.com/report.pdf', emptyDoc())).toBe('paper');
  });

  test('detects PDF URL with query string after extension', () => {
    expect(detectPageType('https://example.com/doc.pdf?version=2', emptyDoc())).toBe('paper');
  });

  test('detects PDF URL with hash fragment after extension', () => {
    expect(detectPageType('https://example.com/doc.pdf#page=3', emptyDoc())).toBe('paper');
  });

  test('detects PDF via embedded <embed> element', () => {
    const doc = makeDoc('<embed type="application/pdf" src="/file" />');
    expect(detectPageType('https://example.com/viewer', doc)).toBe('paper');
  });

  test('detects PDF via <iframe src ending in .pdf>', () => {
    const doc = makeDoc('<iframe src="/file.pdf"></iframe>');
    expect(detectPageType('https://example.com/viewer', doc)).toBe('paper');
  });

  test('does not detect paper on a plain page with no signals', () => {
    expect(detectPageType('https://example.com/about', emptyDoc())).not.toBe('paper');
  });
});

// ─── Docs detection ───────────────────────────────────────────────────────────

describe('detectPageType — docs', () => {
  test('detects docs.* subdomain', () => {
    expect(detectPageType('https://docs.python.org/3/library/os.html', emptyDoc())).toBe('docs');
  });

  test('detects developer.* subdomain', () => {
    expect(detectPageType('https://developer.mozilla.org/en-US/docs/Web', emptyDoc())).toBe('docs');
  });

  test('detects developers.* subdomain', () => {
    expect(detectPageType('https://developers.google.com/maps/documentation', emptyDoc())).toBe('docs');
  });

  test('detects devdocs.* subdomain', () => {
    expect(detectPageType('https://devdocs.io/react/', emptyDoc())).toBe('docs');
  });

  test('detects api.* subdomain', () => {
    expect(detectPageType('https://api.example.com/reference', emptyDoc())).toBe('docs');
  });

  test('detects readthedocs.io domain', () => {
    expect(detectPageType('https://requests.readthedocs.io/en/latest/', emptyDoc())).toBe('docs');
  });

  test('does not match docs-like path on non-docs subdomain', () => {
    const result = detectPageType('https://github.com/user/repo/tree/main/docs', emptyDoc());
    expect(result).not.toBe('docs');
  });
});

// ─── Article detection ────────────────────────────────────────────────────────

describe('detectPageType — article', () => {
  test('detects article when og:type is "article"', () => {
    const doc = makeDoc('<meta property="og:type" content="article" />');
    expect(detectPageType('https://example.com/post', doc)).toBe('article');
  });

  test('detects NewsArticle schema.org type', () => {
    const doc = makeDoc('<div itemtype="https://schema.org/NewsArticle"></div>');
    expect(detectPageType('https://example.com/news', doc)).toBe('article');
  });

  test('detects BlogPosting schema.org type', () => {
    const doc = makeDoc('<article itemtype="https://schema.org/BlogPosting"></article>');
    expect(detectPageType('https://example.com/blog', doc)).toBe('article');
  });

  test('detects <article> + <time datetime> combination', () => {
    const doc = makeDoc('<article><time datetime="2026-06-08"></time></article>');
    expect(detectPageType('https://example.com/post', doc)).toBe('article');
  });

  test('<article> alone without <time datetime> does not trigger article', () => {
    const doc = makeDoc('<article><p>Content</p></article>');
    const result = detectPageType('https://example.com', doc);
    expect(result).not.toBe('article');
  });
});

// ─── Page catch-all ───────────────────────────────────────────────────────────

describe('detectPageType — page (catch-all)', () => {
  test('returns page for a plain homepage with no signals', () => {
    expect(detectPageType('https://news.ycombinator.com', emptyDoc())).toBe('page');
  });

  test('returns page for a blog post with no structured signals', () => {
    const doc = makeDoc('<h1>Hello</h1><p>Some text.</p>');
    expect(detectPageType('https://myblog.com/post', doc)).toBe('page');
  });

  test('returns page when og:type is "website"', () => {
    const doc = makeDoc('<meta property="og:type" content="website" />');
    expect(detectPageType('https://example.com', doc)).toBe('page');
  });

  test('does not throw on empty document body', () => {
    expect(() => detectPageType('https://example.com', emptyDoc())).not.toThrow();
  });
});

// ─── Priority ordering ────────────────────────────────────────────────────────

describe('detectPageType — priority ordering', () => {
  test('YouTube URL beats og:type=article', () => {
    const doc = makeDoc('<meta property="og:type" content="article" />');
    expect(detectPageType('https://www.youtube.com/watch?v=abc', doc)).toBe('video');
  });

  test('YouTube URL beats <embed type="application/pdf">', () => {
    const doc = makeDoc('<embed type="application/pdf" />');
    expect(detectPageType('https://www.youtube.com/watch?v=abc', doc)).toBe('video');
  });

  test('.pdf URL beats content <video> in DOM', () => {
    const doc = makeDoc('<video src="/clip.mp4"></video>');
    expect(detectPageType('https://example.com/file.pdf', doc)).toBe('paper');
  });

  test('og:type=article beats content <video> in DOM', () => {
    const doc = makeDoc('<meta property="og:type" content="article" /><video src="/clip.mp4"></video>');
    expect(detectPageType('https://example.com/post', doc)).toBe('article');
  });

  test('og:type=video.* beats og:type=article (og:type is read once, video.* checked first)', () => {
    // a page that somehow has two og:type tags — first one wins in querySelector
    const doc = makeDoc('<meta property="og:type" content="video.movie" />');
    expect(detectPageType('https://example.com/film', doc)).toBe('video');
  });

  test('docs subdomain beats og:type=article', () => {
    const doc = makeDoc('<meta property="og:type" content="article" />');
    expect(detectPageType('https://docs.example.com/guide', doc)).toBe('docs');
  });

  test('arXiv URL beats content <video> in DOM', () => {
    const doc = makeDoc('<video src="/clip.mp4"></video>');
    expect(detectPageType('https://arxiv.org/abs/2401.12345', doc)).toBe('paper');
  });
});
