// Incremental offline pre-indexer for sharded audio subtitles (public/subtitles/*.json + manifest.json).
// Scans public/index.json (and/or public/index-cambridge.json via --board=edexcel|cambridge|all) for AUD
// resources (MP3/WAV/M4A/OGG and single/nested ZIP archives), skips tracks already present in public/subtitles/
// by SHA-256 hash, and transcribes ONLY newly added tracks using local Whisper (CPU AVX2 + single Vulkan GPU
// worker) with Silero VAD, English exam rubric probes (opening + post-reading-pause), and verbatim PDF.js
// forced alignment on Transcript PDFs.
//
// Usage:
//   node scripts/index-audio-subtitles.js                          # Incremental Edexcel AUD pre-index (default)
//   node scripts/index-audio-subtitles.js --board=cambridge        # Incremental Cambridge AUD pre-index
//   node scripts/index-audio-subtitles.js --board=all --dry-run    # Preview pending tracks across both boards
//   node scripts/index-audio-subtitles.js --syllabuses=0510,0520   # Filter Cambridge AUD by 4-digit code(s)
//   node scripts/index-audio-subtitles.js --cpu-only               # Use CPU worker only (skip Vulkan GPU)
//   node scripts/index-audio-subtitles.js --force                  # Re-index selected tracks from scratch

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, '..');
const LIB_ROOT = path.resolve(APP_DIR, '..');
const PUBLIC_DIR = path.join(APP_DIR, 'public');
const SUB_DIR = path.join(PUBLIC_DIR, 'subtitles');
const WHISPER_DIR = path.join(APP_DIR, '.data', 'whisper');
const CPU_CLI = path.join(WHISPER_DIR, 'cpu', 'whisper-cli.exe');
const GPU_CLI = path.join(WHISPER_DIR, 'vulkan', 'whisper-cli.exe');
const MODEL_DIR = path.join(WHISPER_DIR, 'models');
const MODEL_BASE = path.join(MODEL_DIR, 'ggml-base-q5_1.bin');
const VAD_MODEL = path.join(MODEL_DIR, 'ggml-silero-v5.1.2.bin');
const RAW_CACHE_DIR = path.join(WHISPER_DIR, 'cache');
const TMP_DIR = path.join(WHISPER_DIR, 'tmp');

const MODEL_BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin';
const VAD_MODEL_URL = 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const CPU_ONLY = args.includes('--cpu-only');
const FORCE = args.includes('--force');
const boardArg = args.find((a) => a.startsWith('--board='));
const TARGET_BOARD = boardArg ? boardArg.split('=')[1].toLowerCase() : 'edexcel';
const sylArg = args.find((a) => a.startsWith('--syllabuses=') || a.startsWith('--syllabus='));
const SYLLABUS_FILTER = sylArg
  ? new Set(sylArg.slice(sylArg.indexOf('=') + 1).split(',').map((s) => s.trim()).filter(Boolean))
  : null;
const gpuDevArg = args.find((a) => a.startsWith('--gpu-dev='));
const GPU_DEV = gpuDevArg ? gpuDevArg.split('=')[1] : '0';
const threadsArg = args.find((a) => a.startsWith('--threads='));
const CPU_THREADS = threadsArg ? Math.max(1, parseInt(threadsArg.split('=')[1], 10) || 3) : 3;

const LANG_CODE = {
  French: 'fr',
  German: 'de',
  Spanish: 'es',
  'English as a Second Language': 'en',
  Chinese: 'zh',
  Swahili: 'sw'
};

function inferCliLangCode(subject = '') {
  if (LANG_CODE[subject]) return LANG_CODE[subject];
  const s = String(subject || '').toLowerCase();
  if (s.includes('french')) return 'fr';
  if (s.includes('german')) return 'de';
  if (s.includes('spanish')) return 'es';
  if (s.includes('chinese') || s.includes('mandarin')) return 'zh';
  if (s.includes('arabic')) return 'ar';
  if (s.includes('urdu')) return 'ur';
  if (s.includes('malay')) return 'ms';
  if (s.includes('tamil')) return 'ta';
  if (s.includes('sinhala')) return 'si';
  if (s.includes('bengali') || s.includes('bangla')) return 'bn';
  if (s.includes('hindi')) return 'hi';
  if (s.includes('gujarati')) return 'gu';
  if (s.includes('turkish')) return 'tr';
  if (s.includes('greek')) return 'el';
  if (s.includes('swahili')) return 'sw';
  return 'en';
}

const PREFIX_MAP = { French: 'WFR', German: 'WGN', Spanish: 'WSP' };

