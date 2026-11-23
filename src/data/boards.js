// Declarative International Exam Board Registry (strictly international boards only).
// Shared across React UI, Web Worker, Node build scripts, and SEO pre-rendering.

export const BOARD_IDS = ['edexcel', 'cambridge'];
export const DEFAULT_BOARD_ID = 'edexcel';
export const BOARD_STORAGE_KEY = 'cs_board';

export const BOARD_REGISTRY = {
  edexcel: {
    id: 'edexcel',
    label: 'Pearson Edexcel',
    shortLabel: 'Edexcel',
    routePrefix: '',
    specs: ['IAL', 'IGCSE'],
    curriculums: [
      {
        id: 'Edexcel IAL',
        spec: 'IAL',
        label: 'Edexcel International A-Level (IAL)',
        shortLabel: 'IAL',
        crossBoardLabel: 'EDX IAL',
        badgeCls: 'ial',
        routeSlug: 'ial',
        indexFile: 'index-edexcel.json'
      },
      {
        id: 'Edexcel IGCSE',
        spec: 'IGCSE',
        label: 'Edexcel International GCSE (IGCSE)',
        shortLabel: 'IGCSE',
        crossBoardLabel: 'EDX IGCSE',
        badgeCls: 'igcse',
        routeSlug: 'igcse',
        indexFile: 'index-edexcel.json'
      }
    ],
    sessions: ['January', 'June', 'October'],
    supportsVariants: false,
    searchPlaceholderDesktop: 'Search by course code, subject, unit or year (e.g. WMA11, Biology, 4MA1)...',
    searchPlaceholderMobile: 'Search unit, code, or year...',
    disclaimer: 'Not affiliated with Pearson plc or Edexcel.'
  },
  cambridge: {
    id: 'cambridge',
    label: 'Cambridge International',
    shortLabel: 'Cambridge',
    routePrefix: 'cambridge',
    specs: ['CIE-AL', 'CIE-IGCSE', 'CIE-OL'],
    curriculums: [
      {
        id: 'Cambridge AS & A Level',
        spec: 'CIE-AL',
        label: 'Cambridge International AS & A Level',
        shortLabel: 'A-Level',
        crossBoardLabel: 'CAIE AL',
        badgeCls: 'cie-al',
        routeSlug: 'cambridge/a-level',
        indexFile: 'index-cie-al.json'
      },
      {
        id: 'Cambridge IGCSE',
        spec: 'CIE-IGCSE',
        label: 'Cambridge IGCSE',
        shortLabel: 'IGCSE',
        crossBoardLabel: 'CAIE IGCSE',
        badgeCls: 'cie-igcse',
        routeSlug: 'cambridge/igcse',
        indexFile: 'index-cie-igcse.json'
      },
      {
        id: 'Cambridge O Level',
        spec: 'CIE-OL',
        label: 'Cambridge O Level',
        shortLabel: 'O-Level',
        crossBoardLabel: 'CAIE OL',
        badgeCls: 'cie-ol',
        routeSlug: 'cambridge/o-level',
        indexFile: 'index-cie-ol.json'
      }
    ],
    sessions: ['Feb/March', 'May/June', 'Oct/Nov'],
    supportsVariants: true,
    searchPlaceholderDesktop: 'Search by syllabus code, paper or session (e.g. 0625 42, 9709 s24, Physics)...',
    searchPlaceholderMobile: 'Search 0625, 9709, paper...',
    disclaimer: 'Not affiliated with Cambridge University Press & Assessment (CAIE).'
  }
};

export const EDEXCEL_CURRICULUMS = ['Edexcel IAL', 'Edexcel IGCSE'];
export const CAMBRIDGE_CURRICULUMS = [
  'Cambridge AS & A Level',
  'Cambridge IGCSE',
  'Cambridge O Level'
];
export const ALL_CURRICULUMS = [...EDEXCEL_CURRICULUMS, ...CAMBRIDGE_CURRICULUMS];

export const SPEC_TO_CURRICULUM = {
  IAL: 'Edexcel IAL',
  IGCSE: 'Edexcel IGCSE',
  'CIE-AL': 'Cambridge AS & A Level',
  'CIE-IGCSE': 'Cambridge IGCSE',
  'CIE-OL': 'Cambridge O Level'
};

