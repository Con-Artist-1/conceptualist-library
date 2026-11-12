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
  getCleanUnitLabel
} from '../src/unitParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_DIR = path.resolve(__dirname, '..', '..'); // 'e:\The Library'
const EXCLUDE_DIRS = ['search-app', 'node_modules', '.git', '.scripts', 'ScriptFiles', '.vercel', 'dist'];
const ALLOWED_ROOT_DIRS = ['Past Papers', 'IAL Books', 'IGCSE Books'];

const CATEGORY_PAST_PAPERS = 'Past Papers';
const CATEGORY_BOOKS = 'IAL Books';
const CATEGORY_IGCSE = 'IGCSE Books';

function isIgnoredArtifactFile(fileName) {
  // Exclude known third-party aggregator watermark misfiles (e.g. an IGCSE 4bs1 download inside IAL English Language)
  return /^toaz\.info-/i.test(fileName);
}

function extractSpec(pathStr) {
  if (pathStr.includes('IGCSE')) return 'IGCSE';
  if (pathStr.includes('IAL')) return 'IAL';
  return 'IAL';
}

function extractCategory(pathStr) {
  if (pathStr.startsWith('Past Papers')) return CATEGORY_PAST_PAPERS;
  if (pathStr.startsWith('IGCSE Books')) return CATEGORY_IGCSE;
  if (pathStr.startsWith('IAL Books') || pathStr.startsWith('Books')) return CATEGORY_BOOKS;
  return 'Other';
}

