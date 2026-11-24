// Shared lossless v2 compact catalog & allowlist serializer/deserializer.
// Used across generate-index.js, prerender-seo.js, index-audio-subtitles.js,
// sync-sources.js, and src/lib/catalogEngine.js (Web Worker + fallback).
//
// Compact v2 catalog row layout:
// [
//   0: dirIdx,         // index into s (-1 if root)
//   1: baseName,       // filename basename
//   2: size,           // file size in bytes
//   3: subjIdx,        // index into s (-1 if null)
//   4: dtIdx,          // index into s (-1 if null)
//   5: sessIdx,        // index into s (-1 if null)
//   6: sortKey,        // numeric sort key
//   7: unitCodeIdx,    // index into s (-1 if null)
//   8: unitNameIdx,    // index into s (-1 if null)
//   9: specIdx,        // index into s (-1 if null)
//  10: catIdx,         // index into s (-1 if null)
//  11: varIdx,         // index into s (-1 if '')
//  12: cleanLabelIdx,  // optional: -1 = same as unitName, -2 = null, >=0 = s[idx]
//  13: sylIdx,         // optional: -1 = null, >=0 = s[idx]
//  14: altPaths,       // optional: 0 = null, string[] = altPaths
//  15: explicitYear,   // optional: -1 = derived from sortKey, 0 = null, >0 = year
//  16: nameIdx         // optional: -1 = same as baseName, >=0 = s[idx]
// ]

export function deriveYearFromSortKey(sortKey) {
  return sortKey && sortKey !== 200000 ? Math.floor(sortKey / 100) : null;
}

export function encodeCompactCatalog(list, meta = {}) {
  const s = [];
  const strMap = new Map();

  const intern = (val) => {
    if (val === null || val === undefined || val === '') return -1;
    const str = String(val);
    let idx = strMap.get(str);
    if (idx === undefined) {
      idx = s.length;
      s.push(str);
      strMap.set(str, idx);
    }
    return idx;
  };

  const files = new Array(list.length);
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    const fullPath = String(f.path || '');
    const slash = fullPath.lastIndexOf('/');
    const dir = slash >= 0 ? fullPath.slice(0, slash) : '';
    const base = slash >= 0 ? fullPath.slice(slash + 1) : fullPath;

    const dirIdx = intern(dir);
    const size = f.size || 0;
    const subjIdx = intern(f.subject);
    const dtIdx = intern(f.docType);
    const sessIdx = intern(f.session);
    const sortKey = f.sortKey || 0;
    const unitCodeIdx = intern(f.unitCode);
    const unitName = f.unitName ?? null;
    const unitNameIdx = intern(unitName);
    const specIdx = intern(f.spec);
    const catIdx = intern(f.category);
    const varIdx = intern(f.variant || '');

    const cleanUnitLabel = f.cleanUnitLabel ?? null;
    const clIdx = cleanUnitLabel === unitName
      ? -1
      : (cleanUnitLabel === null ? -2 : intern(cleanUnitLabel));
    const sylIdx = intern(f.syllabusCode);
    const alts = Array.isArray(f.altPaths) && f.altPaths.length > 0 ? f.altPaths : 0;

    const dYear = deriveYearFromSortKey(sortKey);
    const actualYear = f.year ?? null;
    const explicitYear = actualYear === dYear ? -1 : (actualYear || 0);
    const nameIdx = f.name && f.name !== base ? intern(f.name) : -1;

    const row = [
      dirIdx,
      base,
      size,
      subjIdx,
      dtIdx,
      sessIdx,
      sortKey,
      unitCodeIdx,
      unitNameIdx,
      specIdx,
      catIdx,
      varIdx
    ];

    if (nameIdx !== -1) {
      row.push(clIdx, sylIdx, alts, explicitYear, nameIdx);
    } else if (explicitYear !== -1) {
      row.push(clIdx, sylIdx, alts, explicitYear);
    } else if (alts !== 0) {
      row.push(clIdx, sylIdx, alts);
    } else if (sylIdx !== -1) {
      row.push(clIdx, sylIdx);
    } else if (clIdx !== -1) {
      row.push(clIdx);
    }

    files[i] = row;
  }

  return {
    v: 2,
    s,
    files,
    meta
  };
}