function getFileExt(name = '') {
  const clean = String(name).split(/[?#]/)[0];
  const i = clean.lastIndexOf('.');
  return i > 0 ? clean.slice(i + 1).toLowerCase() : '';
}

function getShardName(spec, subject) {
  const sp = String(spec || 'IAL').toLowerCase();
  const su = String(subject || '')
    .toLowerCase()
    .replace(/english as a second language/i, 'esl')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${sp}-${su}`;
}

function findEocd(buf) {
  const minOff = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minOff; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

// Mirrors src/zipAudioExtractor.js exact entry extraction & sort order (including nested ZIPs)
function parseZipAudioExact(buf, depth = 0) {
  const eocd = findEocd(buf);
  if (eocd === -1) return [];
  const total = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const rawEntries = [];
  for (let i = 0; i < total && ptr + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const lh = buf.readUInt32LE(ptr + 42);
    const entryPath = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString('utf8');
    ptr += 46 + nameLen + extraLen + commentLen;
    if (!entryPath || entryPath.endsWith('/') || entryPath.includes('__MACOSX')) continue;
    const ext = getFileExt(entryPath);
    if (['mp3', 'wav', 'm4a', 'ogg'].includes(ext) || (ext === 'zip' && depth < 2)) {
      rawEntries.push({ entryPath, ext, method, compSize, lh });
    }
  }
  const extracted = [];
  for (const item of rawEntries) {
    const lh = item.lh;
    if (lh + 30 > buf.length || buf.readUInt32LE(lh) !== 0x04034b50) continue;
    const ln = buf.readUInt16LE(lh + 26);
    const le = buf.readUInt16LE(lh + 28);
    const start = lh + 30 + ln + le;
    const end = start + item.compSize;
    if (end > buf.length) continue;
    const slice = buf.subarray(start, end);
    let data = null;
    if (item.method === 0) data = slice;
    else if (item.method === 8) data = zlib.inflateRawSync(slice);
    else continue;

    if (item.ext === 'zip' && depth < 2) {
      extracted.push(...parseZipAudioExact(data, depth + 1));
    } else if (['mp3', 'wav', 'm4a', 'ogg'].includes(item.ext)) {
      extracted.push({
        entryPath: item.entryPath,
        fileName: (item.entryPath.split('/').pop() || item.entryPath).trim(),
        ext: item.ext,
        size: data.length,
        data
      });
    }
  }
  if (depth === 0) {
    extracted.sort((a, b) =>
      a.entryPath.localeCompare(b.entryPath, undefined, { numeric: true, sensitivity: 'base' })
    );
  }
  return extracted;
}

function extractEntryFromZipBuffer(buf, targetEntryPath, targetFileName, depth = 0) {
  const eocd = findEocd(buf);
  if (eocd === -1) return null;
  const total = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < total && ptr + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const lh = buf.readUInt32LE(ptr + 42);
    const entryPath = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString('utf8');
    ptr += 46 + nameLen + extraLen + commentLen;
    if (!entryPath || entryPath.endsWith('/') || entryPath.includes('__MACOSX')) continue;
    const ext = getFileExt(entryPath);
    const baseName = (entryPath.split('/').pop() || entryPath).trim();
    const isMatch = entryPath === targetEntryPath || baseName === targetFileName;
    if (isMatch || (ext === 'zip' && depth < 2)) {
      if (lh + 30 > buf.length || buf.readUInt32LE(lh) !== 0x04034b50) continue;
      const ln = buf.readUInt16LE(lh + 26);
      const le = buf.readUInt16LE(lh + 28);
      const start = lh + 30 + ln + le;
      const slice = buf.subarray(start, start + compSize);
      const data = method === 0 ? slice : method === 8 ? zlib.inflateRawSync(slice) : null;
      if (!data) continue;
      if (isMatch && ext !== 'zip') return data;
      if (ext === 'zip' && depth < 2) {
        const nested = extractEntryFromZipBuffer(data, targetEntryPath, targetFileName, depth + 1);
        if (nested) return nested;
      }
    }
  }
  return null;
}

function buildTrackUnitHint(rawEntryPath) {
  const baseName = (rawEntryPath.split('/').pop() || rawEntryPath).trim();
  const ext = getFileExt(baseName);
  const stem = ext ? baseName.slice(0, -(ext.length + 1)) : baseName;
  const trackNumMatch = stem.match(/(?:^|[_-\s])0*([1-9]\d*)$/);
  if (trackNumMatch) {
    return {
      isTrackedPart: true,
      trackNum: Number(trackNumMatch[1]),
      unitHint: /2[_-]/i.test(stem) ? 'U2' : /4[_-]/i.test(stem) ? 'U4' : ''
    };
  }
  if (/\b(?:U2|WFR02|WGN02|WSP02|Unit\s*2)\b/i.test(rawEntryPath)) {
    return { isTrackedPart: false, unitHint: 'U2' };
  }
  if (/\b(?:U4|WFR04|WGN04|WSP04|Unit\s*4)\b/i.test(rawEntryPath)) {
    return { isTrackedPart: false, unitHint: 'U4' };
  }
  return { isTrackedPart: false, unitHint: '' };
}

function normWord(w) {
  return String(w || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
}

function fmtTime(sec) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function cleanEnglishIntroText(text) {
  return String(text || '')
    .replace(/\bpearson[\s-]+ed[\s-]*xl\b/gi, 'Pearson Edexcel')
    .replace(/\bpearson[\s-]+ed[\s-]*excel\b/gi, 'Pearson Edexcel')
    .replace(/\bperson[\s-]+ed[\s-]*x?el\b/gi, 'Pearson Edexcel')
    .replace(/\bed[\s-]*xl\b/gi, 'Edexcel')
    .replace(/\bed[\s-]*excel\b/gi, 'Edexcel')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanWhisperClosingText(text, lang) {
  const t = String(text || '').trim();
  if (lang === 'fr' && /^femme de l['’]enregistrement\.?$/i.test(t)) return 'Fin de l’enregistrement.';
  if (lang === 'es' && /^(?:c[ií]n|sin|s[ií]n) de la grabaci[oó]n\.?$/i.test(t)) return 'Fin de la grabación.';
  return t;
}

function isHallucinationLine(text, lang = 'en') {
  const t = String(text || '').trim();
  if (!t) return true;
  if (!/[a-zA-Z0-9\u00C0-\u024F\u4e00-\u9fff]/.test(t)) return true;
  if (t.includes('\uFFFD')) return true;
  if (/^[[(].*[\])]$/.test(t) && /music|applause|blank|silence|pause|beep|tone|inaudible|laughter|chime/i.test(t)) {
    return true;
  }
  if (/^(?:merci d'avoir regard[eé]|sous-titres|subtitles by|amara\.org|vielen dank f[uü]rs zuschauen|gracias por ver)/i.test(t)) {
    return true;
  }
  if (lang !== 'zh' && /[\u0400-\u04FF\u0590-\u06FF\uAC00-\uD7AF\u3040-\u30FF\u4E00-\u9FFF]/.test(t)) {
    return true;
  }
  if (/(?:www\.|\.com|\.nl|\.org)\S*(?:,\s*(?:www\.|\.com|\.nl|\.org))/i.test(t)) {
    return true;
  }
  return false;
}

function parseWhisperOjf(transcription, totalDuration, lang = 'fr', isVad = false) {
  const words = [];
  const cleanSegments = [];
  const normalizeText = (s) => (lang === 'en' ? cleanEnglishIntroText(s) : cleanWhisperClosingText(s, lang));

  for (const seg of transcription || []) {
    const segStart = Math.max(0, (seg.offsets?.from || 0) / 1000);
    let segEnd = Math.max(segStart + 0.1, (seg.offsets?.to || 0) / 1000);
    const rawText = normalizeText(String(seg.text || '').replace(/\s+/g, ' ').trim());
    if (!rawText || isHallucinationLine(rawText, lang)) continue;

    const segTokens = Array.isArray(seg.tokens) ? seg.tokens : [];
    const segWords = [];
    let curWord = '';
    let curStart = segStart;
    let curEnd = segEnd;

    for (const tk of segTokens) {
      const txt = String(tk.text || '');
      if (!txt || /^\[_.*\]$/.test(txt) || /^<\|.*\|>$/.test(txt)) continue;
      const tStart = Number.isFinite(tk.offsets?.from) ? tk.offsets.from / 1000 : segStart;
      const tEnd = Number.isFinite(tk.offsets?.to) ? tk.offsets.to / 1000 : tStart + 0.15;

      const isNewWord = /^\s/.test(txt) || (lang === 'zh' && curWord.length >= 2 && /[\u4e00-\u9fff]/.test(txt));
      if (isNewWord && curWord.trim()) {
        segWords.push({ raw: curWord.trim(), norm: normWord(curWord), start: curStart, end: Math.max(curStart, curEnd) });
        curWord = txt.trimStart();
        curStart = tStart;
        curEnd = tEnd;
      } else {
        if (!curWord) curStart = tStart;
        curWord += txt;
        curEnd = Math.max(curEnd, tEnd);
      }
    }
    if (curWord.trim()) {
      segWords.push({ raw: curWord.trim(), norm: normWord(curWord), start: curStart, end: Math.max(curStart, curEnd) });
    }

    if (segWords.length === 0) {
      const splitRaw = rawText.split(/\s+/).filter(Boolean);
      const effectiveDur = isVad ? Math.min(segEnd - segStart, Math.max(3, splitRaw.length * 0.6)) : segEnd - segStart;
      const step = effectiveDur / Math.max(1, splitRaw.length);
      splitRaw.forEach((w, idx) => {
        segWords.push({ raw: w, norm: normWord(w), start: segStart + idx * step, end: segStart + (idx + 1) * step });
      });
    }

    if (isVad && segEnd - segStart > 16) {
      const lastWord = segWords[segWords.length - 1];
      const maxReasonable = Math.max(10, rawText.length * 0.14);
      if (lastWord && lastWord.end < segEnd - 5 && lastWord.end >= segStart + 0.3) {
        segEnd = Math.min(segEnd, lastWord.end + 0.6);
      }
      if (segEnd - segStart > maxReasonable) {
        segEnd = Math.min(segEnd, segStart + maxReasonable);
      }
    }

    for (const w of segWords) {
      if (w.norm) words.push(w);
    }

    if (rawText.length > 120 && segWords.length >= 8) {
      let chunkWords = [];
      for (let i = 0; i < segWords.length; i++) {
        chunkWords.push(segWords[i]);
        const joined = lang === 'zh' ? chunkWords.map((x) => x.raw).join('') : chunkWords.map((x) => x.raw).join(' ');
        const endsSentence = /[.!?…»"。！？]$/.test(segWords[i].raw);
        const endsClause = /[,;:，；：]$/.test(segWords[i].raw);
        const isLast = i === segWords.length - 1;
        if (isLast || (endsSentence && joined.length >= 30) || (endsClause && joined.length >= 80) || joined.length >= 115) {
          const textOut = normalizeText(joined.replace(/\s+([,.;:!?])/g, '$1').trim());
          if (textOut && !isHallucinationLine(textOut, lang)) {
            const st = Number(Math.max(segStart, chunkWords[0].start).toFixed(1));
            const en = Number(Math.max(st + 0.4, Math.min(segEnd, chunkWords[chunkWords.length - 1].end)).toFixed(1));
            cleanSegments.push({ start: st, end: en, text: textOut });
          }
          chunkWords = [];
        }
      }
    } else {
      cleanSegments.push({
        start: Number(segStart.toFixed(1)),
        end: Number(Math.max(segStart + 0.4, segEnd).toFixed(1)),
        text: rawText
      });
    }
  }

  const deduped = [];
  for (const seg of cleanSegments) {
    const prev = deduped[deduped.length - 1];
    if (prev && normWord(prev.text) === normWord(seg.text) && seg.start - prev.end < 1.5) continue;
    const maxD = totalDuration > 0 ? totalDuration : seg.end;
    const st = Math.min(maxD, Math.max(0, seg.start));
    const en = Math.min(maxD, Math.max(st + 0.3, seg.end));
    deduped.push({ start: Number(st.toFixed(1)), end: Number(en.toFixed(1)), text: seg.text });
  }
  return { words, segments: deduped };
}

function extractEnglishIntroSegments(introEn, cutoffSec, isIgcse = false) {
  if (!Array.isArray(introEn) || introEn.length === 0) return [];
  const { segments: parsedSegs } = parseWhisperOjf(introEn, cutoffSec, 'en', false);
  const out = [];
  for (const seg of parsedSegs) {
    if (seg.start >= cutoffSec - 0.5) break;
    const txt = cleanEnglishIntroText(seg.text);
    if (!txt || isHallucinationLine(txt, 'en')) continue;
    if (/^(?:you|thank you|thanks|bye|okay)\.?$/i.test(txt) && seg.start >= 25) continue;
    if (/^(?:passage|h[öo]rtext|h[eöu]rtex[t]?|texto?|extracto|aufnahme|grabaci[oó]n|question|frage|pregunta|section)\s*(?:1|one|a)\b/i.test(txt)) {
      break;
    }
    const clampedEnd = Math.min(seg.end, cutoffSec - 0.1);
    if (clampedEnd > seg.start + 0.2) {
      out.push({ start: Number(seg.start.toFixed(1)), end: Number(clampedEnd.toFixed(1)), text: txt });
    }
    if (/write your answers when you like|open your question paper now|turn to the first question/i.test(txt)) break;
    if (isIgcse && seg.start >= 26 && out.some((x) => /minutes to read|open your question paper/i.test(x.text))) break;
  }
  const joined = out.map((x) => x.text).join(' ');
  const looksEnglish =
    /\b(edexcel|pearson|london examinations|advanced|international|gcse|recording|recordings|extract|bleep|listen|notes|answers|unit|summer|january|october|may|june|question|section|french|german|spanish|chinese|mandarin|cantonese|swahili)\b/i.test(
      joined
    );
  return looksEnglish ? out : [];
}

function extractPostPauseEnglishSegments(postPauseEn, totalDuration) {
  if (!Array.isArray(postPauseEn) || postPauseEn.length === 0) return [];
  const { segments: parsedSegs } = parseWhisperOjf(postPauseEn, totalDuration, 'en', false);
  const out = [];
  for (const seg of parsedSegs) {
    const txt = cleanEnglishIntroText(seg.text);
    if (!txt || isHallucinationLine(txt, 'en')) continue;
    if (/^(?:question|frage|pregunta|section|example|exemple|ejemplo|beispiel)\s*(?:1|one|a)?\b/i.test(txt)) break;
    const isRubricLine =
      /\b(extract|twice|bleep|bleeps|playing|pause|question|title|announced|allow|read|example|preceded|write|recording|first|turn|moment|moments|hear|mandarin|cantonese|french|german|spanish|swahili|english|answers|time|now)\b/i.test(
        txt
      );
    if (!isRubricLine && out.length >= 2) break;
    if (isRubricLine) {
      const fixedTxt = txt.replace(/^For each question title is announced/i, 'After each question title is announced');
      out.push({ start: seg.start, end: seg.end, text: fixedTxt });
      if (/turn to the first question/i.test(fixedTxt)) break;
    }
  }
  return out.length >= 2 ? out : [];
}

let pdfjsLib = null;
const pdfCache = new Map();

async function getPdfJs() {
  if (!pdfjsLib) {
    pdfjsLib = await import(pathToFileURL(path.join(PUBLIC_DIR, 'pdfjs', 'pdf.min.mjs')).href);
    pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
      path.join(PUBLIC_DIR, 'pdfjs', 'pdf.worker.min.mjs')
    ).href;
  }
  return pdfjsLib;
}

async function extractCleanPdfTranscript(relPath) {
  if (pdfCache.has(relPath)) return pdfCache.get(relPath);
  const fullPath = path.join(LIB_ROOT, relPath);
  if (!fs.existsSync(fullPath)) {
    pdfCache.set(relPath, null);
    return null;
  }

  try {
    const pdfjs = await getPdfJs();
    const data = new Uint8Array(fs.readFileSync(fullPath));
    const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
    const allPages = [];

    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const items = tc.items.filter((it) => it.str && it.str.length > 0);
      const lines = [];
      let line = '';
      let prev = null;

      for (const it of items) {
        const x = it.transform[4];
        const y = it.transform[5];
        const h = Math.abs(it.transform[0]) || Math.abs(it.transform[3]) || 10;
        if (prev) {
          if (Math.abs(y - prev.y) > h * 0.45) {
            if (line.trim()) lines.push(line.trim());
            line = it.str;
          } else {
            const gap = x - (prev.x + prev.w);
            const needSpace = gap > h * 0.18 && !/\s$/.test(line) && !/^\s/.test(it.str);
            line += (needSpace ? ' ' : '') + it.str;
          }
        } else {
          line = it.str;
        }
        prev = { x, y, w: it.width || 0, h };
      }
      if (line.trim()) lines.push(line.trim());
      allPages.push({ page: p, lines });
    }

    const transcriptLines = [];
    let inTranscript = false;
    const isStandaloneTranscript = doc.numPages <= 7 && /transcript|_QP_2/i.test(relPath);

    for (const pg of allPages) {
      const pgText = pg.lines.join('\n');
      if (
        /Edexcel and BTEC Qualifications|Pearson:\s*helping people progress|Registered company number 872828/i.test(pgText) &&
        !/(?:Passage|Hörtext|Texto|Extracto)\s*1\b/i.test(pgText)
      ) {
        continue;
      }
      for (const rawLine of pg.lines) {
        const l = rawLine.replace(/\s+/g, ' ').trim();
        if (!l) continue;
        if (/^(?:\*?P\d+[A-Z]?\d*\*?|W\d{5,}|Turn over|BLANK PAGE|©\s*Pearson|\d{1,2}|www\.\S+|https?:\/\/\S+)$/i.test(l)) continue;
        if (/Pearson Education Limited|Registered company number|80 Strand, London|All the material in this publication is copyright/i.test(l)) continue;
        if (/^(?:Transcript\s+)?W(?:FR|GN|SP)0[1-4](?:\/\d{2})?(?:\s+W(?:FR|GN|SP)0[1-4])?(?:\s+Transcript)?$/i.test(l)) continue;
        if (/^Transcript\s+W(?:FR|GN|SP)0[1-4]/i.test(l) && l.length < 70) continue;
        if (/^Transcript$/i.test(l)) continue;
        if (/^\(\d{2,4}(?:\s*(?:words?|mots?|palabras?|wörter))?\)$/i.test(l)) continue;

        if (!inTranscript) {
          if (
            /^(?:[([]?[MF]\d[)\]]?\s*:?\s*)?(?:Passage|H[öo]rtext|Texto|Extracto|Aufnahme|Grabaci[oó]n|Text)\s*1\b/i.test(l) ||
            /^SECTION\s+A\s*[:-]?\s*Listening/i.test(l)
          ) {
            inTranscript = true;
            if (!/^SECTION\s+A/i.test(l)) transcriptLines.push(l);
            continue;
          }
          if (!isStandaloneTranscript && /\bTranscript\b/i.test(l) && l.length < 90 && !/mark\s*scheme/i.test(l)) {
            inTranscript = true;
            continue;
          }
        } else {
          if (/^Pearson Education Limited\./i.test(l) || /^Question\s+\d+\s+Quality/i.test(l)) break;
          if (/International Advanced (?:Subsidiary|Level)|Understanding and Written Response|Research,\s*Understanding|Pearson Edexcel|Advanced Subsidiary|Mark Scheme/i.test(l) && l.length < 150) continue;
          if (/^(?:January|June|Summer|October|May)\s+20\d{2}\b/i.test(l) && l.length < 90) continue;
          if (/^(?:In\s+)?(?:French|German|Spanish)\s*(?:\(W(?:FR|GN|SP)0[1-4]\))?$/i.test(l)) continue;
          if (/^Unit\s*[24]\b/i.test(l) && l.length < 80) continue;
          transcriptLines.push(l);
        }
      }
    }

    const firstPassageIdx = transcriptLines.findIndex((l) =>
      /^(?:[([]?[MF]\d[)\]]?\s*:?\s*)?(?:Passage|H[öo]rtext|Texto|Extracto|Aufnahme|Grabaci[oó]n|Text)\s*1\b/i.test(l)
    );
    if (firstPassageIdx > 0 && firstPassageIdx < 12) transcriptLines.splice(0, firstPassageIdx);
    if (transcriptLines.length < 5) {
      pdfCache.set(relPath, null);
      return null;
    }

    const passageRe = /^(?:[([]?[MF]\d[)\]]?\s*:?\s*)?(?:Passage|H[öo]rtext|Texto|Extracto|Aufnahme|Grabaci[oó]n|Text)\s*(\d+)\b/i;
    const speakerOnlyRe = /^[([]?([MF]\d|Male|Female|Man|Woman|Presenter|Interviewer|Speaker\s*\d?)[)\]]?\s*:?$/i;
    const speakerInlineRe = /^(?:[([]?([MF]\d)[)\]]?\s*:?\s+)/;

    const passages = [];
    let curPassage = { label: '', rawLines: [] };
    for (let i = 0; i < transcriptLines.length; i++) {
      const l = transcriptLines[i];
      if (passageRe.test(l)) {
        if (curPassage.rawLines.length > 0) passages.push(curPassage);
        curPassage = { label: l, rawLines: [l] };
      } else if (speakerOnlyRe.test(l) && i + 1 < transcriptLines.length) {
        const tag = l.replace(/[()[\]:]/g, '').trim();
        transcriptLines[i + 1] = `(${tag}) ${transcriptLines[i + 1]}`;
      } else {
        curPassage.rawLines.push(l);
      }
    }
    if (curPassage.rawLines.length > 0) passages.push(curPassage);

    const buildSentences = (rawLines, passageLabel) => {
      const blocks = [];
      let buf = '';
      for (let i = 0; i < rawLines.length; i++) {
        const l = rawLines[i];
        const isHeading = i === 0 && passageRe.test(l);
        const isTitleLine = i === 1 && passageRe.test(rawLines[0]) && !speakerInlineRe.test(l) && l.length < 95 && !/[.!?]$/.test(l);
        const startsSpeaker = speakerInlineRe.test(l);
        if (isHeading) {
          if (buf.trim()) blocks.push(buf.trim());
          blocks.push(l);
          buf = '';
        } else if (isTitleLine) {
          blocks.push(l);
        } else if (startsSpeaker) {
          if (buf.trim()) blocks.push(buf.trim());
          buf = l;
        } else {
          if (!buf) buf = l;
          else if (buf.endsWith('-') && !/\s-$/.test(buf)) buf = buf.slice(0, -1) + l;
          else buf += ' ' + l;
        }
      }
      if (buf.trim()) blocks.push(buf.trim());

      const sentences = [];
      for (const blk of blocks) {
        const cleanBlk = blk
          .replace(/\s*\(\d{2,4}(?:\s*(?:words?|mots?|palabras?|wörter))?\)\s*$/i, '')
          .replace(/\s+/g, ' ')
          .replace(/\s+([,.;:!?])/g, '$1')
          .replace(/([([«])\s+/g, '$1')
          .replace(/\s+([)\]»])/g, '$1')
          .replace(/\b([cdjlmnstquCDJLMNSTQU])'\s+/g, "$1'")
          .replace(/\b([cdjlmnstquCDJLMNSTQU])’\s+/g, '$1’')
          .trim();
        if (!cleanBlk || /^\(\d{2,4}\)$/.test(cleanBlk)) continue;
        const parts = cleanBlk.split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Þ¡¿([«"„])/);
        for (const pt of parts) {
          const s = pt.replace(/\s*\(\d{2,4}\)\s*$/, '').trim();
          if (s && !/^\(\d{2,4}\)$/.test(s)) sentences.push({ text: s, passage: passageLabel });
        }
      }
      return sentences;
    };

    const parsedPassages = passages.map((p) => ({ label: p.label, sentences: buildSentences(p.rawLines, p.label) }));
    const result = { path: relPath, passages: parsedPassages, sentences: parsedPassages.flatMap((p) => p.sentences) };
    pdfCache.set(relPath, result);
    return result;
  } catch {
    pdfCache.set(relPath, null);
    return null;
  }
}

function wordsMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 5 && b.length >= 5) {
    if (a.startsWith(b.slice(0, 4)) && Math.abs(a.length - b.length) <= 2) return true;
    if (Math.abs(a.length - b.length) <= 1) {
      let i = 0;
      let j = 0;
      let diffs = 0;
      while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
          i++;
          j++;
        } else {
          diffs++;
          if (diffs > 1) return false;
          if (a.length > b.length) i++;
          else if (b.length > a.length) j++;
          else { i++; j++; }
        }
      }
      return true;
    }
  }
  return false;
}

function alignPdfSentencesToAsr(pdfSentences, asrWords, totalDuration) {
  if (!pdfSentences.length || !asrWords.length) return null;
  const pdfWords = [];
  const sentRanges = [];
  for (let sIdx = 0; sIdx < pdfSentences.length; sIdx++) {
    const spokenOnly = pdfSentences[sIdx].text.replace(/[([]?[MF]\d[)\]]?\s*:?/gi, ' ');
    const tokens = spokenOnly.split(/\s+/).map(normWord).filter(Boolean);
    const wStart = pdfWords.length;
    for (const t of tokens) pdfWords.push({ norm: t, sentIdx: sIdx });
    sentRanges.push({ wStart, wEnd: pdfWords.length - 1 });
  }

  const M = pdfWords.length;
  const N = asrWords.length;
  if (M < 15 || N < 15) return null;

  const band = Math.max(160, Math.abs(M - N) + 120);
  const stride = band * 2 + 1;
  const dp = new Int32Array((M + 1) * stride);
  const dir = new Uint8Array((M + 1) * stride);

  const getDp = (i, j) => {
    const off = j - (Math.floor((i * N) / M) - band);
    if (off < 0 || off >= stride) return -1;
    return dp[i * stride + off];
  };

  for (let i = 1; i <= M; i++) {
    const center = Math.floor((i * N) / M);
    const jMin = Math.max(1, center - band);
    const jMax = Math.min(N, center + band);
    const pw = pdfWords[i - 1].norm;
    for (let j = jMin; j <= jMax; j++) {
      const cellIdx = i * stride + (j - (center - band));
      const matched = wordsMatch(pw, asrWords[j - 1].norm);
      const diagPrev = getDp(i - 1, j - 1);
      const upPrev = getDp(i - 1, j);
      const leftPrev = getDp(i, j - 1);
      let best = upPrev >= 0 ? upPrev : 0;
      let d = 2;
      if (leftPrev > best) { best = leftPrev; d = 3; }
      if (matched && diagPrev >= 0 && diagPrev + 1 >= best) { best = diagPrev + 1; d = 1; }
      dp[cellIdx] = best;
      dir[cellIdx] = d;
    }
  }

  let bestJ = N;
  let bestScore = -1;
  for (let j = Math.max(1, N - band); j <= N; j++) {
    const v = getDp(M, j);
    if (v > bestScore) { bestScore = v; bestJ = j; }
  }
  if (bestScore / M < 0.52) return null;

  const pdfToAsr = new Int32Array(M).fill(-1);
  let ci = M;
  let cj = bestJ;
  while (ci > 0 && cj > 0) {
    const off = cj - (Math.floor((ci * N) / M) - band);
    if (off < 0 || off >= stride) break;
    const d = dir[ci * stride + off];
    if (d === 1) { pdfToAsr[ci - 1] = cj - 1; ci--; cj--; }
    else if (d === 2) ci--;
    else if (d === 3) cj--;
    else break;
  }

  const rawAligned = [];
  let anchoredSentences = 0;
  for (let sIdx = 0; sIdx < pdfSentences.length; sIdx++) {
    const { wStart, wEnd } = sentRanges[sIdx];
    const matchedAsrIndices = [];
    for (let w = wStart; w <= wEnd; w++) {
      if (pdfToAsr[w] !== -1) matchedAsrIndices.push(pdfToAsr[w]);
    }
    if (matchedAsrIndices.length > 0) {
      const clusters = [];
      let curCluster = [matchedAsrIndices[0]];
      for (let k = 1; k < matchedAsrIndices.length; k++) {
        if (asrWords[matchedAsrIndices[k]].start - asrWords[matchedAsrIndices[k - 1]].end > 9.0) {
          clusters.push(curCluster);
          curCluster = [matchedAsrIndices[k]];
        } else {
          curCluster.push(matchedAsrIndices[k]);
        }
      }
      clusters.push(curCluster);
      let bestCluster = clusters[0];
      for (const cl of clusters) {
        if (cl.length > bestCluster.length || (cl.length === bestCluster.length && sIdx === 0)) bestCluster = cl;
      }
      const wordCnt = Math.max(1, wEnd - wStart + 1);
      const maxReasonableDur = Math.max(16, wordCnt * 0.85);
      let sStart = asrWords[bestCluster[0]].start;
      const sEnd = asrWords[bestCluster[bestCluster.length - 1]].end;
      if (sEnd - sStart > maxReasonableDur) sStart = Math.max(sStart, sEnd - maxReasonableDur);
      anchoredSentences++;
      rawAligned.push({ text: pdfSentences[sIdx].text, start: sStart, end: sEnd, anchored: true });
    } else {
      rawAligned.push({ text: pdfSentences[sIdx].text, start: null, end: null, anchored: false });
    }
  }
  if (anchoredSentences / pdfSentences.length < 0.65) return null;

  for (let i = 0; i < rawAligned.length; i++) {
    if (rawAligned[i].anchored) continue;
    let prevIdx = i - 1;
    while (prevIdx >= 0 && !rawAligned[prevIdx].anchored) prevIdx--;
    let nextIdx = i + 1;
    while (nextIdx < rawAligned.length && !rawAligned[nextIdx].anchored) nextIdx++;
    const prevEnd = prevIdx >= 0 ? rawAligned[prevIdx].end : Math.max(0, rawAligned[nextIdx].start - 3 * (nextIdx - i));
    const nextStart = nextIdx < rawAligned.length ? rawAligned[nextIdx].start : Math.min(totalDuration || prevEnd + 4, prevEnd + 3.5);
    const spanCount = Math.max(1, (nextIdx < rawAligned.length ? nextIdx : rawAligned.length) - (prevIdx >= 0 ? prevIdx : -1) - 1);
    const pos = i - (prevIdx >= 0 ? prevIdx : -1) - 1;
    const step = Math.max(0.8, (nextStart - prevEnd) / spanCount);
    rawAligned[i].start = prevEnd + pos * step;
    rawAligned[i].end = rawAligned[i].start + Math.min(step, 3.5);
  }

  const finalSegments = [];
  const maxDur = totalDuration > 0 ? totalDuration : asrWords[asrWords.length - 1].end;
  for (let i = 0; i < rawAligned.length; i++) {
    const prev = finalSegments[finalSegments.length - 1];
    let st = Math.max(0, Math.min(maxDur, rawAligned[i].start));
    if (prev && st < prev.start) st = prev.end;
    let en = Math.max(st + 0.5, Math.min(maxDur, rawAligned[i].end));
    if (i + 1 < rawAligned.length && rawAligned[i + 1].anchored && en > rawAligned[i + 1].start) {
      en = Math.max(st + 0.4, rawAligned[i + 1].start);
    }
    finalSegments.push({ start: Number(st.toFixed(1)), end: Number(en.toFixed(1)), text: rawAligned[i].text });
  }
  if (asrWords[asrWords.length - 1].end - finalSegments[finalSegments.length - 1].end > 20) return null;
  return { segments: finalSegments };
}

function selectBestPassageForTrackedPart(pdfDoc, asrWords) {
  if (!pdfDoc?.passages?.length) return null;
  if (pdfDoc.passages.length === 1) return pdfDoc.sentences;
  const asrSet = new Set(asrWords.map((w) => w.norm).filter((w) => w.length >= 4));
  let bestPassage = null;
  let bestScore = 0;
  for (const p of pdfDoc.passages) {
    const pWords = p.sentences.flatMap((s) => s.text.split(/\s+/).map(normWord)).filter((w) => w.length >= 4);
    if (pWords.length < 10) continue;
    let hits = 0;
    for (const w of pWords) if (asrSet.has(w)) hits++;
    const score = hits / pWords.length;
    if (score > bestScore) { bestScore = score; bestPassage = p; }
  }
  return bestScore >= 0.45 && bestPassage ? bestPassage.sentences : null;
}

async function ensureModelsDownloaded() {
  fs.mkdirSync(MODEL_DIR, { recursive: true });
  const downloads = [
    { file: MODEL_BASE, url: MODEL_BASE_URL, label: 'ggml-base-q5_1.bin', minBytes: 50_000_000 },
    { file: VAD_MODEL, url: VAD_MODEL_URL, label: 'ggml-silero-v5.1.2.bin', minBytes: 500_000 }
  ];
  for (const item of downloads) {
    if (fs.existsSync(item.file) && fs.statSync(item.file).size >= item.minBytes) continue;
    console.log(`Downloading ${item.label} -> ${item.file}...`);
    const res = await fetch(item.url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Failed to download ${item.label}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(item.file, buf);
    console.log(`  Saved ${item.label} (${(buf.length / 1048576).toFixed(2)} MB)`);
  }
}

function runWhisperProcess(exePath, argsList, timeoutMs = 900000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(exePath, argsList, { windowsHide: true });
    let stderrTail = '';
    const appendLog = (chunk) => {
      stderrTail += chunk.toString('utf8');
      if (stderrTail.length > 4000) stderrTail = stderrTail.slice(-4000);
    };
    proc.stdout.on('data', appendLog);
    proc.stderr.on('data', appendLog);
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* ignore */ }
      reject(new Error(`Timeout after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    proc.on('error', (err) => { clearTimeout(timer); reject(err); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stderrTail });
      else reject(new Error(`Exit code ${code}: ${stderrTail.slice(-300)}`));
    });
  });
}

