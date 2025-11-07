import { BrowserWindow, ipcMain } from 'electron';
import { registerOverlayWindow, bringToFront, updateOverlayWindowPinned } from './windowZManager.js';
import type { OverlayVersion } from '../../types/overlayVersion.js';
import type { SettingsService } from '../services/settingsService.js';
import { getActiveBuild } from '../../shared/pob/buildManager.js';
import gemsData from '../../data/leveling-data/gems.json';
import gemColoursData from '../../data/leveling-data/gem-colours.json';
import gemAcquisitionData from '../../data/leveling-data/gem-acquisition.json';

interface LevelingGemsWindowOptions {
  settingsService: SettingsService;
  overlayVersion: OverlayVersion;
  parentWindow?: BrowserWindow;
}

let gemsWindow: BrowserWindow | null = null;

export function openLevelingGemsWindow(options: LevelingGemsWindowOptions): BrowserWindow {
  const { settingsService, overlayVersion, parentWindow } = options;

  // If window already exists, focus it
  if (gemsWindow && !gemsWindow.isDestroyed()) {
    gemsWindow.focus();
    return gemsWindow;
  }

  // Get saved window position or use defaults
  const settingsKey = overlayVersion === 'poe1' ? 'levelingWindowPoe1' : 'levelingWindowPoe2';
  const savedSettings = settingsService.get(settingsKey) || {};
  const gemsWindowSettings = (savedSettings as any).gemsWindow || {};
  const { x = 100, y = 100, width = 450, height = 600, ultraMinimal = false, pinned = true } = gemsWindowSettings;

  gemsWindow = new BrowserWindow({
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
    // Important: avoid owned/parent windows so z-order among overlays is free on Windows
    // Parent windows force a z-order group on Win32 where children cannot rise above other top-level windows
    // which breaks click-to-front across sibling overlays. We intentionally do NOT set `parent` here.
  });

  gemsWindow.setIgnoreMouseEvents(false);
  // Debounce timers for position/size saves
  let _moveTimer = null as any;
  let _resizeTimer = null as any;

  // Register and elevate when shown/focused
  try { registerOverlayWindow('gems', gemsWindow, pinned); } catch {}

  // Get current PoB build data from the new builds list (pobBuilds) instead of legacy pobBuild
  const pobBuilds = (savedSettings as any).pobBuilds;
  const pobBuild = pobBuilds ? getActiveBuild(pobBuilds) : ((savedSettings as any).pobBuild || null);
  
  const currentActIndex = (savedSettings as any).currentActIndex || 0;
  const characterLevel = (savedSettings as any).characterLevel || 1;
  const savedGemsIndex = (savedSettings as any).selectedGemsIndex ?? -1;
  const autoDetectEnabled = (savedSettings as any).uiSettings?.autoDetectLevelingSets ?? true;
  
  // Determine initial act: use saved index if available and valid, otherwise use current game act
  let initialAct;
  if (savedGemsIndex >= 0 && !autoDetectEnabled) {
    // User has manually selected a set and auto-detect is off
    initialAct = savedGemsIndex + 1; // Convert 0-based index to 1-based act
  } else {
    // Use current game act
    initialAct = currentActIndex + 1;
  }

  const html = buildLevelingGemsWindowHtml(pobBuild, initialAct, characterLevel, overlayVersion, ultraMinimal, autoDetectEnabled, savedGemsIndex, pinned);
  gemsWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  // Save position on move
  gemsWindow.on('move', () => {
    if (!gemsWindow || gemsWindow.isDestroyed()) return;
    if (_moveTimer) clearTimeout(_moveTimer);
    _moveTimer = setTimeout(() => {
      if (!gemsWindow || gemsWindow.isDestroyed()) return;
      const [newX, newY] = gemsWindow.getPosition();
      settingsService.update(settingsKey, (current: any) => ({
        ...current,
        gemsWindow: {
          ...(current.gemsWindow || {}),
          x: newX,
          y: newY,
        },
      }));
    }, 150);
  });

  // Save size on resize
  gemsWindow.on('resize', () => {
    if (!gemsWindow || gemsWindow.isDestroyed()) return;
    if (_resizeTimer) clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      if (!gemsWindow || gemsWindow.isDestroyed()) return;
      const [newWidth, newHeight] = gemsWindow.getSize();
      settingsService.update(settingsKey, (current: any) => ({
        ...current,
        gemsWindow: {
          ...(current.gemsWindow || {}),
          width: newWidth,
          height: newHeight,
        },
      }));
    }, 150);
  });

  gemsWindow.on('closed', () => {
    gemsWindow = null;
  });
  
  // Handle ultra minimal mode toggle
  ipcMain.on('gems-window-toggle-minimal', (event, isMinimal) => {
    if (!gemsWindow || gemsWindow.isDestroyed()) return;
    
    // Don't use click-through at all - we need buttons to work
    // Instead, we'll just make the window transparent and rely on CSS
    
    // Save minimal mode state
    settingsService.update(settingsKey, (current: any) => ({
      ...current,
      gemsWindow: {
        ...(current.gemsWindow || {}),
        ultraMinimal: isMinimal,
      },
    }));
  });
  
  // Handle pin toggle
  ipcMain.on('gems-window-toggle-pinned', (event, isPinned) => {
    if (!gemsWindow || gemsWindow.isDestroyed()) return;
    gemsWindow.setAlwaysOnTop(isPinned);
    
    // Update the window manager's pinned state
    try { updateOverlayWindowPinned('gems', isPinned); } catch {}
    
    // Save pinned state
    settingsService.update(settingsKey, (current: any) => ({
      ...current,
      gemsWindow: {
        ...(current.gemsWindow || {}),
        pinned: isPinned,
      },
    }));
  });

  return gemsWindow;
}

export function updateLevelingGemsWindow(currentAct: number, overlayVersion: OverlayVersion, settingsService: SettingsService) {
  if (!gemsWindow || gemsWindow.isDestroyed()) return;

  // Send act update to renderer
  gemsWindow.webContents.send('gems-window-act-changed', currentAct);
}

export function updateLevelingGemsWindowBuild(pobBuild: any, overlayVersion: OverlayVersion, settingsService: SettingsService) {
  if (!gemsWindow || gemsWindow.isDestroyed()) return;

  // Send build update to renderer
  gemsWindow.webContents.send('gems-window-build-updated', pobBuild);
}

export function updateLevelingGemsWindowCharacterLevel(level: number) {
  if (!gemsWindow || gemsWindow.isDestroyed()) return;

  // Send character level update to renderer
  gemsWindow.webContents.send('character-level-up', { level });
}

export function closeLevelingGemsWindow() {
  if (gemsWindow && !gemsWindow.isDestroyed()) {
    gemsWindow.close();
    gemsWindow = null;
  }
}

export function isGemsWindowOpen(): boolean {
  return gemsWindow !== null && !gemsWindow.isDestroyed();
}

