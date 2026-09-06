import { createHash, sign, verify } from 'node:crypto';

export const CATALOG_LIMIT = 262144;
export const PACKAGE_LIMIT = 16777216;
export const RELEASE_ROOT = 'https://github.com/Skillful-Fox-Studio/Fennec-Dictionaries/releases/download/';
const token = /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,63}$/;
const sha = /^[a-f0-9]{64}$/;
export const encode = value => Buffer.from(JSON.stringify(value) + '\n', 'utf8');
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function requireValue(condition, message) { if (!condition) throw new Error(message); }
function text(value, max) { return typeof value === 'string' && value.length > 0 && value.length <= max; }
function integer(value, max) { return Number.isSafeInteger(value) && value > 0 && value <= max; }
function parse(bytes, max) {
  requireValue(bytes.byteLength <= max, 'Size limit exceeded');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
function identity(entry) {
  requireValue(entry && typeof entry === 'object', 'Invalid entry');
  requireValue(text(entry.language, 35) && token.test(entry.language), 'Invalid language');
  requireValue(text(entry.version, 64) && token.test(entry.version), 'Invalid version');
  requireValue(text(entry.name, 100) && text(entry.source, 500) && text(entry.license, 1000), 'Missing metadata');
  requireValue(entry.source.startsWith('https://'), 'Invalid provenance');
  requireValue(entry.engine === 'nspell-2.1.5', 'Unsupported engine');
  requireValue(['latin-v1', 'cyrillic-v1'].includes(entry.tokenizer), 'Unsupported tokenizer');
}
export function assetName(entry) {
  identity(entry);
  return `dictionary-${entry.language}-${entry.version}.json`;
}
export function assetUrl(entry) {
  return `${RELEASE_ROOT}${entry.language}-${entry.version}/${assetName(entry)}`;
}
export function makePackage(recipe, files) {
  identity(recipe);
  for (const name of ['aff', 'dic', 'notice']) {
    const expected = recipe.files[name];
    requireValue(files[name]?.byteLength === expected.bytes && digest(files[name]) === expected.sha256, `Unqualified ${name}`);
  }
  const { language, name, version, engine, tokenizer, source, license } = recipe;
  const metadata = { language, name, version, engine, tokenizer, source, license };
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const bytes = encode({ schemaVersion: 1, ...metadata, files: Object.fromEntries(
    ['aff', 'dic', 'notice'].map(key => [key, decoder.decode(files[key])]),
  ) });
  requireValue(bytes.length <= PACKAGE_LIMIT, 'Package too large');
  const entry = { ...metadata, url: assetUrl(metadata), bytes: bytes.length, sha256: digest(bytes) };
  verifyPackage(bytes, entry);
  return { bytes, entry };
}
export function validateCatalog(catalog) {
  requireValue(catalog?.schemaVersion === 1 && integer(catalog.sequence, Number.MAX_SAFE_INTEGER), 'Invalid catalog version/sequence');
  requireValue(Array.isArray(catalog.dictionaries) && catalog.dictionaries.length <= 100, 'Invalid dictionary list');
  const languages = new Set();
  for (const entry of catalog.dictionaries) {
    identity(entry);
    requireValue(!languages.has(entry.language.toLowerCase()), 'Duplicate language');
    languages.add(entry.language.toLowerCase());
    requireValue(entry.url === assetUrl(entry), 'Untrusted asset URL');
    requireValue(integer(entry.bytes, PACKAGE_LIMIT) && sha.test(entry.sha256), 'Invalid asset integrity metadata');
  }
  return catalog;
}
export function signCatalog(catalog, keyId, privateKey) {
  requireValue(privateKey.asymmetricKeyType === 'ed25519', 'Expected Ed25519 key');
  requireValue(text(keyId, 64) && token.test(keyId), 'Invalid key ID');
  const payload = encode(validateCatalog(catalog));
  requireValue(payload.length <= CATALOG_LIMIT / 2, 'Catalog payload too large');
  return encode({ schemaVersion: 1, keyId, payload: payload.toString('base64'), signature: sign(null, payload, privateKey).toString('base64') });
}
export function verifyCatalog(bytes, trustedKeys, minimumSequence = 0, previousPayloadHash = null) {
  const envelope = parse(bytes, CATALOG_LIMIT);
  requireValue(envelope?.schemaVersion === 1, 'Unsupported envelope');
  const key = trustedKeys.get(envelope.keyId);
  requireValue(key?.asymmetricKeyType === 'ed25519', 'Unknown signing key');
  requireValue(text(envelope.payload, CATALOG_LIMIT) && text(envelope.signature, 88), 'Invalid envelope');
  const payload = Buffer.from(envelope.payload, 'base64');
  const signature = Buffer.from(envelope.signature, 'base64');
  requireValue(signature.length === 64 && verify(null, payload, key, signature), 'Invalid catalog signature');
  const catalog = validateCatalog(parse(payload, CATALOG_LIMIT / 2));
  requireValue(catalog.sequence >= minimumSequence, 'Catalog rollback');
  if (catalog.sequence === minimumSequence && previousPayloadHash !== null) {
    requireValue(digest(payload) === previousPayloadHash, 'Catalog changed without sequence increment');
  }
  return catalog;
}
export function verifyPackage(bytes, entry) {
  validateCatalog({ schemaVersion: 1, sequence: 1, dictionaries: [entry] });
  requireValue(bytes.byteLength === entry.bytes && digest(bytes) === entry.sha256, 'Package integrity failure');
  const pack = parse(bytes, PACKAGE_LIMIT);
  requireValue(pack?.schemaVersion === 1, 'Unsupported package');
  for (const key of ['language', 'name', 'version', 'engine', 'tokenizer', 'source', 'license']) {
    requireValue(pack[key] === entry[key], 'Package identity mismatch');
  }
  requireValue(pack.files && Object.keys(pack.files).sort().join(',') === 'aff,dic,notice', 'Invalid file set');
  for (const name of ['aff', 'dic', 'notice']) {
    requireValue(text(pack.files[name], name === 'notice' ? 262144 : 8388608), `Invalid ${name}`);
    requireValue(!pack.files[name].includes('\0'), 'Invalid dictionary data');
  }
  return pack;
}
