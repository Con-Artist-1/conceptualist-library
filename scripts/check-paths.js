import fs from 'fs';

const raw = fs.readFileSync('e:/The Library/search-app/public/index.json', 'utf8');
const data = JSON.parse(raw);

console.log('keys:', data.keys);
console.log('files count:', data.files ? data.files.length : data.flatFiles?.length);

const keys = data.keys;
const firstFile = data.files[0];
const obj = {};
keys.forEach((k, i) => obj[k] = firstFile[i]);
console.log('First file:', obj);

// Check paths containing 'Past Papers'
const pathsWithPastPapers = data.files.slice(0, 50).map(f => {
  const o = {};
  keys.forEach((k, i) => o[k] = f[i]);
  return o.path;
});
console.log('Sample paths:', pathsWithPastPapers.slice(0, 10));

// Check if any path starts with 'Past Papers/IAL' or 'Past Papers\\IAL'
let forwardSlashIal = 0;
let backSlashIal = 0;
for (const f of data.files) {
  const o = {};
  keys.forEach((k, i) => o[k] = f[i]);
  if (o.path.startsWith('Past Papers/IAL')) forwardSlashIal++;
  if (o.path.startsWith('Past Papers\\IAL')) backSlashIal++;
}
console.log('Forward slash IAL count:', forwardSlashIal);
console.log('Backslash IAL count:', backSlashIal);
