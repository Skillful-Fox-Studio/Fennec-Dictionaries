import { readFile, writeFile } from 'node:fs/promises';
import { encode, validateCatalog } from './format.mjs';
const [output, sequence, ...entries] = process.argv.slice(2);
if (!output || !sequence || !entries.length) throw new Error('Usage: node scripts/catalog.mjs output.json sequence entry.json [...]');
const dictionaries = await Promise.all(entries.map(async path => JSON.parse(await readFile(path, 'utf8'))));
dictionaries.sort((a, b) => a.language.localeCompare(b.language, 'en'));
const catalog = validateCatalog({ schemaVersion: 1, sequence: Number(sequence), dictionaries });
await writeFile(output, encode(catalog), { flag: 'wx' });
console.log('Unsigned catalog prepared. Include every supported entry, not only the newest language.');
