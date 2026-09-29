// Tanımsız öğeleri sıklığa göre listeler (külliyat yazarken yardımcı).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLibrary } from './build.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { report } = buildLibrary(path.join(root, 'data'));
const count = new Map();
for (const e of report.errors) {
  const m = e.match(/tanımsız öğe → "([^"]+)"/);
  if (m) count.set(m[1], (count.get(m[1]) || 0) + 1);
}
const list = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'));
console.log(`${list.length} tanımsız öğe:`);
console.log(list.map(([n, c]) => `${n}(${c})`).join(', '));
const other = report.errors.filter(e => !e.includes('tanımsız öğe'));
if (other.length) { console.log(`\nDiğer hatalar (${other.length}):`); for (const e of other.slice(0, 80)) console.log('  ' + e); }