function parseDurationFromStderr(logText) {
  const m = logText.match(/\(\d+\s+samples,\s*([\d.]+)\s+sec\)/i);
  return m ? Number(m[1]) : 0;
}

function findReadingPauseResumeMs(transcription) {
  if (!Array.isArray(transcription) || transcription.length < 2) return null;
  for (let i = 0; i < Math.min(transcription.length, 15); i++) {
    const s = transcription[i];
    const from = s.offsets?.from || 0;
    const to = s.offsets?.to || 0;
    if (from < 90000 && to > 220000 && to - from >= 120000) return to;
    if (i > 0) {
      const prevTo = transcription[i - 1].offsets?.to || 0;
      if (prevTo < 90000 && from > 220000 && from - prevTo >= 120000) return from;
    }
  }
  return null;
}

async function runEnglishProbe(workerConfig, audioPath, offsetMs, durationMs, prefix) {
  const jsonPath = `${prefix}.json`;
  try {
    await runWhisperProcess(
      workerConfig.exe,
      [
        ...workerConfig.deviceArgs,
        '-m', MODEL_BASE,
        '-f', audioPath,
        '-l', 'en',
        '-ot', String(Math.max(0, Math.round(offsetMs))),
        '-d', String(durationMs),
        '-t', String(workerConfig.threads),
        '-bs', '1',
        '-bo', '1',
        '-mc', '64',
        '-sns',
        '-ojf',
        '-of', prefix
      ],
      120000
    );
    if (fs.existsSync(jsonPath)) {
      const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      return Array.isArray(parsed.transcription) ? parsed.transcription : null;
    }
  } catch {
    return null;
  } finally {
    try { fs.unlinkSync(jsonPath); } catch { /* ignore */ }
  }
  return null;
}

