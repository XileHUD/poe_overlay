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

### Merchant History
One of the core motivations for this project. In-game, the vendor history is capped at the last 100 items and doesn't show the items themselves. XileHUD provides a local, searchable, and filterable history of your merchant interactions, allowing you to save and analyze more than just the last 100 transactions.

<p align="center">
	<img src="./screenshots/MerchantHistory.png" alt="Merchant History UI" width="760" />
</p>

### Detailed Modifier Overview
Get an in-depth look at item modifiers with advanced filters, weighting, and more. Instantly understand the power of an item.

<p align="center">
	<img src="./screenshots/Modifier.png" alt="Detailed Modifier Overview" width="760" />
</p>

### Crafting Currency Helper
Ever wondered about the different Essences, Omens, or Runes available? Instead of manually searching the trade site, simply press Ctrl+Q on any currency to see a detailed, filterable list of what they do.

<p align="center">
	<img src="./screenshots/Omen.png" alt="Crafting Currency / Omen Helper" width="720" />
</p>

### Smart Clipboard
The overlay is intelligent. If you copy a rare Strength-based chestplate, for example, the modifiers page will automatically open with the "STR Chest" category pre-selected. This functionality extends to Omens, Essences, Catalysts, Uniques, Flasks, Relics, and much more, saving you valuable clicks.

<p align="center">
	<img src="./screenshots/Socketables.png" alt="Smart Clipboard Socketables Context" width="360" />
	<img src="./screenshots/Annoints.png" alt="Smart Clipboard Annoints Context" width="360" />
</p>

### Character Planner
View all available Gems, Atlas Passives, Keystones, and Ascendancy passives. Filter everything to your needs to plan your next build or optimize your current one. A comprehensive glossary is also included.

<p align="center">
	<img src="./screenshots/Gems.png" alt="Character Planner Gems" width="760" />
</p>

### Quest Passives Helper
With the absence of the /passives command in PoE2 and the increased number of campaign rewards, this tool is essential. Track and filter all sources of Spirit, passive points, resistances, and attributes. Check them off as you collect them to ensure you never miss a permanent character boost again.

<p align="center">
	<img src="./screenshots/QuestPassives.png" alt="Quest Passives Helper" width="760" />
</p>

### Item Database
Browse all base items and Uniques in the game through a clean, organized interface with powerful filtering options. For instance, find the highest evasion base armor with just two clicks.

<p align="center">
	<img src="./screenshots/Bases.png" alt="Base Item Browser" width="370" />
	<img src="./screenshots/Uniques.png" alt="Unique Item Browser" width="370" />
</p>

### Map Regex Tool
A simple tool to make juicing maps more straightforward. Select the mods you want or don't want, and copy the generated regex directly into the game.

<p align="center">
	<img src="./screenshots/Regex.png" alt="Map Regex Tool" width="760" />
</p>

### Focused Gaming
The overlay is designed to be unobtrusive and can be quickly toggled with a hotkey, keeping you focused on the game.

### Local Database
Most features are fully local and can be used offline. An internet connection and account authentication are only required for the Merchant History to fetch your data from the PoE servers.

---

## 🚀 Quick Start