function buildTree(dirPath, rootPath) {
  const name = path.basename(dirPath);
  const node = {
    name,
    path: path.relative(rootPath, dirPath).replace(/\\/g, '/'),
    type: 'directory',
    children: [],
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
        const subject = detectSubject(relPath);
        const sessionDate = extractSessionDate(relPath);
        const { unitCode, unitName } = category === CATEGORY_PAST_PAPERS
          ? extractUnitInfo(relPath, subject, spec)
          : { unitCode: null, unitName: null };

        node.children.push({
          name: item.name,
          path: relPath,
          size: fs.statSync(fullPath).size,
          subject,
          docType: detectDocType(item.name, relPath),
          year: sessionDate ? sessionDate.year : extractYear(relPath),
          session: sessionDate ? sessionDate.label : null,
          sortKey: sessionDate ? sessionDate.sortKey : null,
          unitCode,
          unitName,
          spec,
          category
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

function computeCoverageMap(filesSubset, subjectList) {
  const cov = {};
  for (const subj of subjectList) {
    const subjFiles = filesSubset.filter(f => f.subject === subj);
    const subjDates = subjFiles
      .map(f => extractSessionDate(f.path))
      .filter(Boolean)
      .sort((a, b) => a.sortKey - b.sortKey);

    if (subjDates.length > 0) {
      const minD = subjDates[0];
      const maxD = subjDates[subjDates.length - 1];
      cov[subj] = `${minD.label} – ${maxD.label}`;
    } else {
      cov[subj] = 'Reference Collection';
    }
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
    const alts = allPaths.filter(p => p !== canonical.path);
    return {
      ...canonical,
      variant,
      cleanUnitLabel: getCleanUnitLabel(canonical),
      altPaths: alts.length > 0 ? alts : null
    };
  });
}

// Precompute instant 0ms Wizard metadata (Subject -> Units -> Years & Counts)
function buildWizardMeta(dedupedList) {
  const wizard = {
    'Edexcel IAL': {},
    'Edexcel IGCSE': {}
  };
  for (const f of dedupedList) {
    const curr = f.spec === 'IGCSE' ? 'Edexcel IGCSE' : 'Edexcel IAL';
    const subj = f.subject;
    if (!subj) continue;
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
      for (const u of Object.keys(entry.units).sort((a, b) => a.localeCompare(b))) {
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

function isYearOrSessionDir(name) {
  if (/^\d{4}$/.test(name)) return true;
  if (/^\d{4}[-_\s]+[A-Za-z]+$/i.test(name)) return true;
  if (/^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|summer|winter|spring)[-_\s]*\d{0,4}$/i.test(name)) return true;
  return false;
}

// Compact tree representation [name, children] pruned of year/session directories (~6 KB)
function getCompactTree(node, depth = 0) {
  if (!node) return null;
  if (depth > 2 && isYearOrSessionDir(node.name)) return null;

  const dirChildren = (node.children || [])
    .filter(c => c.children && !isYearOrSessionDir(c.name))
    .map(c => getCompactTree(c, depth + 1))
    .filter(Boolean);

  if (dirChildren.length === 0) return node.name;
  return [node.name, dirChildren];
}

console.log('Generating index for', TARGET_DIR);
const tree = buildTree(TARGET_DIR, TARGET_DIR);
tree.name = 'The Library';

const flatFiles = extractFlatFiles(tree);
const dedupedFiles = deduplicateFiles(flatFiles);

const allSubjects = [...new Set(dedupedFiles.map(f => f.subject).filter(Boolean))].sort();
const ialSubjects = [...new Set(dedupedFiles.filter(f => f.spec === 'IAL').map(f => f.subject).filter(Boolean))].sort();
const igcseSubjects = [...new Set(dedupedFiles.filter(f => f.spec === 'IGCSE').map(f => f.subject).filter(Boolean))].sort();

const subjectCoverage = computeCoverageMap(dedupedFiles, allSubjects);
const ialSubjectCoverage = computeCoverageMap(dedupedFiles.filter(f => f.spec === 'IAL'), ialSubjects);
const igcseSubjectCoverage = computeCoverageMap(dedupedFiles.filter(f => f.spec === 'IGCSE'), igcseSubjects);

const wizardMeta = buildWizardMeta(dedupedFiles);

const dates = flatFiles
  .map(f => extractSessionDate(f.path))
  .filter(Boolean)
  .sort((a, b) => a.sortKey - b.sortKey);

const minDate = dates[0];
const maxDate = dates[dates.length - 1];

const coverageRangeStr = minDate && maxDate
  ? `${minDate.label} – ${maxDate.label}`
  : 'January 2003 – June 2026';

const compactTree = getCompactTree(tree);

const keys = [
  'name', 'path', 'size', 'subject', 'docType', 'year', 'session', 'sortKey',
  'unitCode', 'unitName', 'spec', 'category', 'variant', 'cleanUnitLabel', 'altPaths'
];
const files = dedupedFiles.map(f => [
  f.name,
  f.path,
  f.size,
  f.subject,
  f.docType,
  f.year,
  f.session,
  f.sortKey,
  f.unitCode,
  f.unitName,
  f.spec,
  f.category,
  f.variant,
  f.cleanUnitLabel,
  f.altPaths
]);

const metaInfo = {
  totalFiles: flatFiles.length,
  uniqueFiles: dedupedFiles.length,
  subjects: allSubjects,
  ialSubjects,
  igcseSubjects,
  coverage: coverageRangeStr,
  subjectCoverage,
  ialSubjectCoverage,
  igcseSubjectCoverage,
  wizard: wizardMeta,
  generatedAt: new Date().toISOString()
};

const output = {
  compactTree,
  keys,
  files,
  meta: metaInfo
};

const metaOutput = {
  compactTree,
  meta: metaInfo
};

const publicDir = path.resolve(__dirname, '..', 'public');
const outputPath = path.join(publicDir, 'index.json');
fs.writeFileSync(outputPath, JSON.stringify(output));

const metaPath = path.join(publicDir, 'meta.json');
fs.writeFileSync(metaPath, JSON.stringify(metaOutput));

const rootLiveIndexPath = path.join(TARGET_DIR, 'live_index.json');
fs.writeFileSync(rootLiveIndexPath, JSON.stringify(output));

console.log(`Index generated successfully at ${outputPath}`);
console.log(`Indexed ${flatFiles.length} total files (${dedupedFiles.length} unique records; ${ialSubjects.length} IAL subjects, ${igcseSubjects.length} IGCSE subjects).`);
