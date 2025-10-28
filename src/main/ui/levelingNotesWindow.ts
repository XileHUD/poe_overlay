import { BrowserWindow, ipcMain } from 'electron';
import { registerOverlayWindow } from './windowZManager.js';
import type { OverlayVersion } from '../../types/overlayVersion.js';
import type { SettingsService } from '../services/settingsService.js';

interface LevelingNotesWindowOptions {
  settingsService: SettingsService;
  overlayVersion: OverlayVersion;
  parentWindow?: BrowserWindow;
}

let notesWindow: BrowserWindow | null = null;

export function openLevelingNotesWindow(options: LevelingNotesWindowOptions): BrowserWindow {
  const { settingsService, overlayVersion, parentWindow } = options;

  // If window already exists, focus it
  if (notesWindow && !notesWindow.isDestroyed()) {
    notesWindow.focus();
    return notesWindow;
  }

  // Get saved window position or use defaults
  const settingsKey = overlayVersion === 'poe1' ? 'levelingWindowPoe1' : 'levelingWindowPoe2';
  const savedSettings = settingsService.get(settingsKey) || {};
  const notesWindowSettings = (savedSettings as any).notesWindow || {};
  const { x = 150, y = 150, width = 500, height = 600, ultraMinimal = false } = notesWindowSettings;

  notesWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    },
    // Avoid `parent` relationship to keep this as a top-level window for proper z-ordering on Windows.
  });

  notesWindow.setIgnoreMouseEvents(false);
  // Debounce timers for position/size saves
  let _moveTimer = null as any;
  let _resizeTimer = null as any;

  // Register for managed z-order
  try { registerOverlayWindow('notes', notesWindow); } catch {}

  // Get current PoB build notes
  const pobBuild = (savedSettings as any).pobBuild || null;
  const notes = pobBuild?.notes || 'No notes available.\n\nImport a PoB build with notes to see them here.';

  const html = buildLevelingNotesWindowHtml(notes, overlayVersion, ultraMinimal, pobBuild);
  notesWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  // Save position on move
  notesWindow.on('move', () => {
    if (!notesWindow || notesWindow.isDestroyed()) return;
    if (_moveTimer) clearTimeout(_moveTimer);
    _moveTimer = setTimeout(() => {
      if (!notesWindow || notesWindow.isDestroyed()) return;
      const [newX, newY] = notesWindow.getPosition();
      settingsService.update(settingsKey, (current: any) => ({
        ...current,
        notesWindow: {
          ...(current.notesWindow || {}),
          x: newX,
          y: newY,
        },
      }));
    }, 150);
  });

  // Save size on resize
  notesWindow.on('resize', () => {
    if (!notesWindow || notesWindow.isDestroyed()) return;
    if (_resizeTimer) clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      if (!notesWindow || notesWindow.isDestroyed()) return;
      const [newWidth, newHeight] = notesWindow.getSize();
      settingsService.update(settingsKey, (current: any) => ({
        ...current,
        notesWindow: {
          ...(current.notesWindow || {}),
          width: newWidth,
          height: newHeight,
        },
      }));
    }, 150);
  });

  notesWindow.on('closed', () => {
    notesWindow = null;
  });
  
  // Handle ultra minimal mode toggle
  ipcMain.on('notes-window-toggle-minimal', (event, isMinimal) => {
    if (!notesWindow || notesWindow.isDestroyed()) return;
    
    // Save minimal mode state
    settingsService.update(settingsKey, (current: any) => ({
      ...current,
      notesWindow: {
        ...(current.notesWindow || {}),
        ultraMinimal: isMinimal,
      },
    }));
  });

  return notesWindow;
}

export function updateNotesWindow(notes: string): void {
  if (!notesWindow || notesWindow.isDestroyed()) return;
  notesWindow.webContents.send('notes-updated', notes);
}

export function isNotesWindowOpen(): boolean {
  return notesWindow !== null && !notesWindow.isDestroyed();
}

export function closeNotesWindow(): void {
  if (notesWindow && !notesWindow.isDestroyed()) {
    notesWindow.close();
  }
}

