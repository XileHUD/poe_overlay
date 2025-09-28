<div align="center">

# XileHUD (Beta)

<strong>Low-latency local PoE2 overlay + modifier intelligence. Copy an item → structured breakdown, tiers, fractured / desecrated emphasis, sockets & runes.</strong><br/>
<a href="https://github.com/XileHUD/poe_overlay/releases/latest">⬇ Download Latest Release</a><br/>
<sub>Windows x64 • Portable EXE • Local-first • No telemetry</sub>

<br />
<strong>PoE1 version:</strong> Planned (target: before the late-October league) – data layer reusable; adapter work pending.

</div>

---

## Why it exists
Built as a personal efficiency tool (speed-check fractured value, identify chase tiers, preserve merchant sale history) – released because others asked for the same data clarity without remote round‑trips.

---

## ✨ Key Features
1. Instant Item Parsing (clipboard driven: copy → overlay updates)
2. Tier Inference Engine (aggregates combined stats; hides tiers on uniques to reduce noise)
3. Fractured & Desecrated Highlighting (prioritized ordering at top)
4. Sockets + Rune Visualization inline
5. Merchant History (local archive, fast filters: timeframe, class, fractured/desecrated, runes, search)
6. Smart Clipboard (only active when needed; no constant global polling spam)
7. Local Modifier Dataset (bundled JSON; optional external override)
8. Offline Operation (no network calls for core flows)
9. Future Helpers: crafting currency guidance, regex builder expansion, PoE1 parity
10. Hotkey Toggle (`Ctrl+Q` planned; current builds rely on window focus + copy trigger)

---

## 🚀 Quick Start (End Users)
1. Download portable EXE from Releases.
2. Run it (unsigned: use “More info → Run anyway”).
3. Launch PoE2 (windowed/borderless recommended).
4. Copy an item in inventory (`Ctrl+C`).
5. Overlay panel populates automatically.

Tray:
- Hide/restore from system tray icon.
- Quit via tray menu or window close.

Data Override Priority:
| Priority | Mechanism | Purpose |
|----------|-----------|---------|
| 1 | `XILEHUD_DATA_DIR` env var | Point to custom JSON set |
| 2 | `%APPDATA%/XileHUD/overlay/overlay-config.json` | User-configurable path |
| 3 | Bundled resources | Default packaged dataset |

---

## � Privacy
| Action | Network? | Notes |
|--------|----------|-------|
| Item parse | ❌ | Pure local processing |
| Tier lookup | ❌ | JSON / in-memory only |
| Merchant logging | ❌ | Local SQLite/JSON (export manual) |
| Telemetry | ❌ | None implemented |
| Auth | ❌ | Not used in current beta |

---

## 🧪 Tier Logic (Summary)
1. Extract extended hash groups (explicit/fractured/desecrated)
2. Aggregate magnitudes for merged multi-roll lines
3. Map magnitude ranges to scraped tier intervals
4. Prefer fractured context (locked) > generic explicit potential
5. Suppress tiers for uniques

Remaining edge cases are logged locally for heuristic refinement (e.g. near-boundary dual partial rolls).

---

## ⚠️ Current Limitations
| Area | State |
|------|-------|
| Code signing | Not yet (SmartScreen warning) |
| Auto-update | Manual download per release |
| Settings UI | Pending (hotkeys, layout persistence) |
| PoE1 Support | Not shipped yet |
| Data refresh | Requires new release (diff patcher planned) |

---

## 🗺️ Roadmap (Short / Mid)
- Code signing & incremental updater
- Configurable hotkeys + overlay profiles
- Live modifier diff ingestion (no full repackage)
- Crafting recipe helper / shareable templates
- Regex tool expansion (influence sets, rune families, atlas passive groups)
- Spectre database (minion archetype surfacing)
- PoE1 adapter layer
- Lightweight local price memory (no external API spam)

Exploratory: craft simulation sandbox; passive tree diff preview if stable model emerges.

---

## 🐞 Reporting Issues
Please include:
1. App version (filename)
2. Steps to reproduce
3. Item text (if tier mismatch) + expected reference (e.g. PoE2DB link)
4. Optional terminal output (run EXE from PowerShell)

Create issues: https://github.com/XileHUD/poe_overlay/issues

---

## 🛠 Build From Source
Prereqs: Node 18+, Git, Windows (for portable target)

```powershell
git clone https://github.com/XileHUD/poe_overlay.git
cd poe_overlay\packages\overlay
npm install
npm run dev
```

Production (unsigned portable):
```powershell
npm run dist:unsigned
```
Output: `dist_electron/XileHUD-<version>-portable.exe`

Just JS bundles:
```powershell
npm run build
```

Packaging notes:
- Uses electron-builder (portable target)
- Data falls back to `process.resourcesPath/data/poe2`

---

## 🙌 Contributing
Open to PRs now (no “wait until stable” gate). Helpful areas:
- Tier aggregation edge cases
- Performance profiling (clipboard loop / render diff)
- Additional item context panels

Flow:
1. Fork & branch
2. Fresh `npm install`
3. Run dev overlay, reproduce intended change
4. Commit w/ clear conventional message (feat:, fix:, chore:, docs:)
5. Open PR with before/after rationale & screenshots if UI

---

## 📜 License
[MIT](./LICENSE) – Not affiliated with or endorsed by Grinding Gear Games.

### Credits / Acknowledgements
- Grinding Gear Games (game + data; all trademarks belong to GGG)
- Community data sources (PoE2DB, POE2.RE, POEDB) for cross-reference validation
- OmegaK2, brather1ng, Chriskang – historical tooling & parsing inspiration

---

Built with focus, caffeine, and far too many test items.
