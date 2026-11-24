import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  detectDocType,
  detectSubject,
  extractYear,
  extractSessionDate,
  extractUnitInfo,
  extractVariant,
  getCleanUnitLabel,
  compareUnitLabels
} from '../src/unitParser.js';
import { getBookMetadata } from '../src/bookCatalog.js';
import {
  ALL_CURRICULUMS,
  getBoardForSpec,
  getCurriculumForSpec,
  isBookCategory,
  isCambridgePath,
  isCambridgeSpec
} from '../src/data/boards.js';
import { detectCambridgeSpec } from '../src/parsers/cambridgeParser.js';
import { extractSyllabusCodeFromSubject } from '../src/data/cambridgeCatalog.js';
import { encodeCompactCatalog, encodeCompactAllowlist } from '../src/lib/indexSerializer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_DIR = path.resolve(__dirname, '..', '..'); // 'e:\The Library'
const EXCLUDE_DIRS = ['search-app', 'node_modules', '.git', '.scripts', 'ScriptFiles', '.vercel', 'dist'];
const ALLOWED_ROOT_DIRS = ['Past Papers', 'IAL Books', 'IGCSE Books', 'Cambridge Books'];

const CATEGORY_PAST_PAPERS = 'Past Papers';
const CATEGORY_BOOKS = 'IAL Books';
const CATEGORY_IGCSE = 'IGCSE Books';
const CATEGORY_CIE_BOOKS = 'Cambridge Books';
const CATEGORY_CIE_AL_BOOKS = 'Cambridge AL Books';
const CATEGORY_CIE_IGCSE_BOOKS = 'Cambridge IGCSE Books';
const CATEGORY_CIE_OL_BOOKS = 'Cambridge OL Books';

function isIgnoredArtifactFile(fileName) {
  // Exclude known third-party aggregator watermark misfiles (e.g. an IGCSE 4bs1 download inside IAL English Language)
  return /^toaz\.info-/i.test(fileName);
}

function extractSpec(pathStr) {
  if (isCambridgePath(pathStr)) return detectCambridgeSpec(pathStr);
  if (pathStr.includes('IGCSE')) return 'IGCSE';
  if (pathStr.includes('IAL')) return 'IAL';
  return 'IAL';
}

function extractCategory(pathStr) {
  if (pathStr.startsWith('Past Papers')) return CATEGORY_PAST_PAPERS;
  if (pathStr.startsWith('IGCSE Books')) return CATEGORY_IGCSE;
  if (pathStr.startsWith('IAL Books') || pathStr.startsWith('Books')) return CATEGORY_BOOKS;
  if (pathStr.startsWith('Cambridge Books')) {
    if (/^Cambridge Books\/(?:A-Level|AS[-_\s]*A[-_\s]*Level|CIE-AL)\//i.test(pathStr)) {
      return CATEGORY_CIE_AL_BOOKS;
    }
    if (/^Cambridge Books\/(?:O-Level|O[-_\s]*Level|CIE-OL)\//i.test(pathStr)) {
      return CATEGORY_CIE_OL_BOOKS;
    }
    if (/^Cambridge Books\/(?:IGCSE|CIE-IGCSE)\//i.test(pathStr)) {
      return CATEGORY_CIE_IGCSE_BOOKS;
    }
    return CATEGORY_CIE_BOOKS;
  }
  return 'Other';
}

