import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPublicKey } from 'node:crypto';
import { verifyCatalog } from '../scripts/format.mjs';

test('committed catalog authenticates with the reviewed production public key', async () => {
  const publicKey = createPublicKey(await readFile(new URL('../trust/public-key.pem', import.meta.url)));
  const bytes = await readFile(new URL('../catalog/v1.json', import.meta.url));
  const catalog = verifyCatalog(bytes, new Map([['fennec-dictionaries-1', publicKey]]), 2);
  assert.deepEqual(catalog.dictionaries.map(entry => entry.language), ['ru','fr-FR','it-IT']);
  assert.equal(catalog.dictionaries.find(entry => entry.language === 'fr-FR').sha256, '1d567681a52043eb0506a2bf9271ddfc785bf554e180b30db6b9729b271be9ac');
  assert.equal(catalog.dictionaries.find(entry => entry.language === 'it-IT').sha256, 'c4fed67f3e105af351e0683c5631ca1c3ff5aab46ee02425d24558d91f48b75b');
});
