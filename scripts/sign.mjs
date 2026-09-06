import { readFile, writeFile } from 'node:fs/promises';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { signCatalog, verifyCatalog } from './format.mjs';

const [input, output, keyId] = process.argv.slice(2);
const path = process.env.FENNEC_DICTIONARY_SIGNING_KEY_FILE;
const secret = process.env.FENNEC_DICTIONARY_SIGNING_KEY;
delete process.env.FENNEC_DICTIONARY_SIGNING_KEY;
if (!input || !output || !keyId || (!path && !secret) || (path && secret)) throw new Error('Supply exactly one signing source: external key path or environment secret');
const key = createPrivateKey(secret ?? await readFile(path));
const trusted = createPublicKey(await readFile('trust/public-key.pem'));
if (!createPublicKey(key).export({type:'spki',format:'der'}).equals(trusted.export({type:'spki',format:'der'}))) throw new Error('Signing key differs from reviewed public key');
const bytes = signCatalog(JSON.parse(await readFile(input, 'utf8')), keyId, key);
verifyCatalog(bytes, new Map([[keyId, trusted]]));
// Never overwrite an already signed artifact, and never print private material.
await writeFile(output, bytes, { flag: 'wx' });
console.log('Signed catalog created locally. Nothing was uploaded.');