function buildTree(dirPath, rootPath) {
  const name = path.basename(dirPath);
  const node = {
    name,
    path: path.relative(rootPath, dirPath).replace(/\\/g, '/'),
    type: 'directory',
    children: []
  };

  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const item of items) {
      if (EXCLUDE_DIRS.includes(item.name)) continue;
      if (item.name.startsWith('.')) continue;
      if (dirPath === rootPath) {
        if (!item.isDirectory() || !ALLOWED_ROOT_DIRS.includes(item.name)) {
          continue;
        }
      }

      const fullPath = path.join(dirPath, item.name);
      const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/');

      if (item.isDirectory()) {
        const childNode = buildTree(fullPath, rootPath);
        node.children.push(childNode);
      } else {
        if (isIgnoredArtifactFile(item.name)) continue;
        const relPath = relativePath;
        const category = extractCategory(relPath);
        const spec = extractSpec(relPath);
        const subject = detectSubject(relPath, spec);
        const sessionDate = extractSessionDate(relPath, spec);
        const unitInfo = category === CATEGORY_PAST_PAPERS
          ? extractUnitInfo(relPath, subject, spec)
          : { unitCode: null, unitName: null, syllabusCode: isCambridgeSpec(spec) ? extractSyllabusCodeFromSubject(subject) : null };
        const { unitCode, unitName } = unitInfo;
        const syllabusCode = unitInfo.syllabusCode || (isCambridgeSpec(spec) ? extractSyllabusCodeFromSubject(subject) : null);

        const bookMeta = isBookCategory(category)
          ? getBookMetadata(relPath)
          : null;
        const ext = path.extname(item.name);
        const displayFileName = bookMeta?.title ? `${bookMeta.title}${ext}` : item.name;

        const fallbackSession = (!sessionDate && category === CATEGORY_PAST_PAPERS && /(?:^|[^a-z0-9])(?:sams?\d*|sb-eams|specimen)(?:[^a-z0-9]|$)/i.test(relPath))
          ? 'Specimen'
          : null;

        const computedYear = bookMeta?.year || (sessionDate ? sessionDate.year : extractYear(relPath, spec));
        node.children.push({
          name: displayFileName,
          path: relPath,
          size: fs.statSync(fullPath).size,
          subject,
          docType: detectDocType(item.name, relPath, spec),
          year: computedYear,
          session: sessionDate ? sessionDate.label : fallbackSession,
          sortKey: sessionDate ? sessionDate.sortKey : (computedYear ? computedYear * 100 : 200000),
          unitCode,
          unitName,
          spec,
          syllabusCode: syllabusCode || null,
          category,
          _sdLabel: sessionDate ? sessionDate.label : null,
          _sdSort: sessionDate ? sessionDate.sortKey : 0
        });
      }
    }

    node.children.sort((a, b) => {
      if (a.children && !b.children) return -1;
      if (!a.children && b.children) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
  }

  return node;
}

function extractFlatFiles(treeNode, filesList = []) {
  if (treeNode.children && treeNode.children.length >= 0) {
    for (const child of treeNode.children) {
      extractFlatFiles(child, filesList);
    }
  } else {
    filesList.push(treeNode);
  }
  return filesList;
}

function computeCoverageString(filesSubset, fallback = 'January 2003 – June 2026') {
  let minSort = Infinity;
  let minLabel = null;
  let maxSort = -Infinity;
  let maxLabel = null;
  for (let i = 0; i < filesSubset.length; i++) {
    const f = filesSubset[i];
    const lbl = f._sdLabel;
    if (!lbl) continue;
    const sk = f._sdSort;
    if (sk < minSort) {
      minSort = sk;
      minLabel = lbl;
    }
    if (sk > maxSort) {
      maxSort = sk;
      maxLabel = lbl;
    }
  }
  if (!minLabel || !maxLabel) return fallback;
  return `${minLabel} – ${maxLabel}`;
}

