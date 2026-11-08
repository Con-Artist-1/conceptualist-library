import fs from 'fs';

const raw = fs.readFileSync('e:/The Library/search-app/public/meta.json', 'utf8');
const data = JSON.parse(raw);

console.log('Top keys in meta.json:', Object.keys(data));
if (data.compactTree) {
  console.log('compactTree length:', data.compactTree.length);
  console.log('compactTree[0]:', data.compactTree[0]);
  console.log('compactTree[1] (first 3 children):', data.compactTree[1].slice(0, 3));
}
if (data.tree) {
  console.log('tree name:', data.tree.name);
  console.log('tree children:', (data.tree.children || []).map(c => c.name));
}

