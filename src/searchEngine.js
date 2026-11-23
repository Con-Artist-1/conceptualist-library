// High-precision, sub-millisecond multi-board fuzzy search & ranking engine for Conceptualist Systems.
// Strictly isolates Pearson Edexcel (IAL & IGCSE) and Cambridge International (AS & A Level, IGCSE, O Level).

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
import { isBookCategory, isCambridgeSpec } from './data/boards.js';
import {
  CAMBRIDGE_ALL_CODES,
  extractSyllabusCodeFromSubject,
  getCambridgeSubjectAliases
} from './data/cambridgeCatalog.js';

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

const MONTH_NAME_SET = new Set([
  'jan', 'january', 'feb', 'february', 'mar', 'march', 'may', 'jun', 'june', 'summer',
  'oct', 'october', 'nov', 'november', 'autumn', 'winter', 'mayjune', 'octnov', 'febmarch', 'fm', 'mj', 'on'
]);

function tokenizeRaw(str) {
  if (!str) return [];
  return String(str)
    .toLowerCase()
    .replace(/['’]/g, '')
    .match(/[a-z0-9]+/g) || [];
}

function expandBaseCodeAliases(codeLower, targetSet, isCambridge = false) {
  if (!codeLower) return;
  targetSet.add(codeLower);
  if (isCambridge) return;
  // Edexcel variant strips: m1a -> m1, m1r -> m1, p1r -> p1, fp2a -> fp2, wma11r -> wma11
  const strippedVar = codeLower.replace(/(?:r|a)$/, '');
  if (strippedVar && strippedVar !== codeLower && /\d$/.test(strippedVar)) {
    targetSet.add(strippedVar);
  }
  const equiv = ITEM_CODE_EQUIV[strippedVar] || ITEM_CODE_EQUIV[codeLower];
  if (equiv) {
    for (let i = 0; i < equiv.length; i++) targetSet.add(equiv[i]);
  }
  const paperMatch = codeLower.match(/^paper([1-4][a-z]?)$/);
  if (paperMatch) {
    targetSet.add('paper');
    targetSet.add(`p${paperMatch[1]}`);
    targetSet.add(`p${paperMatch[1].replace(/[ar]$/, '')}`);
  }
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
 * Detect whether a user query unambiguously targets another exam board
 * so the UI can offer a 1-click "Switch Board" nudge instead of 0-result confusion.
 */
export function detectLikelyQueryBoard(rawQuery = '') {
  const q = String(rawQuery || '').toLowerCase().trim();
  if (!q) return null;

  // Explicit board keywords
  if (/\b(?:cambridge|caie|cie|o[-_\s]?levels?)\b/.test(q)) return 'cambridge';
  if (/\b(?:edexcel|pearson|ial|solomon)\b/.test(q)) return 'edexcel';

  // Explicit Edexcel course codes (W-codes, 4-char IGCSE 4*, 6-char GCE)
  if (/\b(?:w[a-z]{2}\d{2}|4w?[a-z]{2}\d|4wm[12][hf]|yla[12]|6(?:bi|ch|ph)\d{2})\b/.test(q)) {
    return 'edexcel';
  }

  // Explicit Cambridge cover-code or session-letter syntax (e.g. "0625/42", "9709 s24", "0580 fm25")
  const fourDigitMatches = q.match(/\b\d{4}\b/g) || [];
  for (const code of fourDigitMatches) {
    if (CAMBRIDGE_ALL_CODES.has(code)) {
      // Guard ambiguous year-like code "2010": only treat as Cambridge if paired with another CIE signal or not alone as a year
      if (code === '2010') {
        if (/\b(?:[msw]\d{2}|qp|ms|er|gt|in|lit|literature|11|12|13|21|22|23)\b/.test(q)) {
          return 'cambridge';
        }
        continue;
      }
      return 'cambridge';
    }
  }
  if (/\b(?:[msw](?:0[2-9]|[12]\d)|fm\d{2}|mj\d{2}|on\d{2})\b/.test(q)) {
    return 'cambridge';
  }
  return null;
}

/**
 * Attach structured search tokens and phrase indexes once per file object.
 */
export function buildFileSearchData(fileObj) {
  if (!fileObj) return null;

  const isCie = fileObj.board === 'cambridge' || isCambridgeSpec(fileObj.spec);
  const highSet = new Set();
  const metaSet = new Set();
  const tokenSet = new Set();

  const addTok = (val, destSet) => {
    if (!val) return;
    destSet.add(val);
    tokenSet.add(val);
  };

  const addTokensTo = (str, destSet, alsoExpandCodes = false) => {
    const toks = tokenizeRaw(str);
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      destSet.add(t);
      tokenSet.add(t);
      if (alsoExpandCodes && t.length <= 7 && /\d/.test(t)) {
        expandBaseCodeAliases(t, destSet, isCie);
        expandBaseCodeAliases(t, tokenSet, isCie);
      }
    }
  };

  // High-priority fields: unit label, unit name, unit code, subject, aliases
  addTokensTo(fileObj.cleanUnitLabel, highSet, !isCie);
  addTokensTo(fileObj.unitName, highSet, !isCie);
  addTokensTo(fileObj.unitCode, highSet, !isCie);
  addTokensTo(fileObj.subject, highSet, false);

  const subj = fileObj.subject || '';
  const subjLower = subj.toLowerCase();
  if (subj === 'Math' || subjLower.startsWith('mathematics')) {
    addTok('math', highSet);
    addTok('mathematics', highSet);
    addTok('maths', highSet);
  } else if (subjLower.startsWith('information technology') || subjLower.startsWith('ict')) {
    addTok('it', highSet);
    addTok('ict', highSet);
  } else if (subjLower.startsWith('computer science')) {
    addTok('cs', highSet);
    addTok('compsci', highSet);
  } else if (subjLower.startsWith('further pure mathematics') || subjLower.startsWith('further mathematics')) {
    addTok('fmath', highSet);
  } else if (subjLower.startsWith('english as a second language')) {
    addTok('esl', highSet);
  } else if (subjLower.startsWith('first language english')) {
    addTok('fle', highSet);
  }

  // Board-specific syllabus codes & paper/unit indexing
  const unitLabelStr = `${fileObj.cleanUnitLabel || ''} ${fileObj.unitName || ''}`.toLowerCase();

  if (isCie) {
    addTok('cambridge', metaSet);
    addTok('caie', metaSet);
    addTok('cie', metaSet);
    if (fileObj.spec === 'CIE-AL') {
      addTok('alevel', metaSet);
      addTok('alevels', metaSet);
      addTok('cie-al', metaSet);
    } else if (fileObj.spec === 'CIE-OL') {
      addTok('olevel', metaSet);
      addTok('olevels', metaSet);
      addTok('cie-ol', metaSet);
    } else {
      addTok('igcse', metaSet);
      addTok('cie-igcse', metaSet);
    }

    const sylCode = fileObj.syllabusCode || extractSyllabusCodeFromSubject(subj);
    if (sylCode) {
      const aliases = getCambridgeSubjectAliases(sylCode);
      for (let i = 0; i < aliases.length; i++) {
        addTok(aliases[i], highSet);
      }
    }

    // Index Cambridge paper number (p1..p7) and exact component code (e.g. 42, 12, 33) + variant (v1..v6)
    const ucPaperMatch = String(fileObj.unitCode || '').match(/P(\d)$/i) || unitLabelStr.match(/\bpaper\s*([1-7])\b/);
    const paperDigit = ucPaperMatch ? ucPaperMatch[1] : '';
    const vDigit = /^\d$/.test(String(fileObj.variant || '')) ? String(fileObj.variant) : '';
    if (paperDigit) {
      addTok(`p${paperDigit}`, highSet);
      if (sylCode) addTok(`${sylCode}p${paperDigit}`, highSet);
      if (vDigit) {
        addTok(`${paperDigit}${vDigit}`, highSet);
        addTok(`p${paperDigit}${vDigit}`, highSet);
        addTok(`v${vDigit}`, metaSet);
      }
    }
    // Also index legacy pre-renumbering component digits from raw filename (e.g. 9709_s19_qp_62 -> 62, p6)
    const rawCompMatch = String(fileObj.name || '').match(/_(?:qp|ms|in|ci|sf|tn|pm)_(\d{1,2})\./i);
    if (rawCompMatch) {
      const rc = rawCompMatch[1];
      addTok(rc, highSet);
      if (rc.length === 2 && !rc.startsWith('0')) {
        addTok(`p${rc[0]}`, highSet);
        addTok(`v${rc[1]}`, metaSet);
      } else if (rc.length === 1) {
        addTok(`p${rc}`, highSet);
      }
    }

    // Cambridge 9709 / 9231 board-neutral Math branch tokens
    if (sylCode === '9709') {
      if (unitLabelStr.includes('pure mathematics 1')) { addTok('pure1', highSet); addTok('p1', highSet); }
      else if (unitLabelStr.includes('pure mathematics 2')) { addTok('pure2', highSet); addTok('p2', highSet); }
      else if (unitLabelStr.includes('pure mathematics 3')) { addTok('pure3', highSet); addTok('p3', highSet); }
      else if (unitLabelStr.includes('mechanics 2') || unitLabelStr.includes('old p5')) { addTok('m2', highSet); addTok('p5', highSet); }
      else if (unitLabelStr.includes('mechanics')) { addTok('m1', highSet); addTok('p4', highSet); }
      else if (unitLabelStr.includes('statistics 1')) { addTok('s1', highSet); addTok('p5', highSet); }
      else if (unitLabelStr.includes('statistics 2')) { addTok('s2', highSet); addTok('p6', highSet); }
    } else if (sylCode === '9231') {
      if (unitLabelStr.includes('further pure mathematics 1')) { addTok('fp1', highSet); addTok('f1', highSet); }
      else if (unitLabelStr.includes('further pure mathematics 2')) { addTok('fp2', highSet); addTok('f2', highSet); }
      else if (unitLabelStr.includes('further mechanics')) { addTok('fm', highSet); }
      else if (unitLabelStr.includes('further probability')) { addTok('fs', highSet); }
    }

    // Cambridge paper descriptors (MCQ, ATP, Core, Extended, AS, A2)
    if (unitLabelStr.includes('multiple choice')) addTok('mcq', highSet);
    if (unitLabelStr.includes('alternative to practical')) addTok('atp', highSet);
    if (unitLabelStr.includes('core')) addTok('core', highSet);
    if (unitLabelStr.includes('extended')) addTok('extended', highSet);
    if (/\(as\)|\bas\b/.test(unitLabelStr)) addTok('as', metaSet);
    if (/\(a2\)|\ba2\b/.test(unitLabelStr)) addTok('a2', metaSet);

    // Cambridge SC subtypes (Insert, Confidential Instructions, Transcript, Pre-Release)
    const rawNameLower = String(fileObj.name || '').toLowerCase();
    if (/_in(?:_|\.)/.test(rawNameLower)) { addTok('in', highSet); addTok('insert', highSet); }
    if (/_ci(?:_|\.)/.test(rawNameLower)) { addTok('ci', highSet); addTok('confidential', highSet); }
    if (/_tn(?:_|\.)/.test(rawNameLower)) { addTok('tn', highSet); addTok('transcript', highSet); addTok('tapescript', highSet); }
    if (/_pm(?:_|\.)/.test(rawNameLower)) { addTok('pm', highSet); addTok('prerelease', highSet); }
  } else {
    // Pearson Edexcel indexing (unchanged precision)
    addTok('edexcel', metaSet);
    addTok('pearson', metaSet);

    if (fileObj.spec === 'IGCSE' || fileObj.curriculum === 'Edexcel IGCSE') {
      const igCodes = IGCSE_CODE_BY_SUBJECT[subj];
      if (igCodes) {
        igCodes.forEach((c) => addTok(c, highSet));
      }
    }

    const unitNumMatch = unitLabelStr.match(/\bunit\s*([1-6])\b/);
    if (unitNumMatch) addTok(`u${unitNumMatch[1]}`, highSet);
    const paperNumMatch = unitLabelStr.match(/\bpaper\s*([1-4]r?)\b/);
    if (paperNumMatch) addTok(`p${paperNumMatch[1]}`, highSet);

    const v = fileObj.variant || '';
    const isReg = v === 'R' || v === 'A' || v.includes('R');
    if (isReg) {
      ['regional', 'reg', 'r'].forEach((t) => addTok(t, metaSet));
    }
    if (v === 'A') {
      ['alt', 'alta'].forEach((t) => addTok(t, metaSet));
    }
    if (v.includes('H')) {
      addTok('higher', metaSet);
      if (paperNumMatch) {
        const pDigit = paperNumMatch[1].replace(/r$/i, '');
        addTok(`${pDigit}h`, highSet);
        if (isReg) addTok(`${pDigit}hr`, highSet);
      }
    }
    if (v.includes('F')) {
      addTok('foundation', metaSet);
      if (paperNumMatch) {
        const pDigit = paperNumMatch[1].replace(/r$/i, '');
        addTok(`${pDigit}f`, highSet);
        if (isReg) addTok(`${pDigit}fr`, highSet);
      }
    }
  }

  // Metadata fields: curriculum, spec, category, year
  addTokensTo(fileObj.curriculum, metaSet, false);
  addTokensTo(fileObj.spec, metaSet, false);
  addTokensTo(fileObj.category, metaSet, false);
  if (fileObj.year) {
    addTok(String(fileObj.year), metaSet);
  }

  // Board-isolated session token indexing
  const sRaw = `${fileObj.session || ''} ${fileObj.path || ''}`;
  addTokensTo(fileObj.session, metaSet, false);
  const yyTwo = fileObj.year ? String(fileObj.year).slice(-2) : '';

  if (isCie) {
    if (/feb[-/\s]*mar|march/i.test(fileObj.session || '')) {
      SESSION_SYNONYMS_BY_MONTH.febMarchCie.forEach((t) => addTok(t, metaSet));
      if (yyTwo) { addTok(`m${yyTwo}`, metaSet); addTok(`fm${yyTwo}`, metaSet); }
    } else if (/may|jun/i.test(fileObj.session || '')) {
      SESSION_SYNONYMS_BY_MONTH.mayJune.forEach((t) => addTok(t, metaSet));
      addTok('mj', metaSet);
      if (yyTwo) { addTok(`s${yyTwo}`, metaSet); addTok(`mj${yyTwo}`, metaSet); }
    } else if (/oct|nov/i.test(fileObj.session || '')) {
      SESSION_SYNONYMS_BY_MONTH.octNov.forEach((t) => addTok(t, metaSet));
      addTok('winter', metaSet);
      addTok('on', metaSet);
      if (yyTwo) { addTok(`w${yyTwo}`, metaSet); addTok(`on${yyTwo}`, metaSet); }
    }
  } else {
    if (/\b(?:may|jun|june)\b|may[-_\s]*june/i.test(sRaw)) {
      SESSION_SYNONYMS_BY_MONTH.mayJune.forEach((t) => addTok(t, metaSet));
    }
    if (/\b(?:oct|october|nov|november)\b|oct[-_\s]*nov/i.test(sRaw)) {
      SESSION_SYNONYMS_BY_MONTH.octNov.forEach((t) => addTok(t, metaSet));
    }
    if (/\b(?:jan|january)\b|jan[-_\s]*feb/i.test(sRaw)) {
      SESSION_SYNONYMS_BY_MONTH.janEdexcel.forEach((t) => addTok(t, metaSet));
    }
    if (/\b(?:feb|february)\b/i.test(sRaw)) {
      addTok('feb', metaSet);
      addTok('february', metaSet);
    }
  }

  const dt = fileObj.docType || '';
  const dtToks = DOC_TYPE_TOKENS[dt];
  if (dtToks) {
    dtToks.forEach((t) => {
      if (dt === 'GT') addTok(t, highSet);
      addTok(t, metaSet);
    });
  }
  if (isBookCategory(fileObj.category) && dt !== 'SOL') {
    DOC_TYPE_TOKENS.Book.forEach((t) => {
      addTok(t, highSet);
      addTok(t, metaSet);
    });
  }

  // Path & Filename tokens
  const sanitizedPathForTokens = String(fileObj.path || '').replace(/\s*\(\d+\)(\.[a-z0-9]+)$/i, '$1');
  addTokensTo(fileObj.name, tokenSet, !isCie);
  addTokensTo(sanitizedPathForTokens, tokenSet, !isCie);

  if (!isCie && subj === 'Math') {
    const mathPMap = { p1: ['wma11', 'pure1'], p2: ['wma12', 'pure2'], p3: ['wma13', 'pure3'], p4: ['wma14', 'pure4'] };
    Object.entries(mathPMap).forEach(([pKey, [wma, pureKey]]) => {
      if (tokenSet.has(pKey) || tokenSet.has(`${pKey}r`) || tokenSet.has(`${pKey}a`) || tokenSet.has(wma)) {
        addTok(pKey, highSet);
        addTok(wma, highSet);
        addTok(pureKey, highSet);
      }
    });
    const mathBookCodeMatch = String(fileObj.name || '').match(/\((p[1-4]|m[1-3]|s[1-3]|fp[1-3]|d1|c12|c34)\)/i);
    if (mathBookCodeMatch) {
      expandBaseCodeAliases(mathBookCodeMatch[1].toLowerCase(), highSet, false);
      expandBaseCodeAliases(mathBookCodeMatch[1].toLowerCase(), tokenSet, false);
    }
  }

  if (!isCie) {
    const v = fileObj.variant || '';
    const isReg = v === 'R' || v === 'A' || v.includes('R');
    if (isReg && fileObj.unitCode) {
      const ucLower = fileObj.unitCode.toLowerCase().replace(/[ar]$/, '');
      const regSuffix = v === 'A' ? 'a' : 'r';
      addTok(`${ucLower}${regSuffix}`, highSet);
      const eqs = ITEM_CODE_EQUIV[ucLower];
      if (eqs) {
        for (let i = 0; i < eqs.length; i++) {
          addTok(`${eqs[i]}${regSuffix}`, highSet);
        }
      }
    }
  }

  const highPhraseBase = [
    fileObj.cleanUnitLabel,
    fileObj.unitName,
    fileObj.unitCode,
    fileObj.subject,
    subj === 'Math' ? 'mathematics maths' : '',
    subjLower.startsWith('information technology') || subjLower.startsWith('ict') ? 'information technology it ict' : '',
    subjLower.startsWith('computer science') ? 'computer science cs' : ''
  ]
    .filter(Boolean)
    .join(' ');

  const isEdexcelReg = !isCie && (fileObj.variant === 'R' || fileObj.variant === 'A' || String(fileObj.variant || '').includes('R'));
  const allPhraseBase = [
    highPhraseBase,
    fileObj.name,
    sanitizedPathForTokens,
    fileObj.curriculum,
    fileObj.category,
    fileObj.session,
    DOC_TYPE_PHRASES[dt] || '',
    isEdexcelReg ? 'regional reg r' : '',
    isCie && fileObj.variant ? `variant ${fileObj.variant}` : ''
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

function damerauLevenshtein(a, b, maxDist = 2) {
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

  // Cambridge full cover codes: "9709/12/M/J/23" -> "9709 12 mayjune 2023", "0625/42/O/N/24", "0580/42/F/M/25"
  q = q.replace(/\b(\d{4})[/_\s-]+(\d{1,2})[/_\s-]+m[/\s]*j[/_\s-]*(\d{2,4})\b/g, (_, syl, comp, yr) => (
    `${syl} ${comp} mayjune ${yr.length === 2 ? `20${yr}` : yr}`
  ));
  q = q.replace(/\b(\d{4})[/_\s-]+(\d{1,2})[/_\s-]+o[/\s]*n[/_\s-]*(\d{2,4})\b/g, (_, syl, comp, yr) => (
    `${syl} ${comp} octnov ${yr.length === 2 ? `20${yr}` : yr}`
  ));
  q = q.replace(/\b(\d{4})[/_\s-]+(\d{1,2})[/_\s-]+f[/\s]*m[/_\s-]*(\d{2,4})\b/g, (_, syl, comp, yr) => (
    `${syl} ${comp} febmarch ${yr.length === 2 ? `20${yr}` : yr}`
  ));

  // Cambridge syllabus/component slash notation: "9709/12" -> "9709 12", "0625/42" -> "0625 42"
  q = q.replace(/\b(\d{4})[/](\d{1,2})\b/g, '$1 $2');

  // Cambridge native series+year shorthands: "s24" -> "s24 mayjune 2024", "w23" -> "w23 octnov 2023", "m25"/"fm25" -> "m25 febmarch 2025"
  // Safe for Edexcel M1-M3 and S1-S3 because those have 1 digit while series codes have 2 digits (02..29)
  q = q.replace(/\b(?:fm|f\/m)[-_]?([012]\d)\b/g, (_, yy) => `m${yy} febmarch 20${yy}`);
  q = q.replace(/\b(?:mj|m\/j)[-_]?([012]\d)\b/g, (_, yy) => `s${yy} mayjune 20${yy}`);
  q = q.replace(/\b(?:on|o\/n)[-_]?([012]\d)\b/g, (_, yy) => `w${yy} octnov 20${yy}`);
  q = q.replace(/\b([msw])(0[2-9]|[12]\d)\b/g, (_, ch, yy) => {
    const sess = ch === 'm' ? 'febmarch' : ch === 's' ? 'mayjune' : 'octnov';
    return `${ch}${yy} ${sess} 20${yy}`;
  });

  // Strip Edexcel cover-sheet component numbers ("WMA11/01" -> "wma11", "4MA1/02HR" -> "4ma1 2hr")
  q = q.replace(/\b([a-z]{2,3}\d{2}|6[a-z]{2}\d{2})[/_\s-]+0[1-9]\b/g, '$1');
  q = q.replace(/\b([a-z]{2,3}\d{2}|4[a-z]{1,3}\d|6[a-z]{2}\d{2})[/_\s-]+0?([1-4][hrfa]{1,2})\b/g, '$1 $2');
  q = q.replace(/\b(4[a-z]{1,3}\d)[/_\s-]+0([1-4])\b/g, '$1 p$2');

  // Rejoin accidentally spaced Edexcel course codes ("wma 11" -> "wma11", "4ma 1" -> "4ma1", "6bi 01" -> "6bi01")
  q = q.replace(/\b(w[a-z]{2}|6[a-z]{2})\s+(\d{2}[ar]?)\b/g, '$1$2');
  q = q.replace(/\b(4[a-z]{1,3})\s+(\d[hf]?r?)\b/g, '$1$2');

  // Split joined session+year or code+year ("jan26" -> "jan 2026", "wma11jan25" -> "wma11 jan 2025")
  q = q.replace(/([a-z0-9]{2,})(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|may|jun(?:e)?|summer|oct(?:ober)?|nov(?:ember)?|autumn|winter)(\d{2}|\d{4})\b/gi, (_, pre, mo, yr) => (
    `${pre} ${mo} ${yr.length === 2 ? `20${yr}` : yr}`
  ));
  q = q.replace(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|may|jun(?:e)?|summer|oct(?:ober)?|nov(?:ember)?|autumn|winter|mayjune|octnov|febmarch)[-_\s/]*(\d{2}|\d{4})\b/g, (_, mo, yr) => (
    `${mo} ${yr.length === 2 && parseInt(yr, 10) >= 3 && parseInt(yr, 10) <= 29 ? `20${yr}` : yr}`
  ));

  // Normalize board-neutral multi-word unit/paper shorthands
  q = q.replace(/\bunit\s*([1-6])\b/g, 'u$1');
  q = q.replace(/\bpaper\s*([1-7][ar]?)\b/g, 'p$1');
  q = q.replace(/\bvariant\s*([1-6])\b/g, 'v$1');
  q = q.replace(/\bfurther\s+(?:pure(?:\s+math(?:ematics|s)?)?|math(?:ematics|s)?)\s*(?:f?p|u)?([1-3])([ar])?\b/g, (_, d, v) => (v ? `fp${d} ${v}` : `fp${d}`));
  // Pure Mathematics 1..4 -> board-neutral pure1..pure4 (matches both Edexcel WMA11-14 and Cambridge 9709 P1-P3!)
  q = q.replace(/\bpure(?:\s+math(?:ematics|s)?)?\s*(?:p|u)?([1-4])([ar])?\b/g, (_, d, v) => (v ? `pure${d} ${v}` : `pure${d}`));
  q = q.replace(/\b(?:mechanics|mech)\s*(?:m|p|u)?([1-3])([ar])?\b/g, (_, d, v) => (v ? `m${d} ${v}` : `m${d}`));
  q = q.replace(/\b(?:statistics|stats?)\s*(?:s|p|u)?([1-3])([ar])?\b/g, (_, d, v) => (v ? `s${d} ${v}` : `s${d}`));
  q = q.replace(/\bdecision(?:\s+math(?:ematics|s)?)?\s*(?:d|p|u)?1([ar])?\b/g, (_, v) => (v ? `d1 ${v}` : 'd1'));
  q = q.replace(/\bcore\s+(?:math(?:ematics|s)?\s*)?(?:c|p|u)?([1-4]|12|34)([ar])?\b/g, (_, d, v) => (v ? `c${d} ${v}` : `c${d}`));
  q = q.replace(/\bfeb(?:ruary)?[-_\s/]+mar(?:ch)?\b/g, 'febmarch');
  q = q.replace(/\bmay[-_\s/]+june?\b/g, 'mayjune');
  q = q.replace(/\boct(?:ober)?[-_\s/]+nov(?:ember)?\b/g, 'octnov');
  q = q.replace(/\bo[-_\s]+levels?\b/g, 'olevel');
  q = q.replace(/\ba[-_\s]+levels?\b/g, 'alevel');
  q = q.replace(/\bgrade\s+thresholds?\b/g, 'gt');

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
export function parseSearchQuery(rawQuery, catalogVocab = STATIC_SEARCH_VOCAB, { activeBoard = '' } = {}) {
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

  // Detect Cambridge query context so 2-digit component codes (12, 22, 33, 42) never expand into 2012/2022!
  const hasCambridgeSyllabusTok = rawTokens.some((t) => /^\d{4}$/.test(t) && CAMBRIDGE_ALL_CODES.has(t));
  const hasCambridgeWord = rawTokens.some((t) => t === 'cambridge' || t === 'caie' || t === 'cie' || t === 'olevel' || t === 'febmarch');
  const isCambridgeContext = activeBoard === 'cambridge' || hasCambridgeSyllabusTok || hasCambridgeWord;

  // Count non-syllabus year tokens so "2010 s23 qp 12" recognizes 2023 as year and 2010 as O-Level Literature syllabus
  const otherYearCount = rawTokens.filter((t) => /^(?:199\d|20[0-3]\d)$/.test(t) && !CAMBRIDGE_ALL_CODES.has(t)).length;

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
    const prevTok = i > 0 ? rawTokens[i - 1] : '';

    // Expand standalone 2-digit years ("26" -> "2026") ONLY when NOT a Cambridge component code (e.g. "0625 22", "9709 12")
    if (/^\d{2}$/.test(tok)) {
      const yrNum = parseInt(tok, 10);
      const precededByMonth = MONTH_NAME_SET.has(prevTok);
      if (yrNum >= 3 && yrNum <= 29 && (!isCambridgeContext || precededByMonth)) {
        tok = String(2000 + yrNum);
      }
    }

    const altsMap = new Map();
    addAlt(altsMap, { type: 'tok', val: tok }, 0, false);
    addSynonymsForKey(tok, altsMap, 0, false);

    const isNumeric = /^\d+$/.test(tok);
    const hasDigit = /\d/.test(tok);
    const isKnownWordOrCode = Boolean(
      COMPILED_SYNONYMS[tok] ||
      STATIC_SEARCH_VOCAB_SET.has(tok) ||
      vocabSet.has(tok) ||
      CAMBRIDGE_ALL_CODES.has(tok)
    );
    let bestCorrection = null;

    if (!isNumeric && tok.length === 3 && !isKnownWordOrCode) {
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
          if (hasDigit) {
            if (!/\d/.test(word) || word.replace(/\D/g, '') !== tokDigits) continue;
          }
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

    const isCieSyllabus = /^\d{4}$/.test(tok) && CAMBRIDGE_ALL_CODES.has(tok) && !(tok === '2010' && !isCambridgeContext && otherYearCount === 0);
    const isYear = !isCieSyllabus && /^(?:199\d|20[0-3]\d)$/.test(tok);
    const isCode = isCieSyllabus || (/\d/.test(tok) && !isYear);
    const isGeneric = GENERIC_QUERY_WORDS.has(tok);
    const isSession = Boolean(
      MONTH_NAME_SET.has(tok) ||
      /^[msw](?:0[2-9]|[12]\d)$/.test(tok)
    );
    const isSubjectOrTopic = !isYear && !isGeneric && !isSession && (
      Boolean(COMPILED_SYNONYMS[tok] || IGCSE_SUBJECT_BY_CODE[tok] || isCieSyllabus) ||
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
  if (allowPrefix && val.length >= 3 && !/^\d+$/.test(val) && searchData.wordStr.includes(` ${val}`)) {
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
      if (item.syllabusCode && item.syllabusCode === alt.val) s += 14;
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
    'wfm01', 'wfm02', 'wfm03', '4pm1', '4pm0', '9231'
  ]);
  const hasPureQueryToken = groups.some((g) => g.primary === 'pure' || /^pure[1-4]$/.test(g.primary) || /^wma1[1-4]$/.test(g.primary));
  const hasFurtherQueryToken = groups.some((g) => FURTHER_QUERY_KEYS.has(g.primary));
  const strictMatched = [];
  const strictRelevance = new WeakMap();
  const groupHitCounts = new Array(groups.length).fill(0);
  let strictTypoUsed = false;

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
