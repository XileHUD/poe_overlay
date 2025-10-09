/**
 * Feature selection splash screen.
 * Shown on first launch or when user wants to reconfigure features.
 */

import { BrowserWindow, ipcMain, screen } from 'electron';
import { FeatureConfig, DEFAULT_FEATURES, MINIMAL_FEATURES, ALL_FEATURES } from '../features/featureTypes.js';

/**
 * Build HTML for feature selection splash.
 * Uses dark theme consistent with merchant history UI.
 */
export function buildFeatureSplashHtml(currentConfig?: FeatureConfig): string {
  const config = currentConfig || DEFAULT_FEATURES;
  
  const checked = (val: boolean) => val ? 'checked' : '';
  
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
      --accent-orange: #f0ad4e;
    }
    
    * { box-sizing: border-box; }
    
    body {
      margin: 0;
      padding: 24px;
      font-family: 'Segoe UI', Roboto, Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      overflow-y: auto;
      user-select: none;
    }
    
    /* Dark scrollbar */
    body::-webkit-scrollbar {
      width: 12px;
    }
    
    body::-webkit-scrollbar-track {
      background: var(--bg-secondary);
      border-radius: 6px;
    }
    
    body::-webkit-scrollbar-thumb {
      background: var(--bg-tertiary);
      border-radius: 6px;
      border: 2px solid var(--bg-secondary);
    }
    
    body::-webkit-scrollbar-thumb:hover {
      background: #444c56;
    }
    
    h1 {
      margin: 0 0 8px;
      font-size: 20px;
      color: var(--accent-orange);
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
      justify-content: space-between;
    }
    
    .close-btn {
      background: none;
      border: none;
      color: var(--text-secondary);
      font-size: 20px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      transition: all 0.15s ease;
      line-height: 1;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .close-btn:hover {
      background: var(--bg-tertiary);
      color: var(--text-primary);
    }
    
    .subtitle {
      margin: 0 0 24px;
      font-size: 13px;
      color: var(--text-secondary);
    }
    
    .feature-group {
      margin-bottom: 12px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      overflow: hidden;
    }
    
    .feature-main {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      background: var(--bg-secondary);
      cursor: pointer;
      transition: background 0.15s ease;
      border-bottom: 1px solid var(--border-color);
    }
    
    .feature-main:hover {
      background: var(--bg-tertiary);
    }
    
    .feature-main.collapsed {
      border-bottom: none;
    }
    
    .feature-main input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
      margin: 0;
      flex-shrink: 0;
    }
    
    .feature-main label {
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      flex: 1;
      margin: 0;
    }
    
    .expand-icon {
      color: var(--text-secondary);
      font-size: 12px;
      transition: transform 0.2s ease;
      flex-shrink: 0;
    }
    
    .expand-icon.expanded {
      transform: rotate(90deg);
    }
    
    .feature-subs {
      background: rgba(0, 0, 0, 0.2);
      padding: 8px 0;
      display: none;
    }
    
    .feature-subs.visible {
      display: block;
    }
    
    .feature-sub {
      padding: 8px 14px 8px 44px;
      display: flex;
      align-items: center;
      gap: 10px;
      transition: background 0.15s ease;
    }
    
    .feature-sub:hover {
      background: rgba(255, 255, 255, 0.03);
    }
    
    .feature-sub input[type="checkbox"] {
      width: 16px;
      height: 16px;
      cursor: pointer;
      margin: 0;
      flex-shrink: 0;
    }
    
    .feature-sub label {
      cursor: pointer;
      font-size: 13px;
      color: var(--text-primary);
      margin: 0;
    }
    
    .buttons {
      margin-top: 24px;
      display: flex;
      gap: 10px;
      justify-content: center;
      padding-top: 16px;
      border-top: 1px solid var(--border-color);
    }
    
    button {
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: inherit;
    }
    
    .btn-primary {
      background: var(--accent-blue);
      color: #fff;
    }
    
    .btn-primary:hover {
      background: #5bb0ff;
    }
    
    .btn-secondary {
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
    }
    
    .btn-secondary:hover {
      background: #454545;
    }
    
    .warning {
      padding: 10px 14px;
      background: rgba(240, 173, 78, 0.1);
      border: 1px solid rgba(240, 173, 78, 0.3);
      border-radius: 6px;
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .warning::before {
      content: "⚠️";
      font-size: 16px;
    }
    
    .simple-checkbox {
      margin-bottom: 12px;
      padding: 12px 14px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    
    .simple-checkbox:hover {
      background: var(--bg-tertiary);
    }
    
    .simple-checkbox input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
      margin: 0;
    }
    
    .simple-checkbox label {
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      margin: 0;
    }
  </style>
</head>
<body>
  <h1>
    <span>🎯 Feature Selection</span>
    <button class="close-btn" onclick="closeWindow()" title="Close">✕</button>
  </h1>
  <p class="subtitle">Choose which features you want to use. You can change this later from the tray menu.</p>
  
  <div class="warning">
    Enabling fewer features will make the overlay start faster and use less memory.
  </div>

  <!-- Modifiers (simple checkbox, no subs) -->
  <div class="simple-checkbox">
    <input type="checkbox" id="feat-modifiers" ${checked(config.modifiers)}/>
    <label for="feat-modifiers">Modifiers (gear, weapons, jewels, etc.)</label>
  </div>

  <!-- Crafting (with subcategories) -->
  <div class="feature-group">
    <div class="feature-main" onclick="toggleGroup('crafting')">
      <input type="checkbox" id="feat-crafting" ${checked(config.crafting.enabled)} onclick="event.stopPropagation()"/>
      <label for="feat-crafting">Crafting</label>
      <span class="expand-icon ${config.crafting.enabled ? 'expanded' : ''}">▶</span>
    </div>
    <div class="feature-subs ${config.crafting.enabled ? 'visible' : ''}" id="subs-crafting">
      <div class="feature-sub">
        <input type="checkbox" id="feat-craft-liquid" ${checked(config.crafting.subcategories.liquidEmotions)}/>
        <label for="feat-craft-liquid">Liquid Emotions</label>
      </div>
      <div class="feature-sub">
        <input type="checkbox" id="feat-craft-annoints" ${checked(config.crafting.subcategories.annoints)}/>
        <label for="feat-craft-annoints">Annoints</label>
      </div>
      <div class="feature-sub">
        <input type="checkbox" id="feat-craft-essences" ${checked(config.crafting.subcategories.essences)}/>
        <label for="feat-craft-essences">Essences</label>
      </div>
      <div class="feature-sub">
        <input type="checkbox" id="feat-craft-omens" ${checked(config.crafting.subcategories.omens)}/>
        <label for="feat-craft-omens">Omens</label>
      </div>
      <div class="feature-sub">
        <input type="checkbox" id="feat-craft-currency" ${checked(config.crafting.subcategories.currency)}/>
        <label for="feat-craft-currency">Currency</label>
      </div>
      <div class="feature-sub">
        <input type="checkbox" id="feat-craft-catalysts" ${checked(config.crafting.subcategories.catalysts)}/>
        <label for="feat-craft-catalysts">Catalysts</label>
      </div>
      <div class="feature-sub">
        <input type="checkbox" id="feat-craft-socketables" ${checked(config.crafting.subcategories.socketables)}/>
        <label for="feat-craft-socketables">Socketables</label>
      </div>
    </div>
  </div>

  <!-- Character (with subcategories) -->
  <div class="feature-group">
    <div class="feature-main" onclick="toggleGroup('character')">
      <input type="checkbox" id="feat-character" ${checked(config.character.enabled)} onclick="event.stopPropagation()"/>
      <label for="feat-character">Character</label>
      <span class="expand-icon ${config.character.enabled ? 'expanded' : ''}">▶</span>
    </div>
    <div class="feature-subs ${config.character.enabled ? 'visible' : ''}" id="subs-character">
      <div class="feature-sub">
        <input type="checkbox" id="feat-char-quests" ${checked(config.character.subcategories.questPassives)}/>
        <label for="feat-char-quests">Quest Passives</label>
      </div>
      <div class="feature-sub">
        <input type="checkbox" id="feat-char-keystones" ${checked(config.character.subcategories.keystones)}/>
        <label for="feat-char-keystones">Keystones</label>
      </div>
      <div class="feature-sub">
        <input type="checkbox" id="feat-char-asc" ${checked(config.character.subcategories.ascendancyPassives)}/>
        <label for="feat-char-asc">Ascendancy Passives</label>
      </div>
      <div class="feature-sub">
        <input type="checkbox" id="feat-char-atlas" ${checked(config.character.subcategories.atlasNodes)}/>
        <label for="feat-char-atlas">Atlas Nodes</label>
      </div>
      <div class="feature-sub">
        <input type="checkbox" id="feat-char-gems" ${checked(config.character.subcategories.gems)}/>
        <label for="feat-char-gems">Gems</label>
      </div>
      <div class="feature-sub">
        <input type="checkbox" id="feat-char-glossar" ${checked(config.character.subcategories.glossar)}/>
        <label for="feat-char-glossar">Glossar</label>
      </div>
    </div>
  </div>

  <!-- Items (with subcategories) -->
  <div class="feature-group">
    <div class="feature-main" onclick="toggleGroup('items')">
      <input type="checkbox" id="feat-items" ${checked(config.items.enabled)} onclick="event.stopPropagation()"/>
      <label for="feat-items">Items</label>
      <span class="expand-icon ${config.items.enabled ? 'expanded' : ''}">▶</span>
    </div>
    <div class="feature-subs ${config.items.enabled ? 'visible' : ''}" id="subs-items">
      <div class="feature-sub">
        <input type="checkbox" id="feat-items-uniques" ${checked(config.items.subcategories.uniques)}/>
        <label for="feat-items-uniques">Uniques</label>
      </div>
      <div class="feature-sub">
        <input type="checkbox" id="feat-items-bases" ${checked(config.items.subcategories.bases)}/>
        <label for="feat-items-bases">Bases</label>
      </div>
    </div>
  </div>

  <!-- Tools (with subcategories) -->
  <div class="feature-group">
    <div class="feature-main" onclick="toggleGroup('tools')">
      <input type="checkbox" id="feat-tools" ${checked(config.tools.enabled)} onclick="event.stopPropagation()"/>
      <label for="feat-tools">Tools</label>
      <span class="expand-icon ${config.tools.enabled ? 'expanded' : ''}">▶</span>
    </div>
    <div class="feature-subs ${config.tools.enabled ? 'visible' : ''}" id="subs-tools">
      <div class="feature-sub">
        <input type="checkbox" id="feat-tools-regex" ${checked(config.tools.subcategories.regex)}/>
        <label for="feat-tools-regex">Regex Builder</label>
      </div>
    </div>
  </div>

  <!-- Merchant (simple checkbox, no subs) -->
  <div class="simple-checkbox">
    <input type="checkbox" id="feat-merchant" ${checked(config.merchant)}/>
    <label for="feat-merchant">Merchant History</label>
  </div>

  <div class="buttons">
    <button class="btn-secondary" onclick="loadPreset('minimal')">Minimal</button>
    <button class="btn-secondary" onclick="loadPreset('recommended')">Recommended</button>
    <button class="btn-secondary" onclick="loadPreset('all')">All Features</button>
    <button class="btn-primary" onclick="saveAndContinue()">Save & Continue</button>
  </div>

  <script>
    // Toggle group expansion
    function toggleGroup(groupName) {
      const checkbox = document.getElementById('feat-' + groupName);
      const subs = document.getElementById('subs-' + groupName);
      const icon = event.currentTarget.querySelector('.expand-icon');
      
      if (checkbox.checked) {
        subs.classList.toggle('visible');
        icon.classList.toggle('expanded');
      } else {
        // If unchecking parent, collapse and hide subs
        subs.classList.remove('visible');
        icon.classList.remove('expanded');
      }
    }
    
    // Watch parent checkboxes to auto-collapse
    ['crafting', 'character', 'items', 'tools'].forEach(group => {
      const checkbox = document.getElementById('feat-' + group);
      const subs = document.getElementById('subs-' + group);
      const icon = document.querySelector('[onclick*="' + group + '"] .expand-icon');
      
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          subs.classList.add('visible');
          icon.classList.add('expanded');
        } else {
          subs.classList.remove('visible');
          icon.classList.remove('expanded');
        }
      });
    });
    
    function loadPreset(type) {
      const presets = {
        minimal: ${JSON.stringify(MINIMAL_FEATURES)},
        recommended: ${JSON.stringify(DEFAULT_FEATURES)},
        all: ${JSON.stringify(ALL_FEATURES)}
      };
      
      const preset = presets[type];
      if (!preset) return;
      
      // Apply preset
      document.getElementById('feat-modifiers').checked = preset.modifiers;
      document.getElementById('feat-merchant').checked = preset.merchant;
      
      // Crafting
      document.getElementById('feat-crafting').checked = preset.crafting.enabled;
      document.getElementById('feat-craft-liquid').checked = preset.crafting.subcategories.liquidEmotions;
      document.getElementById('feat-craft-annoints').checked = preset.crafting.subcategories.annoints;
      document.getElementById('feat-craft-essences').checked = preset.crafting.subcategories.essences;
      document.getElementById('feat-craft-omens').checked = preset.crafting.subcategories.omens;
      document.getElementById('feat-craft-currency').checked = preset.crafting.subcategories.currency;
      document.getElementById('feat-craft-catalysts').checked = preset.crafting.subcategories.catalysts;
      document.getElementById('feat-craft-socketables').checked = preset.crafting.subcategories.socketables;
      
      // Character
      document.getElementById('feat-character').checked = preset.character.enabled;
      document.getElementById('feat-char-quests').checked = preset.character.subcategories.questPassives;
      document.getElementById('feat-char-keystones').checked = preset.character.subcategories.keystones;
      document.getElementById('feat-char-asc').checked = preset.character.subcategories.ascendancyPassives;
      document.getElementById('feat-char-atlas').checked = preset.character.subcategories.atlasNodes;
      document.getElementById('feat-char-gems').checked = preset.character.subcategories.gems;
      document.getElementById('feat-char-glossar').checked = preset.character.subcategories.glossar;
      
      // Items
      document.getElementById('feat-items').checked = preset.items.enabled;
      document.getElementById('feat-items-uniques').checked = preset.items.subcategories.uniques;
      document.getElementById('feat-items-bases').checked = preset.items.subcategories.bases;
      
      // Tools
      document.getElementById('feat-tools').checked = preset.tools.enabled;
      document.getElementById('feat-tools-regex').checked = preset.tools.subcategories.regex;
      
      // Update visibility
      ['crafting', 'character', 'items', 'tools'].forEach(group => {
        const checkbox = document.getElementById('feat-' + group);
        const subs = document.getElementById('subs-' + group);
        const icon = document.querySelector('[onclick*="' + group + '"] .expand-icon');
        
        if (checkbox.checked) {
          subs.classList.add('visible');
          icon.classList.add('expanded');
        } else {
          subs.classList.remove('visible');
          icon.classList.remove('expanded');
        }
      });
    }
    
    function closeWindow() {
      if (window.electronAPI && window.electronAPI.closeFeatureSplash) {
        window.electronAPI.closeFeatureSplash();
      } else {
        console.error('[FeatureSplash] closeFeatureSplash not available in electronAPI');
      }
    }
    
    function saveAndContinue() {
      console.log('[FeatureSplash] Save button clicked!');
      
      const config = {
        modifiers: document.getElementById('feat-modifiers').checked,
        crafting: {
          enabled: document.getElementById('feat-crafting').checked,
          subcategories: {
            liquidEmotions: document.getElementById('feat-craft-liquid').checked,
            annoints: document.getElementById('feat-craft-annoints').checked,
            essences: document.getElementById('feat-craft-essences').checked,
            omens: document.getElementById('feat-craft-omens').checked,
            currency: document.getElementById('feat-craft-currency').checked,
            catalysts: document.getElementById('feat-craft-catalysts').checked,
            socketables: document.getElementById('feat-craft-socketables').checked
          }
        },
        character: {
          enabled: document.getElementById('feat-character').checked,
          subcategories: {
            questPassives: document.getElementById('feat-char-quests').checked,
            keystones: document.getElementById('feat-char-keystones').checked,
            ascendancyPassives: document.getElementById('feat-char-asc').checked,
            atlasNodes: document.getElementById('feat-char-atlas').checked,
            gems: document.getElementById('feat-char-gems').checked,
            glossar: document.getElementById('feat-char-glossar').checked
          }
        },
        items: {
          enabled: document.getElementById('feat-items').checked,
          subcategories: {
            uniques: document.getElementById('feat-items-uniques').checked,
            bases: document.getElementById('feat-items-bases').checked
          }
        },
        tools: {
          enabled: document.getElementById('feat-tools').checked,
          subcategories: {
            regex: document.getElementById('feat-tools-regex').checked
          }
        },
        merchant: document.getElementById('feat-merchant').checked
      };
      
      // Validate at least one feature enabled
      const hasAny = config.modifiers || config.merchant || 
        config.crafting.enabled || config.character.enabled || 
        config.items.enabled || config.tools.enabled;
      
      if (!hasAny) {
        alert('Please enable at least one feature!');
        return;
      }
      
      console.log('[FeatureSplash] Sending config:', JSON.stringify(config, null, 2));
      
      try {
        if (!window.electronAPI) {
          console.error('[FeatureSplash] ERROR: window.electronAPI is not defined!');
          alert('ERROR: electronAPI not available. Check console.');
          return;
        }
        
        if (!window.electronAPI.saveFeatureConfig) {
          console.error('[FeatureSplash] ERROR: saveFeatureConfig method not found!');
          alert('ERROR: saveFeatureConfig not available. Check console.');
          return;
        }
        
        window.electronAPI.saveFeatureConfig(config);
        console.log('[FeatureSplash] Config sent via IPC');
      } catch (error) {
        console.error('[FeatureSplash] Exception:', error);
        alert('ERROR sending config: ' + error.message);
      }
    }
  </script>
