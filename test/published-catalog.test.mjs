import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPublicKey } from 'node:crypto';
import { verifyCatalog } from '../scripts/format.mjs';

test('committed catalog authenticates with the reviewed production public key', async () => {
  const publicKey = createPublicKey(await readFile(new URL('../trust/public-key.pem', import.meta.url)));
  const bytes = await readFile(new URL('../catalog/v1.json', import.meta.url));
  const catalog = verifyCatalog(bytes, new Map([['fennec-dictionaries-1', publicKey]]), 1);
  assert.ok(catalog.dictionaries.length > 0);
  assert.ok(catalog.dictionaries.some(entry => entry.language === 'ru'));
});
