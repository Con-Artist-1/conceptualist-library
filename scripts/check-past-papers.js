import fs from 'fs';

const raw = fs.readFileSync('e:/The Library/search-app/public/index.json', 'utf8');
const data = JSON.parse(raw);
const keys = data.keys;

const paths = data.files.map(arr => {
  const o = {};
  keys.forEach((k, i) => o[k] = arr[i]);
  return o.path;
});

console.log('Total files:', paths.length);

const rootDirs = new Set(paths.map(p => p.split('/')[0]));
console.log('Root directories in paths:', Array.from(rootDirs));

const pastPapersSubDirs = new Set(
  paths
    .filter(p => p.startsWith('Past Papers/'))
    .map(p => p.split('/')[1])
);
console.log('Subdirectories under Past Papers/:', Array.from(pastPapersSubDirs));

const ialPastPapers = paths.filter(p => p.startsWith('Past Papers/IAL/'));
console.log('Past Papers/IAL/ count:', ialPastPapers.length);

const igcsePastPapers = paths.filter(p => p.startsWith('Past Papers/IGCSE/'));
console.log('Past Papers/IGCSE/ count:', igcsePastPapers.length);

const otherPastPapers = paths.filter(p => p.startsWith('Past Papers/') && !p.startsWith('Past Papers/IAL/') && !p.startsWith('Past Papers/IGCSE/'));
console.log('Other Past Papers count:', otherPastPapers.length);
if (otherPastPapers.length > 0) {
  console.log('Sample other:', otherPastPapers.slice(0, 5));
}

