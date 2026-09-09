import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

const SOURCE_LIMIT = 16 * 1024 * 1024;
const shaPattern = /^[a-f0-9]{64}$/;

function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function checked(bytes, source, label) {
  if (!Number.isSafeInteger(source?.bytes) || source.bytes < 1 || source.bytes > SOURCE_LIMIT
      || !shaPattern.test(source.sha256)) throw new Error(`Invalid source metadata: ${label}`);
  if (bytes.length !== source.bytes || digest(bytes) !== source.sha256) throw new Error(`Unqualified source: ${label}`);
  return bytes;
}

async function download(source, label) {
  if (typeof source.url !== 'string' || !source.url.startsWith('https://')) throw new Error(`Invalid source URL: ${label}`);
  const response = await fetch(source.url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Download failed: ${label} (${response.status})`);
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > source.bytes) throw new Error(`Oversize source: ${label}`);
    chunks.push(chunk);
  }
  return checked(Buffer.concat(chunks), source, label);
}

export function extractZipMembers(archive, requested) {
  const minimum = Math.max(0, archive.length - 65557);
  let eocd = -1;
  for (let offset = archive.length - 22; offset >= minimum; offset--) {
    if (archive.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0 || archive.readUInt16LE(eocd + 4) !== 0 || archive.readUInt16LE(eocd + 6) !== 0) throw new Error('Unsupported ZIP archive');
  const count = archive.readUInt16LE(eocd + 10);
  const centralSize = archive.readUInt32LE(eocd + 12);
  const centralOffset = archive.readUInt32LE(eocd + 16);
  if (count === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff
      || centralOffset + centralSize > eocd) throw new Error('Unsupported ZIP archive');
  const found = new Map();
  let cursor = centralOffset;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > archive.length || archive.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP directory');
    const flags = archive.readUInt16LE(cursor + 8);
    const method = archive.readUInt16LE(cursor + 10);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const size = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const end = cursor + 46 + nameLength + extraLength + commentLength;
    if (end > archive.length || flags & 1 || ![0, 8].includes(method) || size > SOURCE_LIMIT) throw new Error('Unsupported ZIP member');
    const name = new TextDecoder('utf-8', { fatal: true }).decode(archive.subarray(cursor + 46, cursor + 46 + nameLength));
    if (requested.has(name)) {
      if (found.has(name) || localOffset + 30 > archive.length || archive.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Invalid ZIP member');
      const localNameLength = archive.readUInt16LE(localOffset + 26);
      const localExtraLength = archive.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      if (start + compressedSize > archive.length) throw new Error('Invalid ZIP member bounds');
      const compressed = archive.subarray(start, start + compressedSize);
      const bytes = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: size });
      if (bytes.length !== size) throw new Error('Invalid ZIP member size');
      found.set(name, bytes);
    }
    cursor = end;
  }
  for (const name of requested) if (!found.has(name)) throw new Error(`Missing ZIP member: ${name}`);
  return found;
}

export function assembleNotice(parts) {
  const chunks = [];
  for (const { label, bytes } of parts) {
    if (typeof label !== 'string' || !/^[A-Za-z0-9._/-]{1,120}$/.test(label)) throw new Error('Invalid notice label');
    chunks.push(Buffer.from(`===== ${label} =====\n`, 'utf8'), bytes);
    if (bytes.at(-1) !== 0x0a) chunks.push(Buffer.from('\n'));
    chunks.push(Buffer.from('\n'));
  }
  return Buffer.concat(chunks);
}

export function decodeNoticePart(bytes, encoding = 'utf-8') {
  if (encoding === 'utf-8') {
    new TextDecoder('utf-8', { fatal:true }).decode(bytes);
    return bytes;
  }
  if (encoding === 'iso-8859-1') return Buffer.from(bytes.toString('latin1'), 'utf8');
  throw new Error('Unsupported notice encoding');
}

export async function loadRecipeFiles(recipe) {
  let members = new Map();
  if (recipe.archive) {
    const names = new Set(['aff', 'dic'].map(name => recipe.files[name]?.member).filter(Boolean));
    for (const part of recipe.files.notice?.parts ?? []) if (part.member) names.add(part.member);
    members = extractZipMembers(await download(recipe.archive, 'archive'), names);
  }
  const resolve = async (source, label) => {
    const bytes = source.member ? members.get(source.member) : await download(source, label);
    if (!bytes) throw new Error(`Missing source: ${label}`);
    return checked(bytes, source, label);
  };
  const files = {};
  for (const name of ['aff', 'dic']) files[name] = await resolve(recipe.files[name], name);
  if (Array.isArray(recipe.files.notice.parts)) {
    const parts = [];
    for (const [index, source] of recipe.files.notice.parts.entries()) parts.push({
      label:source.label,
      bytes:decodeNoticePart(await resolve(source, `notice part ${index + 1}`), source.encoding),
    });
    files.notice = checked(assembleNotice(parts), recipe.files.notice, 'notice');
  } else {
    files.notice = await resolve(recipe.files.notice, 'notice');
  }
  return files;
}
