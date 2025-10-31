import { BrowserWindow, ipcMain } from 'electron';
import { registerOverlayWindow, updateOverlayWindowPinned } from './windowZManager.js';
import type { OverlayVersion } from '../../types/overlayVersion.js';
import type { SettingsService } from '../services/settingsService.js';
import type { ItemSet } from '../../shared/pob/types.js';
import { getActiveBuild } from '../../shared/pob/buildManager.js';

interface LevelingGearWindowOptions {
  settingsService: SettingsService;
  overlayVersion: OverlayVersion;
  parentWindow?: BrowserWindow;
}

let gearWindow: BrowserWindow | null = null;

export function openLevelingGearWindow(options: LevelingGearWindowOptions): BrowserWindow {
  const { settingsService, overlayVersion, parentWindow } = options;

  // If window already exists, focus it
  if (gearWindow && !gearWindow.isDestroyed()) {
    gearWindow.focus();
    return gearWindow;
  }

  // Get saved window position or use defaults
  const settingsKey = overlayVersion === 'poe1' ? 'levelingWindowPoe1' : 'levelingWindowPoe2';
  const savedSettings = settingsService.get(settingsKey) || {};
  const gearWindowSettings = (savedSettings as any).gearWindow || {};
  const { x = 200, y = 200, width = 650, height = 700, ultraMinimal = false, hideInfo = false, pinned = true } = gearWindowSettings;

  gearWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: pinned,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    },
    // Important: do not set `parent` so this overlay remains a top-level window.
    // Owned windows on Windows are grouped above their owner and cannot freely reorder across groups.
  });

  gearWindow.setIgnoreMouseEvents(false);
  // Debounce timers for position/size saves
  let _moveTimer = null as any;
  let _resizeTimer = null as any;

  // Register and participate in managed z-order
  try { registerOverlayWindow('gear', gearWindow, pinned); } catch {}

  // Get current PoB build gear from the new builds list (pobBuilds) instead of legacy pobBuild
  const pobBuilds = (savedSettings as any).pobBuilds;
  const pobBuild = pobBuilds ? getActiveBuild(pobBuilds) : ((savedSettings as any).pobBuild || null);
  const itemSets = pobBuild?.itemSets || [];
  
  // Use root-level persistent selection, fallback to gearWindow.selectedSetIndex for backwards compatibility
  const savedGearIndex = (savedSettings as any).selectedGearIndex ?? gearWindowSettings.selectedSetIndex ?? 0;
  const autoDetectEnabled = (savedSettings as any).uiSettings?.autoDetectLevelingSets ?? true;
  
  const html = buildLevelingGearWindowHtml(itemSets, overlayVersion, ultraMinimal, pobBuild, savedGearIndex, hideInfo, autoDetectEnabled, pinned);
  gearWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  // Save position on move
  gearWindow.on('move', () => {
    if (!gearWindow || gearWindow.isDestroyed()) return;
    if (_moveTimer) clearTimeout(_moveTimer);
    _moveTimer = setTimeout(() => {
      if (!gearWindow || gearWindow.isDestroyed()) return;
      const [newX, newY] = gearWindow.getPosition();
      settingsService.update(settingsKey, (current: any) => ({
        ...current,
        gearWindow: {
          ...(current.gearWindow || {}),
          x: newX,
          y: newY,
        },
      }));
    }, 150);
  });

  // Save size on resize
  gearWindow.on('resize', () => {
    if (!gearWindow || gearWindow.isDestroyed()) return;
    if (_resizeTimer) clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      if (!gearWindow || gearWindow.isDestroyed()) return;
      const [newWidth, newHeight] = gearWindow.getSize();
      settingsService.update(settingsKey, (current: any) => ({
        ...current,
        gearWindow: {
          ...(current.gearWindow || {}),
          width: newWidth,
          height: newHeight,
        },
      }));
    }, 150);
  });

  gearWindow.on('closed', () => {
    gearWindow = null;
  });
  
  // Handle ultra minimal mode toggle
  ipcMain.on('gear-window-toggle-minimal', (event, isMinimal) => {
    if (!gearWindow || gearWindow.isDestroyed()) return;
    
    // Save minimal mode state
    settingsService.update(settingsKey, (current: any) => ({
      ...current,
      gearWindow: {
        ...(current.gearWindow || {}),
        ultraMinimal: isMinimal,
      },
    }));
  });
  
  // Handle pinned toggle
  ipcMain.on('gear-window-toggle-pinned', (event, isPinned) => {
    if (!gearWindow || gearWindow.isDestroyed()) return;
    
    gearWindow.setAlwaysOnTop(isPinned);
    
    // Update the window manager's pinned state
    try { updateOverlayWindowPinned('gear', isPinned); } catch {}
    
    // Save pinned state
    settingsService.update(settingsKey, (current: any) => ({
      ...current,
      gearWindow: {
        ...(current.gearWindow || {}),
        pinned: isPinned,
      },
    }));
  });

  // Handle set selection
  ipcMain.on('gear-window-set-selected', (event, setIndex) => {
    if (!gearWindow || gearWindow.isDestroyed()) return;
    
    // Save selected set index at root level (for persistent user selection)
    // and also in gearWindow for backwards compatibility
    settingsService.update(settingsKey, (current: any) => ({
      ...current,
      selectedGearIndex: setIndex, // Root-level persistent selection
      gearWindow: {
        ...(current.gearWindow || {}),
        selectedSetIndex: setIndex, // Backwards compatibility
      },
    }));
  });

  // Handle dismissing info banner (persist hide)
  ipcMain.on('gear-window-dismiss-info', () => {
    if (!gearWindow || gearWindow.isDestroyed()) return;
    settingsService.update(settingsKey, (current: any) => ({
      ...current,
      gearWindow: {
        ...(current.gearWindow || {}),
        hideInfo: true,
      },
    }));
  });

  return gearWindow;
}

export function updateGearWindow(itemSets: ItemSet[]): void {
  if (!gearWindow || gearWindow.isDestroyed()) return;
  gearWindow.webContents.send('gear-updated', itemSets);
}

export function isGearWindowOpen(): boolean {
  return gearWindow !== null && !gearWindow.isDestroyed();
}

export function updateGearWindowContext(currentAct: number, characterLevel: number): void {
  if (!gearWindow || gearWindow.isDestroyed()) return;
  
  // Send context update so the gear window can re-evaluate the best set
  gearWindow.webContents.send('gear-context-update', {
    currentAct,
    characterLevel,
  });
}

export function closeGearWindow(): void {
  if (gearWindow && !gearWindow.isDestroyed()) {
    gearWindow.close();
  }
}

