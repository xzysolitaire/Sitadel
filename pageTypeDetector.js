/**
 * Detects the semantic type of a webpage from its URL and DOM.
 * Priority order: youtube → pdf → article (og:type) → video → article (fallback)
 *
 * A <video> is only counted as content video if it is NOT a decorative background
 * element (autoplay + muted + loop with no controls attribute).
 *
 * @param {string} url - The full URL of the page
 * @param {Document} doc - The page's document object
 * @returns {'youtube' | 'pdf' | 'article' | 'video'}
 */
function detectPageType(url, doc) {
  if (/youtube\.com\/(watch|shorts|embed)|youtu\.be\//.test(url)) return 'youtube';

  if (/\.pdf(\?|#|$)/i.test(url)) return 'pdf';
  const hasPdfEmbed =
    doc.querySelector('embed[type="application/pdf"]') ||
    [...doc.querySelectorAll('iframe[src]')].some((f) =>
      /\.pdf(\?|#|&|$)/i.test(f.getAttribute('src') || '')
    );
  if (hasPdfEmbed) return 'pdf';

  const ogType = doc.querySelector('meta[property="og:type"]')?.content;
  if (ogType === 'article') return 'article';

  const isDecorative = (v) =>
    v.hasAttribute('autoplay') &&
    v.hasAttribute('muted') &&
    v.hasAttribute('loop') &&
    !v.hasAttribute('controls');
  if ([...doc.querySelectorAll('video')].some((v) => !isDecorative(v))) return 'video';

  return 'article';
}

if (typeof module !== 'undefined') {
  module.exports = { detectPageType };
}
