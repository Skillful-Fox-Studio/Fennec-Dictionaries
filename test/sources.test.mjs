import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleNotice, decodeNoticePart, extractZipMembers, releaseAssetName } from '../scripts/sources.mjs';

function storedZip(name, contents) {
  const filename = Buffer.from(name);
  const bytes = Buffer.from(contents);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
  local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(filename.length, 28);
  const directory = Buffer.concat([central, filename]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(directory.length, 12); eocd.writeUInt32LE(local.length + filename.length + bytes.length, 16);
  return Buffer.concat([local, filename, bytes, directory, eocd]);
}

test('extracts only explicitly requested bounded ZIP members', () => {
  const archive = storedZip('dictionary.aff', 'SET UTF-8\n');
  assert.equal(extractZipMembers(archive, new Set(['dictionary.aff'])).get('dictionary.aff').toString(), 'SET UTF-8\n');
  assert.throws(() => extractZipMembers(archive, new Set(['dictionary.dic'])), /Missing ZIP member/);
  assert.throws(() => extractZipMembers(Buffer.alloc(22), new Set()), /ZIP/);
});

test('assembles labeled notice parts deterministically', () => {
  const notice = assembleNotice([{ label:'README.txt', bytes:Buffer.from('Attribution') }, { label:'LICENSE.txt', bytes:Buffer.from('Terms\n') }]);
  assert.equal(notice.toString(), '===== README.txt =====\nAttribution\n\n===== LICENSE.txt =====\nTerms\n\n');
  assert.throws(() => assembleNotice([{ label:'../bad\nname', bytes:Buffer.from('x') }]), /label/);
});

test('transcodes declared ISO-8859-1 notices and rejects undeclared invalid UTF-8', () => {
  assert.equal(decodeNoticePart(Buffer.from([0x63,0x69,0x74,0x74,0xe0]), 'iso-8859-1').toString(), 'città');
  assert.throws(() => decodeNoticePart(Buffer.from([0xe0])), /encoded data/);
  assert.throws(() => decodeNoticePart(Buffer.from('x'), 'unknown'), /encoding/);
});

test('accepts flat release asset names and rejects paths', () => {
  assert.equal(releaseAssetName('UPSTREAM-SOURCE.tar.bz2'), 'UPSTREAM-SOURCE.tar.bz2');
  assert.throws(() => releaseAssetName('../source.zip'), /asset name/);
  assert.throws(() => releaseAssetName('folder/source.zip'), /asset name/);
});