function computeCoverageMap(filesSubset, subjectList) {
  const boundsBySubj = new Map();
  for (let i = 0; i < filesSubset.length; i++) {
    const f = filesSubset[i];
    const subj = f.subject;
    const lbl = f._sdLabel;
    if (!subj || !lbl) continue;
    const sk = f._sdSort;
    let b = boundsBySubj.get(subj);
    if (!b) {
      b = { minSort: sk, minLabel: lbl, maxSort: sk, maxLabel: lbl };
      boundsBySubj.set(subj, b);
    } else {
      if (sk < b.minSort) {
        b.minSort = sk;
        b.minLabel = lbl;
      }
      if (sk > b.maxSort) {
        b.maxSort = sk;
        b.maxLabel = lbl;
      }
    }
  }

  const cov = {};
  for (const subj of subjectList) {
    const b = boundsBySubj.get(subj);
    cov[subj] = b ? `${b.minLabel} – ${b.maxLabel}` : 'Reference Collection';
  }
  return cov;
}

// Deduplicate identical sittings across folders at build time while preserving alternate paths for folder filtering
function deduplicateFiles(filesList) {
  const scoreFile = (f) => {
    let s = 0;
    if (f.path.includes('(')) s += 10;
    if (f.name.includes('_')) s += 5;
    return s;
  };
  const map = new Map();
  for (const f of filesList) {
    const ext = (f.name || '').split('.').pop().toLowerCase();
    const v = extractVariant(f);
    const key = (f.category === CATEGORY_PAST_PAPERS && f.unitCode && f.session && f.docType)
      ? `${f.spec}|${f.subject}|${f.unitCode}|${v}|${f.session}|${f.docType}|${ext}|${f.size}`
      : f.path;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, { canonical: f, variant: v, allPaths: [f.path] });
    } else {
      existing.allPaths.push(f.path);
      if (scoreFile(f) > scoreFile(existing.canonical)) {
        existing.canonical = f;
        existing.variant = v;
      }
    }
  }

  return Array.from(map.values()).map(({ canonical, variant, allPaths }) => {
    const alts = allPaths.filter((p) => p !== canonical.path);
    return {
      ...canonical,
      variant,
      cleanUnitLabel: getCleanUnitLabel(canonical),
      altPaths: alts.length > 0 ? alts : null
    };
  });
}

// Precompute instant 0ms Wizard metadata across all 5 international curriculums (Subject -> Units -> Years & Counts)
function buildWizardMeta(dedupedList) {
  const wizard = {};
  for (const curr of ALL_CURRICULUMS) {
    wizard[curr] = {};
  }

  for (const f of dedupedList) {
    const curr = getCurriculumForSpec(f.spec, f.category);
    const subj = f.subject;
    if (!subj) continue;
    if (!wizard[curr]) wizard[curr] = {};
    if (!wizard[curr][subj]) {
      wizard[curr][subj] = { totalFiles: 0, units: {}, allYears: new Set() };
    }
    wizard[curr][subj].totalFiles++;
    if (f.year) wizard[curr][subj].allYears.add(f.year);
    const unitLabel = f.cleanUnitLabel;
    if (unitLabel) {
      if (!wizard[curr][subj].units[unitLabel]) {
        wizard[curr][subj].units[unitLabel] = { count: 0, years: new Set() };
      }
      wizard[curr][subj].units[unitLabel].count++;
      if (f.year) wizard[curr][subj].units[unitLabel].years.add(f.year);
    }
  }
  for (const curr of Object.keys(wizard)) {
    for (const subj of Object.keys(wizard[curr])) {
      const entry = wizard[curr][subj];
      entry.allYears = Array.from(entry.allYears).sort((a, b) => b - a);
      const cleanUnits = {};
      for (const u of Object.keys(entry.units).sort((a, b) => compareUnitLabels(a, b, subj))) {
        cleanUnits[u] = {
          count: entry.units[u].count,
          years: Array.from(entry.units[u].years).sort((a, b) => b - a)
        };
      }
      entry.units = cleanUnits;
    }
  }
  return wizard;
}

// Compact v2 serialization & allowlist encoding are imported from ../src/lib/indexSerializer.js

console.log('Generating multi-board index for', TARGET_DIR);
const tree = buildTree(TARGET_DIR, TARGET_DIR);
tree.name = 'The Library';

