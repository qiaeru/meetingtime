import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const en = JSON.parse(fs.readFileSync(path.join(root, 'client/src/i18n/locales/en.json'), 'utf8'));
const keys = Object.keys(en);

const srcRoot = path.join(root, 'client/src');
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'locales' || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|js|html)$/.test(e.name)) files.push(p);
  }
})(srcRoot);
const all = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
const unused = keys.filter(k => !all.includes('"' + k + '"') && !all.includes("'" + k + "'") && !all.includes('`' + k + '`'));
console.log('UNUSED KEYS:');
unused.forEach(k => console.log(' -', k));