</body>
</html>
  `.trim();
}

/**
 * Show feature selection splash window.
 * Returns a promise that resolves with the selected configuration.
 */
export function showFeatureSplash(currentConfig?: FeatureConfig): Promise<FeatureConfig> {
  return new Promise((resolve, reject) => {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    
    // Get preload script path - it's in dist/main/, not dist/main/ui/
    const path = require('path');
    const preloadPath = path.join(__dirname, '..', 'preload.js');
    
    const win = new BrowserWindow({
      width: 550,
      height: Math.min(750, height - 100),
      x: Math.round(width / 2 - 275),
      y: Math.round(height / 2 - 375),
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: preloadPath
      }
    });

    const html = buildFeatureSplashHtml(currentConfig);
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    let resolved = false;

    // Handle close button
    const closeHandler = () => {
      if (resolved) return;
      win.close();
    };

    ipcMain.on('feature-splash-close', closeHandler);

    // Handle save event
    const saveHandler = (_event: any, config: FeatureConfig) => {
      if (resolved) return;
      resolved = true;
      ipcMain.removeListener('save-feature-config', saveHandler);
      ipcMain.removeListener('feature-splash-close', closeHandler);
      console.log('[FeatureSplash] Saving config:', config);
      win.close();
      resolve(config);
    };

    ipcMain.on('save-feature-config', saveHandler);

    // Handle window close without saving
    win.on('closed', () => {
      if (resolved) return;
      resolved = true;
      ipcMain.removeListener('save-feature-config', saveHandler);
      ipcMain.removeListener('feature-splash-close', closeHandler);
      console.log('[FeatureSplash] Window closed without saving');
      // If window closed without saving, use current config or defaults
      if (currentConfig) {
        resolve(currentConfig);
      } else {
        resolve(DEFAULT_FEATURES);
      }
    });
  });
}
