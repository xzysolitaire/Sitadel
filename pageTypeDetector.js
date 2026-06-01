/**
 * Detects the semantic type of a webpage from its URL and DOM.
 * Priority order: youtube → pdf → article (og:type) → video → article (fallback)
 *
 * @param {string} url - The full URL of the page
 * @param {Document} doc - The page's document object
 * @returns {'youtube' | 'pdf' | 'article' | 'video'}
 */
function detectPageType(url, doc) {
  if (/youtube\.com\/watch|youtu\.be\//.test(url)) return 'youtube';

  if (/\.pdf(\?|#|$)/i.test(url)) return 'pdf';
  if (doc.querySelector('embed[type="application/pdf"], iframe[src$=".pdf"]')) return 'pdf';

  const ogType = doc.querySelector('meta[property="og:type"]')?.content;
  if (ogType === 'article') return 'article';

  if (doc.querySelector('video')) return 'video';

  return 'article';
}

module.exports = { detectPageType };
