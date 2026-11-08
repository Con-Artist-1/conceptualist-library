import fs from 'fs';

function inflateCompactTree(compactNode, parentPath = '', isRoot = true) {
  if (!compactNode) return null;
  if (typeof compactNode === 'string') {
    const nodePath = isRoot ? '' : (parentPath ? `${parentPath}/${compactNode}` : compactNode);
    return { name: compactNode, path: nodePath, children: [] };
  }
  if (Array.isArray(compactNode)) {
    const [name, rawChildren] = compactNode;
    const nodePath = isRoot ? '' : (parentPath ? `${parentPath}/${name}` : name);
    const children = (rawChildren || []).map(c => inflateCompactTree(c, nodePath, false));
    return { name, path: nodePath, children };
  }
  return compactNode;
}

const raw = fs.readFileSync('e:/The Library/search-app/public/meta.json', 'utf8');
const data = JSON.parse(raw);

const inflated = inflateCompactTree(data.compactTree);
console.log('Root:', inflated.name, 'path:', inflated.path);
console.log('Top children:', inflated.children.map(c => ({ name: c.name, path: c.path, childrenCount: c.children.length })));

const pp = inflated.children.find(c => c.name === 'Past Papers');
console.log('Past Papers children:', pp.children.map(c => ({ name: c.name, path: c.path, childrenCount: c.children.length })));

const ial = pp.children.find(c => c.name === 'IAL');
console.log('IAL children count:', ial.children.length);
console.log('IAL children sample:', ial.children.slice(0, 5).map(c => ({ name: c.name, path: c.path, childrenCount: c.children.length })));

