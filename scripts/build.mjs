import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assetName, makePackage, encode } from './format.mjs';

const recipe = JSON.parse(await readFile(process.argv[2] ?? 'recipes/ru.json', 'utf8'));
const files = {};
for (const name of ['aff', 'dic', 'notice']) {
  const source = recipe.files[name];
  if (!Number.isSafeInteger(source.bytes) || source.bytes < 1 || source.bytes > 8388608) throw new Error('Invalid source size');
  // Network access is an explicit maintainer build action, never an app startup step.
  const response = await fetch(source.url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Download failed: ${name} (${response.status})`);
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > source.bytes) throw new Error(`Oversize source: ${name}`);
    chunks.push(chunk);
  }
  files[name] = Buffer.concat(chunks);
}
const { bytes, entry } = makePackage(recipe, files);
const directory = resolve('dist', `${entry.language}-${entry.version}`);
await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, assetName(entry)), bytes);
await writeFile(resolve(directory, 'entry.json'), encode(entry));
await writeFile(resolve(directory, 'UPSTREAM-LICENSE.txt'), files.notice);
console.log(`${assetName(entry)}: ${bytes.length} bytes, SHA-256 ${entry.sha256}`);
console.log('Built locally only. Nothing was signed or published.');
