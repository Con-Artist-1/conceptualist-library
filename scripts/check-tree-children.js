import fs from 'fs';

const raw = fs.readFileSync('e:/The Library/search-app/public/meta.json', 'utf8');
const data = JSON.parse(raw);

const pp = data.tree.children.find(c => c.name === 'Past Papers');
console.log('Past Papers children:', pp.children.map(c => ({ name: c.name, childrenCount: c.children?.length })));

const ial = pp.children.find(c => c.name === 'IAL');
console.log('IAL children:', ial.children.map(c => c.name));

