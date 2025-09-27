<div align="center">
	<h1>XileHUD (Beta)</h1>
	<p><strong>Lightweight PoE2 item & modifier overlay – copy an item, see the data instantly.</strong></p>
	<p>
		<a href="https://github.com/XileHUD/poe_overlay/releases/latest">Download Latest Release</a>
	</p>
	<sub>First public beta • Windows x64 • Portable executable</sub>
</div>

---

## ✨ What is XileHUD?
XileHUD is a small always-on-top overlay for Path of Exile 2 that lets you:

* Copy an in‑game item (Ctrl+C) and instantly view structured modifier breakdowns.
* Inspect implicit / explicit / crafted sections using a local JSON database (bundled).
* Keep the game focused – overlay stays out of the way and can be toggled quickly.
* Run entirely offline (no remote API calls for core parsing).

> Screenshots will be added soon.

---

## 🚀 Quick Start (End Users)
1. Head to: https://github.com/XileHUD/poe_overlay/releases/latest
2. Download the portable executable: `XileHUD-<version>-portable.exe`
3. Place it anywhere (e.g. a tools folder) and run it.
4. (SmartScreen) If Windows warns about an unknown publisher: click "More info" → "Run anyway" (unsigned beta).
5. Launch PoE2, copy an item in your inventory (`Ctrl+C`) – the overlay should populate.

### Tray & Window
* The overlay can be hidden/restored from the system tray icon.
* Close from tray menu or via standard window controls.

### Data Files
The shipped executable already includes a JSON snapshot under `resources/data/poe2` (inside the packaged app). You normally do **not** need to download anything else.

Optional overrides (advanced users):
| Priority | Source | How |
|----------|--------|-----|
| 1 | Env var | Set `XILEHUD_DATA_DIR` to a folder containing the JSON set |
| 2 | User config | `%APPDATA%/XileHUD/overlay/overlay-config.json` pointing to a directory |
| 3 | Packaged bundle | Built-in `resources/data/poe2` (default) |

---

## 📂 What’s Included in the Beta?
* Portable single-file build (no installer, no registry keys)
* Local modifier / item classification JSONs
* Clipboard-driven parsing loop
* System tray control (show/hide/quit)

---

## 🔒 Privacy & Safety
* No network calls for core functionality.
* No telemetry, tracking or account auth.
* Writes user-specific config + caches to: `%APPDATA%/XileHUD/overlay`.

---

## ⚠️ Known Beta Limitations
| Area | Status |
|------|--------|
| Signing | Executable is **unsigned** (SmartScreen warning) |
| Platform | Windows x64 only |
| Updates | No auto-updater yet (manual redownload) |
| Settings UI | Not implemented (positioning + toggles coming) |
| Data Refresh | Requires new release for updated JSON (hot reload planned) |

---

## 🧭 Roadmap (Short Term)
* Code signing + incremental auto-updates
* Settings / preferences surface
* Overlay positioning & opacity controls
* Live modifier DB refresh (diff / patch model)
* Additional parsing enrichment & error reporting

---

## 🐞 Reporting Issues
Please include:
1. App version (see filename or upcoming About dialog)
2. Steps (item copied? crash? nothing displayed?)
3. If possible: run from terminal (`PowerShell > .\XileHUD-...-portable.exe`) and paste console output.

Create issues here: https://github.com/XileHUD/poe_overlay/issues

---

## 🛠 Building From Source (Developers)
> Only needed if you want to modify or contribute. End users can skip this section.

Prerequisites: Node 18+ (LTS recommended), Git, Windows (for the portable target).

Install & Run (dev mode):
```powershell
git clone https://github.com/XileHUD/poe_overlay.git
cd poe_overlay\packages\overlay
npm install
npm run dev
```
This starts:
* Main process via `tsx` in watch mode
* Renderer via Vite dev server

Production build:
```powershell
npm run dist:unsigned
```
Output: `dist_electron/XileHUD-<version>-portable.exe`

If you just want the prepackaged main+renderer JS (no EXE):
```powershell
npm run build
```

### Packaging Notes
* We use `electron-builder` with the `portable` target.
* Only `dist/**` and `xile512.ico` are bundled plus JSON via `extraFiles`.
* Data resolution logic falls back to `process.resourcesPath/data/poe2` when packaged.

---

## 📜 License
MIT © XileHUD

---

## 🙌 Contributing
PRs welcome once the API stabilizes. Beta focus is stability & data correctness. Feel free to open issues with ideas.

---

Enjoy the beta – feedback helps shape the next milestones.
