<div align="center">

<h1>XileHUD (Beta)</h1>

Lightweight PoE2 item & modifier overlay – copy an item, see the data instantly.<br/>
<a href="https://github.com/XileHUD/poe_overlay/releases/latest">⬇ Download the Latest Release</a><br/>
<sub>Windows x64 • Portable • Local-First • Privacy Focused</sub>

<br />

<strong>PoE1 Version:</strong> Currently in development, with a planned release before the new league at the end of October.

</div>

---

## What is XileHUD?

I initially created this HUD for my personal use. As a self-employed trader, I spend a lot of time on the PC, and Path of Exile is the perfect game for that. I've been coding as a hobby for some years now, mainly building tools that help me get things done faster. A friend saw the overlay and told me I should release it to the public, so here we are. I hope you find it as useful as I do!

---

## ✨ Features

> (All original feature text preserved; now presented as a list for readability)

- Merchant History: One of the core motivations for this project. In-game, the vendor history is capped at the last 100 items and doesn't show the items themselves. XileHUD provides a local, searchable, and filterable history of your merchant interactions, allowing you to save and analyze more than just the last 100 transactions.
- Detailed Modifier Overview: Get an in-depth look at item modifiers with advanced filters, weighting, and more. Instantly understand the power of an item.
- Crafting Currency Helper: Ever wondered about the different Essences, Omens, or Runes available? Instead of manually searching the trade site, simply press Ctrl+Q on any currency to see a detailed, filterable list of what they do.
- Smart Clipboard: The overlay is intelligent. If you copy a rare Strength-based chestplate, for example, the modifiers page will automatically open with the "STR Chest" category pre-selected. This functionality extends to Omens, Essences, Catalysts, Uniques, Flasks, Relics, and much more, saving you valuable clicks.
- Character Planner: View all available Gems, Atlas Passives, Keystones, and Ascendancy passives. Filter everything to your needs to plan your next build or optimize your current one. A comprehensive glossary is also included.
- Quest Passives Helper: With the absence of the /passives command in PoE2 and the increased number of campaign rewards, this tool is essential. Track and filter all sources of Spirit, passive points, resistances, and attributes. Check them off as you collect them to ensure you never miss a permanent character boost again.
- Item Database: Browse all base items and Uniques in the game through a clean, organized interface with powerful filtering options. For instance, find the highest evasion base armor with just two clicks.
- Map Regex Tool: A simple tool to make juicing maps more straightforward. Select the mods you want or don't want, and copy the generated regex directly into the game.
- Focused Gaming: The overlay is designed to be unobtrusive and can be quickly toggled with a hotkey, keeping you focused on the game.
- Local Database: Most features are fully local and can be used offline. An internet connection and account authentication are only required for the Merchant History to fetch your data from the PoE servers.

---

## 🚀 Quick Start

Download the portable EXE from the Releases page.

Run the application (as it's unsigned, you may need to click “More info → Run anyway”).

Launch Path of Exile 2 (Windowed or Borderless Fullscreen is recommended).

In-game, hover over an item and press Ctrl+C to copy its data.

Press Ctrl+Q to toggle the overlay panel and view the item's details.

### System Tray

- Hide or restore the overlay from the system tray icon.
- Right-click the tray icon to quit the application.

---

## 🔒 Privacy

No telemetry or tracking is implemented. Account authentication is only required if you wish to use the Merchant History feature to fetch your data from your Path of Exile account. All other features work offline.

---

## 🗺️ Roadmap

I usually add features that I personally think would help me save time, so when you see an update, it's likely something I'm actively using myself.

- Spectre Database: A comprehensive list of spectres and their abilities.
- Shareable Crafting Recipes: Create and share crafting processes with the community.
- Expanded Regex Tool: Add more categories for deeper customization.
- PoE1 Version: Complete the Path of Exile 1 adaptation.
- And much more!: I have many other ideas in mind to continue making our lives in Wraeclast easier.

---

## 🐞 Reporting Issues

If you encounter a bug or have a suggestion, please create an issue on the GitHub Issues page. You can also report issues in the Reddit thread.

When reporting, please include:

- The application version.
- Steps to reproduce the issue.
- The item text (if it's an item parsing issue).
- Any relevant output from the console.

---

## 🛠️ Build From Source

Prerequisites: Node.js 18+, Git, and Windows.

<!-- Original artifact lines preserved below as a code-comment style block for fidelity -->
```
code
Powershell
download
content_copy
expand_less
```

### Clone & Install
```powershell
# Clone the repository
git clone https://github.com/XileHUD/poe_overlay.git

# Navigate to the overlay package
cd poe_overlay\packages\overlay

# Install dependencies
npm install

# Run in development mode
npm run dev
```

### Build Portable Executable
```
code
Powershell
download
content_copy
expand_less
```
```powershell
npm run dist:unsigned
```

The output will be located in `dist_electron/XileHUD-<version>-portable.exe`.

---

## 🙌 Contributing

Pull requests are welcome! Some helpful areas for contribution include:

- Refining tier aggregation for edge cases.
- Performance profiling and optimization.
- Developing new item context panels.

### Flow

1. Fork the repository and create a new branch.
2. Run npm install to get started.
3. Implement your changes.
4. Commit with a clear, conventional message (e.g., feat:, fix:, docs:).
5. Open a Pull Request with a description of your changes.

---

## 📜 License

MIT

This project is not affiliated with or endorsed by Grinding Gear Games.

---

## Acknowledgements

- Grinding Gear Games (http://www.grindinggear.com/): For creating the incredible Path of Exile (https://www.pathofexile.com/) and many of the file formats used. Please support them and do not reuse their files without permission.
- OmegaK2 (https://github.com/OmegaK2): The original developer of PyPoE.
- brather1ng (https://github.com/brather1ng): For the updated PyPoE fork.
- Chriskang: For the original VisualGGPK2.
- POEDB (http://poedb.tw/us/) & POE2.RE (https://poe2.re/): For invaluable data and references.
