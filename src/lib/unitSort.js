// Lightweight unit label sorting and legacy-spec detection shared by UI components
// and unitParser.js without pulling heavy filename-parsing regex tables into entry chunks.

const LEGACY_IAL_UNIT_CODE_RE = /\((W(?:PH|BI|CH|BS|EC)0[1-7]|6ECA[1-3])\)$/i;
const LEGACY_CAMBRIDGE_UNIT_RE = /^Legacy\s+|\(Pre-20\d{2}\)|\(Old\s+P\d\)/i;

export function isLegacyIalUnitLabel(label = '') {
  return LEGACY_IAL_UNIT_CODE_RE.test(String(label || '').trim());
}

export function isLegacyUnitLabel(label = '') {
  const s = String(label || '').trim();
  return LEGACY_IAL_UNIT_CODE_RE.test(s) || LEGACY_CAMBRIDGE_UNIT_RE.test(s);
}

const MATH_UNIT_ORDER = [
  'Pure Mathematics 1 (P1)',
  'Pure Mathematics 2 (P2)',
  'Pure Mathematics 3 (P3)',
  'Pure Mathematics 4 (P4)',
  'Mechanics (P4)',
  'Mechanics 1 (M1)',
  'Mechanics 2 (M2)',
  'Mechanics 3 (M3)',
  'Probability & Statistics 1 (P5)',
  'Probability & Statistics 2 (P6)',
  'Statistics 1 (S1)',
  'Statistics 2 (S2)',
  'Statistics 3 (S3)',
  'Decision Mathematics 1 (D1)',
  'Further Pure Mathematics 1 (P1)',
  'Further Pure Mathematics 2 (P2)',
  'Further Mechanics (P3)',
  'Further Probability & Statistics (P4)',
  'Further Pure 1 (FP1)',
  'Further Pure 2 (FP2)',
  'Further Pure 3 (FP3)',
  'Legacy Mechanics 2 (Old P5)',
  'Legacy Further Mathematics Paper 1 (Pre-2020)',
  'Legacy Further Mathematics Paper 2 (Pre-2020)',
  'Core Mathematics 12 (C12)',
  'Core Mathematics 34 (C34)',
  'Core Mathematics 1 (C1)',
  'Core Mathematics 2 (C2)',
  'Core Mathematics 3 (C3)',
  'Core Mathematics 4 (C4)'
];

export function compareUnitLabels(a = '', b = '', subject = '') {
  const strA = String(a || '');
  const strB = String(b || '');
  const isMath =
    subject === 'Math' ||
    subject === 'Mathematics' ||
    subject.startsWith('Mathematics (') ||
    subject.startsWith('Further Mathematics (');
  if (isMath || MATH_UNIT_ORDER.includes(strA) || MATH_UNIT_ORDER.includes(strB)) {
    const ia = MATH_UNIT_ORDER.indexOf(strA);
    const ib = MATH_UNIT_ORDER.indexOf(strB);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
  }

  // Group Current Spec (tier 0) -> Legacy (tier 1) -> Legacy GCE 6ECA* (tier 2)
  const getTier = (s) => {
    if (/\(6ECA[1-3]\)$/i.test(s)) return 2;
    if (LEGACY_IAL_UNIT_CODE_RE.test(s) || LEGACY_CAMBRIDGE_UNIT_RE.test(s)) return 1;
    return 0;
  };
  const tierDiff = getTier(strA) - getTier(strB);
  if (tierDiff !== 0) return tierDiff;

  // Natural numeric sort by Unit/Paper number (1..7)
  const numA = strA.match(/\b(?:Unit|Paper)\s+(\d+)\b/i);
  const numB = strB.match(/\b(?:Unit|Paper)\s+(\d+)\b/i);
  if (numA && numB) {
    const diff = parseInt(numA[1], 10) - parseInt(numB[1], 10);
    if (diff !== 0) return diff;
  }

  return strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
}