function buildLevelingGemsWindowHtml(pobBuild: any, currentAct: number, characterLevel: number, overlayVersion: OverlayVersion, ultraMinimal: boolean = false, autoDetectEnabled: boolean = true, savedGemsIndex: number = -1, pinned: boolean = true): string {
  const className = pobBuild?.className || 'No Build Loaded';
  const ascendancy = pobBuild?.ascendancyName || '';
  const level = pobBuild?.level || 0;

  // Extract unique gem names from the PoB build
  const uniqueGemNames = new Set<string>();
  if (pobBuild?.skillSets) {
    for (const skillSet of pobBuild.skillSets) {
      if (skillSet?.socketGroups) {
        for (const group of skillSet.socketGroups) {
          if (group?.gems) {
            for (const gem of group.gems) {
              const gemName = (gem.nameSpec || gem.gemId || '').replace(/^Support:\s*/, '').trim();
              if (gemName) {
                uniqueGemNames.add(gemName);
                // Also add the "X Support" variant for supports
                if (gem.supportGem || gem.isSupport || /support/i.test(gem.skillId || '')) {
                  uniqueGemNames.add(gemName + ' Support');
                }
              }
            }
          }
        }
      }
    }
  } else if (pobBuild?.socketGroups) {
    for (const group of pobBuild.socketGroups) {
      if (group?.gems) {
        for (const gem of group.gems) {
          const gemName = (gem.nameSpec || gem.gemId || '').replace(/^Support:\s*/, '').trim();
          if (gemName) {
            uniqueGemNames.add(gemName);
            if (gem.supportGem || gem.isSupport || /support/i.test(gem.skillId || '')) {
              uniqueGemNames.add(gemName + ' Support');
            }
          }
        }
      }
    }
  }

  // Filter acquisition data to only include gems used in this build
  const filteredAcquisition: Record<string, any> = {};
  const acquisitionDataAsRecord = gemAcquisitionData as Record<string, any>;
  for (const gemName of uniqueGemNames) {
    if (acquisitionDataAsRecord[gemName]) {
      filteredAcquisition[gemName] = acquisitionDataAsRecord[gemName];
    }
  }

  // Inject JSON data
  const gemsJSON = JSON.stringify(gemsData);
  const gemColoursJSON = JSON.stringify(gemColoursData);
  const gemAcquisitionJSON = JSON.stringify(filteredAcquisition);

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
      --bg-card: #252525;
      --text-primary: #ffffff;
      --text-secondary: #b0b0b0;
      --text-muted: #808080;
      --border-color: #404040;
      --accent-blue: #4a9eff;
      --accent-green: #5cb85c;
      --accent-red: #d9534f;
      --gem-str: #ff4444;
      --gem-dex: #44ff44;
      --gem-int: #4444ff;
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
    
    .act-nav-btn {
      width: 20px;
      height: 20px;
      background: rgba(74, 158, 255, 0.1);
      border: 1px solid rgba(74, 158, 255, 0.3);
      border-radius: 3px;
      color: var(--accent-blue);
      font-size: 11px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
      flex-shrink: 0;
    }
    
    .act-nav-btn:hover:not(.disabled) {
      background: rgba(74, 158, 255, 0.2);
      border-color: rgba(74, 158, 255, 0.5);
    }
    
    .act-nav-btn.disabled {
      opacity: 0.25;
      cursor: not-allowed;
    }
    
    .minimal-btn {
      width: 20px;
      height: 20px;
      background: rgba(74, 158, 255, 0.1);
      border: 1px solid rgba(74, 158, 255, 0.3);
      border-radius: 3px;
      color: var(--accent-blue);
      font-size: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
      flex-shrink: 0;
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
      width: 20px;
      height: 20px;
      background: rgba(74, 158, 255, 0.1);
      border: 1px solid rgba(74, 158, 255, 0.3);
      border-radius: 3px;
      color: var(--accent-blue);
      font-size: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
      flex-shrink: 0;
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
      width: 20px;
      height: 20px;
      background: rgba(217, 83, 79, 0.1);
      border: 1px solid rgba(217, 83, 79, 0.3);
      border-radius: 3px;
      color: var(--accent-red);
      font-size: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
      flex-shrink: 0;
    }
    
    .close-btn:hover {
      background: rgba(217, 83, 79, 0.2);
      border-color: rgba(217, 83, 79, 0.5);
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
    
    body.ultra-minimal .socket-group {
      pointer-events: auto;
    }
    
    body.ultra-minimal .gem-item {
      pointer-events: auto;
    }
    
    .content {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      opacity: 1;
      transition: opacity 0.1s ease;
    }
    
    .content.updating {
      opacity: 0;
    }
    
    .no-build {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-muted);
      gap: 12px;
    }
    
    .no-build-icon {
      font-size: 64px;
      opacity: 0.3;
    }
    
    .no-build-text {
      font-size: 14px;
    }
    
    .socket-group {
      background: rgba(37, 37, 37, 0.6);
      border: 1px solid rgba(64, 64, 64, 0.5);
      border-radius: 6px;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    
    .socket-group-header {
      display: flex;
      align-items: center;
      gap: 4px;
      padding-bottom: 6px;
      margin-bottom: 6px;
      border-bottom: 1px solid rgba(74, 158, 255, 0.15);
    }
    
    .socket-count {
      font-size: 9px;
      color: rgba(150, 150, 150, 0.8);
      font-weight: 500;
      letter-spacing: 0.5px;
      background: rgba(50, 50, 50, 0.5);
      padding: 2px 6px;
      border-radius: 3px;
      border: 1px solid rgba(100, 100, 100, 0.3);
    }
    
    .gems-list {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px;
    }
    
    .gem-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 6px;
      background: rgba(255, 255, 255, 0.015);
      border-radius: 3px;
      border-left: 2px solid var(--gem-color);
      transition: all 0.15s;
    }
    
    .gem-item:hover {
      background: rgba(255, 255, 255, 0.04);
    }
    
    .gem-item.str {
      --gem-color: var(--gem-str);
    }
    
    .gem-item.dex {
      --gem-color: var(--gem-dex);
    }
    
    .gem-item.int {
      --gem-color: var(--gem-int);
    }
    
    .gem-item.support {
      opacity: 0.85;
    }
    
    .gem-icon {
      font-size: 12px;
      width: 16px;
      text-align: center;
    }
    
    .gem-image {
      width: 24px;
      height: 24px;
      object-fit: contain;
      flex-shrink: 0;
    }
    
    .gem-image.poe2 {
      border-radius: 4px;
      border: 1px solid rgba(74, 158, 255, 0.3);
      background: rgba(0, 0, 0, 0.3);
      padding: 2px;
    }
    
    .gem-name {
      flex: 1;
      font-size: 11px;
      color: var(--text-primary);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .gem-name.support {
      font-style: italic;
      color: var(--text-secondary);
    }
    
    .gem-level {
      font-size: 9px;
      color: var(--text-muted);
      background: rgba(0, 0, 0, 0.3);
      padding: 1px 4px;
      border-radius: 2px;
      font-family: monospace;
    }
    
    .gem-quest-info {
      font-size: 9px;
      color: var(--accent-green);
      padding: 1px 5px;
      border-radius: 2px;
      background: rgba(74, 222, 128, 0.08);
      border: 1px solid rgba(74, 222, 128, 0.25);
    }
    
    .gem-quest-info.buy {
      color: var(--accent-blue);
      background: rgba(74, 158, 255, 0.08);
      border-color: rgba(74, 158, 255, 0.25);
    }
    
    .act-filter {
      background: var(--bg-secondary);
      padding: 6px 8px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 11px;
      margin-bottom: 8px;
    }
    
    .act-filter-info {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .act-filter-label {
      color: var(--text-secondary);
    }
    
    .act-filter-value {
      color: var(--accent-blue);
      font-weight: 600;
    }
    
    .act-filter-controls {
      display: flex;
      gap: 4px;
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
    
    .gem-set-dropdown {
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid rgba(74, 158, 255, 0.3);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 11px;
      cursor: pointer;
      outline: none;
      max-width: 200px;
      position: relative;
      z-index: 10000;
    }
    
    .gem-set-dropdown:hover {
      border-color: rgba(74, 158, 255, 0.5);
      background: rgba(74, 158, 255, 0.05);
    }
    
    .gem-set-dropdown option {
      background: var(--bg-secondary);
      color: var(--text-primary);
      padding: 4px;
    }
    
    .gem-info-btn {
      width: 16px;
      height: 16px;
      background: transparent;
      border: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 0;
      flex-shrink: 0;
      transition: all 0.15s;
      margin-left: 4px;
      opacity: 0.5;
    }
    
    .gem-info-btn svg {
      width: 16px;
      height: 16px;
      display: block;
    }
    
    .gem-info-btn:hover {
      transform: scale(1.1);
      opacity: 0.8;
    }
    
    .gem-info-btn:active {
      transform: scale(0.95);
    }
    
    /* Modal overlay */
    #gem-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.75);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 100000;
      backdrop-filter: blur(3px);
    }
    
    #gem-modal-overlay.active {
      display: flex;
    }
    
    #gem-modal {
      background: rgba(20, 20, 28, 0.98);
      border: 1px solid rgba(74, 158, 255, 0.4);
      border-radius: 6px;
      max-width: 700px;
      max-height: 80vh;
      width: 90%;
      display: flex;
      flex-direction: column;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05);
      overflow: hidden;
    }
    
    .modal-header {
      padding: 12px 16px;
      background: rgba(74, 158, 255, 0.15);
      border-bottom: 1px solid rgba(74, 158, 255, 0.3);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .modal-title {
      font-size: 13px;
      font-weight: 600;
      color: #ffffff;
    }
    
    .modal-close {
      width: 24px;
      height: 24px;
      border-radius: 3px;
      background: rgba(217, 83, 79, 0.15);
      border: 1px solid rgba(217, 83, 79, 0.3);
      color: #d9534f;
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
    }
    
    .modal-close:hover {
      background: rgba(217, 83, 79, 0.25);
      border-color: rgba(217, 83, 79, 0.5);
    }
    
    .modal-body {
      padding: 16px;
      overflow-y: auto;
      flex: 1;
    }
    
    .gem-description {
      padding: 12px;
      margin-bottom: 16px;
      background: rgba(74, 158, 255, 0.08);
      border-left: 3px solid rgba(74, 158, 255, 0.5);
      border-radius: 4px;
      font-size: 11px;
      line-height: 1.6;
      color: #b8d4f1;
    }
    
    .details-button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      margin-bottom: 16px;
      background: rgba(74, 158, 255, 0.15);
      border: 1px solid rgba(74, 158, 255, 0.3);
      border-radius: 4px;
      color: #4A9EFF;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }
    
    .details-button:hover {
      background: rgba(74, 158, 255, 0.25);
      border-color: rgba(74, 158, 255, 0.5);
      transform: translateY(-1px);
    }
    
    .modal-section {
      margin-bottom: 20px;
    }
    
    .modal-section:last-child {
      margin-bottom: 0;
    }
    
    .modal-section-title {
      font-size: 11px;
      font-weight: 600;
      color: #aaaaaa;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(74, 158, 255, 0.2);
    }
    
    .modal-section-desc {
      font-size: 10px;
      color: #b0b0b0;
      line-height: 1.5;
      margin-bottom: 12px;
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.02);
      border-left: 2px solid rgba(74, 158, 255, 0.3);
      border-radius: 3px;
    }
    
    .modal-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    
    .modal-table thead th {
      padding: 6px 8px;
      text-align: center;
      font-weight: 600;
      color: #999;
      background: rgba(255, 255, 255, 0.03);
      border-bottom: 2px solid rgba(74, 158, 255, 0.2);
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    
    .modal-table tbody td {
      padding: 8px;
      text-align: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    }
    
    .modal-table tbody tr:hover {
      background: rgba(74, 158, 255, 0.05);
    }
    
    .modal-table tbody tr:last-child td {
      border-bottom: none;
    }
    
    .quest-cell {
      text-align: left !important;
      padding-left: 12px !important;
    }
    
    .quest-name {
      font-weight: 600;
      color: #e0e0e0;
      font-size: 10px;
      margin-bottom: 2px;
    }
    
    .quest-act {
      font-size: 9px;
      color: #888;
    }
    
    .quest-npc {
      font-size: 8px;
      color: #666;
      font-style: italic;
    }
    
    .availability-yes {
      color: #5cb85c;
      font-size: 14px;
    }
    
    .availability-no {
      color: #d9534f;
      opacity: 0.3;
      font-size: 14px;
    }
    
    .availability-partial {
      color: #f0ad4e;
      font-size: 14px;
    }
    
    .availability-na {
      color: #666;
      font-size: 14px;
    }
    
    .availability-unknown {
      color: #888;
    }
    
    /* Highlight the active character class column */
    .modal-table thead th.active-class {
      background: rgba(74, 158, 255, 0.25);
      color: #4A9EFF;
      font-weight: 700;
    }
    
    .modal-table tbody td.active-class {
      background: rgba(74, 158, 255, 0.15);
      font-weight: 600;
    }
    
    .modal-subsection {
      margin-top: 16px;
      padding: 12px;
      background: rgba(255, 255, 255, 0.02);
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    
    .modal-subsection-title {
      font-size: 10px;
      font-weight: 600;
      color: #aaa;
      margin-bottom: 8px;
    }
    
    .modal-list {
      margin: 0;
      padding-left: 20px;
      font-size: 9px;
      color: #b0b0b0;
      line-height: 1.6;
    }
    
    .modal-list li {
      margin-bottom: 4px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-title">
      <h1>💎 Gem Links</h1>
      <div class="header-subtitle">${ascendancy || className} - Level ${level}</div>
    </div>
    <div class="header-controls">
      <div class="pin-btn active" onclick="togglePinned()" id="pinBtn" title="Toggle Always On Top">📌</div>
      <div class="minimal-btn" onclick="toggleMinimalMode()" id="minimalBtn" title="Toggle Ultra Minimal Mode">◐</div>
      <div class="close-btn" onclick="closeWindow()">×</div>
    </div>
  </div>
  
  <div class="content" id="content">
    <!-- Content will be rendered by JavaScript -->
  </div>
  
  <!-- Modal for gem acquisition info -->
  <div id="gem-modal-overlay">
    <div id="gem-modal">
      <div class="modal-header">
        <div class="modal-title" id="modal-title">Gem Acquisition</div>
        <button class="modal-close" onclick="closeGemModal()">×</button>
      </div>
      <div class="modal-body" id="modal-body">
        <!-- Content injected by JS -->
      </div>
    </div>
  </div>
  
  <script>
    const { ipcRenderer } = require('electron');
    const path = require('path');
    const fs = require('fs');
    // Ensure clicking this window brings it to front above other overlays
    try {
      document.addEventListener('mousedown', () => {
        try { ipcRenderer.send('overlay-window-focus', 'gems'); } catch {}
      }, { capture: true });
      window.addEventListener('focus', () => {
        try { ipcRenderer.send('overlay-window-focus', 'gems'); } catch {}
      });
    } catch {}
    
    let currentBuild = ${JSON.stringify(pobBuild)};
    let currentAct = ${currentAct};
    let characterLevel = ${characterLevel}; // Current character level from client.txt
    let skillSetIndex = 0; // Current skill set index
    let manualSelection = false; // Flag to track if user manually selected a set
    let isUltraMinimal = ${ultraMinimal};
    let isPinned = ${pinned};
    let autoDetectEnabled = ${autoDetectEnabled};
    let savedGemsIndex = ${savedGemsIndex};
  let gemDatabase = {};
  let gemColours = {};
  let gemAcquisition = {};
    const overlayVersion = '${overlayVersion}';
    
    // Injected JSON data from main process
  const INJECTED_GEMS_DATA = ${gemsJSON};
  const INJECTED_GEM_COLOURS = ${gemColoursJSON};
  const INJECTED_GEM_ACQUISITION = ${gemAcquisitionJSON};
    
    // Load gem database
    async function loadGemDatabase() {
      try {
        gemDatabase = INJECTED_GEMS_DATA;
        console.log('[GemsWindow] Loaded', Object.keys(gemDatabase).length, 'gems from injected data');
      } catch (err) {
        console.error('[GemsWindow] Failed to load gem database:', err);
        gemDatabase = {};
      }
    }
    
    // Load gem colors data
    async function loadGemColors() {
      try {
        gemColours = INJECTED_GEM_COLOURS;
        console.log('[GemsWindow] Loaded gem color mapping:', gemColours);
      } catch (err) {
        console.error('[GemsWindow] Failed to load gem colors:', err);
        gemColours = {
          'strength': '#ff3333',
          'dexterity': '#33ff33',
          'intelligence': '#3333ff',
          'none': '#ffffff'
        };
      }
    }
    
    // Load acquisition dataset scraped from PoE Wiki
    async function loadGemAcquisition() {
      try {
        gemAcquisition = INJECTED_GEM_ACQUISITION || {};
        console.log('[GemsWindow] Loaded acquisition dataset with', Object.keys(gemAcquisition).length, 'entries');
      } catch (err) {
        console.error('[GemsWindow] Failed to load acquisition data:', err);
        gemAcquisition = {};
      }
    }
    
    function getGemColor(gemName, isSupport) {
      // PoE1 database uses "<Name> Support" naming; PoE2 uses base names
      const lookupName = (overlayVersion === 'poe1' && isSupport)
        ? gemName + ' Support'
        : gemName;
      const cleanName = lookupName.replace(/^Support: /, '');
      
      // Try to get color from gem database (available for PoE1)
      if (overlayVersion === 'poe1' && gemDatabase && gemColours && Object.keys(gemDatabase).length > 0) {
        const gemEntry = Object.values(gemDatabase).find(
          (g) => g.name.toLowerCase() === cleanName.toLowerCase()
        );
        if (gemEntry) {
          const attribute = gemEntry.primary_attribute;
          console.log(\`[GemsWindow] Gem "\${gemName}" (lookup: "\${cleanName}") -> attribute: \${attribute}\`);
          
          // Map full attribute name to short code for CSS class
          if (attribute === 'strength') return 'str';
          if (attribute === 'dexterity') return 'dex';
          if (attribute === 'intelligence') return 'int';
          
          return 'int'; // Fallback
        } else {
          console.log(\`[GemsWindow] NO MATCH in database for: \${cleanName} (original: \${gemName}, isSupport: \${isSupport})\`);
        }
      }
      
      // Fallback to blue for unknown gems
      return 'int';
    }
    
    // Robust support detection that doesn't depend solely on PoB attribute
    function computeIsSupport(gem) {
      const gemName = (gem.nameSpec || gem.gemId || '').trim();
      const fromPob = gem.supportGem === true || gem.isSupport === true;
      const nameHints = /^Support:\s*/.test(gemName) || /\s+Support$/i.test(gemName);
      const skillIdHints = typeof gem.skillId === 'string' && /support/i.test(gem.skillId);
      let dbHints = false;
      try {
        if (gemDatabase && Object.keys(gemDatabase).length > 0) {
          const want = (gemName + ' Support').toLowerCase();
          dbHints = Object.values(gemDatabase).some((g) => {
            const n = g && g.name;
            return typeof n === 'string' && n.toLowerCase() === want;
          });
        }
      } catch {}
      const result = !!(fromPob || nameHints || skillIdHints || dbHints);
      if (!fromPob && result) {
        console.log('[GemsWindow] Heuristic marked as support:', { gemName, skillId: gem.skillId, dbHints });
      }
      return result;
    }

    function getGemIcon(gemName) {
      if (gemName.startsWith('Support: ')) return '◆';
      return '◇';
    }
    
  // Helper to get gem image path - aligned with asset layout
    function getGemImagePath(gemName, isSupport) {
      // Remove "Support: " prefix
      const cleanName = gemName.replace(/^Support: /, '');
      
      // Convert to lowercase and replace spaces/special chars with underscores
      const slug = cleanName
        .toLowerCase()
        .replace(/[:']/g, '')
        .replace(/\\s+/g, '_')
        .replace(/-/g, '_')
        .replace(/[()]/g, '')
        .trim();
      
  // PoE1 has separate _support images; PoE2 uses the base icon for supports
  const filename = (overlayVersion === 'poe1' && isSupport) ? (slug + '_support') : slug;
      
      // Determine game version folder
      const folder = overlayVersion === 'poe1' ? 'poe1/gems' : 'gems';
      
      // Return the bundled image path (relative, will be resolved via electronAPI)
      return folder + '/' + filename + '.webp';
    }
    
    // Async: resolve gem image via IPC - single path version
    async function resolveGemImage(img, localPath) {
      if (!localPath) return;
      try {
        const resolvedPath = await (async () => {
          try { return await ipcRenderer.invoke('get-bundled-image-path', localPath); } catch { return null; }
        })() || (await (window.electronAPI?.getBundledImagePath?.(localPath)));
        if (resolvedPath) {
          img.src = resolvedPath;
          img.style.display = '';
          console.log('[GemsWindow] Image resolved:', localPath, '->', resolvedPath);
        } else {
          console.warn('[GemsWindow] Image not found:', localPath);
          img.style.display = 'none';
          if (img.nextElementSibling) {
            img.nextElementSibling.style.display = 'inline';
          }
        }
      } catch (err) {
        console.error('[GemsWindow] Error resolving image:', localPath, err);
        img.style.display = 'none';
        if (img.nextElementSibling) {
          img.nextElementSibling.style.display = 'inline';
        }
      }
    }
    
    function escapeHtml(value) {
      if (value === null || value === undefined) return '';
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function escapeAttr(value) {
      return escapeHtml(value);
    }

    function resolveAcquisitionEntry(rawName, isSupport) {
      const baseName = (rawName || '').replace(/^Support:\s*/, '').trim();
      const candidates = [];
      if (baseName) candidates.push(baseName);
      if (isSupport) {
        const supportName = baseName.endsWith('Support') ? baseName : (baseName ? baseName + ' Support' : '');
        if (supportName && !candidates.includes(supportName)) {
          candidates.unshift(supportName);
        }
      }

      for (const candidate of candidates) {
        const entry = gemAcquisition[candidate];
        if (entry) {
          return { entry, lookupName: candidate };
        }
      }

      return { entry: null, lookupName: candidates[0] || baseName };
    }

    function entryHasContent(entry) {
      if (!entry) return false;
      if (entry.questRewards && Array.isArray(entry.questRewards.rows) && entry.questRewards.rows.length) return true;
      if (entry.vendorRewards && Array.isArray(entry.vendorRewards.rows) && entry.vendorRewards.rows.length) return true;
      if (entry.itemAcquisition) {
        if (entry.itemAcquisition.summary) return true;
        if (Array.isArray(entry.itemAcquisition.sections) && entry.itemAcquisition.sections.length) return true;
      }
      return false;
    }

    function renderAvailabilitySymbol(value) {
      switch (value) {
        case 'yes':
          return '✔';
        case 'no':
          return '✖';
        case 'partial':
          return '◐';
        case 'na':
          return '—';
        case 'unknown':
          return '?';
        default:
          return escapeHtml(value || '?');
      }
    }

    function buildQuestVendorSection(title, data, characterClass) {
      if (!data || !Array.isArray(data.rows) || data.rows.length === 0) return '';
      const classes = Array.isArray(data.classes) && data.classes.length ? data.classes : [];
      let html = '<div class="modal-section">';
      html += '<div class="modal-section-title">' + escapeHtml(title) + '</div>';
      if (data.description) {
        html += '<div class="modal-section-desc">' + escapeHtml(data.description) + '</div>';
      }
      html += '<table class="modal-table">';
      html += '<thead><tr><th class="quest-cell">Quest / Act / NPC</th>';
      for (const cls of classes) {
        // Highlight the class column that matches the character's class
        const isActiveClass = characterClass && cls.toLowerCase() === characterClass.toLowerCase();
        const classAttr = isActiveClass ? ' class="active-class"' : '';
        html += '<th' + classAttr + '>' + escapeHtml(cls) + '</th>';
      }
      html += '</tr></thead><tbody>';

      for (const row of data.rows) {
        html += '<tr>';
        html += '<td class="quest-cell">';
        html += '<div class="quest-name">' + escapeHtml(row.quest || 'Unknown quest') + '</div>';
        if (row.act) {
          html += '<div class="quest-act">' + escapeHtml(row.act) + '</div>';
        }
        if (row.npc) {
          html += '<div class="quest-npc">' + escapeHtml(row.npc) + '</div>';
        }
        if (Array.isArray(row.extra)) {
          for (const line of row.extra) {
            html += '<div class="quest-npc">' + escapeHtml(line) + '</div>';
          }
        }
        html += '</td>';

        const availability = Array.isArray(row.availability) ? row.availability : [];
        for (let i = 0; i < classes.length; i += 1) {
          const value = availability[i] || 'unknown';
          const isActiveClass = characterClass && classes[i] && classes[i].toLowerCase() === characterClass.toLowerCase();
          const cellClass = 'availability-' + value + (isActiveClass ? ' active-class' : '');
          html += '<td class="' + cellClass + '">' + renderAvailabilitySymbol(value) + '</td>';
        }

        html += '</tr>';
      }

      html += '</tbody></table></div>';
      return html;
    }

    function buildItemAcquisitionSection(data) {
      if (!data) return '';
      const hasSummary = typeof data.summary === 'string' && data.summary.length > 0;
      const hasSections = Array.isArray(data.sections) && data.sections.length > 0;
      if (!hasSummary && !hasSections) return '';

      let html = '<div class="modal-section">';
      html += '<div class="modal-section-title">Item acquisition (recipes, divination cards)</div>';
      if (hasSummary) {
        html += '<div class="modal-section-desc">' + escapeHtml(data.summary) + '</div>';
      }

      if (hasSections) {
        for (const section of data.sections) {
          html += '<div class="modal-subsection">';
          html += '<div class="modal-subsection-title">' + escapeHtml(section.title || '') + '</div>';
          if (Array.isArray(section.blocks)) {
            for (const block of section.blocks) {
              if (!block) continue;
              if (block.type === 'paragraph' && block.text) {
                html += '<div class="modal-section-desc">' + escapeHtml(block.text) + '</div>';
              } else if (block.type === 'list' && Array.isArray(block.items)) {
                html += '<ul class="modal-list">';
                for (const item of block.items) {
                  html += '<li>' + escapeHtml(item) + '</li>';
                }
                html += '</ul>';
              } else if (block.type === 'table' && Array.isArray(block.rows)) {
                // Filter out META column
                const columns = Array.isArray(block.columns) ? block.columns.filter(col => col.toUpperCase() !== 'META') : [];
                const metaIndex = Array.isArray(block.columns) ? block.columns.findIndex(col => col.toUpperCase() === 'META') : -1;
                
                html += '<table class="modal-table">';
                if (columns.length > 0) {
                  html += '<thead><tr>';
                  for (const column of columns) {
                    html += '<th>' + escapeHtml(column) + '</th>';
                  }
                  html += '</tr></thead>';
                }
                html += '<tbody>';
                for (const row of block.rows) {
                  html += '<tr>';
                  const cells = Array.isArray(row) ? row : [];
                  for (let i = 0; i < cells.length; i++) {
                    // Skip META column
                    if (i === metaIndex) continue;
                    html += '<td>' + escapeHtml(cells[i]) + '</td>';
                  }
                  html += '</tr>';
                }
                html += '</tbody></table>';
              }
            }
          }
          html += '</div>';
        }
      }

      html += '</div>';
      return html;
    }

    function buildGemModalHtml(displayName, entry, lookupName) {
      if (!entryHasContent(entry)) return '';
      const characterClass = currentBuild?.className || '';
      let html = '';
      
      // Add gem description at the top if available
      if (entry.description) {
        html += '<div class="gem-description">' + escapeHtml(entry.description) + '</div>';
      }
      
      // Add Details button to open main overlay - use lookupName for accurate matching
      const gemNameForDetails = lookupName || displayName;
      html += '<button class="details-button" onclick="openGemInMainOverlay(&quot;' + escapeAttr(gemNameForDetails) + '&quot;)">';
      html += '<span>📖</span>';
      html += '<span>View Details in Main Overlay</span>';
      html += '</button>';
      
      if (entry.questRewards && Array.isArray(entry.questRewards.rows) && entry.questRewards.rows.length) {
        html += buildQuestVendorSection('Quest rewards', entry.questRewards, characterClass);
      }
      if (entry.vendorRewards && Array.isArray(entry.vendorRewards.rows) && entry.vendorRewards.rows.length) {
        html += buildQuestVendorSection('Vendor rewards', entry.vendorRewards, characterClass);
      }
      html += buildItemAcquisitionSection(entry.itemAcquisition);
      
      // Add References section
      const gemSlug = displayName.replace(/\s+/g, '_');
      const wikiUrl = \`https://www.poewiki.net/wiki/\${encodeURIComponent(gemSlug)}\`;
      html += \`
        <div class="modal-section" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(144, 164, 174, 0.2);">
          <h3 class="modal-section-title">References</h3>
          <div style="margin-top: 8px;">
            <a href="#" class="wiki-link" data-wiki-url="\${wikiUrl}" style="color: #4A9EFF; text-decoration: none; font-size: 13px; display: inline-flex; align-items: center; gap: 6px;">
              <span style="font-size: 14px;">🌐</span>
              <span>PoE Wiki - \${displayName}</span>
            </a>
          </div>
        </div>
      \`;
      
      return html;
    }
    
    function openGemModal(displayName, lookupName) {
      const entry = lookupName ? gemAcquisition[lookupName] : null;
      if (!entry || !entryHasContent(entry)) {
        console.log('[GemsWindow] No acquisition data for:', lookupName);
        return;
      }
      
      const modalOverlay = document.getElementById('gem-modal-overlay');
      const modalTitle = document.getElementById('modal-title');
      const modalBody = document.getElementById('modal-body');
      
      modalTitle.textContent = displayName;
      modalBody.innerHTML = buildGemModalHtml(displayName, entry, lookupName);
      modalOverlay.classList.add('active');
    }
    
    function closeGemModal() {
      const modalOverlay = document.getElementById('gem-modal-overlay');
      modalOverlay.classList.remove('active');
    }
    
    function openGemInMainOverlay(gemName) {
      try {
        // Send IPC message to main process to open gem details in main overlay
        ipcRenderer.send('show-gem-details', gemName);
        console.log('[GemsWindow] Requested gem details for:', gemName);
      } catch (err) {
        console.error('[GemsWindow] Failed to open gem details:', err);
      }
    }

    function parseLevelRange(title) {
      if (!title) return null;
      
      // Match level ranges like "Level 10-15" or "10-15"
      const rangeMatch = title.match(/(\d+)\s*-\s*(\d+)/);
      if (rangeMatch) {
        const min = parseInt(rangeMatch[1], 10);
        const max = parseInt(rangeMatch[2], 10);
        if (!isNaN(min) && !isNaN(max)) {
          return { min, max };
        }
      }
      
      // Match single level like "Level 14" or "14 level"
      const singleMatch = title.match(/(?:level|lv|lvl)?\s*(\d+)/i);
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
      return /act\s*\d+/.test(lower);
    }
    
    // Helper to extract act number from title
    function extractActNumber(title) {
      if (!title) return null;
      const match = title.toLowerCase().match(/act\s*(\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
      return null;
    }
    
    // Helper: filter out empty header-style skill sets (no gems in any socket group)
    function filterNonEmptySkillSets(skillSets) {
      if (!Array.isArray(skillSets)) return [];
      return skillSets.filter(set => {
        const groups = set && Array.isArray(set.socketGroups) ? set.socketGroups : [];
        return groups.some(g => Array.isArray(g.gems) && g.gems.length > 0);
      });
    }

    // Find best matching skill set based on act (preferred) or level (fallback)
    function findBestSkillSet(skillSets, currentAct, characterLevel) {
      if (!skillSets || skillSets.length === 0) return null;
      const nonEmptySets = filterNonEmptySkillSets(skillSets);
      if (nonEmptySets.length === 0) return null;
      
      console.log(\`[GemsWindow] Finding best skill set for act \${currentAct}, level \${characterLevel}\`);
      
      // First, try to find by act reference
      for (let i = 0; i < nonEmptySets.length; i++) {
        const set = nonEmptySets[i];
        if (hasActReference(set.title)) {
          const actNum = extractActNumber(set.title);
          if (actNum === currentAct) {
            console.log(\`[GemsWindow] Matched by act: "\${set.title}" (index \${i})\`);
            return { set, index: i };
          }
        }
      }
      
      // Fallback: match by level range
      console.log(\`[GemsWindow] No act match found, trying level-based matching for level \${characterLevel}\`);
      for (let i = 0; i < nonEmptySets.length; i++) {
        const set = nonEmptySets[i];
        const range = parseLevelRange(set.title);
        if (range && characterLevel >= range.min && characterLevel <= range.max) {
          console.log(\`[GemsWindow] Matched by level: "\${set.title}" (range \${range.min}-\${range.max}, index \${i})\`);
          return { set, index: i };
        }
      }
      
      // Ultimate fallback: use index-based matching (old behavior)
      const fallbackIndex = Math.min(currentAct - 1, nonEmptySets.length - 1);
      console.log(\`[GemsWindow] Using fallback index-based match: index \${fallbackIndex}\`);
      return { set: nonEmptySets[fallbackIndex], index: fallbackIndex };
    }
    
    function renderGems() {
      const content = document.getElementById('content');
      
      // Check if we have skill sets (preferred) or fall back to socket groups
      const hasSkillSets = currentBuild && currentBuild.skillSets && currentBuild.skillSets.length > 0;
      const hasSocketGroups = currentBuild && currentBuild.socketGroups && currentBuild.socketGroups.length > 0;
      
      if (!hasSkillSets && !hasSocketGroups) {
        content.innerHTML = \`
          <div class="no-build">
            <div class="no-build-icon">💎</div>
            <div class="no-build-text">No gem setup available</div>
            <div class="no-build-text" style="font-size: 12px; opacity: 0.7;">Import a PoB build to see your gem links</div>
          </div>
        \`;
        return;
      }
      
      // Determine which skill set we're showing using smart matching
      let currentSkillSetTitle = 'Act ' + currentAct;
      let matchedSkillSet = null;
      
      // Only auto-detect if user hasn't manually selected a set
      if (!manualSelection && hasSkillSets) {
        skillSetIndex = currentAct - 1; // Default fallback
        const result = findBestSkillSet(currentBuild.skillSets, currentAct, characterLevel);
        if (result) {
          matchedSkillSet = result.set;
          skillSetIndex = result.index;
          currentSkillSetTitle = result.set.title || ('Act ' + currentAct);
        }
      } else if (hasSkillSets && skillSetIndex < currentBuild.skillSets.length) {
        // Use manually selected index
        matchedSkillSet = currentBuild.skillSets[skillSetIndex];
        currentSkillSetTitle = matchedSkillSet.title || ('Set ' + (skillSetIndex + 1));
      }
      
      let html = \`
        <div class="act-filter">
          <div class="act-filter-info">
            <span class="act-filter-label">Gem Set:</span>
            <select id="gemSetSelector" onchange="changeGemSet()" class="gem-set-dropdown">
              \${currentBuild.skillSets.map((set, i) => \`
                <option value="\${i}" \${i === skillSetIndex ? 'selected' : ''}>\${set.title || 'Set ' + (i + 1)}</option>
              \`).join('')}
            </select>
          </div>
        </div>
      \`;
      
      // Determine which socket groups to use based on matched skill set
      let socketGroupsToShow = [];
      
      if (hasSkillSets && matchedSkillSet) {
        console.log(\`[GemsWindow] Using skill set "\${matchedSkillSet.title}" (index \${skillSetIndex}) for page \${currentAct}\`);
        socketGroupsToShow = matchedSkillSet.socketGroups || [];
      } else {
        // Fallback to old logic using socketGroups directly
        socketGroupsToShow = currentBuild.socketGroups;
      }
      
      // Group socket groups by size
      const sortedGroups = [...socketGroupsToShow].sort((a, b) => b.gems.length - a.gems.length);
      
      // Start gem groups container
      html += '<div class="gem-groups-container">';
      
      for (const group of sortedGroups) {
        if (!group.gems || group.gems.length === 0) continue;
        
        const socketCount = group.gems.length;
        const socketWord = socketCount === 1 ? 'Socket' : 'Sockets';
        const linkLabel = socketCount >= 2 ? \`\${socketCount}-Link\` : \`\${socketCount} \${socketWord}\`;
        
        html += \`
          <div class="socket-group">
            <div class="socket-group-header">
              <span class="socket-count">\${linkLabel}</span>
            </div>
            <div class="gems-list">
        \`;
        
        for (const gem of group.gems) {
          const gemName = gem.nameSpec || gem.gemId || 'Unknown Gem';
          // Robust support detection
          const isSupport = computeIsSupport(gem);
          
          // DEBUG: Log support detection
          console.log('[GemsWindow] Gem:', gemName, '| gem.supportGem:', gem.supportGem, '| gem.isSupport:', gem.isSupport, '| skillId:', gem.skillId, '| computed isSupport:', isSupport);
          
          const colorClass = getGemColor(gemName, isSupport);
          const icon = getGemIcon(gemName);
          const level = gem.level || 1;
          const quality = gem.quality || 0;
          
          console.log(\`[GemsWindow] Rendering gem: \${gemName}, colorClass: \${colorClass}\`);
          
          // Get actual color hex value for styling icon
          const colorHex = colorClass === 'str' ? '#ff4444' : 
                          colorClass === 'dex' ? '#44ff44' : '#4444ff';
          
          const displayName = gemName.replace('Support: ', '');
          const acquisitionLookup = resolveAcquisitionEntry(gemName, isSupport);
          const hasAcquisition = entryHasContent(acquisitionLookup.entry);

          // Get gem image path - EXACT same logic as working task list
          const imagePath = getGemImagePath(gemName, isSupport);
          const imageClass = overlayVersion === 'poe2' ? 'gem-image poe2' : 'gem-image';

          html += '<div class="gem-item ' + colorClass + (isSupport ? ' support' : '') + '">';
          if (imagePath) {
            html += '<img data-gem-img="' + imagePath + '" class="' + imageClass + '" style="display:none;" />';
          }
          
          html += '<span class="gem-name ' + (isSupport ? 'support' : '') + '">' + displayName + '</span>';
          html += '<div class="gem-meta">';
          html += '<span class="gem-level">L' + level + (quality > 0 ? ' Q' + quality : '') + '</span>';
          if (hasAcquisition) {
            html += '<button class="gem-info-btn" data-gem-info="' + escapeAttr(acquisitionLookup.lookupName || displayName) + '" data-gem-display="' + escapeAttr(displayName) + '" title="Show acquisition info"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C22 4.92893 22 7.28595 22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22ZM12 17.75C12.4142 17.75 12.75 17.4142 12.75 17V11C12.75 10.5858 12.4142 10.25 12 10.25C11.5858 10.25 11.25 10.5858 11.25 11V17C11.25 17.4142 11.5858 17.75 12 17.75ZM12 7C12.5523 7 13 7.44772 13 8C13 8.55228 12.5523 9 12 9C11.4477 9 11 8.55228 11 8C11 7.44772 11.4477 7 12 7Z" fill="#4A9EFF"></path></svg></button>';
          }
          html += '</div>';
          
          html += '</div>';
        }
        
        html += \`
            </div>
          </div>
        \`;
      }
      
      // Close gem groups container
      html += '</div>';
      
      content.innerHTML = html;
      
      // Resolve all gem images asynchronously - same as task list
      const gemImages = content.querySelectorAll('img[data-gem-img]');
      gemImages.forEach(img => {
        const localPath = img.getAttribute('data-gem-img');
        if (localPath) {
          resolveGemImage(img, localPath);
        }
      });
      
  // Setup acquisition tooltip handlers
  setupGemInfoButtons();
    }
    
    function setupGemInfoButtons() {
      const buttons = document.querySelectorAll('.gem-info-btn');
      console.log('[GemsWindow] Setting up acquisition modals for', buttons.length, 'gems');

      buttons.forEach((button) => {
        const lookupName = button.getAttribute('data-gem-info');
        const displayName = button.getAttribute('data-gem-display') || lookupName || 'Unknown gem';
        const entry = lookupName ? gemAcquisition[lookupName] : null;

        if (!entryHasContent(entry)) {
          button.style.display = 'none';
          return;
        }

        button.addEventListener('click', (event) => {
          event.stopPropagation();
          openGemModal(displayName, lookupName);
        });
      });
      
      // Close modal on overlay click
      const modalOverlay = document.getElementById('gem-modal-overlay');
      if (modalOverlay) {
        modalOverlay.addEventListener('click', (event) => {
          if (event.target === modalOverlay) {
            closeGemModal();
          }
        });
      }
      
      // Handle wiki link clicks (delegated from modal body)
      document.addEventListener('click', (event) => {
        const target = event.target;
        if (target.classList && target.classList.contains('wiki-link')) {
          event.preventDefault();
          const wikiUrl = target.getAttribute('data-wiki-url');
          if (wikiUrl) {
            require('electron').shell.openExternal(wikiUrl);
          }
        }
      });
    }
    
    function changeGemSet() {
      const selector = document.getElementById('gemSetSelector');
      if (!selector) return;
      
      const newIndex = parseInt(selector.value);
      
      // Only update if the value actually changed
      if (newIndex === skillSetIndex) {
        console.log('[GemsWindow] Dropdown value unchanged, not re-rendering');
        return;
      }
      
      if (!isNaN(newIndex) && newIndex >= 0 && currentBuild && newIndex < currentBuild.skillSets.length) {
        console.log('[GemsWindow] Gem set changed from', skillSetIndex, 'to', newIndex);
        skillSetIndex = newIndex;
        manualSelection = true; // Mark as manual selection
        
        // Update only the gem content area, not the entire page
        updateGemContent();
      }
    }
    
    function updateGemContent() {
      // Just update the gems display without re-rendering the dropdown
      const content = document.getElementById('content');
      if (!content) return;
      
      const hasSkillSets = currentBuild && currentBuild.skillSets && currentBuild.skillSets.length > 0;
      if (!hasSkillSets || skillSetIndex >= currentBuild.skillSets.length) return;
      
      const matchedSkillSet = currentBuild.skillSets[skillSetIndex];
      const socketGroupsToShow = matchedSkillSet.socketGroups || [];
      
      // Find the gem groups container
      let gemGroupsContainer = content.querySelector('.gem-groups-container');
      if (!gemGroupsContainer) {
        // First time - render everything
        renderGems();
        return;
      }
      
      // Group socket groups by size (same as renderGems)
      const sortedGroups = [...socketGroupsToShow].sort((a, b) => b.gems.length - a.gems.length);
      
      // Build new gem groups HTML with proper structure
      let html = '';
      for (const group of sortedGroups) {
        if (!group.gems || group.gems.length === 0) continue;
        
        const socketCount = group.gems.length;
        const socketWord = socketCount === 1 ? 'Socket' : 'Sockets';
        const linkLabel = socketCount >= 2 ? socketCount + '-Link' : socketCount + ' ' + socketWord;
        
        html += '<div class="socket-group">';
        html += '<div class="socket-group-header">';
        html += '<span class="socket-count">' + linkLabel + '</span>';
        html += '</div>';
        html += '<div class="gems-list">';
        
        for (const gem of group.gems) {
          const gemName = gem.nameSpec || gem.gemId || gem.name || 'Unknown Gem';
          // Use robust support detection (same as renderGems)
          const isSupport = computeIsSupport(gem);
          const colorClass = getGemColor(gemName, isSupport);
          const level = gem.level || 1;
          const quality = gem.quality || 0;
          
          const displayName = gemName.replace('Support: ', '');
          const acquisitionLookup = resolveAcquisitionEntry(gemName, isSupport);
          const hasAcquisition = entryHasContent(acquisitionLookup.entry);
          
          const imagePath = getGemImagePath(gemName, isSupport);
          const imageClass = overlayVersion === 'poe2' ? 'gem-image poe2' : 'gem-image';
          
          html += '<div class="gem-item ' + colorClass + (isSupport ? ' support' : '') + '">';
          if (imagePath) {
            html += '<img data-gem-img="' + imagePath + '" class="' + imageClass + '" style="display:none;" />';
          }
          
          html += '<span class="gem-name ' + (isSupport ? 'support' : '') + '">' + displayName + '</span>';
          html += '<div class="gem-meta">';
          html += '<span class="gem-level">L' + level + (quality > 0 ? ' Q' + quality : '') + '</span>';
          if (hasAcquisition) {
            html += '<button class="gem-info-btn" data-gem-info="' + escapeAttr(acquisitionLookup.lookupName || displayName) + '" data-gem-display="' + escapeAttr(displayName) + '" title="Show acquisition info"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C22 4.92893 22 7.28595 22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22ZM12 17.75C12.4142 17.75 12.75 17.4142 12.75 17V11C12.75 10.5858 12.4142 10.25 12 10.25C11.5858 10.25 11.25 10.5858 11.25 11V17C11.25 17.4142 11.5858 17.75 12 17.75ZM12 7C12.5523 7 13 7.44772 13 8C13 8.55228 12.5523 9 12 9C11.4477 9 11 8.55228 11 8C11 7.44772 11.4477 7 12 7Z" fill="#4A9EFF"></path></svg></button>';
          }
          html += '</div>';
          html += '</div>';
        }
        
        html += '</div>';
        html += '</div>';
      }
      
      // Update the container
      gemGroupsContainer.innerHTML = html;
      
      // Resolve gem images
      const gemImages = gemGroupsContainer.querySelectorAll('img[data-gem-img]');
      gemImages.forEach(img => {
        const localPath = img.getAttribute('data-gem-img');
        if (localPath) {
          resolveGemImage(img, localPath);
        }
      });
      
      // Setup acquisition tooltips
      setupGemInfoButtons();
    }
    
    function smoothRenderGems() {
      // Don't re-render if dropdown is currently open
      if (dropdownOpen) {
        console.log('[GemsWindow] Skipping render - dropdown is open');
        return;
      }
      
      const content = document.getElementById('content');
      
      // Fade out content first
      content.classList.add('updating');
      
      // Wait for fade out, then render new content
      setTimeout(() => {
        renderGems();
        // Fade content back in
        content.classList.remove('updating');
      }, 100);
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
      
      // Notify main process to save state
      ipcRenderer.send('gems-window-toggle-minimal', isUltraMinimal);
    }
    
    function togglePinned() {
      isPinned = !isPinned;
      const btn = document.getElementById('pinBtn');
      
      if (isPinned) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
      
      // Notify main process to change alwaysOnTop
      ipcRenderer.send('gems-window-toggle-pinned', isPinned);
    }
    
    function closeWindow() {
      ipcRenderer.send('leveling-gems-window-close');
    }
    
    // Listen for act changes
    ipcRenderer.on('gems-window-act-changed', (event, newAct) => {
      currentAct = newAct;
      manualSelection = false; // Reset manual selection on act change
      smoothRenderGems();
    });
    
    // Listen for build updates
    ipcRenderer.on('gems-window-build-updated', (event, newBuild) => {
      currentBuild = newBuild;
      manualSelection = false; // Reset manual selection on build update
      smoothRenderGems();
    });
    
    // Listen for character level updates
    ipcRenderer.on('character-level-up', (event, data) => {
      if (data && typeof data.level === 'number') {
        console.log(\`[GemsWindow] Character level updated: \${data.level}\`);
        characterLevel = data.level;
        smoothRenderGems();
      }
    });
    
    // Initialize
    (async () => {
  await loadGemDatabase();
  await loadGemColors();
  await loadGemAcquisition();
      renderGems();
      
      // Apply saved minimal mode state
      if (isUltraMinimal) {
        document.body.classList.add('ultra-minimal');
        document.getElementById('minimalBtn').classList.add('active');
      }
    })();
  </script>
</body>
</html>
  `;
}