const flatFiles = extractFlatFiles(tree);
const dedupedFiles = deduplicateFiles(flatFiles);

// Partition by board & Cambridge level
const edexcelFlat = flatFiles.filter((f) => getBoardForSpec(f.spec) === 'edexcel');
const cambridgeFlat = flatFiles.filter((f) => getBoardForSpec(f.spec) === 'cambridge');

const edexcelDeduped = dedupedFiles.filter((f) => getBoardForSpec(f.spec) === 'edexcel');
const cambridgeDeduped = dedupedFiles.filter((f) => getBoardForSpec(f.spec) === 'cambridge');
const cieAlDeduped = cambridgeDeduped.filter((f) => f.spec === 'CIE-AL');
const cieIgcseDeduped = cambridgeDeduped.filter((f) => f.spec === 'CIE-IGCSE');
const cieOlDeduped = cambridgeDeduped.filter((f) => f.spec === 'CIE-OL');

const uniqueSorted = (arr) => [...new Set(arr.filter(Boolean))].sort();

const allSubjects = uniqueSorted(dedupedFiles.map((f) => f.subject));
const ialSubjects = uniqueSorted(edexcelDeduped.filter((f) => f.spec === 'IAL').map((f) => f.subject));
const igcseSubjects = uniqueSorted(edexcelDeduped.filter((f) => f.spec === 'IGCSE').map((f) => f.subject));
const cieAlSubjects = uniqueSorted(cieAlDeduped.map((f) => f.subject));
const cieIgcseSubjects = uniqueSorted(cieIgcseDeduped.map((f) => f.subject));
const cieOlSubjects = uniqueSorted(cieOlDeduped.map((f) => f.subject));

const subjectCoverage = computeCoverageMap(dedupedFiles, allSubjects);
const ialSubjectCoverage = computeCoverageMap(edexcelDeduped.filter((f) => f.spec === 'IAL'), ialSubjects);
const igcseSubjectCoverage = computeCoverageMap(edexcelDeduped.filter((f) => f.spec === 'IGCSE'), igcseSubjects);
const cieAlSubjectCoverage = computeCoverageMap(cieAlDeduped, cieAlSubjects);
const cieIgcseSubjectCoverage = computeCoverageMap(cieIgcseDeduped, cieIgcseSubjects);
const cieOlSubjectCoverage = computeCoverageMap(cieOlDeduped, cieOlSubjects);

const wizardMeta = buildWizardMeta(dedupedFiles);
const generatedAt = new Date().toISOString();

const coverageRangeStr = computeCoverageString(flatFiles, 'January 2003 – June 2026');
const edexcelCoverageStr = computeCoverageString(edexcelFlat, 'January 2003 – June 2026');
const cambridgeCoverageStr = computeCoverageString(cambridgeFlat, 'Oct/Nov 2002 – May/June 2026');

const totalBooks = dedupedFiles.filter((f) => isBookCategory(f.category)).length;
const ialBooks = edexcelDeduped.filter((f) => f.category === CATEGORY_BOOKS).length;
const igcseBooks = edexcelDeduped.filter((f) => f.category === CATEGORY_IGCSE).length;
const cambridgeBooks = cambridgeDeduped.filter((f) => isBookCategory(f.category)).length;
const dfCount = dedupedFiles.filter((f) => f.docType === 'DF').length;
const audioCount = dedupedFiles.filter((f) => f.docType === 'AUD').length;