function buildLevelingNotesWindowHtml(notes: string, overlayVersion: OverlayVersion, ultraMinimal: boolean, pobBuild: any): string {
  const className = pobBuild?.className || 'No Build Loaded';
  const ascendancy = pobBuild?.ascendancyName || '';
  const characterName = pobBuild?.characterName || '';

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
    }
    
    * { box-sizing: border-box; }
    
    body {
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', Roboto, Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      overflow: hidden;
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
    
    .content {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 15px;
    }
    
    .notes-text {
      color: var(--text-primary);
      font-size: 13px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-wrap: break-word;
      font-family: 'Consolas', 'Monaco', monospace;
      user-select: none;
      -webkit-user-select: none;
    }
    
    .no-notes {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-muted);
      text-align: center;
      padding: 40px;
    }
    
    .no-notes-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }
    
    .no-notes-text {
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
    
    body.ultra-minimal .notes-text {
      background: rgba(26, 26, 26, 0.85);
      padding: 10px;
      border-radius: 4px;
      border: 1px solid rgba(74, 158, 255, 0.2);
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-title">
      <h1>📝 Notes</h1>
      <div class="header-subtitle">${characterName || ascendancy || className}</div>
    </div>
    <div class="header-controls">
      <div class="minimal-btn" onclick="toggleMinimalMode()" id="minimalBtn" title="Toggle Ultra Minimal Mode">◐</div>
      <div class="close-btn" onclick="closeWindow()">×</div>
    </div>
  </div>
  
  <div class="content" id="content">
    ${notes ? `<div class="notes-text" id="notesText">${parsePobNotes(notes)}</div>` : `
      <div class="no-notes">
        <div class="no-notes-icon">📝</div>
        <div class="no-notes-text">No notes available<br><br>Import a PoB build with notes to see them here</div>
      </div>
    `}
  </div>
  
  <script>
    const { ipcRenderer } = require('electron');
    // Ensure clicking this window brings it to front above other overlays
    try {
      document.addEventListener('mousedown', () => {
        try { ipcRenderer.send('overlay-window-focus', 'notes'); } catch {}
      }, { capture: true });
      window.addEventListener('focus', () => {
        try { ipcRenderer.send('overlay-window-focus', 'notes'); } catch {}
      });
    } catch {}
    
    let isUltraMinimal = ${ultraMinimal};
    
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
      ipcRenderer.send('notes-window-toggle-minimal', isUltraMinimal);
    }
    
    function closeWindow() {
      ipcRenderer.send('leveling-notes-window-close');
    }
    
    // Listen for notes updates
    ipcRenderer.on('notes-updated', (event, newNotes) => {
      const content = document.getElementById('content');
      if (newNotes) {
        content.innerHTML = '<div class="notes-text" id="notesText">' + parsePobNotesInBrowser(newNotes) + '</div>';
      } else {
        content.innerHTML = '<div class="no-notes"><div class="no-notes-icon">📝</div><div class="no-notes-text">No notes available<br><br>Import a PoB build with notes to see them here</div></div>';
      }
    });
    
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    function parsePobNotesInBrowser(text) {
      // First escape HTML
      let escaped = escapeHtml(text);
      
      // PoB preset colors
      const presetColors = {
        '0': '#FFFFFF',
        '1': '#FF0000',
        '2': '#00FF00',
        '3': '#0000FF',
        '4': '#FFFF00',
        '5': '#00FFFF',
        '6': '#FF00FF',
        '7': '#FFFFFF',
        '8': '#7F7F7F',
        '9': '#CFCFCF'
      };
      
      let currentColor = '#ffffff';
      const parts = [];
      let lastIndex = 0;
      
      // Combined regex: match either ^xRRGGBB or ^N
      const colorRegex = /\\^(?:x([0-9A-Fa-f]{6})|([0-9]))/g;
      let match;
      
      while ((match = colorRegex.exec(escaped)) !== null) {
        if (match.index > lastIndex) {
          const textBefore = escaped.substring(lastIndex, match.index);
          if (textBefore) {
            parts.push('<span style="color: ' + currentColor + '">' + textBefore + '</span>');
          }
        }
        
        // Update current color
        if (match[1]) {
          currentColor = '#' + match[1];
        } else if (match[2]) {
          currentColor = presetColors[match[2]] || '#ffffff';
        }
        
        lastIndex = match.index + match[0].length;
      }
      
      if (lastIndex < escaped.length) {
        const remaining = escaped.substring(lastIndex);
        if (remaining) {
          parts.push('<span style="color: ' + currentColor + '">' + remaining + '</span>');
        }
      }
      
      return parts.join('');
    }
    
    // Initialize
    if (isUltraMinimal) {
      document.body.classList.add('ultra-minimal');
      document.getElementById('minimalBtn').classList.add('active');
    }
  </script>
</body>
</html>
  `;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parsePobNotes(text: string): string {
  // First escape HTML
  let escaped = escapeHtml(text);
  
  // Parse PoB color codes
  // Format 1: ^xRRGGBB (6 hex digits)
  // Format 2: ^N (single digit 0-9 for preset colors)
  
  // PoB preset colors (based on PoB source code)
  const presetColors: { [key: string]: string } = {
    '0': '#FFFFFF', // White (default)
    '1': '#FF0000', // Red
    '2': '#00FF00', // Green
    '3': '#0000FF', // Blue
    '4': '#FFFF00', // Yellow
    '5': '#00FFFF', // Cyan
    '6': '#FF00FF', // Magenta
    '7': '#FFFFFF', // White (reset)
    '8': '#7F7F7F', // Gray
    '9': '#CFCFCF', // Light gray
  };
  
  let currentColor = '#ffffff'; // Default white
  const parts: string[] = [];
  let lastIndex = 0;
  
  // Combined regex: match either ^xRRGGBB or ^N
  const colorRegex = /\^(?:x([0-9A-Fa-f]{6})|([0-9]))/g;
  let match;
  
  while ((match = colorRegex.exec(escaped)) !== null) {
    // Add text before this color code (with current color)
    if (match.index > lastIndex) {
      const textBefore = escaped.substring(lastIndex, match.index);
      if (textBefore) {
        parts.push(`<span style="color: ${currentColor}">${textBefore}</span>`);
      }
    }
    
    // Update current color
    if (match[1]) {
      // ^xRRGGBB format
      currentColor = '#' + match[1];
    } else if (match[2]) {
      // ^N format (preset)
      currentColor = presetColors[match[2]] || '#ffffff';
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text with current color
  if (lastIndex < escaped.length) {
    const remaining = escaped.substring(lastIndex);
    if (remaining) {
      parts.push(`<span style="color: ${currentColor}">${remaining}</span>`);
    }
  }
  
  return parts.join('');
}
