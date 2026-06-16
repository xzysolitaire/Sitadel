/**
 * Detects the semantic type of a webpage from its URL and DOM.
 *
 * Priority order:
 *   URL video platforms → URL audio platforms → academic/PDF →
 *   course platforms → docs subdomains → og:type signals → schema.org →
 *   article DOM → video/audio DOM → page (catch-all)
 *
 * @param {string} url - The full URL of the page
 * @param {Document} doc - The page's document object
 * @returns {'video' | 'audio' | 'paper' | 'docs' | 'course' | 'article' | 'page'}
 */
function detectPageType(url, doc) {
  // 1. Video platforms (URL-based — unambiguous)
  if (/youtube\.com\/(watch|shorts|embed)|youtu\.be\/|vimeo\.com\/\d|twitch\.tv\/\w|dailymotion\.com\/video\//.test(url)) {
    return 'video';
  }

  // 2. Audio platforms (URL-based)
  if (/soundcloud\.com\/[^/]+\/[^/]+|open\.spotify\.com\/(track|album|episode)|music\.apple\.com\//.test(url)) {
    return 'audio';
  }

  // 3. Academic content and PDFs
  if (/arxiv\.org\/(abs|pdf)\/|pubmed\.ncbi\.nlm\.nih\.gov\/\d|biorxiv\.org\/content\/|ssrn\.com\/abstract|\/\/doi\.org\//.test(url)) {
    return 'paper';
  }
  if (/\.pdf(\?|#|$)/i.test(url)) return 'paper';
  const hasPdfEmbed =
    doc.querySelector('embed[type="application/pdf"]') ||
    [...doc.querySelectorAll('iframe[src]')].some((f) =>
      /\.pdf(\?|#|&|$)/i.test(f.getAttribute('src') || '')
    );
  if (hasPdfEmbed) return 'paper';

  // 4. Online course platforms
  if (
    /coursera\.org\/learn\/|coursera\.org\/specializations\/|coursera\.org\/professional-certificates\//.test(url) ||
    /udemy\.com\/course\//.test(url) ||
    /edx\.org\/course\/|edx\.org\/learn\/|edx\.org\/professional-certificate\//.test(url) ||
    /khanacademy\.org\/.+\/(unit|lesson|quiz|test|article|exercise)/.test(url) ||
    /skillshare\.com\/(en\/)?classes\//.test(url) ||
    /brilliant\.org\/(courses|daily-problems|practice)\//.test(url) ||
    /pluralsight\.com\/courses\//.test(url) ||
    /linkedin\.com\/learning\//.test(url)
  ) {
    return 'course';
  }
  // Path heuristic for unlisted platforms
  try {
    if (/\/courses?\//i.test(new URL(url).pathname)) return 'course';
  } catch { /* invalid URL */ }

  // 6. Developer documentation (subdomain-based)
  try {
    const { hostname } = new URL(url);
    if (
      /^(docs|developer|developers|devdocs|api)\./i.test(hostname) ||
      /\.(readthedocs\.io|rtfd\.io)$/.test(hostname)
    ) {
      return 'docs';
    }
  } catch { /* invalid URL */ }

  // 7. Open Graph type signals (author-declared, more reliable than DOM heuristics)
  const ogType = doc.querySelector('meta[property="og:type"]')?.content ?? '';
  if (/^video\./.test(ogType)) return 'video';
  if (/^music\./.test(ogType)) return 'audio';
  if (ogType === 'article') return 'article';

  // 8. Schema.org structured data
  const itemtype = doc.querySelector('[itemtype]')?.getAttribute('itemtype') ?? '';
  if (/schema\.org\/(NewsArticle|BlogPosting|Article)/i.test(itemtype)) return 'article';

  // 9. Article DOM signals
  if (doc.querySelector('article') && doc.querySelector('time[datetime]')) return 'article';

  // 10. Video/audio DOM signals (non-decorative only)
  const isDecorative = (v) =>
    v.hasAttribute('autoplay') &&
    v.hasAttribute('muted') &&
    v.hasAttribute('loop') &&
    !v.hasAttribute('controls');
  if ([...doc.querySelectorAll('video')].some((v) => !isDecorative(v))) return 'video';
  if (doc.querySelector('audio')) return 'audio';

  return 'page';
}

const PAGE_TYPES = ['article', 'video', 'audio', 'paper', 'docs', 'course', 'page'];

if (typeof module !== 'undefined') {
  module.exports = { detectPageType, PAGE_TYPES };
}
