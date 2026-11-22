// High-precision, sub-millisecond fuzzy search & ranking engine for Conceptualist Systems

import {
  STATIC_SEARCH_VOCAB,
  SHORT_VOCAB_3CHAR,
  STATIC_SEARCH_VOCAB_SET,
  VOCAB_STOPWORDS,
  RAW_ATOMIC_SYNONYMS,
  IGCSE_CODE_BY_SUBJECT,
  IGCSE_SUBJECT_BY_CODE,
  DOC_TYPE_TOKENS,
  DOC_TYPE_PHRASES,
  SESSION_SYNONYMS_BY_MONTH,
  GENERIC_QUERY_WORDS,
  ITEM_CODE_EQUIV
} from './data/searchDictionaries.js';

const _dlPrevPrev = new Int32Array(64);
const _dlPrev = new Int32Array(64);
const _dlCurr = new Int32Array(64);

// Precompile synonym lookup objects once
const COMPILED_SYNONYMS = Object.fromEntries(
  Object.entries(RAW_ATOMIC_SYNONYMS).map(([key, entries]) => [
    key,
    entries.map((entry) =>
      entry.includes(' ')
        ? { type: 'phrase', val: entry, words: entry.split(' ') }
        : { type: 'tok', val: entry }
    )
  ])
);

