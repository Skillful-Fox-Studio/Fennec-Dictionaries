import { mkdir, readFile } from 'node:fs/promises';
import { createPublicKey } from 'node:crypto';
import { validateCatalog, verifyCatalog, verifyPackage } from './format.mjs';
const catalog = validateCatalog(JSON.parse(await readFile('publication/catalog-input.json', 'utf8')));
const key = createPublicKey(await readFile('trust/public-key.pem'));
let previous;
try { previous = await readFile('catalog/v1.json'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (previous && catalog.sequence <= verifyCatalog(previous, new Map([['fennec-dictionaries-1', key]])).sequence) throw new Error('Sequence must increase');
for (const entry of catalog.dictionaries) {
  const response = await fetch(entry.url, {signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error(`Published package is not accessible: ${entry.language}`);
  let length = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > entry.bytes) throw new Error('Published package exceeds expected size');
    chunks.push(chunk);
  }
  verifyPackage(Buffer.concat(chunks), entry);
}
await mkdir('dist', {recursive:true});
console.log('Catalog and all public packages verified.');
