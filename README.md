# Fennec Dictionaries

Spelling dictionaries for Fennec.

Dictionary packages are available in [Releases](https://github.com/Skillful-Fox-Studio/Fennec-Dictionaries/releases). Each package includes dictionary data and its upstream license notices.

The repository tooling is MIT-licensed. Dictionary data retains its respective upstream licenses.

Release recipes are hash-pinned and produce packages locally without signing or
uploading. Current recipes cover Russian, German (Germany), French (France,
classic orthography), Spanish (Spain) and Italian (Italy). European packs use
Hunspell/WASM 0.3.0. Each built package carries complete upstream attribution
and license material; German and Spanish releases also retain their exact
upstream source archives.

Catalog sequence 2 is production-signed and independently verified. It retains
the existing Russian entry and adds the published FR 7.7 Classic and IT 5.1.1
packages. The signed bytes in `catalog/v1.json` are never edited by hand.