function tokenizeRaw(str) {
  if (!str) return [];
  return String(str)
    .toLowerCase()
    .replace(/['’]/g, '')
    .match(/[a-z0-9]+/g) || [];
}

function expandBaseCodeAliases(codeLower, targetSet) {
  if (!codeLower) return;
  targetSet.add(codeLower);
  // Variant strips: m1a -> m1, m1r -> m1, p1r -> p1, fp2a -> fp2, wma11r -> wma11
  const strippedVar = codeLower.replace(/(?:r|a)$/, '');
  if (strippedVar && strippedVar !== codeLower && /\d$/.test(strippedVar)) {
    targetSet.add(strippedVar);
  }
  const equiv = ITEM_CODE_EQUIV[strippedVar] || ITEM_CODE_EQUIV[codeLower];
  if (equiv) {
    for (let i = 0; i < equiv.length; i++) targetSet.add(equiv[i]);
  }
  // Paper1 / Paper2 concatenated filenames
  const paperMatch = codeLower.match(/^paper([1-4][a-z]?)$/);
  if (paperMatch) {
    targetSet.add('paper');
    targetSet.add(`p${paperMatch[1]}`);
    targetSet.add(`p${paperMatch[1].replace(/[ar]$/, '')}`);
  }
  // Tiered IGCSE paper codes like 1h, 2hr, 1f, 2fr
  const tierMatch = codeLower.match(/^([1-4])([hf])(r)?$/);
  if (tierMatch) {
    targetSet.add(`p${tierMatch[1]}`);
    targetSet.add(tierMatch[2] === 'h' ? 'higher' : 'foundation');
    if (tierMatch[3]) {
      targetSet.add('regional');
      targetSet.add('reg');
      targetSet.add('r');
      targetSet.add(`p${tierMatch[1]}r`);
    }
  }
}

/**
 * Attach structured search tokens and phrase indexes once per file object.
 */
export function buildFileSearchData(fileObj) {
  if (!fileObj) return null;

  const highSet = new Set();
  const metaSet = new Set();
  const tokenSet = new Set();

  const addTokensTo = (str, destSet, alsoExpandCodes = false) => {
    const toks = tokenizeRaw(str);
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      destSet.add(t);
      tokenSet.add(t);
      if (alsoExpandCodes && t.length <= 7 && /\d/.test(t)) {
        expandBaseCodeAliases(t, destSet);
        expandBaseCodeAliases(t, tokenSet);
      }
    }
  };

  // High-priority fields: unit label, unit name, unit code, subject, aliases
  addTokensTo(fileObj.cleanUnitLabel, highSet, true);
  addTokensTo(fileObj.unitName, highSet, true);
  addTokensTo(fileObj.unitCode, highSet, true);
  addTokensTo(fileObj.subject, highSet, false);

  const subj = fileObj.subject || '';
  if (subj === 'Math') {
    highSet.add('mathematics');
    highSet.add('maths');
    tokenSet.add('mathematics');
    tokenSet.add('maths');
  } else if (subj === 'Information Technology') {
    highSet.add('it');
    highSet.add('ict');
    tokenSet.add('it');
    tokenSet.add('ict');
  } else if (subj === 'Computer Science') {
    highSet.add('cs');
    highSet.add('compsci');
    tokenSet.add('cs');
    tokenSet.add('compsci');
  } else if (subj === 'Further Pure Mathematics') {
    highSet.add('fmath');
    tokenSet.add('fmath');
  }

  // Index IGCSE syllabus codes on IGCSE papers/textbooks so searching "4ma1" or "4ph1" works
  if (fileObj.spec === 'IGCSE' || fileObj.curriculum === 'Edexcel IGCSE') {
    const igCodes = IGCSE_CODE_BY_SUBJECT[subj];
    if (igCodes) {
      igCodes.forEach((c) => {
        highSet.add(c);
        tokenSet.add(c);
      });
    }
  }

  // Extract normalized unit tag (e.g. "Unit 2" -> "u2", "Paper 1" -> "p1")
  const unitLabelStr = `${fileObj.cleanUnitLabel || ''} ${fileObj.unitName || ''}`.toLowerCase();
  const unitNumMatch = unitLabelStr.match(/\bunit\s*([1-6])\b/);
  if (unitNumMatch) {
    highSet.add(`u${unitNumMatch[1]}`);
    tokenSet.add(`u${unitNumMatch[1]}`);
  }
  const paperNumMatch = unitLabelStr.match(/\bpaper\s*([1-4]r?)\b/);
  if (paperNumMatch) {
    highSet.add(`p${paperNumMatch[1]}`);
    tokenSet.add(`p${paperNumMatch[1]}`);
  }

  // Metadata fields: curriculum, category, session + bidirectional seasonal aliases, variant, docType
  addTokensTo(fileObj.curriculum, metaSet, false);
  addTokensTo(fileObj.spec, metaSet, false);
  addTokensTo(fileObj.category, metaSet, false);
  if (fileObj.year) {
    const yr = String(fileObj.year);
    metaSet.add(yr);
    tokenSet.add(yr);
  }

  const sRaw = `${fileObj.session || ''} ${fileObj.path || ''}`;
  addTokensTo(fileObj.session, metaSet, false);
  if (/\b(?:may|jun|june)\b|may[-_\s]*june/i.test(sRaw)) {
    SESSION_SYNONYMS_BY_MONTH.mayJune.forEach((t) => {
      metaSet.add(t);
      tokenSet.add(t);
    });
  }
  if (/\b(?:oct|october|nov|november)\b|oct[-_\s]*nov/i.test(sRaw)) {
    SESSION_SYNONYMS_BY_MONTH.octNov.forEach((t) => {
      metaSet.add(t);
      tokenSet.add(t);
    });
  }
  if (/\b(?:jan|january|feb|february)\b|jan[-_\s]*feb/i.test(sRaw)) {
    SESSION_SYNONYMS_BY_MONTH.janFeb.forEach((t) => {
      metaSet.add(t);
      tokenSet.add(t);
    });
  }

  const v = fileObj.variant || '';
  const isReg = v === 'R' || v === 'A' || v.includes('R');
  if (isReg) {
    ['regional', 'reg', 'r'].forEach((t) => {
      metaSet.add(t);
      tokenSet.add(t);
    });
  }
  if (v === 'A') {
    ['alt', 'alta'].forEach((t) => {
      metaSet.add(t);
      tokenSet.add(t);
    });
  }
  if (v.includes('H')) {
    metaSet.add('higher');
    tokenSet.add('higher');
    if (paperNumMatch) {
      const pDigit = paperNumMatch[1].replace(/r$/i, '');
      highSet.add(`${pDigit}h`);
      tokenSet.add(`${pDigit}h`);
      if (isReg) {
        highSet.add(`${pDigit}hr`);
        tokenSet.add(`${pDigit}hr`);
      }
    }
  }
  if (v.includes('F')) {
    metaSet.add('foundation');
    tokenSet.add('foundation');
    if (paperNumMatch) {
      const pDigit = paperNumMatch[1].replace(/r$/i, '');
      highSet.add(`${pDigit}f`);
      tokenSet.add(`${pDigit}f`);
      if (isReg) {
        highSet.add(`${pDigit}fr`);
        tokenSet.add(`${pDigit}fr`);
      }
    }
  }

  const dt = fileObj.docType || '';
  const dtToks = DOC_TYPE_TOKENS[dt];
  if (dtToks) {
    dtToks.forEach((t) => {
      metaSet.add(t);
      tokenSet.add(t);
    });
  }
  if (
    (fileObj.category === 'Books' || fileObj.category === 'IAL Books' || fileObj.category === 'IGCSE Books') &&
    dt !== 'SOL'
  ) {
    DOC_TYPE_TOKENS.Book.forEach((t) => {
      highSet.add(t);
      metaSet.add(t);
      tokenSet.add(t);
    });
  }

  // Path & Filename tokens (strip browser duplicate-copy suffixes like " (1).pdf" so Book 2 doesn't index token "1")
  const sanitizedPathForTokens = String(fileObj.path || '').replace(/\s*\(\d+\)(\.[a-z0-9]+)$/i, '$1');
  addTokensTo(fileObj.name, tokenSet, true);
  addTokensTo(sanitizedPathForTokens, tokenSet, true);

  if (subj === 'Math') {
    const mathPMap = { p1: 'wma11', p2: 'wma12', p3: 'wma13', p4: 'wma14' };
    Object.entries(mathPMap).forEach(([pKey, wma]) => {
      if (tokenSet.has(pKey) || tokenSet.has(`${pKey}r`) || tokenSet.has(`${pKey}a`)) {
        highSet.add(pKey);
        highSet.add(wma);
        tokenSet.add(pKey);
        tokenSet.add(wma);
      }
    });
    const mathBookCodeMatch = String(fileObj.name || '').match(/\((p[1-4]|m[1-3]|s[1-3]|fp[1-3]|d1|c12|c34)\)/i);
    if (mathBookCodeMatch) {
      expandBaseCodeAliases(mathBookCodeMatch[1].toLowerCase(), highSet);
      expandBaseCodeAliases(mathBookCodeMatch[1].toLowerCase(), tokenSet);
    }
  }

  if (isReg && fileObj.unitCode) {
    const ucLower = fileObj.unitCode.toLowerCase().replace(/[ar]$/, '');
    const regSuffix = v === 'A' ? 'a' : 'r';
    highSet.add(`${ucLower}${regSuffix}`);
    tokenSet.add(`${ucLower}${regSuffix}`);
    const eqs = ITEM_CODE_EQUIV[ucLower];
    if (eqs) {
      for (let i = 0; i < eqs.length; i++) {
        highSet.add(`${eqs[i]}${regSuffix}`);
        tokenSet.add(`${eqs[i]}${regSuffix}`);
      }
    }
  }

  const highPhraseBase = [
    fileObj.cleanUnitLabel,
    fileObj.unitName,
    fileObj.unitCode,
    fileObj.subject,
    subj === 'Math' ? 'mathematics maths' : '',
    subj === 'Information Technology' ? 'information technology it ict' : '',
    subj === 'Computer Science' ? 'computer science cs' : ''
  ]
    .filter(Boolean)
    .join(' ');

  const allPhraseBase = [
    highPhraseBase,
    fileObj.name,
    sanitizedPathForTokens,
    fileObj.curriculum,
    fileObj.category,
    fileObj.session,
    DOC_TYPE_PHRASES[dt] || '',
    isReg ? 'regional reg r' : ''
  ]
    .filter(Boolean)
    .join(' ');

  const normSpaces = (text) => ` ${tokenizeRaw(text).join(' ')} `;
  const wordStr = ` ${Array.from(tokenSet).join(' ')} `;

  return {
    highSet,
    metaSet,
    tokenSet,
    wordStr,
    highStr: normSpaces(highPhraseBase),
    phraseStr: normSpaces(allPhraseBase)
  };
}

/**
 * Merge search indexes across all sibling docs inside a grouped unified sitting.
 */
export function finalizeUnifiedSearchData(item, childFiles) {
  const highSet = new Set();
  const metaSet = new Set();
  const tokenSet = new Set();
  const highParts = [];
  const phraseParts = [];

  for (let i = 0; i < childFiles.length; i++) {
    const s = childFiles[i]?._search;
    if (!s) continue;
    s.highSet.forEach((t) => highSet.add(t));
    s.metaSet.forEach((t) => metaSet.add(t));
    s.tokenSet.forEach((t) => tokenSet.add(t));
    if (s.highStr) highParts.push(s.highStr.trim());
    if (s.phraseStr) phraseParts.push(s.phraseStr.trim());
  }

  item._search = {
    highSet,
    metaSet,
    tokenSet,
    wordStr: ` ${Array.from(tokenSet).join(' ')} `,
    highStr: ` ${highParts.join(' ')} `,
    phraseStr: ` ${phraseParts.join(' ')} `
  };
  return item._search;
}

/**
 * Dynamically build a deduplicated catalog vocabulary combining curated terms
 * with real syllabus unit names, textbook titles, and course codes from the loaded library.
 */
export function buildCatalogVocab(flatFiles = []) {
  const vocabSet = new Set(STATIC_SEARCH_VOCAB);
  for (let i = 0; i < flatFiles.length; i++) {
    const f = flatFiles[i];
    if (!f) continue;
    const sources = [f.subject, f.unitCode, f.unitName, f.cleanUnitLabel, f.name];
    for (let s = 0; s < sources.length; s++) {
      const toks = tokenizeRaw(sources[s]);
      for (let t = 0; t < toks.length; t++) {
        const w = toks[t];
        if (w.length < 4 || VOCAB_STOPWORDS.has(w)) continue;
        if (/^\d+$/.test(w)) continue;
        vocabSet.add(w);
      }
    }
  }
  return Array.from(vocabSet);
}

/**
 * Fast bounded Damerau-Levenshtein distance using reusable typed arrays.
 */
export function damerauLevenshtein(a, b, maxDist = 2) {
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > maxDist) return maxDist + 1;
  if (lenA === 0) return lenB <= maxDist ? lenB : maxDist + 1;
  if (lenB === 0) return lenA <= maxDist ? lenA : maxDist + 1;

  const need = lenB + 1;
  const prevPrev = need <= _dlPrevPrev.length ? _dlPrevPrev : new Int32Array(need);
  const prev = need <= _dlPrev.length ? _dlPrev : new Int32Array(need);
  const curr = need <= _dlCurr.length ? _dlCurr : new Int32Array(need);

  let rowPrevPrev = prevPrev;
  let rowPrev = prev;
  let rowCurr = curr;

  for (let j = 0; j <= lenB; j++) rowPrev[j] = j;

  for (let i = 1; i <= lenA; i++) {
    rowCurr[0] = i;
    let rowMin = maxDist + 1;
    const chA = a.charCodeAt(i - 1);
    const chAPrev = i > 1 ? a.charCodeAt(i - 2) : -1;
    for (let j = 1; j <= lenB; j++) {
      const chB = b.charCodeAt(j - 1);
      const cost = chA === chB ? 0 : 1;
      let val = rowPrev[j] + 1;
      const ins = rowCurr[j - 1] + 1;
      if (ins < val) val = ins;
      const sub = rowPrev[j - 1] + cost;
      if (sub < val) val = sub;
      if (i > 1 && j > 1 && chA === b.charCodeAt(j - 2) && chAPrev === chB) {
        const trans = rowPrevPrev[j - 2] + 1;
        if (trans < val) val = trans;
      }
      rowCurr[j] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > maxDist) return maxDist + 1;
    const tmp = rowPrevPrev;
    rowPrevPrev = rowPrev;
    rowPrev = rowCurr;
    rowCurr = tmp;
  }
  return rowPrev[lenB];
}

