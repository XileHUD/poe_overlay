/**
 * Leveling Settings Splash
 * Separate window for leveling overlay settings
 */

import { BrowserWindow, ipcMain, screen } from 'electron';
import { registerOverlayWindow } from './windowZManager.js';
import type { SettingsService } from '../services/settingsService.js';
import type { OverlayVersion } from '../../types/overlayVersion.js';

interface LevelingSettingsSplashParams {
  settingsService: SettingsService;
  overlayVersion: OverlayVersion;
  overlayWindow?: any; // Reference to main overlay window if needed
}

let activeSettingsWindow: BrowserWindow | null = null;

export function openLevelingSettingsSplash(params: LevelingSettingsSplashParams): void {
  // If already open, just focus it
  if (activeSettingsWindow && !activeSettingsWindow.isDestroyed()) {
    activeSettingsWindow.focus();
    return;
  }

  const { settingsService, overlayVersion } = params;
  
  // Get current settings
  const levelingKey = overlayVersion === 'poe1' ? 'levelingWindowPoe1' : 'levelingWindowPoe2';
  const currentSettings = settingsService.get(levelingKey) || {};
  
  console.log(`[LevelingSettingsSplash] Opening settings for ${levelingKey}, uiSettings:`, currentSettings.uiSettings);
  
  // Get client.txt path separately (stored at root level)
  const clientTxtPathKey = overlayVersion === 'poe1' ? 'clientTxtPathPoe1' : 'clientTxtPathPoe2';
  const clientTxtPath = settingsService.get(clientTxtPathKey) || 'Not configured';
  
  // Window dimensions
  const splashWidth = 675;
  const splashHeight = 396;
  
  // Try to center on screen
  let initialX = Math.floor((screen.getPrimaryDisplay().workAreaSize.width - splashWidth) / 2);
  let initialY = Math.floor((screen.getPrimaryDisplay().workAreaSize.height - splashHeight) / 2);

  const window = new BrowserWindow({
    width: splashWidth,
    height: splashHeight,
    x: initialX,
    y: initialY,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: undefined
    }
  });

  // Track as active settings window
  activeSettingsWindow = window;

  // Register for managed z-order and visibility
  try { registerOverlayWindow('levelingSettings', window); } catch {}

  // Build HTML
  const html = buildLevelingSettingsSplashHtml(currentSettings, overlayVersion, clientTxtPath);
  
  window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  
  window.once('ready-to-show', () => {
    window.show();
  });

  // Handle close button
  ipcMain.once('leveling-settings-close', () => {
    if (!window.isDestroyed()) {
      window.close();
    }
  });

  window.on('closed', () => {
    activeSettingsWindow = null;
  });
}

