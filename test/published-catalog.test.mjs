import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPublicKey } from 'node:crypto';
import { verifyCatalog } from '../scripts/format.mjs';

test('committed catalog authenticates with the reviewed production public key', async () => {
  const publicKey = createPublicKey(await readFile(new URL('../trust/public-key.pem', import.meta.url)));
  const bytes = await readFile(new URL('../catalog/v1.json', import.meta.url));
  const catalog = verifyCatalog(bytes, new Map([['fennec-dictionaries-1', publicKey]]), 3);
  assert.deepEqual(catalog.dictionaries.map(entry => entry.language), ['ru','de-DE','fr-FR','es-ES','it-IT']);
  assert.equal(catalog.dictionaries.find(entry => entry.language === 'de-DE').sha256, 'ae417fdd594e9200bf0aa4b5c812b0150ed53ee968041bf4a99d21ffa089be9d');
  assert.equal(catalog.dictionaries.find(entry => entry.language === 'fr-FR').sha256, '1d567681a52043eb0506a2bf9271ddfc785bf554e180b30db6b9729b271be9ac');
  assert.equal(catalog.dictionaries.find(entry => entry.language === 'es-ES').sha256, '42b15070fb8f2e7f7bbc8300a397fa988188add2edd9d3cb07a454c2cda0c7ba');
  assert.equal(catalog.dictionaries.find(entry => entry.language === 'it-IT').sha256, 'c4fed67f3e105af351e0683c5631ca1c3ff5aab46ee02425d24558d91f48b75b');
});