function addAlt(altsMap, entry, editDist, isPrefix = false) {
  const key = `${entry.type}:${entry.val}`;
  const existing = altsMap.get(key);
  if (!existing || editDist < existing.editDist || (!isPrefix && existing.isPrefix && editDist === existing.editDist)) {
    altsMap.set(key, {
      type: entry.type,
      val: entry.val,
      words: entry.words || null,
      editDist,
      isPrefix
    });
  }
}

function addSynonymsForKey(key, altsMap, baseEditDist, isPrefix) {
  const syns = COMPILED_SYNONYMS[key];
  if (!syns) return;
  for (let i = 0; i < syns.length; i++) {
    addAlt(altsMap, syns[i], baseEditDist, isPrefix);
  }
}

function normalizeQueryString(rawQuery) {
  let q = String(rawQuery || '').toLowerCase().replace(/['’]/g, '');

  // Strip Edexcel cover-sheet component numbers ("WMA11/01" -> "wma11", "4MA1/02HR" -> "4ma1 2hr")
  q = q.replace(/\b([a-z]{2,3}\d{2}|6[a-z]{2}\d{2})[/_\s-]+0[1-9]\b/g, '$1');
  q = q.replace(/\b([a-z]{2,3}\d{2}|4[a-z]{1,3}\d|6[a-z]{2}\d{2})[/_\s-]+0?([1-4][hrfa]{1,2})\b/g, '$1 $2');
  q = q.replace(/\b(4[a-z]{1,3}\d)[/_\s-]+0([1-4])\b/g, '$1 p$2');

  // Rejoin accidentally spaced course codes ("wma 11" -> "wma11", "4ma 1" -> "4ma1", "6bi 01" -> "6bi01")
  q = q.replace(/\b(w[a-z]{2}|6[a-z]{2})\s+(\d{2}[ar]?)\b/g, '$1$2');
  q = q.replace(/\b(4[a-z]{1,3})\s+(\d[hf]?r?)\b/g, '$1$2');

  // Split joined session+year or code+year ("jan26" -> "jan 26", "wma11jan25" -> "wma11 jan 25")
  q = q.replace(/([a-z0-9]{2,})(jan(?:uary)?|feb(?:ruary)?|may|jun(?:e)?|summer|oct(?:ober)?|nov(?:ember)?|autumn|winter)(\d{2}|\d{4})\b/gi, '$1 $2 $3');
  q = q.replace(/\b(jan(?:uary)?|feb(?:ruary)?|mar|may|jun(?:e)?|summer|oct(?:ober)?|nov(?:ember)?|autumn|winter)[-_\s/]*(\d{2}|\d{4})\b/g, '$1 $2');

  // Normalize common multi-word unit shorthands ("unit 1" -> "u1", "paper 1r" -> "p1r", "mech 1" -> "m1", "pure mathematics 3" -> "wma13")
  q = q.replace(/\bunit\s*([1-6])\b/g, 'u$1');
  q = q.replace(/\bpaper\s*([1-4][ar]?)\b/g, 'p$1');
  q = q.replace(/\bfurther\s+(?:pure(?:\s+math(?:ematics|s)?)?|math(?:ematics|s)?)\s*(?:f?p|u)?([1-3])([ar])?\b/g, (_, d, v) => (v ? `fp${d} ${v}` : `fp${d}`));
  q = q.replace(/\bpure(?:\s+math(?:ematics|s)?)?\s*(?:p|u)?([1-4])([ar])?\b/g, (_, d, v) => (v ? `wma1${d} ${v}` : `wma1${d}`));
  q = q.replace(/\b(?:mechanics|mech)\s*(?:m|p|u)?([1-3])([ar])?\b/g, (_, d, v) => (v ? `m${d} ${v}` : `m${d}`));
  q = q.replace(/\b(?:statistics|stats?)\s*(?:s|p|u)?([1-3])([ar])?\b/g, (_, d, v) => (v ? `s${d} ${v}` : `s${d}`));
  q = q.replace(/\bdecision(?:\s+math(?:ematics|s)?)?\s*(?:d|p|u)?1([ar])?\b/g, (_, v) => (v ? `d1 ${v}` : 'd1'));
  q = q.replace(/\bcore\s+(?:math(?:ematics|s)?\s*)?(?:c|p|u)?([1-4]|12|34)([ar])?\b/g, (_, d, v) => (v ? `c${d} ${v}` : `c${d}`));
  q = q.replace(/\bmay[-_\s/]+june?\b/g, 'mayjune');
  q = q.replace(/\boct[-_\s/]+nov(?:ember)?\b/g, 'octnov');

  return q.trim();
}

const _vocabSetCache = new WeakMap();
function getVocabSet(catalogVocab) {
  if (!Array.isArray(catalogVocab)) return STATIC_SEARCH_VOCAB_SET;
  let s = _vocabSetCache.get(catalogVocab);
  if (!s) {
    s = new Set(catalogVocab);
    _vocabSetCache.set(catalogVocab, s);
  }
  return s;
}

/**
 * Parse a user search query into structured positive groups, exact phrases,
 * negative `-exclusions`, typo corrections, and a "Did you mean" candidate.
 */
export function parseSearchQuery(rawQuery, catalogVocab = STATIC_SEARCH_VOCAB) {
  const trimmed = String(rawQuery || '').trim();
  if (!trimmed) {
    return { hasQuery: false, groups: [], exclusions: [], corrections: [], didYouMean: '' };
  }

  // Extract quoted exact phrases first
  const phrases = [];
  let remaining = trimmed.replace(/"([^"]{2,})"/g, (_, inner) => {
    const words = tokenizeRaw(inner);
    if (words.length >= 1) phrases.push(words);
    return ' ';
  });

  // Extract standalone negative exclusions (e.g. "-regional", "-er", "-r", "-igcse")
  const exclusions = [];
  remaining = remaining.replace(/(?:^|\s)-([a-z0-9]+)\b/gi, (_, negTok) => {
    const cleanNeg = negTok.toLowerCase();
    if (cleanNeg.length >= 1) exclusions.push(cleanNeg);
    return ' ';
  });

  const normalized = normalizeQueryString(remaining).replace(/[,/;•—–_()-]+/g, ' ').trim();
  const rawTokens = normalized ? normalized.split(/\s+/).filter(Boolean) : [];

  const groups = [];
  const corrections = [];

  for (let i = 0; i < phrases.length; i++) {
    const pWords = phrases[i];
    const pStr = pWords.join(' ');
    groups.push({
      primary: pStr,
      display: `"${pStr}"`,
      isSpecific: true,
      alts: [{ type: 'phrase', val: pStr, words: pWords, editDist: 0, isPrefix: false }]
    });
  }

  const vocabSet = getVocabSet(catalogVocab);

  for (let i = 0; i < rawTokens.length; i++) {
    let tok = rawTokens[i];
    const rawOriginal = tok;

    // Expand 2-digit years ("26" -> "2026", "04" -> "2004")
    if (/^\d{2}$/.test(tok)) {
      const yrNum = parseInt(tok, 10);
      if (yrNum >= 3 && yrNum <= 29) {
        tok = String(2000 + yrNum);
      }
    }

    const altsMap = new Map();
    addAlt(altsMap, { type: 'tok', val: tok }, 0, false);
    addSynonymsForKey(tok, altsMap, 0, false);

    const isNumeric = /^\d+$/.test(tok);
    const hasDigit = /\d/.test(tok);
    const isKnownWordOrCode = Boolean(COMPILED_SYNONYMS[tok] || STATIC_SEARCH_VOCAB_SET.has(tok) || vocabSet.has(tok));
    let bestCorrection = null;

    if (!isNumeric && tok.length === 3 && !isKnownWordOrCode) {
      // Short 3-char academic/session typo tolerance (e.g. "boi" -> "bio", "jna" -> "jan")
      SHORT_VOCAB_3CHAR.forEach((word) => {
        if (word === tok) return;
        const dist = damerauLevenshtein(tok, word, 1);
        if (dist === 1) {
          addAlt(altsMap, { type: 'tok', val: word }, 1, false);
          addSynonymsForKey(word, altsMap, 1, false);
          if (!bestCorrection || dist < bestCorrection.dist) {
            bestCorrection = { word, dist };
          }
        }
      });
    } else if (!isNumeric && tok.length >= 4) {
      const maxEdits = hasDigit ? 1 : (tok.length >= 7 ? 2 : 1);
      const tokDigits = hasDigit ? tok.replace(/\D/g, '') : '';
      let prefixMatches = 0;

      for (let v = 0; v < catalogVocab.length; v++) {
        const word = catalogVocab[v];
        if (word === tok) continue;

        if (!isKnownWordOrCode && word.startsWith(tok)) {
          addAlt(altsMap, { type: 'tok', val: word }, 0, true);
          addSynonymsForKey(word, altsMap, 0, true);
          prefixMatches++;
        } else if (!isKnownWordOrCode && Math.abs(word.length - tok.length) <= maxEdits) {
          // Preserve exact digits inside paper/unit codes so "4ph1" never mutates to "4ch1" or "wph11" to "wph12"
          if (hasDigit) {
            if (!/\d/.test(word) || word.replace(/\D/g, '') !== tokDigits) continue;
          }
          // For 1-edit word typos allow mistyped/dropped first char ("hysics", "conomics");
          // for 2-edit typos require anchored prefix or swap for high precision.
          const firstAnchored =
            word[0] === tok[0] ||
            (word[0] === tok[1] && word[1] === tok[0]) ||
            (!hasDigit && maxEdits === 1 && tok.length >= 5) ||
            (maxEdits === 2 && tok.slice(1, 3) === word.slice(0, 2));
          if (!firstAnchored) continue;

          const dist = damerauLevenshtein(tok, word, maxEdits);
          if (dist <= maxEdits) {
            addAlt(altsMap, { type: 'tok', val: word }, dist, false);
            addSynonymsForKey(word, altsMap, dist, false);
            if (
              !bestCorrection ||
              dist < bestCorrection.dist ||
              (dist === bestCorrection.dist && word.length > bestCorrection.word.length)
            ) {
              bestCorrection = { word, dist };
            }
          }
        }
      }

      if (prefixMatches > 0 && bestCorrection && bestCorrection.dist > 1) {
        bestCorrection = null;
      }
    }

    if (bestCorrection && !STATIC_SEARCH_VOCAB_SET.has(tok) && !COMPILED_SYNONYMS[tok]) {
      corrections.push({ from: rawOriginal, to: bestCorrection.word, dist: bestCorrection.dist });
    }

    const isYear = /^\d{4}$/.test(tok);
    const isCode = /\d/.test(tok) && !isYear;
    const isGeneric = GENERIC_QUERY_WORDS.has(tok);
    const isSession = Boolean(
      SESSION_SYNONYMS_BY_MONTH.mayJune.includes(tok) ||
      SESSION_SYNONYMS_BY_MONTH.octNov.includes(tok) ||
      SESSION_SYNONYMS_BY_MONTH.janFeb.includes(tok) ||
      tok === 'mayjune' ||
      tok === 'octnov'
    );
    const isSubjectOrTopic = !isYear && !isGeneric && !isSession && (
      Boolean(COMPILED_SYNONYMS[tok] || IGCSE_SUBJECT_BY_CODE[tok]) ||
      tok.length >= 3
    );

    groups.push({
      primary: tok,
      display: rawOriginal,
      isYear,
      isCode,
      isSpecific: isCode || isSubjectOrTopic,
      alts: Array.from(altsMap.values())
    });
  }

  let didYouMean = '';
  if (corrections.length > 0 && rawTokens.length > 0) {
    const correctionMap = new Map(corrections.map((c) => [c.from, c.to]));
    const candidateTokens = rawTokens.map((t) => correctionMap.get(t) || t);
    const rebuilt = candidateTokens.join(' ');
    if (rebuilt !== rawTokens.join(' ')) {
      didYouMean = exclusions.length > 0 ? `${rebuilt} ${exclusions.map((e) => `-${e}`).join(' ')}` : rebuilt;
    }
  }

  return {
    hasQuery: groups.length > 0 || exclusions.length > 0,
    groups,
    exclusions,
    corrections,
    didYouMean
  };
}

