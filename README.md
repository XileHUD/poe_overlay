# XileHUD

An in-game modifier lookup and crafting companion for PoE2.

Highlights:
- JSON-only data source (no DB required)
- Safe local storage under Electron userData (keeps private data out of git)
- Merchant history viewer with rate-limit aware refresh and fallbacks

## Development
- `npm install`
- `npm run dev` to start main (tsx) and renderer (vite)

## Build
- `npm run build` then `npm run dist` (electron-builder)
- Produces a portable .exe in `dist_electron/`

## Data updates
The app loads JSONs from a data directory. Defaults:
1. Env `XILEHUD_DATA_DIR` if set
2. Saved config at `%APPDATA%/XileHUD/overlay/overlay-config.json`
3. Repo `data/poe2/Rise of the Abyssal` if present (dev)
4. Fallback `%APPDATA%/XileHUD/overlay/poe2`

The renderer can call `electronAPI.setDataDir(path)` and `electronAPI.reloadData()` to switch or refresh at runtime.

## Privacy
- No browser session or history is committed. Local files are written to `%APPDATA%/XileHUD/overlay`.
- `.gitignore` excludes build artifacts and any top-level `data/` or `cache/` from parent.

## Releases (minimal portable)
Use electron-builder `portable` target. Attach the `.exe` to GitHub Releases. Optionally also attach a `data.zip` containing latest JSONs so users can drop them into `%APPDATA%/XileHUD/overlay/poe2`.
