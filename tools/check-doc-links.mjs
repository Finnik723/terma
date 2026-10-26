import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { root } from './runtime.mjs';

function markdown(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? markdown(join(directory, entry.name))
      : entry.name.endsWith('.md') ? [join(directory, entry.name)] : []);
}
const files = ['README.md', 'AGENTS.md'].map(file => join(root, file))
  .concat(markdown(join(root, 'docs')), markdown(join(root, 'contracts')));
let checked = 0;
const failures = [];
for (const file of files) {
  const content = readFileSync(file, 'utf8').replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
  for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    checked++;
    if (!existsSync(resolve(dirname(file), decodeURIComponent(target.split('#')[0])))) failures.push(`${file}: ${target}`);
  }
}
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`Documentation links: ${checked} checked, no missing local targets.`);