function phraseContainsWithoutFurtherPrefix(haystack, phraseVal) {
  const needle = ` ${phraseVal} `;
  if (!phraseVal.startsWith('pure mathematics ')) {
    return haystack.includes(needle);
  }
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    // Reject "... further pure mathematics 1 ..." when searching strictly for "pure mathematics 1" (P1/WMA11)
    const before = haystack.slice(Math.max(0, idx - 8), idx);
    if (!before.endsWith(' further')) return true;
    idx = haystack.indexOf(needle, idx + 1);
  }
  return false;
}

function itemMatchesAlt(searchData, alt, allowPrefix = false) {
  if (alt.type === 'phrase') {
    if (phraseContainsWithoutFurtherPrefix(searchData.highStr, alt.val)) return 'high_exact';
    if (phraseContainsWithoutFurtherPrefix(searchData.phraseStr, alt.val)) return 'body_exact';
    return null;
  }

  const val = alt.val;
  if (searchData.highSet.has(val)) return 'high_exact';
  if (searchData.metaSet.has(val)) return 'meta_exact';
  if (searchData.tokenSet.has(val)) return 'body_exact';
  if (allowPrefix && val.length >= 3 && searchData.wordStr.includes(` ${val}`)) {
    return 'word_prefix';
  }
  return null;
}