export function decodeCatalogFiles(json) {
  if (!json) return [];

  if (json.v === 2 && Array.isArray(json.s) && Array.isArray(json.files)) {
    const s = json.s;
    const rows = json.files;
    const out = new Array(rows.length);

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rLen = r.length;
      const dir = r[0] >= 0 ? s[r[0]] : '';
      const base = r[1] || '';
      const fullPath = dir ? `${dir}/${base}` : base;
      const sortKey = r[6] || 0;
      const unitName = r[8] >= 0 ? s[r[8]] : null;

      const clIdx = rLen > 12 ? r[12] : -1;
      const cleanUnitLabel = clIdx === -1
        ? unitName
        : (clIdx >= 0 ? s[clIdx] : null);

      const sylIdx = rLen > 13 ? r[13] : -1;
      const syllabusCode = sylIdx >= 0 ? s[sylIdx] : null;

      const altPaths = rLen > 14 && Array.isArray(r[14]) ? r[14] : null;

      const dYear = deriveYearFromSortKey(sortKey);
      const year = rLen > 15 && r[15] !== -1
        ? (r[15] || null)
        : dYear;

      const name = rLen > 16 && r[16] >= 0 ? s[r[16]] : base;

      out[i] = {
        name,
        path: fullPath,
        size: r[2] || 0,
        subject: r[3] >= 0 ? s[r[3]] : null,
        docType: r[4] >= 0 ? s[r[4]] : null,
        year,
        session: r[5] >= 0 ? s[r[5]] : null,
        sortKey,
        unitCode: r[7] >= 0 ? s[r[7]] : null,
        unitName,
        spec: r[9] >= 0 ? s[r[9]] : null,
        category: r[10] >= 0 ? s[r[10]] : null,
        variant: r[11] >= 0 ? s[r[11]] : '',
        cleanUnitLabel,
        altPaths,
        syllabusCode
      };
    }
    return out;
  }

  if (Array.isArray(json.files) && Array.isArray(json.keys)) {
    const keys = json.keys;
    const kLen = keys.length;
    const out = new Array(json.files.length);
    for (let i = 0; i < json.files.length; i++) {
      const arr = json.files[i];
      const fileObj = {};
      for (let j = 0; j < kLen; j++) {
        fileObj[keys[j]] = arr[j];
      }
      out[i] = fileObj;
    }
    return out;
  }

  return Array.isArray(json.flatFiles) ? json.flatFiles : [];
}

export function encodeCompactAllowlist(dedupedList, generatedAt) {
  const s = [''];
  const strMap = new Map([['', 0]]);

  const intern = (val) => {
    const str = val === null || val === undefined ? '' : String(val);
    let idx = strMap.get(str);
    if (idx === undefined) {
      idx = s.length;
      s.push(str);
      strMap.set(str, idx);
    }
    return idx;
  };

  const paperDirFiles = new Map();
  const audioDirFiles = new Map();
  const seenPaperSittings = new Set();
  const seenAudioSittings = new Set();
  const psRows = [];
  const asRows = [];

  const addPathToMap = (dirMap, fullPath) => {
    if (!fullPath || typeof fullPath !== 'string') return;
    const slash = fullPath.lastIndexOf('/');
    const dir = slash >= 0 ? fullPath.slice(0, slash) : '';
    const base = slash >= 0 ? fullPath.slice(slash + 1) : fullPath;
    if (!base) return;
    let set = dirMap.get(dir);
    if (!set) {
      set = new Set();
      dirMap.set(dir, set);
    }
    set.add(base);
  };

  for (const f of dedupedList) {
    if (f.path) addPathToMap(paperDirFiles, f.path);
    if (Array.isArray(f.altPaths)) {
      for (const ap of f.altPaths) {
        addPathToMap(paperDirFiles, ap);
      }
    }

    if (f.spec && f.subject && f.session) {
      const sittingKey = `${f.spec}|${f.subject}|${f.unitCode || ''}|${f.variant || ''}|${f.session}`;
      if (!seenPaperSittings.has(sittingKey)) {
        seenPaperSittings.add(sittingKey);
        psRows.push([
          intern(f.spec),
          intern(f.subject),
          intern(f.unitCode || ''),
          intern(f.variant || ''),
          intern(f.session)
        ]);
      }
      if (f.docType === 'AUD' && !seenAudioSittings.has(sittingKey)) {
        seenAudioSittings.add(sittingKey);
        asRows.push([
          intern(f.spec),
          intern(f.subject),
          intern(f.unitCode || ''),
          intern(f.variant || ''),
          intern(f.session)
        ]);
      }
    }

    if (f.docType === 'AUD') {
      if (f.path) addPathToMap(audioDirFiles, f.path);
      if (Array.isArray(f.altPaths)) {
        for (const ap of f.altPaths) {
          addPathToMap(audioDirFiles, ap);
        }
      }
      if (f.spec === 'IAL' && !f.unitCode && f.session && f.subject && /u2u4/i.test(f.name || '')) {
        const prefixMap = { French: 'WFR', German: 'WGN', Spanish: 'WSP' };
        const pref = prefixMap[f.subject];
        if (pref) {
          for (const num of ['02', '04']) {
            const uCode = `${pref}${num}`;
            const derivedKey = `${f.spec}|${f.subject}|${uCode}|${f.variant || ''}|${f.session}`;
            if (!seenAudioSittings.has(derivedKey)) {
              seenAudioSittings.add(derivedKey);
              asRows.push([
                intern(f.spec),
                intern(f.subject),
                intern(uCode),
                intern(f.variant || ''),
                intern(f.session)
              ]);
            }
          }
        }
      }
    }
  }

  const pfDirs = [];
  const pfFiles = [];
  for (const [dir, fileSet] of paperDirFiles.entries()) {
    pfDirs.push(intern(dir));
    pfFiles.push(Array.from(fileSet));
  }

  const afDirs = [];
  const afFiles = [];
  for (const [dir, fileSet] of audioDirFiles.entries()) {
    afDirs.push(intern(dir));
    afFiles.push(Array.from(fileSet));
  }

  return {
    v: 2,
    generatedAt,
    s,
    pfDirs,
    pfFiles,
    psRows,
    afDirs,
    afFiles,
    asRows
  };
}