function materializeAudioFile(job) {
  if (!job.isZipEntry) {
    return { audioPath: path.join(LIB_ROOT, job.sourcePath), isTemp: false };
  }
  const zipBuf = fs.readFileSync(path.join(LIB_ROOT, job.sourcePath));
  const data = extractEntryFromZipBuffer(zipBuf, job.entryPath, job.fileName, 0);
  if (!data) throw new Error(`Could not extract ${job.entryPath} from ${job.sourcePath}`);
  const outPath = path.join(TMP_DIR, `${job.id}.${job.ext}`);
  fs.writeFileSync(outPath, data);
  return { audioPath: outPath, isTemp: true };
}

async function transcribeTrack(job, workerConfig) {
  const cacheFile = path.join(RAW_CACHE_DIR, `${job.id}.raw.json`);
  if (!FORCE && fs.existsSync(cacheFile)) {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  }

  const lang = inferCliLangCode(job.subject);
  const isIgcse = job.spec === 'IGCSE' || job.spec === 'CIE-IGCSE' || job.spec === 'CIE-OL';
  const useVad = isIgcse;
  const maxContext = lang === 'zh' || lang === 'sw' ? '0' : '64';
  const { audioPath, isTemp } = materializeAudioFile(job);
  const outPrefix = path.join(TMP_DIR, `out_${job.id}_${workerConfig.name}`);
  const outJsonPath = `${outPrefix}.json`;

  const startedAt = Date.now();
  try {
    const mainArgs = [
      ...workerConfig.deviceArgs,
      '-m', MODEL_BASE,
      '-f', audioPath,
      '-l', lang,
      '-t', String(workerConfig.threads),
      '-bs', '1',
      '-bo', '1',
      '-mc', maxContext,
      '-sns',
      ...(useVad ? ['--vad', '-vm', VAD_MODEL, '-vt', '0.45', '-vsd', '500', '-vp', '200', '-vmsd', '25'] : []),
      '-ojf',
      '-of', outPrefix
    ];

    const estSec = job.ext === 'wav' ? job.size / 176400 : (job.size * 8) / 128000;
    const timeoutMs = Math.max(900000, Math.round(estSec * 1500));
    const { stderrTail } = await runWhisperProcess(workerConfig.exe, mainArgs, timeoutMs);
    if (!fs.existsSync(outJsonPath)) throw new Error(`Missing Whisper output at ${outJsonPath}`);

    const parsed = JSON.parse(fs.readFileSync(outJsonPath, 'utf8'));
    const rawTranscription = Array.isArray(parsed.transcription) ? parsed.transcription : [];
    const durationSec =
      parseDurationFromStderr(stderrTail) ||
      (rawTranscription.length ? (rawTranscription[rawTranscription.length - 1].offsets?.to || 0) / 1000 : 0);

    let introEn = null;
    let postPauseEn = null;
    let postPauseResumeSec = null;

    if (lang !== 'en' && !(job.isTrackedPart && job.trackIndex > 0)) {
      introEn = await runEnglishProbe(
        workerConfig,
        audioPath,
        0,
        isIgcse ? 65000 : 26000,
        path.join(TMP_DIR, `intro1_${job.id}_${workerConfig.name}`)
      );

      if (isIgcse) {
        const resumeMs = findReadingPauseResumeMs(rawTranscription);
        if (resumeMs !== null) {
          postPauseResumeSec = Number((resumeMs / 1000).toFixed(1));
          postPauseEn = await runEnglishProbe(
            workerConfig,
            audioPath,
            Math.max(0, resumeMs - 2500),
            55000,
            path.join(TMP_DIR, `intro2_${job.id}_${workerConfig.name}`)
          );
        }
      }
    }

    const payload = {
      id: job.id,
      shard: job.shard,
      spec: job.spec,
      subject: job.subject,
      unitCode: job.unitCode,
      variant: job.variant || '',
      session: job.session,
      sourcePath: job.sourcePath,
      fileName: job.fileName,
      lang,
      vad: useVad,
      duration: Number(durationSec.toFixed(2)),
      worker: workerConfig.name,
      elapsedSec: Number(((Date.now() - startedAt) / 1000).toFixed(2)),
      transcription: rawTranscription,
      introEn,
      postPauseEn,
      postPauseResumeSec
    };

    const tmpCache = `${cacheFile}.tmp`;
    fs.writeFileSync(tmpCache, JSON.stringify(payload));
    fs.renameSync(tmpCache, cacheFile);
    return payload;
  } finally {
    if (isTemp) try { fs.unlinkSync(audioPath); } catch { /* ignore */ }
    try { fs.unlinkSync(outJsonPath); } catch { /* ignore */ }
  }
}