function scoreGroupMatch(item, searchData, group) {
  let bestScore = -1;
  let usedTypo = false;

  for (let j = 0; j < group.alts.length; j++) {
    const alt = group.alts[j];
    const allowPrefix = alt.val === group.primary && !alt.isPrefix && alt.editDist === 0;
    const hitTier = itemMatchesAlt(searchData, alt, allowPrefix);
    if (!hitTier) continue;

    let s = 0;
    if (hitTier === 'high_exact') s = 18;
    else if (hitTier === 'meta_exact') s = 12;
    else if (hitTier === 'body_exact') s = 8;
    else if (hitTier === 'word_prefix') s = 6;

    // Exact field boosts (including canonical unitCode equivalences like WMA13 <-> P3, WME01 <-> M1)
    if (alt.type === 'tok') {
      const uc = item.unitCode ? item.unitCode.toLowerCase() : '';
      const ucBase = uc.replace(/[ar]$/, '');
      const isExactUnitCode = uc !== '' && (
        uc === alt.val ||
        ucBase === alt.val ||
        (ITEM_CODE_EQUIV[uc] && ITEM_CODE_EQUIV[uc].includes(alt.val)) ||
        (ITEM_CODE_EQUIV[ucBase] && ITEM_CODE_EQUIV[ucBase].includes(alt.val))
      );
      if (isExactUnitCode) s += 16;
      if (item.subject && item.subject.toLowerCase() === alt.val) s += 10;
      if (item.year && String(item.year) === alt.val) s += 8;
      const isPrimaryOrEquiv =
        alt.val === group.primary ||
        (isExactUnitCode && (
          uc === group.primary ||
          ucBase === group.primary ||
          (ITEM_CODE_EQUIV[uc] && ITEM_CODE_EQUIV[uc].includes(group.primary)) ||
          (ITEM_CODE_EQUIV[ucBase] && ITEM_CODE_EQUIV[ucBase].includes(group.primary))
        ));
      if (isPrimaryOrEquiv && !alt.isPrefix && alt.editDist === 0) s += 4;
    }

    if (alt.isPrefix) s -= 1;
    if (alt.editDist > 0) s -= alt.editDist * 4;

    if (s > bestScore) {
      bestScore = s;
      usedTypo = alt.editDist > 0;
    }
  }

  return bestScore >= 0 ? { score: bestScore, usedTypo } : null;
}