const metaInfo = {
  totalFiles: flatFiles.length,
  uniqueFiles: dedupedFiles.length,
  totalBooks,
  ialBooks,
  igcseBooks,
  cambridgeBooks,
  dfCount,
  audioCount,
  subjects: allSubjects,
  ialSubjects,
  igcseSubjects,
  cieAlSubjects,
  cieIgcseSubjects,
  cieOlSubjects,
  coverage: coverageRangeStr,
  subjectCoverage,
  ialSubjectCoverage,
  igcseSubjectCoverage,
  cieAlSubjectCoverage,
  cieIgcseSubjectCoverage,
  cieOlSubjectCoverage,
  boards: {
    edexcel: {
      totalFiles: edexcelFlat.length,
      uniqueFiles: edexcelDeduped.length,
      totalBooks: ialBooks + igcseBooks,
      ialBooks,
      igcseBooks,
      dfCount: edexcelDeduped.filter((f) => f.docType === 'DF').length,
      audioCount: edexcelDeduped.filter((f) => f.docType === 'AUD').length,
      subjectCount: new Set([...ialSubjects, ...igcseSubjects]).size,
      ialSubjectCount: ialSubjects.length,
      igcseSubjectCount: igcseSubjects.length,
      coverage: edexcelCoverageStr
    },
    cambridge: {
      totalFiles: cambridgeFlat.length,
      uniqueFiles: cambridgeDeduped.length,
      totalBooks: cambridgeBooks,
      dfCount: cambridgeDeduped.filter((f) => f.docType === 'DF').length,
      audioCount: cambridgeDeduped.filter((f) => f.docType === 'AUD').length,
      subjectCount: cieAlSubjects.length + cieIgcseSubjects.length + cieOlSubjects.length,
      alSubjectCount: cieAlSubjects.length,
      igcseSubjectCount: cieIgcseSubjects.length,
      olSubjectCount: cieOlSubjects.length,
      alFiles: cieAlDeduped.length,
      igcseFiles: cieIgcseDeduped.length,
      olFiles: cieOlDeduped.length,
      coverage: cambridgeCoverageStr
    }
  },
  wizard: wizardMeta,
  generatedAt
};

const edexcelOutput = encodeCompactCatalog(edexcelDeduped, {
  ...metaInfo,
  board: 'edexcel',
  partitionUniqueFiles: edexcelDeduped.length,
  isPreDeduped: true
});

const cambridgeOutput = encodeCompactCatalog(cambridgeDeduped, {
  ...metaInfo,
  board: 'cambridge',
  partitionUniqueFiles: cambridgeDeduped.length,
  isPreDeduped: true
});

const publicDir = path.resolve(__dirname, '..', 'public');
const apiDir = path.resolve(__dirname, '..', 'api');
const edexcelJsonStr = JSON.stringify(edexcelOutput);
const cambridgeJsonStr = JSON.stringify(cambridgeOutput);

// Write compact v2 multi-board indexes and lightweight metadata
fs.writeFileSync(path.join(publicDir, 'index.json'), edexcelJsonStr);
fs.writeFileSync(path.join(publicDir, 'index-cambridge.json'), cambridgeJsonStr);
fs.writeFileSync(path.join(publicDir, 'meta.json'), JSON.stringify({ meta: metaInfo }));

// Remove deprecated duplicate/public index & allowlist artifacts if present
const deprecatedPublicFiles = [
  'index-edexcel.json',
  'index-cie-al.json',
  'index-cie-igcse.json',
  'index-cie-ol.json',
  'allowlist.json'
];
for (const deadFile of deprecatedPublicFiles) {
  const deadPath = path.join(publicDir, deadFile);
  if (fs.existsSync(deadPath)) {
    try { fs.unlinkSync(deadPath); } catch { /* ignore */ }
  }
}

// Compact v2 prefix-grouped private allowlist for Vercel serverless API cold starts (not publicly served)
const allowlistObj = encodeCompactAllowlist(dedupedFiles, generatedAt);
fs.writeFileSync(path.join(apiDir, '_allowlist.json'), JSON.stringify(allowlistObj));

// Root live indexes synced to Hugging Face
fs.writeFileSync(path.join(TARGET_DIR, 'live_index.json'), edexcelJsonStr);
fs.writeFileSync(path.join(TARGET_DIR, 'live_index_cambridge.json'), cambridgeJsonStr);