1. Download the portable EXE from the [Releases](https://github.com/XileHUD/poe_overlay/releases/latest) page.
2. Run the application (unsigned: “More info → Run anyway”).
3. Launch Path of Exile 2 (Windowed or Borderless Fullscreen recommended).
4. Hover an item and press `Ctrl+C` to copy its data.
5. Press `Ctrl+Q` to toggle the overlay panel and view the item's details.
6. System Tray:
	- Left click: show / hide
	- Right click: quit

---

## 🔒 Privacy

No telemetry or tracking is implemented. Account authentication is only required if you wish to use the Merchant History feature to fetch your data from your Path of Exile account. All other features work offline.

---

## 🗺️ Roadmap

I usually add features that I personally think would help me save time, so when you see an update, it's likely something I'm actively using myself.

New / High-Priority Ideas:
- Leveling Overlay: Route planner with act/zone splits, boss prep tips, automatic progress detection (so you never miss a quest reward or passive point while rushing).
- Speedrun Timer: Lightweight in-overlay timer with segment splits (acts, key bosses) and auto‑split hooks planned when reliable triggers are identified.
- "Today I Learned" Knowledge Base: Curated micro‑tips (e.g. how to cheaply get a level 21 gem) – community aggregated, surfaced contextually later.

Existing / Ongoing:
- Spectre Database: A comprehensive list of spectres and their abilities.
- Shareable Crafting Recipes: Create and share crafting processes with the community.
- Expanded Regex Tool: Add more categories for deeper customization.
- PoE1 Version: Complete the Path of Exile 1 adaptation.
- And much more!: I have many other ideas in mind to continue making our lives in Wraeclast easier.

---

## ❓ WIP FAQ (Work in Progress)

<sub>Early, evolving list. Content will expand as common questions come up. Nothing here is marketing fluff – just straight answers.</sub>

<details>
<summary><strong>Do you plan on releasing a version for PoE1?</strong></summary>
<p>
Definitely. I think PoE2 is heading in a great direction now – 0.3 was by far my most‑played league yet. I'm a min/max player who sweats week 1 for mirrors and then juices as hard as possible. That said, PoE1 is still my "main" game. I play Path of Exile about 95% of the time. Sometimes I'll touch LE or TLI for 2–3 days, but that's it. PoE gives me everything I want: blasting, crafting, trading, and all the little details. I released the PoE2 version first because it's the active league I'm playing right now. I'm confident the PoE1 overlay will be ready for the upcoming league release.
</p>
</details>

<details>
<summary><strong>Why don't you integrate a price check?</strong></summary>
<p>
I considered it. In my private version there is one, because I don't like waiting on features I personally need. I left it out publicly because there are already overlays that do price checking very well. I personally recommend <em>Exiled Exchange</em> (and <em>Awakened PoE</em> for PoE1) – in my opinion the best option: slim and feature complete.
</p>
</details>

<details>
<summary><strong>Any other features planned?</strong></summary>
<p>
Check the roadmap. I have many ideas because I actively play every day. The current version is a beta – I'll keep adding things I personally find useful over time.
</p>
</details>

<details>
<summary><strong>How long have you played PoE?</strong></summary>
<p>
Over a decade. I started a bit after beginning my self‑employed work. My job involves a lot of "observing", which makes it perfect to play games alongside. I think GGG is the best gaming company in the industry; I love their games and don't see myself switching to anything else as a main game.
</p>
</details>

<details>
<summary><strong>Do you have any socials for updates?</strong></summary>
<p>
Not yet. Let's first see if the overlay is interesting for people. It's a very specific tool aimed more at hardcore (not the game mode) PoE players – though I think there's useful info for beginners too: lots of data and the merchant history. We'll see where it goes.
</p>
</details>

<details>
<summary><strong>Are you open to improvements?</strong></summary>
<p>
For sure – performance or new features. I have an open mind; if I think it genuinely improves the overlay, I'll add it.
</p>
</details>

<details>
<summary><strong>Where to contact?</strong></summary>
<p>
Open an Issue here on GitHub, reply in the Reddit thread, or (soon) reach out via a small Discord.
</p>
</details>

---

## 🐞 Reporting Issues

If you encounter a bug or have a suggestion, please create an issue on the **[GitHub Issues page](https://github.com/XileHUD/poe_overlay/issues)**. You can also report issues in the Reddit thread.

When reporting, please include:

- The application version.
- Steps to reproduce the issue.
- The item text (if it's an item parsing issue).
- Any relevant output from the console.

---
<!-- Build & Contributing sections intentionally removed -->
---

## 📜 License

Licensed under **GNU GPLv3** (see [`LICENSE`](./LICENSE)).

This project is not affiliated with or endorsed by Grinding Gear Games.

---

## Acknowledgements

- [Grinding Gear Games](http://www.grindinggear.com/) – For creating the incredible [Path of Exile](https://www.pathofexile.com/) and many of the file formats used. Please support them and do not reuse their files without permission.
- [OmegaK2](https://github.com/OmegaK2) – The original developer of PyPoE.
- [brather1ng](https://github.com/brather1ng) – For the updated PyPoE fork.
- Chriskang – For the original VisualGGPK2.
- [POEDB](http://poedb.tw/us/) & [POE2.RE](https://poe2.re/) – Invaluable data and references.