async function buildCompactSubtitleEntry(job, raw) {
  const isIgcse = job.spec === 'IGCSE';
  const { words: asrWords, segments: whisperSegments } = parseWhisperOjf(
    raw.transcription,
    raw.duration,
    raw.lang,
    Boolean(raw.vad)
  );

  const introCutoffLimit = isIgcse ? 66 : 26;
  const detectedIntroSegs =
    raw.introEn && raw.lang !== 'en' ? extractEnglishIntroSegments(raw.introEn, introCutoffLimit, isIgcse) : [];
  const introEndSec = detectedIntroSegs.length > 0 ? detectedIntroSegs[detectedIntroSegs.length - 1].end : 0;
  const foreignAsrWords = !isIgcse && introEndSec >= 10
    ? asrWords.filter((w) => w.start >= Math.max(0, introEndSec - 1.2))
    : asrWords;

  let finalSegments = whisperSegments;
  let finalSource = 'whisper-ai';
  let usedPdfPath = '';

  if (job.spec === 'IAL' && Array.isArray(job.candidatePdfs) && job.candidatePdfs.length > 0 && raw.duration < 1200) {
    for (const cand of job.candidatePdfs) {
      const pdfDoc = await extractCleanPdfTranscript(cand.path);
      if (!pdfDoc || pdfDoc.sentences.length < 6) continue;
      const targetSentences = job.isTrackedPart ? selectBestPassageForTrackedPart(pdfDoc, foreignAsrWords) : pdfDoc.sentences;
      if (!targetSentences || targetSentences.length < 4) continue;
      const aligned = alignPdfSentencesToAsr(targetSentences, foreignAsrWords, raw.duration);
      if (aligned) {
        finalSegments = aligned.segments;
        finalSource = 'transcript-aligned';
        usedPdfPath = cand.path;
        break;
      }
    }
  }

  if (detectedIntroSegs.length > 0 && finalSegments.length > 0) {
    if (!isIgcse) {
      let foreignStartSec = finalSegments[0].start;
      if (finalSource === 'whisper-ai') {
        const firstForeignSeg = finalSegments.find(
          (s) =>
            s.start >= Math.max(10, introEndSec - 1.0) &&
            (/\b(?:passage|h[öo]rtext|texto|extracto|aufnahme|grabaci[oó]n)\s*1\b/i.test(s.text) || s.start >= introEndSec)
        );
        foreignStartSec = firstForeignSeg && firstForeignSeg.start <= Math.max(28, introEndSec + 8)
          ? firstForeignSeg.start
          : introEndSec;
      }
      if (foreignStartSec >= 10) {
        const introSegs = extractEnglishIntroSegments(raw.introEn, Math.min(26, foreignStartSec + 0.3), false);
        if (introSegs.length > 0) {
          finalSegments = [...introSegs, ...finalSegments.filter((s) => s.start >= foreignStartSec - 0.2)];
        }
      }
    } else {
      const postPauseSegs = extractPostPauseEnglishSegments(raw.postPauseEn, raw.duration);
      if (postPauseSegs.length > 0) {
        const ppStart = postPauseSegs[0].start;
        const ppEnd = postPauseSegs[postPauseSegs.length - 1].end;
        const pauseMin = Math.max(1, Math.round((ppStart - introEndSec) / 60));
        const pauseCue = {
          start: Number((introEndSec + 1.5).toFixed(1)),
          end: Number(Math.max(introEndSec + 6.0, ppStart - 0.5).toFixed(1)),
          text: `(${pauseMin}-minute reading time — recording resumes at ${fmtTime(ppStart)})`
        };
        finalSegments = [...detectedIntroSegs, pauseCue, ...postPauseSegs, ...finalSegments.filter((s) => s.start >= ppEnd - 0.8)];
      } else {
        const restAfterIntro = finalSegments.filter((s) => s.start >= introEndSec - 0.5);
        if (restAfterIntro.length > 0 && restAfterIntro[0].start - introEndSec >= 120) {
          const resumeSec = restAfterIntro[0].start;
          const pauseMin = Math.max(1, Math.round((resumeSec - introEndSec) / 60));
          const pauseCue = {
            start: Number((introEndSec + 1.5).toFixed(1)),
            end: Number(Math.max(introEndSec + 6.0, resumeSec - 0.5).toFixed(1)),
            text: `(${pauseMin}-minute reading time — recording resumes at ${fmtTime(resumeSec)})`
          };
          finalSegments = [...detectedIntroSegs, pauseCue, ...restAfterIntro];
        } else {
          finalSegments = [...detectedIntroSegs, ...restAfterIntro];
        }
      }
    }
  } else if (isIgcse && raw.lang === 'en' && finalSegments.length > 2) {
    const withPauseCues = [];
    for (let i = 0; i < finalSegments.length; i++) {
      const seg = finalSegments[i];
      if (i > 0) {
        const prev = withPauseCues[withPauseCues.length - 1];
        if (prev.end < 90 && seg.start - prev.end >= 120) {
          const pauseMin = Math.max(1, Math.round((seg.start - prev.end) / 60));
          withPauseCues.push({
            start: Number((prev.end + 1.5).toFixed(1)),
            end: Number(Math.max(prev.end + 6.0, seg.start - 0.5).toFixed(1)),
            text: `(${pauseMin}-minute reading time — recording resumes at ${fmtTime(seg.start)})`
          });
        }
      }
      withPauseCues.push(seg);
    }
    finalSegments = withPauseCues;
  }

  const maxDur = Number((raw.duration || 0).toFixed(1));
  const cleanFinal = [];
  for (const seg of finalSegments) {
    const txt = String(seg.text || '').trim();
    if (!txt) continue;
    const prev = cleanFinal[cleanFinal.length - 1];
    let st = Math.max(0, maxDur > 0 ? Math.min(maxDur, seg.start) : seg.start);
    if (prev && st < prev.start) st = prev.start;
    const en = Math.max(st + 0.3, maxDur > 0 ? Math.min(maxDur, seg.end) : seg.end);
    cleanFinal.push({ start: Number(st.toFixed(1)), end: Number(en.toFixed(1)), text: txt });
  }

  const lastEnd = cleanFinal.length ? cleanFinal[cleanFinal.length - 1].end : 0;
  const compactEntry = {
    d: Number((raw.duration || lastEnd).toFixed(1)),
    src: finalSource,
    lang: raw.lang,
    s: cleanFinal.map((seg) => [seg.start, seg.end, seg.text])
  };
  if (usedPdfPath) compactEntry.pdf = usedPdfPath;
  return compactEntry;
}

