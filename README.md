# Fennec-Dictionaries

Independent, data-only spelling dictionaries for Fennec. This repository is a publication source, not an application extension or a model registry.

Status: publication tooling and the initial RU catalog are prepared. The owner generated the production key and configured the protected GitHub Environment Secret; only the public key belongs in this repository. No signed catalog or dictionary release is published yet. The current Fennec app still uses the accepted Slice 87 installer. Catalog integration is Slice 88 and is not delivered by creating this repository.

## Product contract

- en-US remains bundled with Fennec and does not require this service at runtime.
- Optional packs accumulate in the author's installed set. Installing one does not replace another or change the current document's language.
- Installed dictionaries work offline and can be switched without downloading again. Only the active dictionary occupies worker memory.
- The app fetches a catalog when the author opens Add language or requests refresh; downloads require explicit selection. Server failure does not block writing.
- A compatible new data pack can be discovered without an application update. A new engine requirement or unsupported tokenizer requires application work first.
- Confirmed release baseline: bundled en-US plus optionally installed RU, DE, FR, ES and IT. RU is the first qualified optional language; DE/FR/ES/IT are required release-preparation work after the initial RU catalog integration, but are not yet qualified or available. Each needs license, engine/tokenization, basic-correction and memory checks before publication. Spanish uses `es`, not `sp`; identify supported regional variants during qualification. Spelling language is not application UI localization.

## Repository contents

- `recipes/`: reviewed upstream versions, exact file sizes and hashes.
- `scripts/`: build, catalog validation, Ed25519 signing and package verification using Node built-ins only.
- `test/`: offline tests using ephemeral test keys, never production keys.
- `dist/`: ignored local build outputs; publish packages as persistent Release assets, never as CI artifacts.
- `catalog/v1.json`: reserved path for the first reviewed signed catalog; it does not exist until publication is ready.

Requires Node 22 or newer. No npm dependencies or package installation are needed.

```powershell
npm test
npm run build:ru
node scripts/catalog.mjs dist/catalog-input.json 1 dist/ru-3.0.0-fennec.1/entry.json
```

Build downloads the three pinned upstream files only on explicit maintainer invocation, validates their sizes and hashes, preserves their UTF-8 contents and full notice, and emits one deterministic JSON package. The deployed application must use our release assets, not the recipe's upstream URLs.

## Catalog and package contract v1

The catalog is a single JSON envelope: `schemaVersion`, `keyId`, base64 `payload`, and base64 Ed25519 `signature`. Sign the exact decoded payload bytes, not reserialized JSON. The trusted public key comes from Fennec, never from the downloaded envelope. Publish the entire envelope atomically as one file.

The authenticated payload contains `schemaVersion: 1`, a monotonically increasing positive integer `sequence`, and `dictionaries`. Each entry contains language, display name, package version, engine, tokenizer, source provenance, license summary, immutable asset URL, exact byte count and SHA-256. First-generation consumers accept `nspell-2.1.5` with `latin-v1`/`cyrillic-v1` only. Additional compatible languages use the same fields, not executable scripts.

Each package is UTF-8 JSON with the same identity metadata, `schemaVersion: 1`, and exactly three fixed file strings: `aff`, `dic`, `notice`. There are no archive paths, arbitrary file destinations or executables. Preserve complete upstream notices, including special modification and attribution clauses. Project words do not modify these assets.

Bounds: 256 KiB signed envelope, 128 KiB decoded payload, 100 dictionary entries, 16 MiB package. Validate signature before consuming metadata, package size/hash before decoding, then identity/format/file set. The runtime must bound network bodies while streaming, install through a staging directory, retain the previous working pack on failure and never activate a partial download. Unknown engine/tokenizer entries are unavailable to older apps, not invitations to execute code. Maintainer tooling here intentionally rejects unknown compatibility profiles until qualified.

For cached catalogs, reject lower sequences; at equal sequence require the same authenticated payload hash. Persist the highest accepted sequence and payload hash. A fresh client can still receive an older valid signed catalog: v1 does not claim complete freeze-attack protection or absolute server availability. Keep previous verified local state for offline operation.

## Publication and trust bootstrap

1. Review the language's full license, upstream provenance, morphology, expected typos, tokenization and worker footprint. Only commercially compatible no-cost open-source data passes the gate.
2. Build and test. Back up the exact package and notice independently of GitHub.
3. Publish the package under the exact tag and asset name in its generated `entry.json`, preferably using an immutable Release. Never replace bytes at an existing version URL. Confirm the public download matches the recorded size and hash before exposing it in a catalog.
4. Compose the complete catalog (not just newly added entries); increase its sequence for every change.
6. Commit the reviewed complete unsigned catalog as `publication/catalog-input.json`. The manual `Sign reviewed dictionary catalog` workflow validates public package assets, signs using the environment secret and places the signed envelope in a draft Release. This does not automatically deploy it. The public key must already be reviewed at `trust/public-key.pem`; no test-key fallback exists.
7. Publish the reviewed envelope at `catalog/v1.json` in a separate commit after the assets are reachable. The app's prospective endpoint is `https://raw.githubusercontent.com/Skillful-Fox-Studio/Fennec-Dictionaries/main/catalog/v1.json`.

The owner approved GitHub Environment Secret for signing and an encrypted Drive backup for recovery. The workflow is prepared locally but not deployed or run. Environment protection, production key generation/import, backup upload and application trust-key integration still require setup. Key rotation requires a separately reviewed trust transition; no token or paid service is needed by end users.

GitHub can be unavailable. Maintain offline package backups and do not delete supported published assets. Fennec must cache the verified catalog and preserve installed dictionaries independently of hosting availability.

## License boundary

The MIT license in this repository applies to our tooling and documentation only. Each dictionary retains its own complete upstream license, included in its package and as an adjacent `UPSTREAM-LICENSE.txt` build output. Do not label third-party dictionary data as MIT merely because the tooling is MIT.