function itemViolatesExclusions(searchData, exclusions) {
  for (let i = 0; i < exclusions.length; i++) {
    const ex = exclusions[i];
    if (searchData.tokenSet.has(ex)) return true;
    const exSyns = COMPILED_SYNONYMS[ex];
    if (exSyns) {
      for (let j = 0; j < exSyns.length; j++) {
        if (itemMatchesAlt(searchData, exSyns[j])) return true;
      }
    }
  }
  return false;
}

/**
 * Filter & score items with strict AND + optional partial-match recovery when 0 strict results occur.
 */
export function executeSmartSearch(files, parsedQuery, { isUnified = true } = {}) {
  if (!parsedQuery || !parsedQuery.hasQuery) {
    return {
      files,
      relevanceMap: null,
      isPartialFallback: false,
      missingTerms: [],
      appliedCorrections: [],
      didYouMean: ''
    };
  }

  const { groups, exclusions, corrections, didYouMean } = parsedQuery;
  const FURTHER_QUERY_KEYS = new Set([
    'further', 'fmath', 'furthermath', 'furthermaths',
    'fp1', 'fp2', 'fp3', 'f1', 'f2', 'f3',
    'wfm01', 'wfm02', 'wfm03', '4pm1', '4pm0'
  ]);
  const hasPureQueryToken = groups.some((g) => g.primary === 'pure' || /^wma1[1-4]$/.test(g.primary));
  const hasFurtherQueryToken = groups.some((g) => FURTHER_QUERY_KEYS.has(g.primary));
  const strictMatched = [];
  const strictRelevance = new WeakMap();
  const groupHitCounts = new Array(groups.length).fill(0);
  let strictTypoUsed = false;

  // Candidate partial fallback buckets
  const partialCandidates = [];

  for (let k = 0; k < files.length; k++) {
    const item = files[k];
    const searchData = item._search;
    if (!searchData) continue;
    if (exclusions.length > 0 && itemViolatesExclusions(searchData, exclusions)) continue;

    let matchedCount = 0;
    let totalScore = 0;
    let specificMatches = 0;
    let itemUsedTypo = false;

    for (let i = 0; i < groups.length; i++) {
      const res = scoreGroupMatch(item, searchData, groups[i]);
      if (res) {
        matchedCount++;
        totalScore += res.score;
        groupHitCounts[i]++;
        if (groups[i].isSpecific) specificMatches++;
        if (res.usedTypo) itemUsedTypo = true;
      }
    }

    if (hasPureQueryToken && !hasFurtherQueryToken && searchData.highSet.has('further')) {
      totalScore -= 12;
    }

    if (matchedCount === groups.length) {
      if (isUnified && item.isUnifiedSitting) {
        if (item.docs?.QP && item.docs?.MS) totalScore += 3;
        else if (item.docs?.QP) totalScore += 1;
      }
      strictRelevance.set(item, totalScore);
      strictMatched.push(item);
      if (itemUsedTypo) strictTypoUsed = true;
    } else if (groups.length >= 2 && matchedCount > 0) {
      partialCandidates.push({ item, matchedCount, specificMatches, totalScore });
    }
  }

  if (strictMatched.length > 0 || groups.length === 0) {
    return {
      files: strictMatched,
      relevanceMap: strictRelevance,
      isPartialFallback: false,
      missingTerms: [],
      appliedCorrections: strictTypoUsed ? corrections : [],
      didYouMean: strictTypoUsed ? didYouMean : ''
    };
  }

  // Strict AND had 0 hits: compute relaxed partial matches prioritizing specific anchors
  const hasSpecificGroups = groups.some((g) => g.isSpecific);
  const missingTerms = [];
  for (let i = 0; i < groups.length; i++) {
    if (groupHitCounts[i] === 0) {
      missingTerms.push(groups[i].display);
    }
  }

  const partialMatched = [];
  const partialRelevance = new WeakMap();
  const minMatched = groups.length >= 3 ? Math.max(2, groups.length - 1) : 1;

  for (let p = 0; p < partialCandidates.length; p++) {
    const cand = partialCandidates[p];
    if (cand.matchedCount < minMatched) continue;
    if (hasSpecificGroups && cand.specificMatches === 0 && groups.length <= 2) continue;

    const score = cand.matchedCount * 100 + cand.specificMatches * 40 + cand.totalScore;
    partialRelevance.set(cand.item, score);
    partialMatched.push(cand.item);
  }

  // If minMatched >= 2 was still too strict on 3+ word queries, relax to any multi-specific anchor
  if (partialMatched.length === 0 && partialCandidates.length > 0) {
    for (let p = 0; p < partialCandidates.length; p++) {
      const cand = partialCandidates[p];
      if (hasSpecificGroups && cand.specificMatches === 0) continue;
      const score = cand.matchedCount * 100 + cand.specificMatches * 40 + cand.totalScore;
      partialRelevance.set(cand.item, score);
      partialMatched.push(cand.item);
    }
  }

  return {
    files: partialMatched,
    relevanceMap: partialRelevance,
    isPartialFallback: partialMatched.length > 0,
    missingTerms,
    appliedCorrections: corrections,
    didYouMean
  };
}
