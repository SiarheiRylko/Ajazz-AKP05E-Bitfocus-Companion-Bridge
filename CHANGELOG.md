# Changelog

All notable changes to this project will be documented in this file.

## [v1.0.1] - 2026-05-20
### Added
- CHANGELOG.md
- scripts/release.sh (simple release packager)

### Changed
- No functional changes to plugin/index.js (quiet build remains).

## [v1.0.0] - 2026-05-20
### Added
- Initial quiet build of the bridge:
  - Pixel‑perfect Companion design mirroring (144×144 bitmap)
  - Content‑based bitmap cache + instant restore on `willAppear`
  - Function‑button paging: hold 0/4 + rotate encoder 3/3 → Next/Prev
  - VERBOSE=false by default, performance tweaks
