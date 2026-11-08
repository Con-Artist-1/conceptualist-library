import fs from 'fs';

const raw = fs.readFileSync('e:/The Library/search-app/public/meta.json', 'utf8');
const data = JSON.parse(raw);

const pp = data.compactTree[1].find(c => Array.isArray(c) && c[0] === 'Past Papers');
console.log('Past papers in compactTree:');
console.dir(pp, { depth: null });