// Incrementally maintain audio subtitles coverage (sharded public/subtitles/manifest.json + legacy fallback)
const subtitlesManifestPath = path.join(publicDir, 'subtitles', 'manifest.json');
const subtitlesPath = path.join(publicDir, 'audio-subtitles.json');
const localServerSubtitlesPath = path.resolve(__dirname, '..', '.data', 'audio_subtitles.json');
try {
  let manifestKeys = {};
  let shardCount = 0;
  let uniqueTrackCount = 0;
  if (fs.existsSync(subtitlesManifestPath)) {
    const parsedManifest = JSON.parse(fs.readFileSync(subtitlesManifestPath, 'utf-8'));
    if (parsedManifest && typeof parsedManifest.keys === 'object') {
      manifestKeys = parsedManifest.keys;
      shardCount = Array.isArray(parsedManifest.shards) ? parsedManifest.shards.length : 0;
      uniqueTrackCount = new Set(Object.values(manifestKeys)).size;
    }
  }

  let subDb = { version: '1.0', generatedAt, tracks: {} };
  if (fs.existsSync(subtitlesPath)) {
    const existing = JSON.parse(fs.readFileSync(subtitlesPath, 'utf-8'));
    if (existing && typeof existing.tracks === 'object') {
      subDb = existing;
    }
  }
  let mergedCount = 0;
  if (fs.existsSync(localServerSubtitlesPath)) {
    const localCached = JSON.parse(fs.readFileSync(localServerSubtitlesPath, 'utf-8'));
    if (localCached && typeof localCached.tracks === 'object') {
      for (const [k, v] of Object.entries(localCached.tracks)) {
        if (!manifestKeys[k] && !subDb.tracks[k] && v && Array.isArray(v.segments) && v.segments.length > 0) {
          subDb.tracks[k] = v;
          mergedCount++;
        }
      }
    }
  }
  if ((!fs.existsSync(subtitlesPath) && Object.keys(manifestKeys).length === 0) || mergedCount > 0) {
    subDb.generatedAt = generatedAt;
    fs.writeFileSync(subtitlesPath, JSON.stringify(subDb));
  }
  const tracksMap = subDb.tracks || {};
  const allSubtitleKeys = new Set([...Object.keys(manifestKeys), ...Object.keys(tracksMap)]);
  const audFiles = dedupedFiles.filter((f) => f.docType === 'AUD');
  const coveredAudCount = audFiles.filter((f) => {
    const sit = `${f.spec || 'IAL'}|${f.subject || ''}|${f.unitCode || ''}|${f.variant || ''}|${f.session || ''}`;
    if (allSubtitleKeys.has(f.path) || allSubtitleKeys.has(sit) || allSubtitleKeys.has(`${sit}#track-1`)) {
      return true;
    }
    const zipPrefix = `${f.path}#`;
    for (const k of allSubtitleKeys) {
      if (k.startsWith(zipPrefix)) return true;
    }
    return false;
  }).length;
  console.log(
    `Audio Subtitles Index: ${allSubtitleKeys.size} subtitle keys (${uniqueTrackCount} sharded unique tracks across ${shardCount} shards) covering ${coveredAudCount}/${audFiles.length} audio resources (${mergedCount} newly merged from .data/audio_subtitles.json).`
  );
} catch (err) {
  console.warn('Warning: could not sync audio subtitles metadata:', err.message);
}

console.log(`Indexes generated successfully in ${publicDir}`);
console.log(
  `Edexcel: ${edexcelFlat.length} files (${edexcelDeduped.length} unique; ${ialSubjects.length} IAL, ${igcseSubjects.length} IGCSE) | ` +
  `Cambridge: ${cambridgeFlat.length} files (${cambridgeDeduped.length} unique; ${cieAlSubjects.length} AL, ${cieIgcseSubjects.length} IGCSE, ${cieOlSubjects.length} OL)`
);