function buildLevelingGearWindowHtml(itemSets: ItemSet[], overlayVersion: OverlayVersion, ultraMinimal: boolean, pobBuild: any, selectedSetIndex: number, hideInfo: boolean, autoDetectEnabled: boolean, pinned: boolean = true): string {
  const className = pobBuild?.className || 'No Build Loaded';
  const ascendancy = pobBuild?.ascendancyName || '';
  const characterName = pobBuild?.characterName || '';
  // Show info banner for both PoE1 and PoE2; content differs slightly per version
  const showInfoBanner = true;
  const initialHideInfo = (pobBuild?.gearWindow?.hideInfo ?? undefined) as boolean | undefined; // placeholder if exists in build

  // Helper: determine if an item has meaningful content
  const itemHasContent = (item: any) => {
    if (!item) return false;
    const hasName = !!item.name || !!item.baseName;
    const hasMods = (item.mods && item.mods.length) || (item.implicitMods && item.implicitMods.length) || (item.craftedMods && item.craftedMods.length);
    return !!(hasName || hasMods);
  };

  // Filter out empty header-style sets (no gear, flasks, or jewels)
  const filteredItemSets: ItemSet[] = (itemSets || []).filter((set) => {
    if (!set || !set.items) return false;
    const entries = Object.entries(set.items);
    if (entries.length === 0) return false;
    for (const [, item] of entries) {
      if (itemHasContent(item)) return true;
    }
    return false;
  });

  // Ensure selectedSetIndex is valid for filtered list
  const currentSetIndex = filteredItemSets.length > 0 ? Math.min(selectedSetIndex, filteredItemSets.length - 1) : 0;
  const currentSet = filteredItemSets[currentSetIndex];

  const setSelector = filteredItemSets.length > 1 ? `
    <select id="setSelector" onchange="onSetChange(this.value)" class="set-selector">
      ${filteredItemSets.map((set, idx) => `<option value="${idx}" ${idx === currentSetIndex ? 'selected' : ''}>${set.title}</option>`).join('')}
    </select>
  ` : (filteredItemSets.length === 1 ? `<div class="set-title">${filteredItemSets[0].title}</div>` : '');

  // Initial render will be done by JavaScript
  const itemSetsHtml = '<div id="gear-content"></div>';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      --bg-primary: #1a1a1a;
      --bg-secondary: #2d2d2d;
      --bg-tertiary: #3a3a3a;
      --text-primary: #ffffff;
      --text-secondary: #b0b0b0;
      --text-muted: #808080;
      --accent-blue: #4a9eff;
      --accent-red: #d9534f;
      --rarity-normal: #c8c8c8;
      --rarity-magic: #8888ff;
      --rarity-rare: #ffff77;
      --rarity-unique: #af6025;
      --rarity-gem: #1ba29b;
    }
    
    * { box-sizing: border-box; }
    
    body {
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', Roboto, Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      overflow: visible !important;
      user-select: none;
      -webkit-user-select: none;
      display: flex;
      flex-direction: column;
      height: 100vh;
      border: 1px solid rgba(74, 158, 255, 0.3);
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.5), 0 0 40px rgba(74, 158, 255, 0.15);
      border-radius: 8px;
    }
    
    .header {
      padding: 4px 8px;
      background: rgba(26, 26, 26, 0.85);
      border-bottom: 1px solid rgba(74, 158, 255, 0.2);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
      -webkit-app-region: drag;
      border-radius: 8px 8px 0 0;
      min-height: 24px;
    }
    
    .header-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: var(--text-secondary);
    }
    
    .header-title h1 {
      margin: 0;
      font-size: 11px;
      color: var(--accent-blue);
      font-weight: 500;
    }
    
    .header-subtitle {
      font-size: 10px;
      color: var(--text-muted);
    }
    
    .header-controls {
      display: flex;
      gap: 4px;
      align-items: center;
      -webkit-app-region: no-drag;
    }
    
    .minimal-btn, .close-btn, .pin-btn {
      width: 20px;
      height: 20px;
      border-radius: 3px;
      font-size: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
      flex-shrink: 0;
    }
    
    .minimal-btn {
      background: rgba(74, 158, 255, 0.1);
      border: 1px solid rgba(74, 158, 255, 0.3);
      color: var(--accent-blue);
    }
    
    .minimal-btn:hover {
      background: rgba(74, 158, 255, 0.2);
      border-color: rgba(74, 158, 255, 0.5);
    }
    
    .minimal-btn.active {
      background: rgba(74, 158, 255, 0.3);
      border-color: rgba(74, 158, 255, 0.6);
    }
    
    .pin-btn {
      background: rgba(74, 158, 255, 0.1);
      border: 1px solid rgba(74, 158, 255, 0.3);
      color: var(--accent-blue);
    }
    
    .pin-btn:hover {
      background: rgba(74, 158, 255, 0.2);
      border-color: rgba(74, 158, 255, 0.5);
    }
    
    .pin-btn.active {
      background: rgba(74, 158, 255, 0.3);
      border-color: rgba(74, 158, 255, 0.6);
    }
    
    .close-btn {
      background: rgba(217, 83, 79, 0.1);
      border: 1px solid rgba(217, 83, 79, 0.3);
      color: var(--accent-red);
      font-size: 12px;
    }
    
    .close-btn:hover {
      background: rgba(217, 83, 79, 0.2);
      border-color: rgba(217, 83, 79, 0.5);
    }
    
    .content {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 15px;
    }
    
    .set-selector-container {
      margin-bottom: 15px;
      display: flex;
      justify-content: center;
      -webkit-app-region: no-drag;
    }
    
    .set-selector {
      background: rgba(45, 45, 45, 0.8);
      border: 1px solid rgba(74, 158, 255, 0.3);
      border-radius: 4px;
      color: var(--accent-blue);
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      outline: none;
      -webkit-app-region: no-drag;
      position: relative;
      z-index: 10000;
    }
    
    .set-selector:hover {
      border-color: rgba(74, 158, 255, 0.5);
      background: rgba(45, 45, 45, 1);
    }
    
    .set-selector option {
      background: var(--bg-primary);
      color: var(--text-primary);
      padding: 4px;
    }
    
    .set-title {
      text-align: center;
      font-size: 13px;
      font-weight: 600;
      color: var(--accent-blue);
      margin-bottom: 15px;
    }
    .info-banner {
      background: rgba(45, 45, 45, 0.9);
      border: 1px solid rgba(74, 158, 255, 0.35);
      border-left: 3px solid var(--accent-blue);
      border-radius: 6px;
      padding: 10px 12px;
      color: var(--text-secondary);
      font-size: 11px;
      line-height: 1.5;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: start;
    }
    .info-banner p {
      margin: 4px 0;
    }
    .info-banner .actions {
      flex-shrink: 0;
    }
    .info-banner .hide-btn {
      background: rgba(74, 158, 255, 0.15);
      border: 1px solid rgba(74, 158, 255, 0.4);
      color: var(--accent-blue);
      padding: 4px 8px;
      font-size: 11px;
      border-radius: 4px;
      cursor: pointer;
    }
    .info-banner .hide-btn:hover {
      background: rgba(74, 158, 255, 0.25);
    }
    
    .gear-category {
      margin-bottom: 20px;
    }
    
    .category-header {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 10px;
      padding-bottom: 5px;
      border-bottom: 1px solid rgba(128, 128, 128, 0.2);
    }
    
    .gear-grid {
      /* Masonry-style columns to avoid holes when cards expand */
      column-width: 220px;
      column-gap: 10px;
      margin-bottom: 15px;
    }
    
    .gear-slot {
      display: inline-block; /* Needed for CSS columns */
      width: 100%;
      break-inside: avoid-column;
      -webkit-column-break-inside: avoid;
      page-break-inside: avoid;
      background: linear-gradient(135deg, rgba(20, 20, 20, 0.9) 0%, rgba(30, 30, 30, 0.8) 100%);
      border: 1px solid rgba(128, 128, 128, 0.3);
      border-radius: 6px;
      padding: 0;
      transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
      overflow: hidden;
      cursor: pointer;
      margin: 0 0 10px 0; /* Spacing between items in columns */
    }
    
    .gear-slot:hover {
      border-color: rgba(74, 158, 255, 0.6);
      background: linear-gradient(135deg, rgba(25, 25, 30, 0.95) 0%, rgba(35, 35, 40, 0.9) 100%);
      box-shadow: 0 4px 8px rgba(74, 158, 255, 0.2);
      transform: translateY(-1px);
    }
    
    .gear-slot-header {
      padding: 10px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      user-select: none;
    }
    
    .gear-slot-header-left {
      flex: 1;
      min-width: 0;
    }
    
    .gear-slot-expand-icon {
      font-size: 10px;
      color: var(--text-muted);
      transition: transform 0.15s ease;
      margin-left: 8px;
      flex-shrink: 0;
    }
    
    .gear-slot.expanded .gear-slot-expand-icon {
      transform: rotate(90deg);
    }
    
    .gear-slot-body {
      display: none;
      padding: 0 12px 12px 12px;
    }
    
    .gear-slot.expanded .gear-slot-body {
      display: block;
    }
    
    .slot-name {
      font-size: 9px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
      font-weight: 600;
    }
    
    .item-name {
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 0;
      word-wrap: break-word;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    }
    
    .item-base {
      font-size: 10px;
      color: var(--text-secondary);
      margin-bottom: 8px;
      font-style: italic;
    }
    
    .rarity-tag {
      display: inline-block;
      font-size: 8px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 3px;
      margin-left: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      background: rgba(175, 96, 37, 0.3);
      border: 1px solid rgba(175, 96, 37, 0.6);
      color: #ffaa77;
    }
    
    .item-mods {
      margin-top: 8px;
      background: rgba(10, 10, 15, 0.6);
      border-radius: 4px;
      padding: 8px;
      border-left: 2px solid rgba(136, 136, 255, 0.5);
    }
    .mods-section-title {
      font-size: 9px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 4px 0 2px 0;
      padding-left: 4px;
    }
    .mods-section + .mods-section { margin-top: 6px; }
    
    .mod-line {
      color: #ffffff;
      margin: 3px 0;
      font-size: 10px;
      line-height: 1.5;
      padding-left: 4px;
      position: relative;
    }
    
    .mod-line:before {
      content: '•';
      position: absolute;
      left: -8px;
      color: rgba(255, 255, 255, 0.4);
    }
    
    .mod-crafted {
      color: #e0e0e0;
      font-style: italic;
    }
    
    .mod-crafted:before {
      color: rgba(224, 224, 224, 0.4);
    }
    
    .mod-implicit {
      color: #ffffff;
    }
    
    .mod-implicit:before {
      color: rgba(255, 255, 255, 0.4);
    }
    
    .item-mods.has-implicit {
      border-left-color: rgba(255, 176, 176, 0.5);
    }
    
    .item-empty {
      color: var(--text-muted);
      font-size: 10px;
      font-style: italic;
    }
    
    .rarity-normal { color: var(--rarity-normal); }
    .rarity-magic { color: var(--rarity-magic); }
    .rarity-rare { color: var(--rarity-rare); }
    .rarity-unique { color: var(--rarity-unique); }
    
    .flask-grid, .jewel-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 8px;
      align-items: start;
    }
    
    .no-gear {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-muted);
      text-align: center;
      padding: 40px;
    }
    
    .no-gear-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }
    
    .no-gear-text {
      font-size: 14px;
      line-height: 1.5;
    }
    
    ::-webkit-scrollbar {
      width: 8px;
    }
    
    ::-webkit-scrollbar-track {
      background: var(--bg-secondary);
    }
    
    ::-webkit-scrollbar-thumb {
      background: var(--bg-tertiary);
      border-radius: 4px;
    }
    
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(74, 158, 255, 0.3);
    }
    
    /* Ultra Minimal Mode */
    body.ultra-minimal {
      background: transparent;
      border: none;
      box-shadow: none;
      pointer-events: none;
    }
    
    body.ultra-minimal .header {
      background: transparent;
      border-bottom: none;
      pointer-events: auto;
    }
    
    body.ultra-minimal .content {
      background: transparent;
      pointer-events: auto;
    }
    
    body.ultra-minimal .gear-category {
      background: rgba(26, 26, 26, 0.85);
      padding: 10px;
      border-radius: 6px;
      border: 1px solid rgba(74, 158, 255, 0.2);
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-title">
      <h1>⚔️ Gear</h1>
      <div class="header-subtitle">${characterName || ascendancy || className}</div>
    </div>
    <div class="header-controls">
      <div class="minimal-btn" onclick="toggleMinimalMode()" id="minimalBtn" title="Toggle Ultra Minimal Mode">◐</div>
      <div class="pin-btn" onclick="togglePinned()" id="pinBtn" title="Toggle Always On Top">📌</div>
      <div class="close-btn" onclick="closeWindow()">×</div>
    </div>
  </div>
  
  <div class="content" id="content">
  ${filteredItemSets.length > 1 ? `<div class="set-selector-container">${setSelector}</div>` : ''}
  ${showInfoBanner ? `<div class="info-banner" id="infoBanner" style="display: ${hideInfo ? 'none' : 'flex'};">
      <div>
        <p>Please keep in mind that most creators either choose not to add resistance/attribute lines at all on the gear OR they just split between the gear/put all on one gear. So it usually doesn’t matter on which piece the resists/attributes are — what matters is that you’re capped in endgame and meet gear/gem requirements.</p>
        ${overlayVersion === 'poe1' ? `<p>You can easily swap resistances on a gear with the horticrafting bench.</p>` : ''}
      </div>
      <div class="actions"><button class="hide-btn" onclick="dismissInfo()">Hide</button></div>
    </div>` : ''}
    <div id="gear-content"></div>
  </div>
  
  <script>
    const { ipcRenderer } = require('electron');
    // Ensure clicking this window brings it to front above other overlays
    try {
      document.addEventListener('mousedown', () => {
        try { ipcRenderer.send('overlay-window-focus', 'gear'); } catch {}
      }, { capture: true });
      window.addEventListener('focus', () => {
        try { ipcRenderer.send('overlay-window-focus', 'gear'); } catch {}
      });
    } catch {}
    
    let isUltraMinimal = ${ultraMinimal};
    let isPinned = ${pinned};
    let allItemSets = ${JSON.stringify(itemSets)};
    let currentSetIndex = ${currentSetIndex};
    let currentAct = 1;
    let characterLevel = 1;
    let autoDetectEnabled = ${autoDetectEnabled};
    
    // Initialize pinned button state
    if (isPinned) {
      document.getElementById('pinBtn').classList.add('active');
    }
    
    function itemHasContent(item) {
      if (!item) return false;
      const hasName = !!item.name || !!item.baseName;
      const hasMods = (item.mods && item.mods.length) || (item.implicitMods && item.implicitMods.length) || (item.craftedMods && item.craftedMods.length);
      return !!(hasName || hasMods);
    }
    
    function filterItemSets(sets) {
      if (!Array.isArray(sets)) return [];
      return sets.filter(set => {
        if (!set || !set.items) return false;
        const entries = Object.entries(set.items);
        if (entries.length === 0) return false;
        for (const [, item] of entries) {
          if (itemHasContent(item)) return true;
        }
        return false;
      });
    }
    
    // Helper to parse level range from set title
    function parseLevelRange(title) {
      if (!title) return null;
      
      // Match patterns like: "1-14", "level 1-14", "1-14 level", "Level 1-14"
      const rangeMatch = title.match(/(\\d+)\\s*[-–—]\\s*(\\d+)/);
      if (rangeMatch) {
        const min = parseInt(rangeMatch[1], 10);
        const max = parseInt(rangeMatch[2], 10);
        if (!isNaN(min) && !isNaN(max)) {
          return { min, max };
        }
      }
      
      // Match single level like "Level 14" or "14 level"
      const singleMatch = title.match(/(?:level|lv|lvl)?\\s*(\\d+)/i);
      if (singleMatch) {
        const level = parseInt(singleMatch[1], 10);
        if (!isNaN(level)) {
          return { min: level, max: level };
        }
      }
      
      return null;
    }
    
    // Helper to detect if a set name contains act reference
    function hasActReference(title) {
      if (!title) return false;
      const lower = title.toLowerCase();
      // Match "act 1", "act1", "act 2", etc.
      return /act\\s*\\d+/.test(lower);
    }
    
    // Helper to extract act number from title
    function extractActNumber(title) {
      if (!title) return null;
      const match = title.toLowerCase().match(/act\\s*(\\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
      return null;
    }
    
    // Find best matching gear set based on act (preferred) or level (fallback)
    function findBestGearSet(gearSets, actNum, charLevel) {
      if (!gearSets || gearSets.length === 0) return -1;
      const nonEmptySets = filterItemSets(gearSets);
      if (nonEmptySets.length === 0) return -1;
      
      console.log(\`[GearWindow] Finding best gear set for act \${actNum}, level \${charLevel}\`);
      
      // First, try to find by act reference
      for (let i = 0; i < nonEmptySets.length; i++) {
        const set = nonEmptySets[i];
        if (hasActReference(set.title)) {
          const setActNum = extractActNumber(set.title);
          if (setActNum === actNum) {
            console.log(\`[GearWindow] Matched by act: "\${set.title}" (index \${i})\`);
            return i;
          }
        }
      }
      
      // Fallback: match by level range
      console.log(\`[GearWindow] No act match found, trying level-based matching for level \${charLevel}\`);
      for (let i = 0; i < nonEmptySets.length; i++) {
        const set = nonEmptySets[i];
        const range = parseLevelRange(set.title);
        if (range && charLevel >= range.min && charLevel <= range.max) {
          console.log(\`[GearWindow] Matched by level: "\${set.title}" (range \${range.min}-\${range.max}, index \${i})\`);
          return i;
        }
      }
      
      // No match found - don't default to 0
      console.log(\`[GearWindow] No suitable gear set found for act \${actNum}, level \${charLevel}\`);
      return -1;
    }
    
    function toggleMinimalMode() {
      isUltraMinimal = !isUltraMinimal;
      const body = document.body;
      const btn = document.getElementById('minimalBtn');
      
      if (isUltraMinimal) {
        body.classList.add('ultra-minimal');
        btn.classList.add('active');
      } else {
        body.classList.remove('ultra-minimal');
        btn.classList.remove('active');
      }
      
      ipcRenderer.send('gear-window-toggle-minimal', isUltraMinimal);
    }
    
    function togglePinned() {
      isPinned = !isPinned;
      const btn = document.getElementById('pinBtn');
      if (isPinned) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
      ipcRenderer.send('gear-window-toggle-pinned', isPinned);
    }
    
    function closeWindow() {
      ipcRenderer.send('leveling-gear-window-close');
    }
    
    function onSetChange(index) {
      currentSetIndex = parseInt(index);
      ipcRenderer.send('gear-window-set-selected', currentSetIndex);
      renderCurrentSet();
    }

    function dismissInfo() {
      const banner = document.getElementById('infoBanner');
      if (banner) banner.style.display = 'none';
      ipcRenderer.send('gear-window-dismiss-info', true);
    }
    
    function renderCurrentSet() {
      const gearContent = document.getElementById('gear-content');
      const visibleSets = filterItemSets(allItemSets);
      if (!visibleSets || visibleSets.length === 0) {
        gearContent.innerHTML = '<div class="no-gear"><div class="no-gear-icon">⚔️</div><div class="no-gear-text">No gear available</div></div>';
        const selector = document.getElementById('setSelector');
        if (selector) selector.innerHTML = '';
        return;
      }
      if (currentSetIndex >= visibleSets.length) {
        currentSetIndex = 0;
      }
      const itemSet = visibleSets[currentSetIndex];
      
      if (!itemSet) {
        gearContent.innerHTML = '<div class="no-gear"><div class="no-gear-icon">⚔️</div><div class="no-gear-text">No gear available</div></div>';
        return;
      }
      
      // Update selector if it exists
      const selector = document.getElementById('setSelector');
      if (selector) {
        // Rebuild options based on filtered sets
        selector.innerHTML = visibleSets.map((set, idx) => \`<option value="\${idx}" \${idx === currentSetIndex ? 'selected' : ''}>\${set.title}</option>\`).join('');
        selector.value = currentSetIndex.toString();
      }
      
      gearContent.innerHTML = renderItemSet(itemSet);
    }
    
    function smoothRenderGear() {
      const gearContent = document.getElementById('gear-content');
      
      // Fade out content first
      gearContent.classList.add('updating');
      
      // Wait for fade out, then render new content
      setTimeout(() => {
        renderCurrentSet();
        // Fade content back in
        gearContent.classList.remove('updating');
      }, 100);
    }
    
    function renderItemSet(itemSet) {
      const gear = [];
      const flasks = [];
      const jewels = [];
      
      // Categorize items
      for (const [slotName, item] of Object.entries(itemSet.items)) {
        if (slotName.startsWith('Flask')) {
          flasks.push({ slotName, item });
        } else if (slotName.startsWith('Jewel') || slotName.includes('Socket')) {
          // Include both "Jewel X" and "Abyssal Socket" types
          jewels.push({ slotName, item });
        } else {
          gear.push({ slotName, item });
        }
      }
      
      let html = '';
      
      if (gear.length > 0) {
        html += \`
          <div class="gear-category">
            <div class="category-header">⚔️ Equipment</div>
            <div class="gear-grid">
              \${gear.map(({ slotName, item }) => renderSlot(slotName, item)).join('')}
            </div>
          </div>
        \`;
      }
      
      if (jewels.length > 0) {
        html += \`
          <div class="gear-category">
            <div class="category-header">💎 Jewels</div>
            <div class="jewel-grid">
              \${jewels.map(({ slotName, item }) => renderSlot(slotName, item)).join('')}
            </div>
          </div>
        \`;
      }
      
      if (flasks.length > 0) {
        html += \`
          <div class="gear-category">
            <div class="category-header">🧪 Flasks</div>
            <div class="flask-grid">
              \${flasks.map(({ slotName, item }) => renderSlot(slotName, item)).join('')}
            </div>
          </div>
        \`;
      }
      
      return html;
    }
    
    function renderSlot(slotName, item) {
      if (!item || !item.name) {
        return \`
          <div class="gear-slot" onclick="this.classList.toggle('expanded')">
            <div class="gear-slot-header">
              <div class="gear-slot-header-left">
                <div class="slot-name">\${getSlotIcon(slotName)} \${slotName}</div>
                <div class="item-empty">Empty</div>
              </div>
            </div>
          </div>
        \`;
      }
      
      const rarity = (item.rarity || 'normal').toLowerCase();
      const rarityClass = 'rarity-' + rarity;
      
      // Determine display name
      let displayName = item.name;
      if (rarity === 'unique') {
        // For uniques, show the unique name (first header line) as the main title
        displayName = item.baseName || item.name;
      } else if (item.name === 'New Item' || !item.name) {
        displayName = rarity.charAt(0).toUpperCase() + rarity.slice(1) + ' Item';
      }
      
      // Collect all mods (separate Implicit vs Explicit/Crafted sections)
      let modsHtml = '';
      const hasImplicit = item.implicitMods && item.implicitMods.length > 0;
      const hasMods = item.mods && item.mods.length > 0;
      const hasCrafted = item.craftedMods && item.craftedMods.length > 0;
      
      if (hasImplicit || hasMods || hasCrafted) {
  const modClass = hasImplicit ? 'has-implicit' : '';
  const sections = [];
        
        if (hasImplicit) {
          const lines = item.implicitMods.map(mod => \`<div class=\"mod-line mod-implicit\">\${highlightNumbers(mod)}</div>\`).join('');
          sections.push(\`<div class=\"mods-section\"><div class=\"mods-section-title\">Implicit</div>\${lines}</div>\`);
        }
        if (hasMods) {
          const lines = item.mods.map(mod => \`<div class=\"mod-line\">\${highlightNumbers(mod)}</div>\`).join('');
          sections.push(\`<div class=\"mods-section\"><div class=\"mods-section-title\">Explicit</div>\${lines}</div>\`);
        }
        if (hasCrafted) {
          const lines = item.craftedMods.map(mod => \`<div class=\"mod-line mod-crafted\">\${highlightNumbers(mod)}</div>\`).join('');
          sections.push(\`<div class=\"mods-section\"><div class=\"mods-section-title\">Crafted</div>\${lines}</div>\`);
        }
        
        modsHtml = \`<div class=\"item-mods \${modClass}\">\${sections.join('')}<\/div>\`;
      }
      
      // Build base name display
      let baseText = item.baseName;
      if (rarity === 'unique') {
        // For uniques, show the base type under the title
        baseText = item.name || item.baseName;
      }
      const baseHtml = baseText ? \`<div class="item-base">\${baseText}</div>\` : '';
      
      // Add UNIQUE tag for unique items
      const uniqueTag = rarity === 'unique' ? '<span class="rarity-tag">UNIQUE</span>' : '';
      
      return \`
        <div class="gear-slot" onclick="this.classList.toggle('expanded')">
          <div class="gear-slot-header">
            <div class="gear-slot-header-left">
              <div class="slot-name">\${getSlotIcon(slotName)} \${slotName}</div>
              <div class="item-name \${rarityClass}">\${displayName}\${uniqueTag}</div>
            </div>
            <div class="gear-slot-expand-icon">▶</div>
          </div>
          <div class="gear-slot-body">
            \${baseHtml}
            \${modsHtml}
          </div>
        </div>
      \`;
    }
    
    function highlightNumbers(text) {
      // Match numbers: optional +/-, one or more digits, optional decimal part, optional %
      // Using lookahead/lookbehind to ensure we don't match partial words
      return text.replace(/(^|[^a-zA-Z])([+\-]?\d+(?:\.\d+)?%?)(?=[^a-zA-Z]|$)/g, (match, prefix, number) => {
        return \`\${prefix}<span style="color: #6ba3ff; font-weight: 600;">\${number}</span>\`;
      });
    }
    
    function getSlotIcon(slotName) {
      const icons = {
        'Helmet': '<svg width="14" height="14" viewBox="0 0 51 51" fill="white"><path d="M24.77,7.03c-8.15,0.38-14.42,7.41-14.42,15.57v16.06c0,0.23,0.13,0.44,0.34,0.53l10.33,4.68c0.78,0.35,1.66-0.22,1.66-1.07v-5.75c0,0,0,0,0,0V31.9c0-0.39-0.19-0.75-0.52-0.97l-5.39-3.64l0,0c-0.87-0.52-1.43-1.5-1.34-2.61c0.13-1.46,1.46-2.52,2.93-2.52h4.36c0.65,0,1.17,0.53,1.17,1.17v6.71c0,0,0,0.61,1.61,0.61c1.61,0,1.61-0.61,1.61-0.61v-6.71c0-0.65,0.52-1.17,1.17-1.17h4.36c1.47,0,2.8,1.06,2.93,2.52c0.1,1.11-0.47,2.09-1.34,2.61l0,0l-5.39,3.64c-0.32,0.22-0.52,0.58-0.52,0.97v5.16v5.75c0,0.85,0.88,1.42,1.66,1.07l10.33-4.68c0.21-0.1,0.34-0.3,0.34-0.53V22.17C40.66,13.56,33.47,6.62,24.77,7.03z"/></svg>',
        'Gloves': '<svg width="14" height="14" viewBox="0 0 51 51" fill="white"><path d="M40.1,30.03c0.39-0.47,0.59-1.11,0.42-1.8c-0.18-0.76-0.81-1.39-1.58-1.55c-0.81-0.17-1.54,0.14-2.01,0.68l0,0c0,0-0.03,0.04-0.05,0.07c-0.04,0.05-0.08,0.1-0.12,0.15c-0.47,0.61-1.95,2.37-3.29,2.45c-1.62,0.1,2.51-16.14,2.51-16.14l-0.01,0c0.04-0.15,0.07-0.31,0.07-0.48c0-0.98-0.79-1.77-1.77-1.77c-0.81,0-1.49,0.55-1.69,1.29l-0.01,0c0,0-0.01,0.03-0.01,0.05c-0.01,0.05-0.02,0.1-0.03,0.15c-0.24,1.21-1.68,8.2-2.81,8.89C28.48,22.77,28.5,8.79,28.5,8.79c0-0.98-0.79-1.77-1.77-1.77c-0.98,0-1.77,0.79-1.77,1.77c0,0-0.35,12.85-1.73,12.73c-1.37-0.12-2.47-10.67-2.47-10.67c0-0.98-0.79-1.77-1.77-1.77c-0.98,0-1.77,0.79-1.77,1.77c0,0.15,0.02,0.28,0.06,0.42c0.27,2.06,1.36,11.12-0.06,11.12c-1.6,0-3.68-6.35-3.68-6.35l0,0c-0.23-0.62-0.82-1.06-1.52-1.06c-0.9,0-1.62,0.73-1.62,1.62c0,0.09,0.01,0.17,0.03,0.25l-0.03,0.01c0,0,0.02,0.07,0.07,0.19c0.02,0.09,0.05,0.17,0.09,0.25c0.99,2.71,6.28,17.46,7.26,26.23c0.03,0.25,0.24,0.44,0.49,0.44h12.19c0.26,0,0.47-0.19,0.5-0.45c0.1-1.04,0.52-3.68,2.09-5.54c1.8-2.14,6.06-6.89,6.86-7.79c0.02-0.02,0.03-0.04,0.05-0.06C40.07,30.07,40.11,30.03,40.1,30.03L40.1,30.03z"/></svg>',
        'Body Armour': '<svg width="14" height="14" viewBox="0 0 1000 1000" fill="white"><path d="M718 468q7 9 15 17 19 23 38 47 18-9 64-3 23 3 42 8l21-21v-4q0-3-3-7t-11.5-6-24.5-1q-19 2-36-2-13-4-24-10l-34-22-39-17zm142 0q1-2 2-5 3-6 8-11 6-8 16-13-22-13-29-29-7-13-10-44-12-34-36-61-20-21-47-37-20-12-41-20l-17-5-6 5q-7 5-16 7-11 3-23-1 19 56 11 90-3 16-11 22 48 22 78 51 21 25 44 39 19 11 39 14 14 2 27 0zM560 313q23-16 37-32 12-13 18-24 4-9 5-16l1-5q-19-15-38-41-21-30-18-45-8 0-28-9.5T505 128q-20-4-38 2-23 8-45 33-2 19-6 35l-2 12 7 10q10 10 24 17 19 8 42 7 28-1 61-17-16 13-44 21-34 9-65 5-38-5-64-30 4 27 4 34l-4-9 4 9q20 33 53 51 54 28 128 5zM437 173l8-4q23-12 41-13 33-3 66 20-36 28-79 15-22-6-36-18zm-61 78l-1-3zm-40 115q-2-3-4-5-5-7-7-17-4-15-2-35 3-24 13-55-16 5-32-3-8-3-13-8l-17 5q-21 8-41 19-27 17-47 38-24 27-36 61-3 31-9 44-8 16-30 29 14 8 21 19 4 6 6 10l10 2q13 2 27 0 20-3 39-14 23-14 44-39 30-29 78-51zM120 537q11-2 21-4 25-5 45-6 27-1 41 5 29-39 53-64l-9-21-39 17-34 22q-11 6-23 9-18 5-37 3-15-1-23.5 1t-11.5 5.5-4 7.5v4zm517 193q7-54 12-84t8-42.5 5.5-15.5 6.5-2.5 7.5-.5 7.5-8q21-29 19-84-1-31-12-81l-3-17q-9-3-25-13-25-18-50-27-43-15-114-19-71 4-114 19-25 9-51 27-15 10-24 13l-3 17q-11 50-12 81-3 55 18 84 5 7 8.5 8t7.5.5 6 2.5 5.5 15.5 8 42.5 12.5 84q19-13 80 1 31 7 58 16l29-9q34-10 60-13 35-5 49 5zm-309-47q2 34-23 83-13 25-26 43l193 49 6-6q8-6 13-13 7-10 8-19 0 13 13 26 7 7 14 12l192-49-13-21q-14-26-23-49-12-33-13-56-6 14-12 63l-4 27q-28-7-71-3-24 3-64 11l-18 3q-2 13-2 19 0-7-1-19l-19-4q-40-7-64-10-43-4-70 3l-4-26q-3-26-5-36-3-18-7-28z"/></svg>',
        'Ring 1': '<svg width="14" height="14" viewBox="0 0 76 76" fill="white"><path d="M 55.4167,44.3333C 55.4167,53.9523 47.619,61.75 38,61.75C 28.381,61.75 20.5833,53.9523 20.5833,44.3333C 20.5833,35.7312 26.8196,28.5856 35.0177,27.171L 28.5,20.9792L 28.5,19.3958L 33.25,14.25L 42.75,14.25L 47.5,19.3958L 47.5,20.9792L 40.9823,27.171C 49.1804,28.5856 55.4167,35.7312 55.4167,44.3333 Z M 38,31.6667C 31.0044,31.6667 25.3333,37.3377 25.3333,44.3333C 25.3333,51.3289 31.0044,57 38,57C 44.9956,57 50.6667,51.3289 50.6667,44.3333C 50.6667,37.3377 44.9956,31.6667 38,31.6667 Z M 38.7916,24.5417L 43.5416,20.5834L 40.375,20.5834L 38.7916,24.5417 Z M 41.1667,19L 41.5625,15.8334L 38.7916,17.8125L 41.1667,19 Z M 37.2083,24.5417L 35.625,20.5834L 32.4583,20.5834L 37.2083,24.5417 Z M 34.8333,19L 37.2083,17.8125L 34.4375,15.8333L 34.8333,19 Z "/></svg>',
        'Ring 2': '<svg width="14" height="14" viewBox="0 0 76 76" fill="white"><path d="M 55.4167,44.3333C 55.4167,53.9523 47.619,61.75 38,61.75C 28.381,61.75 20.5833,53.9523 20.5833,44.3333C 20.5833,35.7312 26.8196,28.5856 35.0177,27.171L 28.5,20.9792L 28.5,19.3958L 33.25,14.25L 42.75,14.25L 47.5,19.3958L 47.5,20.9792L 40.9823,27.171C 49.1804,28.5856 55.4167,35.7312 55.4167,44.3333 Z M 38,31.6667C 31.0044,31.6667 25.3333,37.3377 25.3333,44.3333C 25.3333,51.3289 31.0044,57 38,57C 44.9956,57 50.6667,51.3289 50.6667,44.3333C 50.6667,37.3377 44.9956,31.6667 38,31.6667 Z M 38.7916,24.5417L 43.5416,20.5834L 40.375,20.5834L 38.7916,24.5417 Z M 41.1667,19L 41.5625,15.8334L 38.7916,17.8125L 41.1667,19 Z M 37.2083,24.5417L 35.625,20.5834L 32.4583,20.5834L 37.2083,24.5417 Z M 34.8333,19L 37.2083,17.8125L 34.4375,15.8333L 34.8333,19 Z "/></svg>',
        'Amulet': '<svg width="14" height="14" viewBox="0 0 64 64" fill="white"><path d="M22.727,21.9c-0.724-0.725-1.728-1.124-2.753-1.068c-1.024,0.046-1.99,0.525-2.646,1.313l-0.479,0.575c-1.13,1.357-1.13,3.328,0,4.686c0,0,0,0,0.001,0.001l0.479,0.574c0.657,0.788,1.622,1.267,2.646,1.313c1.026,0.051,2.029-0.343,2.753-1.068l1.748-1.748l2.349,2.348l-1.927,1.927c-1.428,1.427-1.428,3.75,0,5.177c0.714,0.714,1.65,1.071,2.589,1.07c0.937,0,1.874-0.356,2.588-1.07L31,35.001V37h-1c-0.553,0-1,0.448-1,1v4.942L27.006,60.89c-0.031,0.283,0.06,0.565,0.249,0.777S27.716,62,28,62h8c0.284,0,0.556-0.121,0.745-0.333s0.28-0.495,0.249-0.777L35,42.942V38c0-0.552-0.447-1-1-1h-1v-1.999l0.927,0.927c1.429,1.429,3.75,1.427,5.177,0c1.428-1.427,1.428-3.75,0-5.177l-1.927-1.927l2.349-2.348l1.748,1.748c0.725,0.726,1.735,1.115,2.753,1.068c1.024-0.046,1.989-0.525,2.646-1.313l0.479-0.575c1.13-1.358,1.13-3.329-0.001-4.687l-0.478-0.573c-0.657-0.789-1.623-1.268-2.647-1.313c-1.019-0.053-2.028,0.343-2.753,1.068l-1.748,1.748l-2.349-2.349l1.927-1.927c1.428-1.427,1.428-3.75,0-5.177c-1.427-1.427-3.748-1.428-5.177,0l-0.294,0.294l1.979-8.226c0.307-1.123,0.083-2.301-0.616-3.232C34.281,2.08,33.189,1.534,32,1.534s-2.281,0.546-2.995,1.498c-0.699,0.932-0.923,2.11-0.624,3.202l1.986,8.256l-0.294-0.294c-1.428-1.428-3.749-1.427-5.177,0c-1.428,1.427-1.428,3.75,0,5.177l1.927,1.927l-2.349,2.349L22.727,21.9z M21.313,26.81c-0.334,0.334-0.793,0.506-1.248,0.484c-0.473-0.021-0.899-0.233-1.202-0.596l-0.478-0.573c-0.513-0.616-0.513-1.511-0.001-2.126l0.479-0.574c0.303-0.363,0.729-0.575,1.201-0.596c0.466-0.017,0.914,0.151,1.248,0.485l1.748,1.748L21.313,26.81z M31,39h2v3h-2V39z M29.117,60l1.778-16h2.209l1.778,16H29.117z M42.688,23.314c0.333-0.334,0.783-0.5,1.248-0.485c0.473,0.021,0.898,0.233,1.202,0.597l0.478,0.573c0.513,0.616,0.513,1.511,0.001,2.126l-0.479,0.574c-0.303,0.363-0.729,0.575-1.202,0.596c-0.442,0.022-0.913-0.15-1.248-0.484l-1.748-1.748L42.688,23.314z M28.659,34.514c-0.648,0.648-1.7,0.647-2.349,0c-0.647-0.647-0.647-1.701,0-2.349l1.927-1.926l2.349,2.348L28.659,34.514z M32,18.951l2.349,2.349L32,23.647l-2.349-2.348L32,18.951z M34.349,28.824L32,31.173l-2.349-2.349L32,26.476L34.349,28.824z M37.689,32.165c0.647,0.647,0.647,1.701,0,2.349c-0.649,0.648-1.701,0.647-2.349,0l-1.927-1.927l2.349-2.348L37.689,32.165z M38.111,25.062l-2.349,2.348l-2.349-2.349l2.349-2.348L38.111,25.062z M35.341,15.61c0.649-0.648,1.701-0.646,2.349,0c0.647,0.647,0.647,1.701,0,2.349l-1.927,1.927l-2.349-2.349L35.341,15.61z M30.604,4.232C30.938,3.789,31.445,3.534,32,3.534s1.063,0.254,1.396,0.698c0.325,0.434,0.43,0.982,0.278,1.534L32,12.725l-1.682-6.989C30.175,5.214,30.279,4.666,30.604,4.232z M26.311,17.958c-0.647-0.647-0.647-1.701,0-2.349c0.324-0.324,0.749-0.485,1.175-0.485c0.425,0,0.85,0.162,1.174,0.485l1.927,1.927l-2.349,2.349L26.311,17.958z M28.237,22.713l2.349,2.348l-2.349,2.349l-2.349-2.348L28.237,22.713z"/></svg>',
        'Weapon 1': '<svg width="14" height="14" viewBox="0 -8 72 72" fill="white"><path d="M12.31,45.37a1.63,1.63,0,0,1,.39-2.31l10.28-8c-.85-1.23.15-1.65.15-1.65l-.83-2.2c-.74-1.53.7-3,.7-3l8.83-6.51a2.66,2.66,0,0,1,3.76.72l1.78-1a1.45,1.45,0,0,1,.52-2l9.44-7.48V8.5c.11-1.88,1.1-1.1,1.1-1.1l3.15,3.1s6.83-5.79,7.31-6.22.91.31.91.31.4.47.15.75-6.56,6-6.56,6l.18,1.53-.57.63-1-1-1.71,1.63a2.53,2.53,0,0,1-.61,2.38l-7.4,7.77c-1.35,1.13-2,.31-2,.31L38.78,26.2c-.63.94,2.15,3.31,2.15,3.31l-.25.68A27.55,27.55,0,0,0,48.2,35.6l-3.32,5.07A20.41,20.41,0,0,1,38,35.92L35.17,37.5c-2.52,1.87-2.06,3.09-2.06,3.09L33.58,44c1.7.79.31,1.53.31,1.53l-2.63,1.2c-1.74,1.1-1.7-.29-1.7-.29l-.22-6.7c-1.06-2.41-2.64-1.22-2.64-1.22a31.25,31.25,0,0,0-5,5.61L21.17,50c-1,2.87-2.74,1.52-2.74,1.52l-4.32-4.34Z"/></svg>',
        'Weapon 2': '<svg width="14" height="14" viewBox="0 0 52 52" fill="white"><path d="M4.8,14h42.4c1,0,1.8-1,1.5-2c-1-3.3-2.4-6.3-4.3-9c-0.6-0.8-1.7-0.9-2.3-0.2c-1.9,1.8-4.6,2.8-7.4,2.8c-3,0-5.7-1.2-7.7-3.2c-0.6-0.6-1.6-0.6-2.2,0c-2,2-4.7,3.2-7.7,3.2c-2.8,0-5.4-1-7.4-2.8C9,2.2,7.9,2.3,7.4,3C5.5,5.6,4,8.7,3.1,12C3,13,3.8,14,4.8,14z"/><path d="M50,20.4c0-0.9-0.7-1.4-1.6-1.4H3.6C2.7,19,2,19.5,2,20.4c0,0.1,0,0.2,0,0.3c0,15,10.4,27.4,24,29.3c13.6-1.9,24-14.3,24-29.2C50,20.6,50,20.5,50,20.4z"/></svg>',
        'Jewel': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><polygon points="6 3 18 3 22 9 12 22 2 9"/><path d="M12 22l4-13-3-6"/><path d="M12 22L8 9l3-6"/><path d="M2 9h20"/></svg>',
        'Flask': '<svg width="14" height="14" viewBox="0 0 36 36" fill="white"><path d="M31.49,27.4,23,14.94V4h1a1,1,0,0,0,0-2H12.08a1,1,0,0,0,0,2H13V14.94L4.58,27.31a4.31,4.31,0,0,0-.78,3A4.23,4.23,0,0,0,8,34H27.86A4.36,4.36,0,0,0,31,32.8,4.23,4.23,0,0,0,31.49,27.4ZM15,15.49V4h6V15.49L26.15,23H9.85Z"/></svg>',
        'Boots': '<svg width="14" height="14" viewBox="0 0 51 51" fill="white"><path d="M13,7.6c3.63,0,10.02,0,13.96,0c1.73,0,2.99,1.64,2.54,3.32l-5.44,20.46c-0.07,0.28,0.03,0.57,0.28,0.72c0.99,0.62,4.64,2.57,8.15,5.78c0.12,0.11,2.92-0.03,3.09-0.01c2.31,0.2,3.97-0.08,5.05,4.7c0.09,0.42-0.21,0.82-0.64,0.82c-4.21,0-24.43,0-28.17,0c-0.34,0-0.63-0.26-0.66-0.61c-0.15-1.82-0.4-7.23,1.74-9.32c0.17-0.16,0.25-0.37,0.2-0.6c-0.39-1.74-2.09-9.83-2.74-22.48C10.29,8.88,11.48,7.6,13,7.6z"/></svg>',
        'Belt': '<svg width="14" height="14" viewBox="0 0 298 298" fill="white"><path d="M292.983,139.187l-29.497-22.068c-6.289-4.72-14.065-7.282-22.073-7.282h-21.714V80.9c0-6.903-5.597-12.5-12.5-12.5H51.64c-6.903,0-12.5,5.597-12.5,12.5v28.937H13.197C5.91,109.837,0,115.445,0,122.363v53.294c0,6.898,5.91,12.506,13.197,12.506H39.14V217.1c0,6.903,5.597,12.5,12.5,12.5h155.559c6.903,0,12.5-5.597,12.5-12.5v-28.937h21.714c8.008,0,15.784-2.561,22.073-7.261l29.497-22.068c3.172-2.381,5.017-5.991,5.017-9.824C298,145.178,296.154,141.567,292.983,139.187z M206.96,158.813c-5.421,0-9.813-4.395-9.813-9.813s4.392-9.813,9.813-9.813c5.42,0,9.813,4.395,9.813,9.813S212.381,158.813,206.96,158.813z M194.699,204.6H64.14V93.4h130.559v16.588H81.973V139H113c5.522,0,10,4.478,10,10c0,5.523-4.478,10-10,10H81.973v29.012h112.726V204.6z M173.392,149c0,5.417-4.392,9.813-9.813,9.813c-5.421,0-9.813-4.395-9.813-9.813s4.392-9.813,9.813-9.813C168.999,139.188,173.392,143.583,173.392,149z"/></svg>'
      };
      
      // Check for partial matches (e.g., "Flask 1" -> "Flask")
      for (const [key, icon] of Object.entries(icons)) {
        if (slotName.includes(key)) {
          return icon;
        }
      }
      
      return '◆';
    }
    
    // Listen for gear updates
    ipcRenderer.on('gear-updated', (event, itemSets) => {
      allItemSets = itemSets;
      if (currentSetIndex >= allItemSets.length) {
        currentSetIndex = 0;
      }
      smoothRenderGear();
    });
    
    // Listen for context updates (act/level changes)
    ipcRenderer.on('gear-context-update', (event, payload) => {
      const { currentAct: newAct, characterLevel: newLevel } = payload;
      currentAct = newAct || 1;
      characterLevel = newLevel || 1;
      
      // Only run auto-detection if enabled
      if (!autoDetectEnabled) {
        console.log(\`[GearWindow] Auto-detect disabled, keeping current selection: \${currentSetIndex}\`);
        return;
      }
      
      // Run auto-detection to find best gear set
      const visibleSets = filterItemSets(allItemSets);
      if (visibleSets && visibleSets.length > 0) {
        const bestIndex = findBestGearSet(allItemSets, currentAct, characterLevel);
        if (bestIndex !== -1 && bestIndex !== currentSetIndex) {
          console.log(\`[GearWindow] Context changed, switching from set \${currentSetIndex} to \${bestIndex}\`);
          currentSetIndex = bestIndex;
          const selector = document.getElementById('setSelector');
          if (selector) selector.value = currentSetIndex;
          ipcRenderer.send('gear-window-set-selected', currentSetIndex);
          renderCurrentSet();
        }
      }
    });
    
    // Initialize
    if (isUltraMinimal) {
      document.body.classList.add('ultra-minimal');
      document.getElementById('minimalBtn').classList.add('active');
    }
    
    // Initial render
    renderCurrentSet();
  </script>
</body>
</html>
  `;
}
