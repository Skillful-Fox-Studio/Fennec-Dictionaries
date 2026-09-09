import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { assetName, digest, encode, makePackage, signCatalog, verifyCatalog, verifyPackage, validateCatalog, CATALOG_LIMIT } from '../scripts/format.mjs';

// Ephemeral keys only; no production trust key or secret is stored by tests.
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const trust = new Map([['test-only', publicKey]]);
const files = { aff: Buffer.from('SET UTF-8\n'), dic: Buffer.from('1\nкорабль\n'), notice: Buffer.from('Test fixture only.\n') };
const recipe = {
  language: 'ru', name: 'Russian', version: '0.0.0-test', engine: 'nspell-2.1.5', tokenizer: 'cyrillic-v1',
  source: 'https://example.invalid/test-only', license: 'Test fixture',
  files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, { bytes: bytes.length, sha256: digest(bytes) }])),
};
const pack = makePackage(recipe, files);
const catalog = { schemaVersion: 1, sequence: 2, dictionaries: [pack.entry] };

test('package preserves dictionary and full notice bytes and is reproducible', () => {
  assert.deepEqual(makePackage(recipe, files), pack);
  const decoded = verifyPackage(pack.bytes, pack.entry);
  for (const name of Object.keys(files)) assert.deepEqual(Buffer.from(decoded.files[name]), files[name]);
});

test('Hunspell packages retain their engine identity and round trip in a mixed catalog', () => {
  const modern = makePackage({ ...recipe, language: 'de-DE', name: 'German (Germany)', engine: 'hunspell-wasm-0.3.0', tokenizer: 'latin-v1' }, files);
  assert.equal(verifyPackage(modern.bytes, modern.entry).engine, 'hunspell-wasm-0.3.0');
  const mixed = { schemaVersion: 1, sequence: 2, dictionaries: [pack.entry, modern.entry] };
  assert.deepEqual(verifyCatalog(signCatalog(mixed, 'test-only', privateKey), trust), mixed);
  assert.throws(() => verifyPackage(modern.bytes, { ...modern.entry, engine: 'nspell-2.1.5' }), /identity/);
});
test('catalog round trip authenticates before returning entries', () => {
  const signed = signCatalog(catalog, 'test-only', privateKey);
  assert.deepEqual(verifyCatalog(signed, trust, 2), catalog);
});
test('unknown key and altered signature are rejected', () => {
  const signed = signCatalog(catalog, 'test-only', privateKey);
  assert.throws(() => verifyCatalog(signed, new Map()), /Unknown signing key/);
  const bad = JSON.parse(signed);
  bad.signature = Buffer.alloc(64).toString('base64');
  assert.throws(() => verifyCatalog(encode(bad), trust), /signature/);
});
test('modified signed payload and catalog rollback are rejected', () => {
  const signed = signCatalog(catalog, 'test-only', privateKey);
  const bad = JSON.parse(signed);
  bad.payload = encode({ ...catalog, sequence: 3 }).toString('base64');
  assert.throws(() => verifyCatalog(encode(bad), trust), /signature/);
  assert.throws(() => verifyCatalog(signed, trust, 3), /rollback/);
});
test('wrong package bytes or hashes are rejected', () => {
  assert.throws(() => verifyPackage(Buffer.concat([pack.bytes, Buffer.from(' ')]), pack.entry), /integrity/);
  assert.throws(() => verifyPackage(pack.bytes, { ...pack.entry, sha256: '0'.repeat(64) }), /integrity/);
});
test('the same catalog sequence cannot change authenticated payload', () => {
  const signed = signCatalog(catalog, 'test-only', privateKey);
  assert.deepEqual(verifyCatalog(signed, trust, 2, digest(encode(catalog))), catalog);
  assert.throws(() => verifyCatalog(signed, trust, 2, '0'.repeat(64)), /sequence increment/);
});
test('external URLs, duplicates and unsafe language paths are rejected', () => {
  assert.throws(() => validateCatalog({ ...catalog, dictionaries: [{ ...pack.entry, url: 'https://evil.invalid/dict' }] }), /URL/);
  assert.throws(() => validateCatalog({ ...catalog, dictionaries: [pack.entry, pack.entry] }), /Duplicate/);
  assert.throws(() => assetName({ ...recipe, language: '../ru' }), /language/);
});
test('unknown engine or tokenizer and invalid sequence are rejected', () => {
  for (const change of [{ engine: 'unknown' }, { tokenizer: 'unknown' }]) {
    assert.throws(() => validateCatalog({ ...catalog, dictionaries: [{ ...pack.entry, ...change }] }), /Unsupported/);
  }
  assert.throws(() => validateCatalog({ ...catalog, sequence: -1 }), /sequence/);
});
test('oversized catalogs fail before parsing', () => {
  assert.throws(() => verifyCatalog(Buffer.alloc(CATALOG_LIMIT + 1), trust), /Size limit/);
});
test('unknown file sets and metadata mismatch fail even with matching package hash', () => {
  for (const change of [{ name: 'Different' }, { files: { ...JSON.parse(pack.bytes).files, executable: 'not allowed' } }]) {
    const bytes = encode({ ...JSON.parse(pack.bytes), ...change });
    assert.throws(() => verifyPackage(bytes, { ...pack.entry, bytes: bytes.length, sha256: digest(bytes) }), /mismatch|file set/);
  }
});
test('upstream bytes must match reviewed recipe', () => {
  assert.throws(() => makePackage(recipe, { ...files, dic: Buffer.from('modified') }), /Unqualified/);
});
test('RU recipe uses the audited source hashes and full notice', async () => {
  const ru = JSON.parse(await readFile(new URL('../recipes/ru.json', import.meta.url)));
  assert.equal(ru.files.dic.sha256, 'f6047416a0204adbecf3a451b874ec8a97ee37e2cbc714466ef04d8dbcc0d6fc');
  assert.equal(ru.files.notice.sha256, '262af2f6ad70a61e5ee1332ff44fa8ee50edca819cf33207d8ad6ba6a0c9be52');
});