async function main() {
  const indexPath = path.join(PUBLIC_DIR, 'index.json');
  if (!fs.existsSync(indexPath)) {
    console.error('Missing public/index.json — run scripts/generate-index.js first.');
    process.exit(1);
  }

  // 1. Load existing sharded subtitles so already-indexed tracks are preserved untouched
  fs.mkdirSync(SUB_DIR, { recursive: true });
  const existingShards = new Map();
  const existingTrackIndex = new Map(); // id -> shardName
  const manifestPath = path.join(SUB_DIR, 'manifest.json');
  let existingKeys = {};

  if (!FORCE && fs.existsSync(manifestPath)) {
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      existingKeys = m && typeof m.keys === 'object' ? { ...m.keys } : {};
      for (const shardName of Array.isArray(m.shards) ? m.shards : []) {
        const sp = path.join(SUB_DIR, `${shardName}.json`);
        if (!fs.existsSync(sp)) continue;
        const sd = JSON.parse(fs.readFileSync(sp, 'utf8'));
        const tracksObj = sd && typeof sd.tracks === 'object' ? sd.tracks : {};
        existingShards.set(shardName, tracksObj);
        for (const id of Object.keys(tracksObj)) existingTrackIndex.set(id, shardName);
      }
    } catch (err) {
      console.warn('Warning: Could not read existing manifest.json, starting fresh:', err.message);
    }
  }

  // 2. Scan selected board index(es) for AUD resources and compute SHA-256 track IDs + candidate keys
  const indexPathsToScan = [];
  if (TARGET_BOARD === 'edexcel' || TARGET_BOARD === 'all') indexPathsToScan.push(indexPath);
  if (TARGET_BOARD === 'cambridge' || TARGET_BOARD === 'all') {
    const cieIdxPath = path.join(PUBLIC_DIR, 'index-cambridge.json');
    if (fs.existsSync(cieIdxPath)) indexPathsToScan.push(cieIdxPath);
  }
  const files = [];
  for (const ip of indexPathsToScan) {
    const idx = JSON.parse(fs.readFileSync(ip, 'utf8'));
    for (const r of idx.files || []) {
      const obj = Object.fromEntries(idx.keys.map((k, i) => [k, r[i]]));
      if (SYLLABUS_FILTER && obj.syllabusCode && !SYLLABUS_FILTER.has(String(obj.syllabusCode))) continue;
      files.push(obj);
    }
  }
  const targetAuds = files.filter((f) => f.docType === 'AUD');
  const pdfPool = files.filter(
    (f) => f.path.toLowerCase().endsWith('.pdf') && (f.docType === 'SC' || f.docType === 'MS' || /_QP_2|_tn_|transcript/i.test(f.name))
  );

  const uniqueTracks = new Map();
  const discoveredKeys = { ...existingKeys };

  for (const f of targetAuds) {
    const fullPath = path.join(LIB_ROOT, f.path);
    if (!fs.existsSync(fullPath)) continue;
    const ext = getFileExt(f.path);
    const shard = getShardName(f.spec, f.subject);
    const baseSitting = f.unitCode && f.session ? `${f.spec}|${f.subject}|${f.unitCode}|${f.variant || ''}|${f.session}` : '';
    const altPaths = Array.isArray(f.altPaths) ? f.altPaths : [];

    if (ext === 'zip') {
      const tracks = parseZipAudioExact(fs.readFileSync(fullPath), 0);
      const hasU2 = tracks.some((t) => buildTrackUnitHint(t.entryPath).unitHint === 'U2');
      const hasU4 = tracks.some((t) => buildTrackUnitHint(t.entryPath).unitHint === 'U4');
      const isCombinedU2U4 = /u2u4/i.test(f.name) || (f.spec === 'IAL' && hasU2 && hasU4);

      tracks.forEach((t, idxNum) => {
        const hash = crypto.createHash('sha256').update(t.data).digest('hex').slice(0, 16);
        const hintInfo = buildTrackUnitHint(t.entryPath);
        let effectiveUnit = f.unitCode || '';
        if (f.spec === 'IAL' && hintInfo.unitHint && PREFIX_MAP[f.subject]) {
          effectiveUnit = `${PREFIX_MAP[f.subject]}${hintInfo.unitHint === 'U2' ? '02' : '04'}`;
        }
        const derivedSitting = effectiveUnit && f.session
          ? `${f.spec}|${f.subject}|${effectiveUnit}|${f.variant || ''}|${f.session}`
          : baseSitting;

        if (!uniqueTracks.has(hash)) {
          uniqueTracks.set(hash, {
            id: hash,
            shard: existingTrackIndex.get(hash) || shard,
            spec: f.spec,
            subject: f.subject,
            unitCode: effectiveUnit,
            variant: f.variant || '',
            session: f.session || '',
            ext: t.ext,
            size: t.size,
            isZipEntry: true,
            sourcePath: f.path,
            entryPath: t.entryPath,
            fileName: t.fileName,
            isTrackedPart: hintInfo.isTrackedPart && tracks.length > 1 && !isCombinedU2U4,
            trackIndex: idxNum,
            keys: []
          });
        }

        const candidateKeys = [`${f.path}#${t.fileName}`];
        if (t.entryPath !== t.fileName) candidateKeys.push(`${f.path}#${t.entryPath}`);
        for (const alt of altPaths) {
          candidateKeys.push(`${alt}#${t.fileName}`);
          if (t.entryPath !== t.fileName) candidateKeys.push(`${alt}#${t.entryPath}`);
        }
        if (tracks.length === 1) {
          candidateKeys.push(f.path, ...altPaths);
          if (derivedSitting) candidateKeys.push(derivedSitting);
        } else if (!isCombinedU2U4) {
          if (derivedSitting) candidateKeys.push(`${derivedSitting}#track-${idxNum + 1}`);
          if (baseSitting && baseSitting !== derivedSitting) candidateKeys.push(`${baseSitting}#track-${idxNum + 1}`);
        } else if (derivedSitting) {
          candidateKeys.push(derivedSitting);
        }

        const job = uniqueTracks.get(hash);
        for (const ck of candidateKeys) {
          if (!job.keys.includes(ck)) job.keys.push(ck);
          discoveredKeys[ck] = `${job.shard}/${hash}`;
        }
      });
    } else {
      const buf = fs.readFileSync(fullPath);
      const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
      if (!uniqueTracks.has(hash)) {
        uniqueTracks.set(hash, {
          id: hash,
          shard: existingTrackIndex.get(hash) || shard,
          spec: f.spec,
          subject: f.subject,
          unitCode: f.unitCode || '',
          variant: f.variant || '',
          session: f.session || '',
          ext,
          size: buf.length,
          isZipEntry: false,
          sourcePath: f.path,
          entryPath: f.name,
          fileName: f.name,
          isTrackedPart: false,
          trackIndex: null,
          keys: []
        });
      }
      const candidateKeys = [f.path, `${f.path}#${f.name}`, ...altPaths];
      if (baseSitting) candidateKeys.push(baseSitting);
      const job = uniqueTracks.get(hash);
      for (const rawKey of candidateKeys) {
        let ck = rawKey;
        if (/\|P\d\|\|/.test(ck) && /_R_AUD\b/i.test(f.name || '')) {
          ck = ck.replace(/\|(P\d)\|\|/, '|$1|R|');
        }
        if (!job.keys.includes(ck)) job.keys.push(ck);
        discoveredKeys[ck] = `${job.shard}/${hash}`;
      }
    }
  }

  // Attach candidate PDFs for any new IAL tracks
  const pendingJobs = [];
  for (const job of uniqueTracks.values()) {
    if (!FORCE && existingTrackIndex.has(job.id)) continue;
    const matchingPdfs = pdfPool
      .filter(
        (p) =>
          p.spec === job.spec &&
          p.subject === job.subject &&
          p.session === job.session &&
          (!job.unitCode || p.unitCode === job.unitCode) &&
          (!job.variant || !p.variant || p.variant === job.variant)
      )
      .sort((a, b) => {
        const score = (x) =>
          (/transcript|_tn_/i.test(x.name) && x.docType === 'SC') ? 30 : /_QP_2/i.test(x.name) ? 20 : x.docType === 'MS' ? 10 : 0;
        return score(b) - score(a);
      });
    job.candidatePdfs = matchingPdfs.map((p) => ({ docType: p.docType, path: p.path, name: p.name }));
    pendingJobs.push(job);
  }

  // Longest-first scheduling so CPU & GPU workers finish together
  pendingJobs.sort((a, b) => {
    const durA = a.ext === 'wav' ? a.size / 176400 : (a.size * 8) / 128000;
    const durB = b.ext === 'wav' ? b.size / 176400 : (b.size * 8) / 128000;
    return durB - durA;
  });

  const newKeyCount = Object.keys(discoveredKeys).filter((k) => existingKeys[k] !== discoveredKeys[k]).length;

  console.log('=== INCREMENTAL AUDIO SUBTITLE INDEXER ===');
  console.log(`Scanned AUD files: ${targetAuds.length} | Unique tracks: ${uniqueTracks.size}`);
  console.log(`Already pre-indexed: ${uniqueTracks.size - pendingJobs.length} | New tracks to transcribe: ${pendingJobs.length} | New/updated keys: ${newKeyCount}`);

  if (DRY_RUN) {
    if (pendingJobs.length > 0) {
      console.log('Pending new tracks (--dry-run):');
      for (const j of pendingJobs.slice(0, 30)) {
        console.log(`  [${j.shard}] ${j.session} ${j.unitCode}${j.variant} -> ${j.fileName} (${(j.size / 1048576).toFixed(1)} MB)`);
      }
      if (pendingJobs.length > 30) console.log(`  ... and ${pendingJobs.length - 30} more`);
    }
    return;
  }

  if (pendingJobs.length === 0 && newKeyCount === 0) {
    console.log('All audio tracks and manifest keys are already up to date — nothing to do!');
    return;
  }

  const modifiedShards = new Set();

  if (pendingJobs.length > 0) {
    await ensureModelsDownloaded();
    fs.mkdirSync(RAW_CACHE_DIR, { recursive: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });

    const workers = [];
    if (fs.existsSync(CPU_CLI)) {
      workers.push({ name: 'CPU', exe: CPU_CLI, deviceArgs: ['-ng'], threads: CPU_THREADS });
    }
    if (!CPU_ONLY && fs.existsSync(GPU_CLI)) {
      workers.push({ name: 'GPU', exe: GPU_CLI, deviceArgs: ['-dev', GPU_DEV, '-fa'], threads: 1 });
    }
    if (workers.length === 0) {
      console.error(`No whisper-cli.exe binary found in ${WHISPER_DIR}\\cpu\\ or ${WHISPER_DIR}\\vulkan\\.`);
      process.exit(1);
    }

    console.log(`Launching ${workers.length} worker(s): ${workers.map((w) => w.name).join(' + ')}`);

    let qIdx = 0;
    let doneCount = 0;
    let gpuDisabled = false;
    let gpuFails = 0;
    const failed = [];
    const batchStart = Date.now();

    const runWorker = async (worker) => {
      while (true) {
        if (worker.name === 'GPU' && gpuDisabled) return;
        if (qIdx >= pendingJobs.length) return;
        const job = pendingJobs[qIdx++];
        try {
          const raw = await transcribeTrack(job, worker);
          if (worker.name === 'GPU') gpuFails = 0;
          const entry = await buildCompactSubtitleEntry(job, raw);
          if (!existingShards.has(job.shard)) existingShards.set(job.shard, {});
          existingShards.get(job.shard)[job.id] = entry;
          modifiedShards.add(job.shard);
          doneCount++;
          const wallMin = ((Date.now() - batchStart) / 60000).toFixed(1);
          console.log(
            `[${doneCount}/${pendingJobs.length} | ${wallMin}m] ${worker.name} INDEXED ${job.shard} ${job.session} (${job.fileName}) -> ${entry.s.length} segs (${entry.src})`
          );
        } catch (err) {
          console.error(`[ERROR] ${worker.name} failed on ${job.fileName}: ${err.message}`);
          if (worker.name === 'GPU' && workers.some((w) => w.name === 'CPU')) {
            gpuFails++;
            pendingJobs.push(job);
            if (gpuFails >= 2) {
              console.warn('Disabling GPU worker after 2 consecutive failures; continuing on CPU.');
              gpuDisabled = true;
              return;
            }
            await new Promise((r) => setTimeout(r, 5000));
          } else {
            failed.push({ id: job.id, fileName: job.fileName, error: err.message });
          }
        }
      }
    };

    try {
      await Promise.all(workers.map((w) => runWorker(w)));
    } finally {
      try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
    }

    if (failed.length > 0) {
      console.error(`Finished with ${failed.length} failed track(s):`, failed);
      process.exitCode = 1;
    }
  }

  // 3. Persist only modified shards + refreshed manifest.json
  const nowIso = new Date().toISOString();
  const shardNames = [...existingShards.keys()].sort((a, b) => a.localeCompare(b));
  let totalUnique = 0;

  for (const shardName of shardNames) {
    const tracksObj = existingShards.get(shardName);
    totalUnique += Object.keys(tracksObj).length;
    if (FORCE || modifiedShards.has(shardName)) {
      const payload = JSON.stringify({ version: '2.0', shard: shardName, generatedAt: nowIso, tracks: tracksObj });
      fs.writeFileSync(path.join(SUB_DIR, `${shardName}.json`), payload, 'utf8');
      console.log(`Updated public/subtitles/${shardName}.json (${Object.keys(tracksObj).length} tracks, ${(Buffer.byteLength(payload) / 1024).toFixed(1)} KB)`);
    }
  }

  const manifestPayload = JSON.stringify({
    version: '2.0',
    generatedAt: nowIso,
    shards: shardNames,
    uniqueTracks: totalUnique,
    keys: discoveredKeys
  });
  fs.writeFileSync(manifestPath, manifestPayload, 'utf8');
  fs.writeFileSync(
    path.join(PUBLIC_DIR, 'audio-subtitles.json'),
    JSON.stringify({ version: '2.0', migratedTo: '/subtitles/manifest.json', generatedAt: nowIso, tracks: {} }),
    'utf8'
  );
  console.log(`Updated public/subtitles/manifest.json (${totalUnique} unique tracks across ${shardNames.length} shards, ${Object.keys(discoveredKeys).length} keys).`);
}

await main();
