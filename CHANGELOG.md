# Changelog

## 0.1.0 (2025-10-06)

### Bug Fixes
- Fixed login window triggering multiple Cloudflare challenges by removing API probes from window events
- Login window now only checks cookie presence on close instead of probing trade API repeatedly
- Fixed case-sensitive URL encoding in image resolver (dual-key indexing for both original and lowercase URLs)
- Added `currency-img` class to liquid emotion images for proper auto-resolution
- Simplified session state to binary logged-in check, removing infinite polling loops
- Fixed poedb image blocking while preserving official PoE CDN access for merchant history

### Technical Improvements
- Removed recursive setTimeout calls in session UI updates
- Streamlined login flow to prevent multiple browser windows opening
- Enhanced image resolution with fallback mechanism for case-mismatched URLs

---

## 0.0.1-beta (2025-09-27)

First public beta of XileHUD Overlay.

### Highlights
- Portable single-file Windows build (no installer). Just run the EXE.
- Embedded PoE2 modifier database (JSON shipped inside resources/data/poe2).
- Real-time clipboard parsing: copy an item in-game to display modifier breakdown.
- Overlay window with always-on-top behavior and tray icon.
- System tray menu for quick show/hide and exit.
- Data path fallback so packaged app reads bundled JSON without manual setup.

### Data Included
- Static modifier / item JSON snapshot from data/poe2 at build time.

### Known Limitations
- Windows only (x64) for this beta.
- No auto-update channel configured yet (manual download required).
- Unsigned executable (may trigger SmartScreen on first run).
- Limited error handling if clipboard parsing fails.

### Next Up (Planned)
- Auto-updater & signed builds.
- Settings UI (toggling features, position, opacity).
- Incremental data updates (dynamic refresh without full rebuild).
- Additional in-game context detection.

---

If you encounter issues, please open an issue with logs (run from console to capture output). Enjoy the beta!
