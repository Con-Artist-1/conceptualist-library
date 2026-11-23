// Board-dispatched unit normalization, variant parsing, and filename metadata utilities.
// Dispatches Cambridge International (CAIE) to src/parsers/cambridgeParser.js
// and Pearson Edexcel (IAL & IGCSE) to src/parsers/edexcelParser.js with zero cross-board bleed.

import { isCambridgeSpec, isCambridgeCurriculum, isCambridgePath } from './data/boards.js';
import {
  detectEdexcelDocType,
  detectEdexcelSubject,
  extractEdexcelYear,
  extractEdexcelSessionDate,
  extractEdexcelUnitInfo,
  extractEdexcelVariant,
  getEdexcelCleanUnitLabel
} from './parsers/edexcelParser.js';
import {
  detectCambridgeDocType,
  detectCambridgeSubject,
  extractCambridgeYear,
  extractCambridgeSessionDate,
  extractCambridgeUnitInfo,
  extractCambridgeVariant,
  getCambridgeCleanUnitLabel,
  detectCambridgeSpec,
  parseCambridgePath
} from './parsers/cambridgeParser.js';

export { isLegacyIalUnitLabel, isLegacyUnitLabel, compareUnitLabels } from './lib/unitSort.js';
export { detectCambridgeSpec, parseCambridgePath };

function shouldUseCambridge({ pathStr = '', spec = '', curriculum = '', board = '' } = {}) {
  return Boolean(
    board === 'cambridge' ||
    isCambridgeSpec(spec) ||
    isCambridgeCurriculum(curriculum) ||
    isCambridgePath(pathStr)
  );
}

export function detectDocType(name, pathStr, spec = '') {
  if (shouldUseCambridge({ pathStr, spec })) {
    return detectCambridgeDocType(name, pathStr);
  }
  return detectEdexcelDocType(name, pathStr);
}

export function detectSubject(pathStr, spec = '') {
  if (shouldUseCambridge({ pathStr, spec })) {
    return detectCambridgeSubject(pathStr);
  }
  return detectEdexcelSubject(pathStr);
}

export function extractYear(pathStr, spec = '') {
  if (shouldUseCambridge({ pathStr, spec })) {
    return extractCambridgeYear(pathStr);
  }
  return extractEdexcelYear(pathStr);
}

export function extractSessionDate(pathStr, spec = '') {
  if (shouldUseCambridge({ pathStr, spec })) {
    return extractCambridgeSessionDate(pathStr);
  }
  return extractEdexcelSessionDate(pathStr);
}

export function extractUnitInfo(pathStr, subject, spec) {
  if (shouldUseCambridge({ pathStr, spec })) {
    return extractCambridgeUnitInfo(pathStr, subject);
  }
  return extractEdexcelUnitInfo(pathStr, subject, spec);
}

export function extractVariant(file) {
  if (shouldUseCambridge({ pathStr: file?.path, spec: file?.spec, curriculum: file?.curriculum, board: file?.board })) {
    return extractCambridgeVariant(file);
  }
  return extractEdexcelVariant(file);
}

export function getCleanUnitLabel(file) {
  if (shouldUseCambridge({ pathStr: file?.path, spec: file?.spec, curriculum: file?.curriculum, board: file?.board })) {
    return getCambridgeCleanUnitLabel(file);
  }
  return getEdexcelCleanUnitLabel(file);
}
