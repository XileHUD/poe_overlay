# Changelog

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