export const CURRICULUM_TO_SPEC = {
  'Edexcel IAL': 'IAL',
  'Edexcel IGCSE': 'IGCSE',
  'Cambridge AS & A Level': 'CIE-AL',
  'Cambridge IGCSE': 'CIE-IGCSE',
  'Cambridge O Level': 'CIE-OL'
};

export const SPEC_TO_BOARD = {
  IAL: 'edexcel',
  IGCSE: 'edexcel',
  'CIE-AL': 'cambridge',
  'CIE-IGCSE': 'cambridge',
  'CIE-OL': 'cambridge'
};

export const CURRICULUM_TO_BOARD = {
  'Edexcel IAL': 'edexcel',
  'Edexcel IGCSE': 'edexcel',
  'Cambridge AS & A Level': 'cambridge',
  'Cambridge IGCSE': 'cambridge',
  'Cambridge O Level': 'cambridge'
};

export const BOOK_CATEGORIES = new Set([
  'Books',
  'IAL Books',
  'IGCSE Books',
  'Cambridge Books',
  'Cambridge AL Books',
  'Cambridge IGCSE Books',
  'Cambridge OL Books'
]);

export function isBookCategory(category) {
  return Boolean(category && BOOK_CATEGORIES.has(category));
}

export function isCambridgeSpec(spec) {
  return spec === 'CIE-AL' || spec === 'CIE-IGCSE' || spec === 'CIE-OL';
}

export function isCambridgeCurriculum(curriculum) {
  return CURRICULUM_TO_BOARD[curriculum] === 'cambridge';
}

export function getBoardForSpec(spec) {
  return SPEC_TO_BOARD[spec] || DEFAULT_BOARD_ID;
}

export function getBoardForCurriculum(curriculum) {
  return CURRICULUM_TO_BOARD[curriculum] || '';
}

export function getCurriculumForSpec(spec, category = '') {
  if (spec && SPEC_TO_CURRICULUM[spec]) return SPEC_TO_CURRICULUM[spec];
  if (category === 'IGCSE Books') return 'Edexcel IGCSE';
  if (category === 'Cambridge AL Books') return 'Cambridge AS & A Level';
  if (category === 'Cambridge IGCSE Books') return 'Cambridge IGCSE';
  if (category === 'Cambridge OL Books') return 'Cambridge O Level';
  return 'Edexcel IAL';
}

export function getCurriculumsForBoard(boardId) {
  if (boardId === 'edexcel') return EDEXCEL_CURRICULUMS;
  if (boardId === 'cambridge') return CAMBRIDGE_CURRICULUMS;
  return ALL_CURRICULUMS;
}

export function getBoardConfig(boardId) {
  return BOARD_REGISTRY[boardId] || BOARD_REGISTRY[DEFAULT_BOARD_ID];
}

export function getCurriculumMeta(curriculum) {
  for (const board of Object.values(BOARD_REGISTRY)) {
    const found = board.curriculums.find((c) => c.id === curriculum);
    if (found) return { ...found, boardId: board.id };
  }
  return {
    id: 'Edexcel IAL',
    spec: 'IAL',
    label: 'Edexcel International A-Level (IAL)',
    shortLabel: 'IAL',
    crossBoardLabel: 'EDX IAL',
    badgeCls: 'ial',
    routeSlug: 'ial',
    indexFile: 'index-edexcel.json',
    boardId: 'edexcel'
  };
}

export function getIndexFileForBoardOrCurriculum(boardId = 'edexcel', curriculum = '') {
  if (curriculum) {
    const meta = getCurriculumMeta(curriculum);
    return meta.indexFile;
  }
  if (boardId === 'cambridge') return 'index-cambridge.json';
  return 'index-edexcel.json';
}

export function isCambridgePath(pathStr = '') {
  const norm = String(pathStr || '').replace(/\\/g, '/');
  return (
    norm.startsWith('Past Papers/Cambridge/') ||
    norm.startsWith('Cambridge Books/') ||
    /(?:^|\/)CIE-(?:AL|IGCSE|OL)\//i.test(norm)
  );
}