test('FR and IT release recipes pin the accepted Hunspell candidates and complete notices', async () => {
  const fr = JSON.parse(await readFile(new URL('../recipes/fr-FR.json', import.meta.url)));
  const it = JSON.parse(await readFile(new URL('../recipes/it-IT.json', import.meta.url)));
  assert.deepEqual([fr.language,fr.version,fr.engine], ['fr-FR','7.7-fennec.1','hunspell-wasm-0.3.0']);
  assert.equal(fr.archive.sha256, '44314d992f94b4658c31a86ef2351724a43067531b0af3643f91bf0220eee616');
  assert.equal(fr.files.notice.parts.length, 2);
  assert.deepEqual([it.language,it.version,it.engine], ['it-IT','5.1.1-fennec.1','hunspell-wasm-0.3.0']);
  assert.equal(it.files.dic.sha256, 'bae1e3501dcd2a923669592493b3fde6c02aae7c7aab83bf5e5b49077e73dd64');
  assert.equal(it.files.notice.parts.length, 10);
});

test('sequence-2 publication input retains RU and pins the built FR/IT entries', async () => {
  const publication = JSON.parse(await readFile(new URL('../publication/catalog-input.json', import.meta.url)));
  assert.equal(validateCatalog(publication), publication);
  assert.equal(publication.sequence, 2);
  assert.deepEqual(publication.dictionaries.map(entry => entry.language), ['ru','fr-FR','it-IT']);
  const expected = {
    'fr-FR':['7.7-fennec.1',1547452,'1d567681a52043eb0506a2bf9271ddfc785bf554e180b30db6b9729b271be9ac'],
    'it-IT':['5.1.1-fennec.1',1597715,'c4fed67f3e105af351e0683c5631ca1c3ff5aab46ee02425d24558d91f48b75b'],
  };
  for (const entry of publication.dictionaries.slice(1)) assert.deepEqual([entry.version,entry.bytes,entry.sha256], expected[entry.language]);
});
