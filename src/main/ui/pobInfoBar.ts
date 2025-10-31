/**
 * PoB Info Bar - Draggable window showing PoB build info with Tree and Gems buttons
 * Spawns when user imports a PoB build
 */

import { BrowserWindow, ipcMain, screen } from 'electron';
import type { SettingsService } from '../services/settingsService.js';
import type { OverlayVersion } from '../../types/overlayVersion.js';
import type { StoredPobBuild } from '../../shared/pob/types.js';
import { registerOverlayWindow, unregisterOverlayWindow } from './windowZManager.js';

interface PobInfoBarParams {
  settingsService: SettingsService;
  overlayVersion: OverlayVersion;
  pobBuild: StoredPobBuild;
  currentAct: number;
}

let activePobInfoBar: BrowserWindow | null = null;

export function isPobInfoBarOpen(): boolean {
  return !!activePobInfoBar && !activePobInfoBar.isDestroyed() && activePobInfoBar.isVisible();
}

export function openPobInfoBar(params: PobInfoBarParams): void {
  // If already open, update it
  if (activePobInfoBar && !activePobInfoBar.isDestroyed()) {
    activePobInfoBar.webContents.send('pob-info-update', {
      build: params.pobBuild,
      currentAct: params.currentAct
    });
    activePobInfoBar.show();
    return;
  }

  const { settingsService, overlayVersion, pobBuild, currentAct } = params;
  
  // Small draggable bar dimensions
  const barWidth = 600; // Increased to accommodate Gear button
  const barHeight = 60;
  
  // Get saved position or use defaults
  const settingsKey = overlayVersion === 'poe1' ? 'levelingWindowPoe1' : 'levelingWindowPoe2';
  const savedSettings = settingsService.get(settingsKey) || {};
  const pobInfoBarSettings = (savedSettings as any).pobInfoBar || {};
  
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const initialX = pobInfoBarSettings.x ?? (width - barWidth - 20);
  const initialY = pobInfoBarSettings.y ?? 100;
  const pinned = pobInfoBarSettings.pinned ?? true;

  const window = new BrowserWindow({
    width: barWidth,
    height: barHeight,
    x: initialX,
    y: initialY,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: pinned,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: undefined
    }
  });

  activePobInfoBar = window;

  // Register with windowZManager for proper overlay behavior (prevents focus fighting)
  registerOverlayWindow('pobInfoBar', window, pinned, false);

  // Build HTML
  const html = buildPobInfoBarHtml(pobBuild, currentAct, pinned);
  
  window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  
  window.once('ready-to-show', () => {
    window.show();
  });

  // Save position on move
  window.on('move', () => {
    if (!window || window.isDestroyed()) return;
    const [newX, newY] = window.getPosition();
    settingsService.update(settingsKey, (current: any) => ({
      ...current,
      pobInfoBar: {
        ...(current.pobInfoBar || {}),
        x: newX,
        y: newY
      }
    }));
  });

  // Handle pinned toggle
  ipcMain.on('pob-info-bar-toggle-pinned', (event, isPinned) => {
    if (!window || window.isDestroyed()) return;
    
    // Update via windowZManager instead of directly
    registerOverlayWindow('pobInfoBar', window, isPinned, false);
    
    // Save pinned state
    settingsService.update(settingsKey, (current: any) => ({
      ...current,
      pobInfoBar: {
        ...(current.pobInfoBar || {}),
        pinned: isPinned
      }
    }));
  });

  // Handle close
  ipcMain.once('pob-info-bar-close', () => {
    if (!window.isDestroyed()) {
      window.close();
    }
  });

  window.on('closed', () => {
    unregisterOverlayWindow('pobInfoBar');
    activePobInfoBar = null;
  });
}

export function closePobInfoBar(): void {
  if (activePobInfoBar && !activePobInfoBar.isDestroyed()) {
    unregisterOverlayWindow('pobInfoBar');
    activePobInfoBar.close();
    activePobInfoBar = null;
  }
}

export function updatePobInfoBar(pobBuild: StoredPobBuild, currentAct: number): void {
  if (activePobInfoBar && !activePobInfoBar.isDestroyed()) {
    activePobInfoBar.webContents.send('pob-info-update', { build: pobBuild, currentAct });
  }
}

