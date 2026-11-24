// Lightweight exam-board query detector for cross-board UI nudges.
// Kept separate from searchEngine.js so the initial main-thread bundle stays minimal.

import { CAMBRIDGE_ALL_CODES } from '../data/cambridgeCatalog.js';

const EDEXCEL_LEGACY_4DIGIT_CODES = new Set([
  '6663', '6664', '6665', '6666', '6667', '6668', '6669',
  '6677', '6678', '6679', '6683', '6684', '6685', '6689', '6691',
  '4308', '4357', '4400', '7042'
]);

/**
 * Detect whether a user query unambiguously targets another exam board
 * so the UI can offer a 1-click "Switch Board" nudge instead of 0-result confusion.
 */
export function detectLikelyQueryBoard(rawQuery = '') {
  const q = String(rawQuery || '').toLowerCase().trim();
  if (!q) return null;

  // Explicit board keywords
  if (/\b(?:cambridge|caie|cie|o[-_\s]?levels?)\b/.test(q)) return 'cambridge';
  if (/\b(?:edexcel|pearson|ial|solomon)\b/.test(q)) return 'edexcel';

  // Explicit Edexcel course codes (W-codes, 4-char IGCSE 4*, YLA1/2, 6-char GCE)
  if (/\b(?:w[a-z]{2}\d{2}|4w?[a-z]{2}\d|4wm[12][hf]|yla1?(?:[/_\s-]*0?[12])?|yla2|6(?:bi|ch|ph)\d{2})\b/.test(q)) {
    return 'edexcel';
  }

  // Check 4-digit codes (Edexcel legacy GCE/IGCSE vs Cambridge syllabus codes)
  const fourDigitMatches = q.match(/\b\d{4}\b/g) || [];
  for (const code of fourDigitMatches) {
    if (EDEXCEL_LEGACY_4DIGIT_CODES.has(code)) {
      return 'edexcel';
    }
    if (CAMBRIDGE_ALL_CODES.has(code)) {
      // Guard ambiguous year-like code "2010": only treat as Cambridge if paired with another CIE signal
      if (code === '2010') {
        if (/\b(?:[msw]\d{2}|qp|ms|er|gt|in|lit|literature|11|12|13|21|22|23)\b/.test(q)) {
          return 'cambridge';
        }
        continue;
      }
      return 'cambridge';
    }
  }

  if (/\b(?:[msw](?:0[2-9]|[12]\d)|(?:fm|f\/m|mj|m\/j|on|o\/n)\s*(?:0[2-9]|[12]\d))\b/.test(q)) {
    return 'cambridge';
  }
  return null;
}