function buildLevelingSettingsSplashHtml(
  currentSettings: any,
  overlayVersion: OverlayVersion,
  clientTxtPath: string
): string {
  // Extract all current settings with proper defaults
  const groupByZone = currentSettings.uiSettings?.groupByZone ?? true;
  const showHints = currentSettings.uiSettings?.showHints ?? true;
  const showOptional = currentSettings.uiSettings?.showOptional ?? true;
  const autoDetectZones = currentSettings.uiSettings?.autoDetectZones ?? true;
  const showTreeNodeDetails = currentSettings.uiSettings?.showTreeNodeDetails ?? false;
  const autoDetectLevelingSets = currentSettings.uiSettings?.autoDetectLevelingSets ?? true;
  const opacity = currentSettings.uiSettings?.opacity ?? 96;
  const fontSize = currentSettings.uiSettings?.fontSize ?? 12;
  const zoomLevel = currentSettings.uiSettings?.zoomLevel ?? 100;
  const visibleSteps = currentSettings.uiSettings?.visibleSteps ?? 99;
  const wideMode = currentSettings.wideMode ?? false;
  
  // Extract hotkeys with defaults
  const hotkeys = currentSettings.hotkeys || {};
  const hotkeyPrev = hotkeys.prev || 'Not Set';
  const hotkeyNext = hotkeys.next || 'Not Set';
  const hotkeyTree = hotkeys.tree || 'Not Set';
  const hotkeyGems = hotkeys.gems || 'Not Set';
  const hotkeyGear = hotkeys.gear || 'Not Set';
  const hotkeyNotes = hotkeys.notes || 'Not Set';
  const hotkeyPobBar = hotkeys.pobBar || 'Not Set';
  const hotkeyLeveling = hotkeys.leveling || 'Not Set';
  
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
      --accent-orange: #f0ad4e;
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
      display: flex;
      flex-direction: column;
      height: 100vh;
      border: 1px solid rgba(74, 222, 128, 0.3);
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.5), 0 0 40px rgba(74, 222, 128, 0.15);
      border-radius: 8px;
    }
    
    .header {
      padding: 6px 12px;
      background: rgba(26, 26, 26, 0.92);
      border-bottom: 1px solid rgba(74, 222, 128, 0.2);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
      -webkit-app-region: drag;
      border-radius: 8px 8px 0 0;
    }
    
    .header-title h1 {
      margin: 0;
      font-size: 14px;
      color: var(--accent-green);
      font-weight: 600;
    }
    
    .header-subtitle {
      margin: 2px 0 0 0;
      font-size: 10px;
      color: var(--text-secondary);
    }
    
    .close-btn {
      width: 22px;
      height: 22px;
      background: rgba(217, 83, 79, 0.1);
      border: 1px solid rgba(217, 83, 79, 0.3);
      border-radius: 4px;
      color: var(--accent-red);
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
      flex-shrink: 0;
      -webkit-app-region: no-drag;
    }
    
    .close-btn:hover {
      background: rgba(217, 83, 79, 0.2);
      border-color: rgba(217, 83, 79, 0.5);
    }
    
    .tab-nav {
      display: flex;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      padding: 0 12px;
      gap: 2px;
      flex-shrink: 0;
      -webkit-app-region: no-drag;
    }
    
    .tab-button {
      padding: 8px 20px;
      background: transparent;
      border: none;
      color: var(--text-secondary);
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      position: relative;
      transition: all 0.15s ease;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
    }
    
    .tab-button:hover {
      color: var(--text-primary);
      background: rgba(255, 255, 255, 0.02);
    }
    
    .tab-button.active {
      color: var(--accent-green);
      border-bottom-color: var(--accent-green);
    }
    
    .content {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }
    
    .tab-panel {
      display: none;
    }
    
    .tab-panel.active {
      display: block;
    }
    
    .setting-group {
      background: rgba(37, 37, 37, 0.6);
      border: 1px solid rgba(64, 64, 64, 0.5);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 10px;
    }
    
    .setting-group-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--accent-green);
      margin: 0 0 10px 0;
    }
    
    .setting-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    }
    
    .setting-item:last-child {
      border-bottom: none;
    }
    
    .setting-label {
      flex: 1;
    }
    
    .setting-name {
      font-size: 11px;
      color: var(--text-primary);
      margin-bottom: 2px;
    }
    
    .setting-description {
      font-size: 10px;
      color: var(--text-muted);
    }
    
    .toggle-switch {
      position: relative;
      width: 40px;
      height: 20px;
      background: var(--bg-tertiary);
      border-radius: 10px;
      cursor: pointer;
      transition: background 0.2s;
      border: 1px solid var(--border-color);
    }
    
    .toggle-switch.active {
      background: var(--accent-green);
      border-color: var(--accent-green);
    }
    
    .toggle-slider {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 14px;
      height: 14px;
      background: white;
      border-radius: 50%;
      transition: transform 0.2s;
    }
    
    .toggle-switch.active .toggle-slider {
      transform: translateX(20px);
    }
    
    .slider-container {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    input[type="range"] {
      width: 160px;
      height: 4px;
      border-radius: 2px;
      background: var(--bg-tertiary);
      outline: none;
      -webkit-appearance: none;
    }
    
    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--accent-green);
      cursor: pointer;
    }
    
    .range-value {
      min-width: 40px;
      text-align: right;
      color: var(--accent-green);
      font-weight: 600;
      font-size: 11px;
    }
    
    .file-path-display {
      font-size: 10px;
      color: var(--text-muted);
      padding: 6px 10px;
      background: var(--bg-tertiary);
      border-radius: 3px;
      word-break: break-all;
      margin-top: 6px;
      font-family: 'Consolas', monospace;
    }
    
    .button-group {
      display: flex;
      gap: 6px;
      margin-top: 6px;
    }
    
    .action-btn {
      flex: 1;
      padding: 6px 12px;
      background: rgba(74, 222, 128, 0.15);
      border: 1px solid rgba(74, 222, 128, 0.3);
      border-radius: 4px;
      color: var(--accent-green);
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }
    
    .action-btn:hover {
      background: rgba(74, 222, 128, 0.25);
      border-color: rgba(74, 222, 128, 0.5);
    }
    
    .action-btn.danger {
      background: rgba(217, 83, 79, 0.15);
      border-color: rgba(217, 83, 79, 0.3);
      color: var(--accent-red);
    }
    
    .action-btn.danger:hover {
      background: rgba(217, 83, 79, 0.25);
      border-color: rgba(217, 83, 79, 0.5);
    }
    
    .action-btn.primary {
      background: rgba(74, 158, 255, 0.15);
      border-color: rgba(74, 158, 255, 0.3);
      color: var(--accent-blue);
    }
    
    .action-btn.primary:hover {
      background: rgba(74, 158, 255, 0.25);
      border-color: rgba(74, 158, 255, 0.5);
    }
    
    .info-box {
      background: rgba(74, 158, 255, 0.08);
      border: 1px solid rgba(74, 158, 255, 0.25);
      border-radius: 4px;
      padding: 8px 10px;
      margin-top: 6px;
      font-size: 10px;
      color: var(--text-secondary);
      line-height: 1.4;
    }
    
    .info-box strong {
      color: var(--accent-blue);
    }
    
    .hotkey-input {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 6px 12px;
      color: var(--text-primary);
      font-size: 11px;
      font-family: 'Consolas', 'Courier New', monospace;
      min-width: 120px;
      text-align: center;
      cursor: pointer;
      transition: all 0.15s;
    }
    
    .hotkey-input:hover {
      border-color: var(--accent-blue);
      background: rgba(74, 158, 255, 0.05);
    }
    
    .hotkey-input.recording {
      border-color: var(--accent-green);
      background: rgba(74, 222, 128, 0.1);
      animation: pulse 1s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    
    .hotkey-clear {
      background: transparent;
      border: 1px solid rgba(217, 83, 79, 0.3);
      color: var(--accent-red);
      padding: 4px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 10px;
      margin-left: 6px;
      transition: all 0.15s;
    }
    
    .hotkey-clear:hover {
      background: rgba(217, 83, 79, 0.1);
      border-color: rgba(217, 83, 79, 0.5);
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
      background: rgba(74, 222, 128, 0.3);
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-title">
      <div>
        <h1>⚙️ Leveling Overlay Settings</h1>
        <div class="header-subtitle">Configure your Path of Exile leveling experience</div>
      </div>
    </div>
    <div class="close-btn" onclick="closeSettings()">×</div>
  </div>
  
  <div class="tab-nav">
    <button class="tab-button active" onclick="switchTab('display')">Display</button>
    <button class="tab-button" onclick="switchTab('behavior')">Behavior</button>
    <button class="tab-button" onclick="switchTab('hotkeys')">Hotkeys</button>
    <button class="tab-button" onclick="switchTab('integration')">Integration</button>
    <button class="tab-button" onclick="switchTab('pob')">PoB Import</button>
    <button class="tab-button" onclick="switchTab('advanced')">Advanced</button>
  </div>
  
  <div class="content">
    <!-- Display Tab -->
    <div class="tab-panel active" id="tab-display">
      <div class="setting-group">
        <h3 class="setting-group-title">Visual Options</h3>
        
        <div class="setting-item">
          <div class="setting-label">
            <div class="setting-name">Overlay Opacity</div>
            <div class="setting-description">Adjust transparency of the overlay background</div>
          </div>
          <div class="slider-container">
            <input type="range" min="20" max="100" value="${opacity}" oninput="updateSetting('opacity', parseInt(this.value))" id="opacitySlider"/>
            <span class="range-value" id="opacity-value">${opacity}%</span>
          </div>
        </div>
        
        <div class="setting-item">
          <div class="setting-label">
            <div class="setting-name">Font Size</div>
            <div class="setting-description">Adjust text size throughout the overlay</div>
          </div>
          <div class="slider-container">
            <input type="range" min="10" max="18" value="${fontSize}" oninput="updateSetting('fontSize', parseInt(this.value))" id="fontSizeSlider"/>
            <span class="range-value" id="fontSize-value">${fontSize}px</span>
          </div>
        </div>
        
        <div class="setting-item">
          <div class="setting-label">
            <div class="setting-name">Zoom Level</div>
            <div class="setting-description">Scale the entire overlay interface</div>
          </div>
          <div class="slider-container">
            <input type="range" min="50" max="150" value="${zoomLevel}" oninput="updateSetting('zoomLevel', parseInt(this.value))" id="zoomSlider"/>
            <span class="range-value" id="zoomLevel-value">${zoomLevel}%</span>
          </div>
        </div>
        
        <div class="setting-item">
          <div class="setting-label">
            <div class="setting-name">Visible Steps</div>
            <div class="setting-description">Limit how many quest steps are shown at once</div>
          </div>
          <div class="slider-container">
            <input type="range" min="1" max="99" value="${visibleSteps}" oninput="updateSetting('visibleSteps', parseInt(this.value))" id="visibleStepsSlider"/>
            <span class="range-value" id="visibleSteps-value">${visibleSteps === 99 ? 'All' : visibleSteps}</span>
          </div>
        </div>

        <div class="button-group">
          <button class="action-btn" onclick="resetDisplaySettings()">🔄 Reset Display to Defaults</button>
        </div>
      </div>
    </div>
    
    <!-- Behavior Tab -->
    <div class="tab-panel" id="tab-behavior">
      <div class="setting-group">
        <h3 class="setting-group-title">Display Behavior</h3>
        
        <div class="setting-item">
          <div class="setting-label">
            <div class="setting-name">Group by Zone</div>
            <div class="setting-description">Group quest steps by zone for better organization</div>
          </div>
          <div class="toggle-switch ${groupByZone ? 'active' : ''}" onclick="toggleSetting(this, 'groupByZone')">
            <div class="toggle-slider"></div>
          </div>
        </div>
        
        <div class="setting-item">
          <div class="setting-label">
            <div class="setting-name">Show Hints</div>
            <div class="setting-description">Display helpful tips and guidance for quest steps</div>
          </div>
          <div class="toggle-switch ${showHints ? 'active' : ''}" onclick="toggleSetting(this, 'showHints')">
            <div class="toggle-slider"></div>
          </div>
        </div>
        
        <div class="setting-item">
          <div class="setting-label">
            <div class="setting-name">First League Run Mode</div>
            <div class="setting-description">Shows optional quests and extra content (disable for faster repeated runs)</div>
          </div>
          <div class="toggle-switch ${showOptional ? 'active' : ''}" onclick="toggleSetting(this, 'showOptional')">
            <div class="toggle-slider"></div>
          </div>
        </div>
        
        <div class="setting-item">
          <div class="setting-label">
            <div class="setting-name">Wide Layout Mode</div>
            <div class="setting-description">Use a wider horizontal layout (requires restart)</div>
          </div>
          <div class="toggle-switch ${wideMode ? 'active' : ''}" onclick="toggleSetting(this, 'wideMode')">
            <div class="toggle-slider"></div>
          </div>
        </div>
        
        <div class="setting-item">
          <div class="setting-label">
            <div class="setting-name">Show Tree Node Details on Hover</div>
            <div class="setting-description">Display node name and stats when hovering over passive tree nodes</div>
          </div>
          <div class="toggle-switch ${showTreeNodeDetails ? 'active' : ''}" onclick="toggleSetting(this, 'showTreeNodeDetails')">
            <div class="toggle-slider"></div>
          </div>
        </div>
        
        <div class="setting-item">
          <div class="setting-label">
            <div class="setting-name">Auto Detect Correct Tree/Gems/Gear Sets</div>
            <div class="setting-description">Automatically select the best matching set based on your current act and level</div>
          </div>
          <div class="toggle-switch ${autoDetectLevelingSets ? 'active' : ''}" onclick="toggleSetting(this, 'autoDetectLevelingSets')">
            <div class="toggle-slider"></div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Hotkeys Tab -->
    <div class="tab-panel" id="tab-hotkeys">
      <div class="setting-group">
        <h3 class="setting-group-title">Navigation Hotkeys</h3>
        
        <div class="setting-item">
          <div class="setting-label">
            <div class="setting-name">Previous Step</div>
            <div class="setting-description">Go to previous quest step (works in all view modes)</div>
          </div>
          <div style="display: flex; align-items: center;">
            <div class="hotkey-input" id="hotkey-prev" onclick="captureHotkey('prev')">${hotkeyPrev}</div>
            <button class="hotkey-clear" onclick="clearHotkey('prev')">Clear</button>
          </div>
        </div>
        
        <div class="setting-item">
          <div class="setting-label">
            <div class="setting-name">Next Step</div>
            <div class="setting-description">Go to next quest step (works in all view modes)</div>
          </div>
          <div style="display: flex; align-items: center;">
            <div class="hotkey-input" id="hotkey-next" onclick="captureHotkey('next')">${hotkeyNext}</div>
            <button class="hotkey-clear" onclick="clearHotkey('next')">Clear</button>
          </div>
        </div>
      </div>
      
      <div class="setting-group">
        <h3 class="setting-group-title">PoB Window Hotkeys</h3>
        
        <div class="setting-item">
          <div class="setting-label">
            <div class="setting-name">Toggle Passive Tree</div>
            <div class="setting-description">Open/close passive tree window</div>
          </div>
          <div style="display: flex; align-items: center;">
            <div class="hotkey-input" id="hotkey-tree" onclick="captureHotkey('tree')">${hotkeyTree}</div>
            <button class="hotkey-clear" onclick="clearHotkey('tree')">Clear</button>
          </div>
        </div>
        
        <div class="setting-item">
          <div class="setting-label">
            <div class="setting-name">Toggle Gems</div>
            <div class="setting-description">Open/close gems window</div>
          </div>
          <div style="display: flex; align-items: center;">
            <div class="hotkey-input" id="hotkey-gems" onclick="captureHotkey('gems')">${hotkeyGems}</div>
            <button class="hotkey-clear" onclick="clearHotkey('gems')">Clear</button>
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <div class="setting-name">Toggle Gear</div>
            <div class="setting-description">Open/close gear window</div>
          </div>
          <div style="display: flex; align-items: center;">
            <div class="hotkey-input" id="hotkey-gear" onclick="captureHotkey('gear')">${hotkeyGear}</div>
            <button class="hotkey-clear" onclick="clearHotkey('gear')">Clear</button>
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <div class="setting-name">Toggle Notes</div>
            <div class="setting-description">Open/close notes window</div>
          </div>
          <div style="display: flex; align-items: center;">
            <div class="hotkey-input" id="hotkey-notes" onclick="captureHotkey('notes')">${hotkeyNotes}</div>
            <button class="hotkey-clear" onclick="clearHotkey('notes')">Clear</button>
          </div>
        </div>
      </div>
      
      <div class="setting-group">
        <h3 class="setting-group-title">Overlay Hotkeys</h3>
        <div class="setting-item">
          <div class="setting-label">
            <div class="setting-name">Toggle Build Info Bar</div>
            <div class="setting-description">Open/close the PoB build info bar</div>
          </div>
          <div style="display: flex; align-items: center;">
            <div class="hotkey-input" id="hotkey-pobBar" onclick="captureHotkey('pobBar')">${hotkeyPobBar}</div>
            <button class="hotkey-clear" onclick="clearHotkey('pobBar')">Clear</button>
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <div class="setting-name">Toggle Leveling Window</div>
            <div class="setting-description">Show/hide the main leveling overlay window</div>
          </div>
          <div style="display: flex; align-items: center;">
            <div class="hotkey-input" id="hotkey-leveling" onclick="captureHotkey('leveling')">${hotkeyLeveling}</div>
            <button class="hotkey-clear" onclick="clearHotkey('leveling')">Clear</button>
          </div>
        </div>
      </div>

      <div class="info-box">
        <strong>How to set hotkeys:</strong> Click on a hotkey field and press your desired key combination.
        Supports modifiers like Ctrl, Alt, Shift. Examples: F1, Ctrl+N, Alt+G, Shift+T
      </div>
    </div>
    
    <!-- Integration Tab -->
    <div class="tab-panel" id="tab-integration">
      <div class="setting-group">
        <h3 class="setting-group-title">Client.txt Integration</h3>
        
        <div class="setting-item">
          <div class="setting-label">
            <div class="setting-name">Auto-detect Zone Changes</div>
            <div class="setting-description">Automatically track your progress by reading Client.txt</div>
          </div>
          <div class="toggle-switch ${autoDetectZones ? 'active' : ''}" onclick="toggleSetting(this, 'autoDetectZones')">
            <div class="toggle-slider"></div>
          </div>
        </div>
        
        <div class="setting-item" style="flex-direction: column; align-items: stretch;">
          <div class="setting-label">
            <div class="setting-name">Client.txt Path</div>
            <div class="setting-description">Location of your Path of Exile Client.txt log file</div>
          </div>
          
          <div class="file-path-display" id="clientPathDisplay">${clientTxtPath}</div>
          
          <div class="button-group">
            <button class="action-btn" onclick="autoDetectPath()">🔍 Auto Detect</button>
            <button class="action-btn" onclick="selectPath()">📁 Browse...</button>
          </div>
          
          <div class="info-box">
            <strong>GGG Policy:</strong> Reading the game's log files is officially allowed by GGG.<br>
            "Reading the game's log files is okay as long as the user is aware of what you are doing with that data."<br>
            Cleaning the log file can improve game performance by removing old entries.<br><br>
            <strong>⚠️ Troubleshooting:</strong> If auto-detection doesn't work, try running the app as administrator. Some antivirus or system permissions may block file access.
          </div>
          
          <div class="button-group">
            <button class="action-btn danger" onclick="cleanLogFile()">🗑️ Clean Log File</button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- PoB Import Tab -->
    <div class="tab-panel" id="tab-pob">
      <div class="setting-group">
        <h3 class="setting-group-title">Path of Building Integration</h3>
        
        <div class="info-box" style="margin-bottom: 16px;">
          <strong>ℹ️ About PoB Import:</strong><br/>
          Import builds from Path of Building to see skill gems and passive tree progression while leveling. 
          The overlay will show ${overlayVersion === 'poe1' ? 'which gems to pick up from quest rewards and track' : 'skill gems and'} your passive tree allocation.
        </div>
        
        <div class="setting-item" style="flex-direction: column; align-items: stretch;">
          <div class="setting-label">
            <div class="setting-name">Import PoB Build Code</div>
            <div class="setting-description">Paste your Path of Building code or pobb.in link</div>
          </div>
          <textarea 
            id="pobCodeInput" 
            placeholder="Paste PoB code or pobb.in link here..." 
            style="width: 100%; min-height: 120px; margin-top: 8px; padding: 12px; 
                   background: var(--bg-tertiary); border: 1px solid var(--border-color); 
                   border-radius: 6px; color: var(--text-primary); font-family: monospace; 
                   font-size: 11px; resize: vertical;"
          ></textarea>
          <button class="action-btn primary" onclick="importPobCode()" style="margin-top: 8px;">
            📥 Import Build
          </button>
        </div>
        
        <div class="setting-item" style="flex-direction: column; align-items: stretch;">
          <div class="setting-label">
            <div class="setting-name">Current Build</div>
            <div class="setting-description">Currently loaded Path of Building build</div>
          </div>
          <div id="pobBuildInfo" style="margin-top: 8px; padding: 12px; background: var(--bg-tertiary); 
                                       border: 1px solid var(--border-color); border-radius: 6px; 
                                       font-size: 12px; color: var(--text-secondary);">
            No build imported
          </div>
          <button class="action-btn danger" onclick="clearPobBuild()" style="margin-top: 8px;" id="clearPobBtn" disabled>
            🗑️ Clear Build
          </button>
        </div>
      </div>
      
      <div class="setting-group" style="${overlayVersion === 'poe2' ? 'opacity: 0.5; pointer-events: none;' : ''}">
        <h3 class="setting-group-title">PoB Windows</h3>
        
        <div class="setting-item" style="flex-direction: column; align-items: stretch;">
          <div class="setting-label">
            <div class="setting-name">Gem Links Window</div>
            <div class="setting-description">Floating window showing your gem socket groups per act</div>
          </div>
          <button class="action-btn primary" onclick="openGemsWindow()" style="margin-top: 8px;">
            💎 Open Gems Window
          </button>
        </div>
        
        <div class="setting-item" style="flex-direction: column; align-items: stretch;">
          <div class="setting-label">
            <div class="setting-name">Build Info Bar</div>
            <div class="setting-description">Quick access to PoB build information and controls</div>
          </div>
          <button class="action-btn primary" onclick="openPobInfoBar()" style="margin-top: 8px;">
            📊 Open Info Bar
          </button>
        </div>
      </div>
    </div>
    
    <!-- Advanced Tab -->
    <div class="tab-panel" id="tab-advanced">
      <div class="setting-group">
        <h3 class="setting-group-title">Advanced Options</h3>
        
        <div class="setting-item" style="flex-direction: column; align-items: stretch;">
          <div class="setting-label">
            <div class="setting-name">Act Speedrunning Summary</div>
            <div class="setting-description">View completion times for all acts</div>
          </div>
          <button class="action-btn primary" onclick="showActSummary()" style="margin-top: 8px;">📊 View Act Times</button>
        </div>
        
        <div class="setting-item" style="flex-direction: column; align-items: stretch;">
          <div class="setting-label">
            <div class="setting-name">Reset Progress</div>
            <div class="setting-description">Clear all completed quest steps and start fresh</div>
          </div>
          <button class="action-btn danger" onclick="resetProgress()" style="margin-top: 8px;">🔄 Reset All Progress</button>
        </div>
        
        <div class="setting-item" style="flex-direction: column; align-items: stretch;">
          <div class="setting-label">
            <div class="setting-name">Clear Run History</div>
            <div class="setting-description">Delete all saved act completion times</div>
          </div>
          <button class="action-btn danger" onclick="clearHistory()" style="margin-top: 8px;">🗑️ Clear All History</button>
        </div>
      </div>
    </div>
  </div>
  
  <script>
    const { ipcRenderer } = require('electron');
    // Ensure clicking this window brings it to front above other overlays
    try {
      document.addEventListener('mousedown', () => {
        try { ipcRenderer.send('overlay-window-focus', 'levelingSettings'); } catch {}
      }, { capture: true });
      window.addEventListener('focus', () => {
        try { ipcRenderer.send('overlay-window-focus', 'levelingSettings'); } catch {}
      });
    } catch {}
    
    function switchTab(tabName) {
      // Update buttons
      document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
      event.target.classList.add('active');
      
      // Update panels
      document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
      document.getElementById('tab-' + tabName).classList.add('active');
    }
    
    function toggleSetting(element, setting) {
      element.classList.toggle('active');
      const value = element.classList.contains('active');
      updateSetting(setting, value);
    }
    
    // Batch settings updates to avoid spamming IPC/render during slider drags
    const _pendingUpdates = {};
    let _rafScheduled = false;
    let _fallbackTimer = null;
    function _flushPending() {
      if (Object.keys(_pendingUpdates).length === 0) return;
      ipcRenderer.send('leveling-settings-update', { ..._pendingUpdates });
      for (const k in _pendingUpdates) delete _pendingUpdates[k];
      _rafScheduled = false;
      if (_fallbackTimer) { clearTimeout(_fallbackTimer); _fallbackTimer = null; }
    }
    function _scheduleSend() {
      if (_rafScheduled) return;
      _rafScheduled = true;
      // Coalesce to next frame for smoothness
      requestAnimationFrame(_flushPending);
      // Fallback in case rAF is throttled (e.g., background)
      if (_fallbackTimer) clearTimeout(_fallbackTimer);
      _fallbackTimer = setTimeout(_flushPending, 120);
    }

    function updateSetting(key, value) {
      // Update display if it's a slider
      const valueDisplay = document.getElementById(key + '-value');
      if (valueDisplay) {
        if (key === 'visibleSteps') {
          valueDisplay.textContent = value === 99 ? 'All' : value;
        } else if (key === 'opacity' || key === 'zoomLevel') {
          valueDisplay.textContent = value + '%';
        } else if (key === 'fontSize') {
          valueDisplay.textContent = value + 'px';
        }
      }
      
      // Batch-send update to main process (smooth sliders)
      _pendingUpdates[key] = value;
      _scheduleSend();
    }

    // Ensure any pending updates are flushed when the window is closed or hidden
    window.addEventListener('beforeunload', () => {
      try { _flushPending(); } catch { /* no-op */ }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        try { _flushPending(); } catch { /* no-op */ }
      }
    });

    // Reset the Display tab sliders to sensible defaults and apply immediately
    function resetDisplaySettings() {
      const defaults = { opacity: 96, fontSize: 12, zoomLevel: 100, visibleSteps: 99 };

      // Update sliders' UI
      const opacityEl = document.getElementById('opacitySlider');
      const fontEl = document.getElementById('fontSizeSlider');
      const zoomEl = document.getElementById('zoomSlider');
      const stepsEl = document.getElementById('visibleStepsSlider');

      if (opacityEl) opacityEl.value = String(defaults.opacity);
      if (fontEl) fontEl.value = String(defaults.fontSize);
      if (zoomEl) zoomEl.value = String(defaults.zoomLevel);
      if (stepsEl) stepsEl.value = String(defaults.visibleSteps);

      // Use the same update path so displays and overlay update via fast-path
      updateSetting('opacity', defaults.opacity);
      updateSetting('fontSize', defaults.fontSize);
      updateSetting('zoomLevel', defaults.zoomLevel);
      updateSetting('visibleSteps', defaults.visibleSteps);

      // Flush immediately so user sees the effect without waiting
      _flushPending();
    }
    
    function autoDetectPath() {
      ipcRenderer.invoke('auto-detect-client-txt').then(result => {
        if (result.success) {
          document.getElementById('clientPathDisplay').textContent = result.path;
        } else {
          alert('Could not auto-detect Client.txt. Please use Browse to select it manually.');
        }
      });
    }
    
    function selectPath() {
      ipcRenderer.invoke('select-client-txt-path').then(result => {
        if (result.success) {
          document.getElementById('clientPathDisplay').textContent = result.path;
        }
      });
    }
    
    function cleanLogFile() {
      if (confirm('This will clear all content from Client.txt. The file will be recreated by the game. Continue?')) {
        ipcRenderer.invoke('clean-client-txt').then(result => {
          if (result.success) {
            alert('Client.txt has been cleaned successfully!');
          } else {
            alert('Failed to clean Client.txt: ' + (result.error || 'Unknown error'));
          }
        });
      }
    }
    
    function resetProgress() {
      if (confirm('This will reset all your leveling progress. Are you sure?')) {
        ipcRenderer.invoke('reset-leveling-progress').then(() => {
          alert('Progress has been reset!');
        });
      }
    }
    
    function clearHistory() {
      if (confirm('This will delete all your saved run times. Are you sure?')) {
        ipcRenderer.invoke('clear-all-run-history').then(() => {
          alert('Run history has been cleared!');
        });
      }
    }
    
    function showActSummary() {
      ipcRenderer.invoke('get-act-times-summary').then(summary => {
        if (summary) {
          alert(summary);
        } else {
          alert('No act times recorded yet. Complete some acts to see your times!');
        }
      });
    }
    
    function importPobCode() {
      const pobCode = document.getElementById('pobCodeInput').value.trim();
      if (!pobCode) {
        alert('Please paste a PoB code or pobb.in URL first.');
        return;
      }
      
      const infoEl = document.getElementById('pobBuildInfo');
      const clearBtn = document.getElementById('clearPobBtn');
      
      infoEl.textContent = 'Importing build...';
      infoEl.style.color = 'var(--text-secondary)';
      
      ipcRenderer.invoke('import-pob-from-settings', pobCode).then(result => {
        if (result.success) {
          infoEl.innerHTML = \`
            <div style="color: var(--accent-green); font-weight: 600; margin-bottom: 8px;">✅ Build Imported Successfully!</div>
            <div><strong>\${result.build.className}</strong> \${result.build.ascendancyName ? '(' + result.build.ascendancyName + ')' : ''}</div>
            <div style="margin-top: 4px;">Level \${result.build.level} | \${result.build.totalNodes || 0} passive nodes | \${result.build.gemsFound || 0} gems</div>
          \`;
          
          clearBtn.disabled = false;
          
          // Clear the input
          document.getElementById('pobCodeInput').value = '';
        } else {
          infoEl.innerHTML = \`<div style="color: var(--accent-red);">❌ \${result.error || 'Failed to import build'}</div>\`;
        }
      }).catch(err => {
        infoEl.innerHTML = \`<div style="color: var(--accent-red);">❌ Error: \${err.message}</div>\`;
      });
    }
    
    function clearPobBuild() {
      if (!confirm('Remove the current PoB build? This will clear gem recommendations and tree data.')) {
        return;
      }
      
      ipcRenderer.invoke('remove-pob-build').then(() => {
        document.getElementById('pobBuildInfo').textContent = 'No build imported';
        document.getElementById('pobBuildInfo').style.color = 'var(--text-secondary)';
        document.getElementById('clearPobBtn').disabled = true;
      });
    }
    
    function openGemsWindow() {
      ipcRenderer.send('open-gems-window');
    }
    
    function openPobInfoBar() {
      ipcRenderer.send('show-pob-info-bar');
    }
    
    function showPobInfoBar() {
      ipcRenderer.send('show-pob-info-bar');
    }
    
    // Hotkey capture system
    let capturingHotkeyFor = null;
    let _hotkeyKeydownHandler = null;
    
    function captureHotkey(hotkeyName) {
      // If we're already capturing another, cancel it first
      if (_hotkeyKeydownHandler) {
        document.removeEventListener('keydown', _hotkeyKeydownHandler, true);
        _hotkeyKeydownHandler = null;
      }

      capturingHotkeyFor = hotkeyName;
      const inputEl = document.getElementById('hotkey-' + hotkeyName);
      inputEl.textContent = 'Press combination...';
      inputEl.classList.add('recording');
      
      // Listen until we receive a non-modifier key (so Ctrl/Shift + Key works)
      _hotkeyKeydownHandler = function handleHotkeyCapture(e) {
        e.preventDefault();
        e.stopPropagation();

        if (!capturingHotkeyFor) return;

        // Allow Esc to cancel
        if (e.key === 'Escape') {
          inputEl.textContent = 'Not Set';
          inputEl.classList.remove('recording');
          capturingHotkeyFor = null;
          document.removeEventListener('keydown', _hotkeyKeydownHandler, true);
          _hotkeyKeydownHandler = null;
          return;
        }

        // Ignore pure modifier presses; keep listening for the actual key
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
          return; // keep capturing
        }

        const hotkeyName = capturingHotkeyFor;
        
        // Build accelerator string
        const modifiers = [];
        if (e.ctrlKey) modifiers.push('Ctrl');
        if (e.altKey) modifiers.push('Alt');
        if (e.shiftKey) modifiers.push('Shift');
        
        // Get the key name
        let key = e.key;
        
        // Normalize key names for Electron accelerator format
        const keyMap = {
          ' ': 'Space',
          'ArrowUp': 'Up',
          'ArrowDown': 'Down',
          'ArrowLeft': 'Left',
          'ArrowRight': 'Right',
          'Delete': 'Delete',
          'Insert': 'Insert',
          'Home': 'Home',
          'End': 'End',
          'PageUp': 'PageUp',
          'PageDown': 'PageDown'
        };
        
        if (keyMap[key]) {
          key = keyMap[key];
        } else if (key.length === 1) {
          key = key.toUpperCase();
        } else if (key.startsWith('F') && !isNaN(key.substring(1))) {
          // F1-F24 keys are already in correct format
          key = key;
        }
        
        // Build full accelerator
        const parts = [...modifiers, key];
        const accelerator = parts.join('+');
        
        // Update display
        inputEl.textContent = accelerator || 'Not Set';
        inputEl.classList.remove('recording');
        
        // Save hotkey
        updateHotkey(hotkeyName, accelerator);
        
        // Cleanup listener
        capturingHotkeyFor = null;
        document.removeEventListener('keydown', _hotkeyKeydownHandler, true);
        _hotkeyKeydownHandler = null;
      };

      // Use capture phase to avoid other handlers swallowing the event
      document.addEventListener('keydown', _hotkeyKeydownHandler, true);
    }
    
    function clearHotkey(hotkeyName) {
      const inputEl = document.getElementById('hotkey-' + hotkeyName);
      inputEl.textContent = 'Not Set';
      updateHotkey(hotkeyName, null);
    }
    
    function updateHotkey(hotkeyName, accelerator) {
      // Send to main process to save
      ipcRenderer.send('leveling-hotkey-update', { 
        hotkeyName, 
        accelerator 
      });
    }
    
    
    function closeSettings() {
      ipcRenderer.send('leveling-settings-close');
    }
    
    // Initialize: Load existing PoB build if any
    (function initializePobDisplay() {
      ipcRenderer.invoke('get-pob-build').then(pobBuild => {
        const infoEl = document.getElementById('pobBuildInfo');
        const clearBtn = document.getElementById('clearPobBtn');
        
        if (pobBuild && pobBuild.className) {
          infoEl.innerHTML = \`
            <div style="color: var(--accent-green); font-weight: 600; margin-bottom: 8px;">✅ Build Loaded</div>
            <div><strong>\${pobBuild.className}</strong> \${pobBuild.ascendancyName ? '(' + pobBuild.ascendancyName + ')' : ''}</div>
            <div style="margin-top: 4px;">Level \${pobBuild.level} | \${pobBuild.totalNodes || 0} passive nodes | \${pobBuild.gemsFound || 0} gems</div>
          \`;
          clearBtn.disabled = false;
        } else {
          infoEl.textContent = 'No build imported';
          infoEl.style.color = 'var(--text-secondary)';
          clearBtn.disabled = true;
        }
      });
    })();
  </script>
</body>
</html>
  `;
}
