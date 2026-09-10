import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assetName, makePackage, encode } from './format.mjs';
import { loadRecipeFiles } from './sources.mjs';

const recipe = JSON.parse(await readFile(process.argv[2] ?? 'recipes/ru.json', 'utf8'));
// Network access is an explicit maintainer build action, never an app startup step.
const files = await loadRecipeFiles(recipe);
const { bytes, entry } = makePackage(recipe, files);
const directory = resolve('dist', `${entry.language}-${entry.version}`);
await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, assetName(entry)), bytes);
await writeFile(resolve(directory, 'entry.json'), encode(entry));
await writeFile(resolve(directory, 'UPSTREAM-LICENSE.txt'), files.notice);
for (const asset of files.releaseAssets) await writeFile(resolve(directory, asset.name), asset.bytes);
console.log(`${assetName(entry)}: ${bytes.length} bytes, SHA-256 ${entry.sha256}`);
console.log('Built locally only. Nothing was signed or published.');