function buildPobInfoBarHtml(pobBuild: StoredPobBuild, currentAct: number, pinned: boolean = true): string {
  const className = pobBuild.className || 'Unknown';
  const ascendancy = pobBuild.ascendancyName || '';
  const level = pobBuild.level || 1;
  
  // Determine availability of features to conditionally render buttons
  const hasAnyGear = !!(pobBuild.itemSets && pobBuild.itemSets.some(set => set && set.items && Object.keys(set.items || {}).length > 0));
  const hasAnyTree = !!(pobBuild.treeSpecs && pobBuild.treeSpecs.some(spec => {
    const a = (spec as any)?.allocatedNodes;
    const p = (spec as any)?.parsedUrl?.nodes;
    return (Array.isArray(a) && a.length > 0) || (Array.isArray(p) && p.length > 0);
  }));
  const hasNotes = !!(pobBuild.notes && pobBuild.notes.trim().length > 0);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Roboto, Arial, sans-serif;
      background: transparent;
      color: #fff;
      overflow: hidden;
      user-select: none;
      -webkit-user-select: none;
    }
    
    /* Pulsating glow animation */
    @keyframes pobBarPulse {
      0%, 100% {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4),
                    0 0 15px rgba(74, 222, 128, 0.3),
                    0 0 25px rgba(74, 222, 128, 0.15);
        border-color: rgba(74, 222, 128, 0.4);
      }
      50% {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4),
                    0 0 25px rgba(74, 222, 128, 0.5),
                    0 0 40px rgba(74, 222, 128, 0.25);
        border-color: rgba(74, 222, 128, 0.6);
      }
    }
    
    .pob-bar {
      background: rgba(26, 26, 26, 0.9);
      border: 1px solid rgba(74, 222, 128, 0.3);
      border-radius: 6px;
      padding: 4px 8px;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
      -webkit-app-region: drag;
      height: 100%;
      transition: box-shadow 0.3s, border-color 0.3s;
    }
    
    /* Apply animation to pulsate class */
    .pob-bar.pulsate {
      animation: pobBarPulse 2s ease-in-out infinite;
    }
    .class-info { flex: 1; min-width: 0; -webkit-app-region: drag; }
    .class-name { font-size: 11px; font-weight: 600; color: #4ade80; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .class-details { font-size: 9px; color: rgba(255, 255, 255, 0.5); margin-top: 1px; }
    .button-group { display: flex; gap: 4px; -webkit-app-region: no-drag; }
    .pob-btn {
      padding: 3px 8px;
      background: rgba(74, 222, 128, 0.1);
      border: 1px solid rgba(74, 222, 128, 0.3);
      border-radius: 3px;
      color: #4ade80;
      font-size: 10px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .pob-btn:hover { background: rgba(74, 222, 128, 0.2); border-color: rgba(74, 222, 128, 0.5); }
    .pob-btn:active { transform: translateY(0); }
    
    .pin-btn {
      width: 18px;
      height: 18px;
      background: rgba(74, 158, 255, 0.1);
      border: 1px solid rgba(74, 158, 255, 0.3);
      border-radius: 3px;
      color: #4a9eff;
      font-size: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
      flex-shrink: 0;
      -webkit-app-region: no-drag;
    }
    .pin-btn:hover { background: rgba(74, 158, 255, 0.2); border-color: rgba(74, 158, 255, 0.5); }
    .pin-btn.active { background: rgba(74, 158, 255, 0.3); border-color: rgba(74, 158, 255, 0.6); }
    
    .close-btn {
      width: 18px;
      height: 18px;
      background: rgba(217, 83, 79, 0.1);
      border: 1px solid rgba(217, 83, 79, 0.3);
      border-radius: 3px;
      color: #d9534f;
      font-size: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
      flex-shrink: 0;
      -webkit-app-region: no-drag;
    }
    .close-btn:hover { background: rgba(217, 83, 79, 0.2); border-color: rgba(217, 83, 79, 0.5); }
    
    .separator {
      width: 1px;
      height: 24px;
      background: rgba(255, 255, 255, 0.15);
      margin: 0 4px;
      -webkit-app-region: no-drag;
    }
  </style>
</head>
<body>
  <div class="pob-bar" id="pobBar">
    <div class="class-info">
      <div class="class-name" id="className">${className}${ascendancy ? ' (' + ascendancy + ')' : ''}</div>
      <div class="class-details">Level ${level} • Act ${currentAct}</div>
    </div>
    <div class="button-group" id="buttonGroup">
      <button class="pob-btn" onclick="toggleGuide()" title="Toggle leveling guide window">📋 Guide</button>
      <div class="separator"></div>
      <button class="pob-btn" onclick="openGems()" title="View gem links for current act">💎 Gems</button>
      ${hasAnyTree ? '<button class="pob-btn" onclick="openTree()" title="View passive tree progression">🌳 Tree</button>' : ''}
      ${hasAnyGear ? '<button class="pob-btn" onclick="openGear()" title="View gear sets from PoB">⚔️ Gear</button>' : ''}
      ${hasNotes ? '<button class="pob-btn" onclick="openNotes()" title="View build notes from PoB">📝 Notes</button>' : ''}
    </div>
    <div class="pin-btn" onclick="togglePinned()" id="pinBtn" title="Toggle Always On Top">📌</div>
    <div class="close-btn" onclick="closeBar()">×</div>
  </div>

  <script>
    const { ipcRenderer } = require('electron');

    let isPinned = ${pinned};

    // Initialize pinned button state
    if (isPinned) {
      document.getElementById('pinBtn').classList.add('active');
    }

    // Check if this is first time seeing the PoB bar
    let hasInteracted = false;
    try {
      hasInteracted = localStorage.getItem('pobBarInteracted') === 'true';
    } catch (e) {
      // localStorage might not be available
    }

    const pobBar = document.getElementById('pobBar');
    
    // If never interacted, add pulsate animation
    if (!hasInteracted && pobBar) {
      pobBar.classList.add('pulsate');
    }

    // Stop animation on any interaction
    function stopPulsate() {
      if (pobBar && pobBar.classList.contains('pulsate')) {
        pobBar.classList.remove('pulsate');
        try {
          localStorage.setItem('pobBarInteracted', 'true');
          hasInteracted = true;
        } catch (e) {
          // Ignore localStorage errors
        }
        console.log('[PoB Bar] Pulsate animation stopped');
      }
    }

    // Add interaction listeners to all buttons
    function addStopListeners() {
      document.querySelectorAll('.pob-btn, .close-btn, .pin-btn').forEach(btn => {
        btn.addEventListener('click', stopPulsate);
        btn.addEventListener('mousedown', stopPulsate);
      });
    }
    
    addStopListeners();
    
    // Listen for ANY mouse interaction on the entire window (capture phase)
    // This catches dragging, clicking, everything
    window.addEventListener('mousedown', stopPulsate, true);
    window.addEventListener('click', stopPulsate, true);

    function computeButtons(build) {
      const hasAnyGear = !!(build.itemSets && build.itemSets.some(set => set && set.items && Object.keys(set.items || {}).length > 0));
      const hasAnyTree = !!(build.treeSpecs && build.treeSpecs.some(spec => {
        const a = (spec)?.allocatedNodes;
        const p = (spec)?.parsedUrl?.nodes;
        return (Array.isArray(a) && a.length > 0) || (Array.isArray(p) && p.length > 0);
      }));
      const hasNotes = !!(build.notes && build.notes.trim().length > 0);

      const parts = [
        '<button class="pob-btn" onclick="toggleGuide()" title="Toggle leveling guide window">📋 Guide</button>',
        '<div class="separator"></div>',
        '<button class="pob-btn" onclick="openGems()" title="View gem links for current act">💎 Gems</button>'
      ];
      if (hasAnyTree) parts.push('<button class="pob-btn" onclick="openTree()" title="View passive tree progression">🌳 Tree</button>');
      if (hasAnyGear) parts.push('<button class="pob-btn" onclick="openGear()" title="View gear sets from PoB">⚔️ Gear</button>');
      if (hasNotes) parts.push('<button class="pob-btn" onclick="openNotes()" title="View build notes from PoB">📝 Notes</button>');
      return parts.join('');
    }

    // Listen for updates
    ipcRenderer.on('pob-info-update', (event, data) => {
      const { build, currentAct } = data;
      const className = build.className || 'Unknown';
      const ascendancy = build.ascendancyName || '';
      const level = build.level || 1;

      document.getElementById('className').textContent = className + (ascendancy ? ' (' + ascendancy + ')' : '');
      document.querySelector('.class-details').textContent = \`Level \${level} • Act \${currentAct}\`;

      // Refresh buttons
      const group = document.getElementById('buttonGroup');
      if (group) {
        group.innerHTML = computeButtons(build);
        // Re-add stop listeners to new buttons
        addStopListeners();
      }
    });

    function openGems() { ipcRenderer.send('open-pob-gems-window'); }
    function openTree() { ipcRenderer.send('open-pob-tree-window'); }
    function openGear() { ipcRenderer.send('open-pob-gear-window'); }
    function openNotes() { ipcRenderer.send('open-pob-notes-window'); }
    function toggleGuide() { ipcRenderer.send('toggle-leveling-guide'); }
    function closeBar() { ipcRenderer.send('pob-info-bar-close'); }
    
    function togglePinned() {
      isPinned = !isPinned;
      const btn = document.getElementById('pinBtn');
      if (isPinned) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
      ipcRenderer.send('pob-info-bar-toggle-pinned', isPinned);
    }
  </script>
</body>
</html>`;
}
