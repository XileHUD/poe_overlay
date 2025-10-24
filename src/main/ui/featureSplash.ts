/**
 * Feature selection splash screen.
 * Shown on first launch or when user wants to reconfigure features.
 */

import { BrowserWindow, ipcMain, screen } from 'electron';
import { FeatureConfig, DEFAULT_FEATURES, MINIMAL_FEATURES, ALL_FEATURES } from '../features/featureTypes.js';
import type { OverlayVersion } from '../../types/overlayVersion.js';

/**
 * Build HTML for feature selection splash.
 * Uses dark theme consistent with merchant history UI.
 */
export function buildFeatureSplashHtml(currentConfig?: FeatureConfig, overlayVersion: OverlayVersion = 'poe2'): string {
  const config = currentConfig || DEFAULT_FEATURES;
  
  // Ensure all required fields exist (merge with defaults)
  const safeConfig: FeatureConfig = {
    ...DEFAULT_FEATURES,
    ...config,
    crafting: {
      ...DEFAULT_FEATURES.crafting,
      ...(config.crafting || {}),
      subcategories: {
        ...DEFAULT_FEATURES.crafting.subcategories,
        ...((config.crafting && config.crafting.subcategories) || {})
      }
    },
    poe1Crafting: {
      ...DEFAULT_FEATURES.poe1Crafting,
      ...(config.poe1Crafting || {}),
      subcategories: {
        ...DEFAULT_FEATURES.poe1Crafting.subcategories,
        ...((config.poe1Crafting && config.poe1Crafting.subcategories) || {})
      }
    },
    character: {
      ...DEFAULT_FEATURES.character,
      ...(config.character || {}),
      subcategories: {
        ...DEFAULT_FEATURES.character.subcategories,
        ...((config.character && config.character.subcategories) || {})
      }
    },
    poe1Character: {
      ...DEFAULT_FEATURES.poe1Character,
      ...(config.poe1Character || {}),
      subcategories: {
        ...DEFAULT_FEATURES.poe1Character.subcategories,
        ...((config.poe1Character && config.poe1Character.subcategories) || {})
      }
    },
    items: {
      ...DEFAULT_FEATURES.items,
      ...(config.items || {}),
      subcategories: {
        ...DEFAULT_FEATURES.items.subcategories,
        ...((config.items && config.items.subcategories) || {})
      }
    },
    poe1Items: {
      ...DEFAULT_FEATURES.poe1Items,
      ...(config.poe1Items || {}),
      subcategories: {
        ...DEFAULT_FEATURES.poe1Items.subcategories,
        ...((config.poe1Items && config.poe1Items.subcategories) || {})
      }
    },
    tools: {
      ...DEFAULT_FEATURES.tools,
      ...(config.tools || {}),
      subcategories: {
        ...DEFAULT_FEATURES.tools.subcategories,
        ...((config.tools && config.tools.subcategories) || {})
      }
    }
  };
  
  const overlayClass = overlayVersion === 'poe1' ? 'poe1-mode' : 'poe2-mode';

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
    }
    
    body.poe1-mode .poe2-only {
      display: none !important;
    }

    body.poe2-mode .poe1-only {
      display: none !important;
    }
    
    .header {
      padding: 16px 24px;
      background: linear-gradient(135deg, rgba(240, 173, 78, 0.12) 0%, rgba(240, 173, 78, 0.06) 100%);
      border-bottom: 2px solid rgba(240, 173, 78, 0.25);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
      -webkit-app-region: drag;
    }
    
    .header-title {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .header-title h1 {
      margin: 0;
      font-size: 20px;
      color: var(--accent-orange);
      font-weight: 600;
    }
    
    .header-subtitle {
      margin: 4px 0 0 34px;
      font-size: 12px;
      color: var(--text-secondary);
    }
    
    .close-btn {
      width: 32px;
      height: 32px;
      background: rgba(217, 83, 79, 0.15);
      border: 2px solid rgba(217, 83, 79, 0.4);
      border-radius: 50%;
      color: var(--accent-red);
      font-size: 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      flex-shrink: 0;
      -webkit-app-region: no-drag;
    }
    
    .close-btn:hover {
      background: rgba(217, 83, 79, 0.3);
      border-color: var(--accent-red);
      transform: scale(1.1);
    }
    
    .content-wrapper {
      flex: 1;
      overflow: hidden;
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
    }
    
    .features-grid {
      flex: 1;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      overflow: hidden;
    }
    
    .feature-column {
      display: flex;
      flex-direction: column;
      gap: 10px;
      overflow: hidden;
    }
    
    .feature-group {
      border: 1px solid var(--border-color);
      border-radius: 6px;
      overflow: hidden;
      background: var(--bg-secondary);
      flex-shrink: 0;
    }
    
    .simple-checkbox {
      padding: 10px 14px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      transition: background 0.15s ease;
      flex-shrink: 0;
    }
    
    .simple-checkbox:hover {
      background: var(--bg-tertiary);
    }
    
    .simple-checkbox input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
      margin: 0;
      flex-shrink: 0;
    }
    
    .simple-checkbox label {
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      margin: 0;
      flex: 1;
    }

    .feature-note {
      display: block;
      font-size: 12px;
      color: var(--text-muted);
      margin-left: 28px;
      margin-top: 4px;
    }
    
    .feature-main {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
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
      font-size: 13px;
      font-weight: 600;
      flex: 1;
      margin: 0;
    }
    
    .expand-icon {
      color: var(--text-secondary);
      font-size: 10px;
      transition: transform 0.2s ease;
      flex-shrink: 0;
    }
    
    .expand-icon.expanded {
      transform: rotate(90deg);
    }
    
    .feature-subs {
      background: rgba(0, 0, 0, 0.2);
      padding: 6px 0;
      display: none;
      max-height: 180px;
      overflow-y: auto;
    }
    
    .feature-subs.visible {
      display: block;
    }
    
    .feature-subs::-webkit-scrollbar {
      width: 8px;
    }
    
    .feature-subs::-webkit-scrollbar-track {
      background: var(--bg-secondary);
    }
    
    .feature-subs::-webkit-scrollbar-thumb {
      background: var(--bg-tertiary);
      border-radius: 4px;
    }
    
    .feature-sub {
      padding: 6px 12px 6px 38px;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: background 0.15s ease;
    }
    
    .feature-sub:hover {
      background: rgba(255, 255, 255, 0.03);
    }
    
    .feature-sub input[type="checkbox"] {
      width: 15px;
      height: 15px;
      cursor: pointer;
      margin: 0;
      flex-shrink: 0;
    }
    
    .feature-sub label {
      cursor: pointer;
      font-size: 12px;
      color: var(--text-primary);
      margin: 0;
    }
    
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--border-color);
      flex-shrink: 0;
    }
    
    .preset-buttons {
      display: flex;
      gap: 8px;
    }
    
    .action-buttons {
      display: flex;
      gap: 8px;
    }
    
    button {
      padding: 8px 16px;
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
  </style>
</head>
<body class="${overlayClass}">
  <div class="header">
    <div>
      <div class="header-title">
        <h1>🎯 Feature Selection</h1>
      </div>
      <div class="header-subtitle">Choose which features you want to use. You can change this later from the tray menu.</div>
    </div>
    <button class="close-btn" onclick="closeWindow()" title="Close">×</button>
  </div>
  
  <div class="content-wrapper">
    <div class="features-grid">
      <!-- Left Column -->
      <div class="feature-column">
        <!-- Modifiers PoE2 -->
        <div class="simple-checkbox poe2-only">
          <input type="checkbox" id="feat-modifiers" ${checked(safeConfig.modifiers)}/>
          <label for="feat-modifiers">Modifiers (PoE2)</label>
        </div>

        <!-- Modifiers PoE1 -->
        <div class="simple-checkbox poe1-only">
          <input type="checkbox" id="feat-poe1-modifiers" ${checked(safeConfig.poe1Modifiers)}/>
          <label for="feat-poe1-modifiers">Modifiers (PoE1)</label>
        </div>

        <!-- Crafting PoE2 -->
        <div class="feature-group poe2-only">
          <div class="feature-main" onclick="toggleGroup('crafting')">
            <input type="checkbox" id="feat-crafting" ${checked(safeConfig.crafting.enabled)} onclick="event.stopPropagation()"/>
            <label for="feat-crafting">Crafting (PoE2)</label>
            <span class="expand-icon ${safeConfig.crafting.enabled ? 'expanded' : ''}">▶</span>
          </div>
          <div class="feature-subs ${safeConfig.crafting.enabled ? 'visible' : ''}" id="subs-crafting">
            <div class="feature-sub">
              <input type="checkbox" id="feat-craft-liquid" ${checked(safeConfig.crafting.subcategories.liquidEmotions)}/>
              <label for="feat-craft-liquid">Liquid Emotions</label>
            </div>
            <div class="feature-sub">
              <input type="checkbox" id="feat-craft-essences" ${checked(safeConfig.crafting.subcategories.essences)}/>
              <label for="feat-craft-essences">Essences</label>
            </div>
            <div class="feature-sub">
              <input type="checkbox" id="feat-craft-omens" ${checked(safeConfig.crafting.subcategories.omens)}/>
              <label for="feat-craft-omens">Omens</label>
            </div>
            <div class="feature-sub">
              <input type="checkbox" id="feat-craft-currency" ${checked(safeConfig.crafting.subcategories.currency)}/>
              <label for="feat-craft-currency">Currency</label>
            </div>
            <div class="feature-sub">
              <input type="checkbox" id="feat-craft-catalysts" ${checked(safeConfig.crafting.subcategories.catalysts)}/>
              <label for="feat-craft-catalysts">Catalysts</label>
            </div>
            <div class="feature-sub">
              <input type="checkbox" id="feat-craft-socketables" ${checked(safeConfig.crafting.subcategories.socketables)}/>
              <label for="feat-craft-socketables">Socketables</label>
            </div>
          </div>
        </div>

        <!-- PoE1 Crafting -->
        <div class="feature-group poe1-only">
          <div class="feature-main" onclick="toggleGroup('poe1Crafting')">
            <input type="checkbox" id="feat-poe1-crafting" ${checked(safeConfig.poe1Crafting.enabled)} onclick="event.stopPropagation()"/>
            <label for="feat-poe1-crafting">Crafting (PoE1)</label>
            <span class="expand-icon ${safeConfig.poe1Crafting.enabled ? 'expanded' : ''}">▶</span>
          </div>
          <div class="feature-subs ${safeConfig.poe1Crafting.enabled ? 'visible' : ''}" id="subs-poe1Crafting">
            <div class="feature-sub">
              <input type="checkbox" id="feat-poe1-craft-scarabs" ${checked(safeConfig.poe1Crafting.subcategories.scarabs)}/>
              <label for="feat-poe1-craft-scarabs">Scarabs</label>
            </div>
            <div class="feature-sub">
              <input type="checkbox" id="feat-poe1-craft-runegrafts" ${checked(safeConfig.poe1Crafting.subcategories.runegrafts)}/>
              <label for="feat-poe1-craft-runegrafts">Runegrafts</label>
            </div>
            <div class="feature-sub">
              <input type="checkbox" id="feat-poe1-craft-currency" ${checked(safeConfig.poe1Crafting.subcategories.currency)}/>
              <label for="feat-poe1-craft-currency">Currency</label>
            </div>
            <div class="feature-sub">
              <input type="checkbox" id="feat-poe1-craft-essences" ${checked(safeConfig.poe1Crafting.subcategories.essences)}/>
              <label for="feat-poe1-craft-essences">Essences</label>
            </div>
            <div class="feature-sub">
              <input type="checkbox" id="feat-poe1-craft-fossils" ${checked(safeConfig.poe1Crafting.subcategories.fossils)}/>
              <label for="feat-poe1-craft-fossils">Fossils</label>
            </div>
            <div class="feature-sub">
              <input type="checkbox" id="feat-poe1-craft-embers" ${checked(safeConfig.poe1Crafting.subcategories.embers)}/>
              <label for="feat-poe1-craft-embers">Embers</label>
            </div>
            <div class="feature-sub">
              <input type="checkbox" id="feat-poe1-craft-horticrafting" ${checked(safeConfig.poe1Crafting.subcategories.horticrafting)}/>
              <label for="feat-poe1-craft-horticrafting">Horticrafting</label>
            </div>
            <div class="feature-sub">
              <input type="checkbox" id="feat-poe1-craft-bestiary" ${checked(safeConfig.poe1Crafting.subcategories.bestiary)}/>
              <label for="feat-poe1-craft-bestiary">Bestiary</label>
            </div>
          </div>
        </div>

        <!-- Character PoE2 -->
        <div class="feature-group poe2-only">
          <div class="feature-main" onclick="toggleGroup('character')">
            <input type="checkbox" id="feat-character" ${checked(safeConfig.character.enabled)} onclick="event.stopPropagation()"/>
            <label for="feat-character">Character (PoE2)</label>
            <span class="expand-icon ${safeConfig.character.enabled ? 'expanded' : ''}">▶</span>
          </div>
          <div class="feature-subs ${safeConfig.character.enabled ? 'visible' : ''}" id="subs-character">
            <div class="feature-sub">
              <input type="checkbox" id="feat-char-quests" ${checked(safeConfig.character.subcategories.questPassives)}/>
              <label for="feat-char-quests">Quest Passives</label>
            </div>
            <div class="feature-sub">
              <input type="checkbox" id="feat-char-annoints" ${checked(safeConfig.character.subcategories.annoints)}/>
              <label for="feat-char-annoints">Annoints</label>
            </div>
            <div class="feature-sub">
              <input type="checkbox" id="feat-char-keystones" ${checked(safeConfig.character.subcategories.keystones)}/>
              <label for="feat-char-keystones">Keystones</label>
            </div>
            <div class="feature-sub">
              <input type="checkbox" id="feat-char-asc" ${checked(safeConfig.character.subcategories.ascendancyPassives)}/>
              <label for="feat-char-asc">Ascendancy Passives</label>
            </div>
            <div class="feature-sub">
              <input type="checkbox" id="feat-char-atlas" ${checked(safeConfig.character.subcategories.atlasNodes)}/>
              <label for="feat-char-atlas">Atlas Nodes</label>
            </div>
            <div class="feature-sub">
              <input type="checkbox" id="feat-char-gems" ${checked(safeConfig.character.subcategories.gems)}/>
              <label for="feat-char-gems">Gems</label>
            </div>
            <div class="feature-sub">
              <input type="checkbox" id="feat-char-glossar" ${checked(safeConfig.character.subcategories.glossar)}/>
              <label for="feat-char-glossar">Glossar</label>
            </div>
          </div>
        </div>

        <!-- PoE1 Character -->
        <div class="feature-group poe1-only">
          <div class="feature-main" onclick="toggleGroup('poe1Character')">
            <input type="checkbox" id="feat-poe1-character" ${checked(safeConfig.poe1Character.enabled)} onclick="event.stopPropagation()"/>
            <label for="feat-poe1-character">Character (PoE1)</label>
            <span class="expand-icon ${safeConfig.poe1Character.enabled ? 'expanded' : ''}">▶</span>
          </div>
          <div class="feature-subs ${safeConfig.poe1Character.enabled ? 'visible' : ''}" id="subs-poe1Character">
            <div class="feature-sub">
              <input type="checkbox" id="feat-poe1-char-divcards" ${checked(safeConfig.poe1Character.subcategories.divinationCards)}/>
              <label for="feat-poe1-char-divcards">Divination Cards</label>
            </div>
            <div class="feature-sub">
              <input type="checkbox" id="feat-poe1-char-asc-notables" ${checked(safeConfig.poe1Character.subcategories.ascendancyNotables)}/>
              <label for="feat-poe1-char-asc-notables">Ascendancy Notables</label>
            </div>
            <div class="feature-sub">
              <input type="checkbox" id="feat-poe1-char-anointments" ${checked(safeConfig.poe1Character.subcategories.anointments)}/>
              <label for="feat-poe1-char-anointments">Anointments</label>
            </div>
            <div class="feature-sub">
              <input type="checkbox" id="feat-poe1-char-tattoos" ${checked(safeConfig.poe1Character.subcategories.tattoos)}/>
              <label for="feat-poe1-char-tattoos">Tattoos</label>
            </div>
            <div class="feature-sub">
              <input type="checkbox" id="feat-poe1-char-gems" ${checked(safeConfig.poe1Character.subcategories.gems)}/>
              <label for="feat-poe1-char-gems">Gems</label>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column -->
      <div class="feature-column">
        <!-- Items PoE2 -->
        <div class="feature-group poe2-only">
          <div class="feature-main" onclick="toggleGroup('items')">
            <input type="checkbox" id="feat-items" ${checked(safeConfig.items.enabled)} onclick="event.stopPropagation()"/>
            <label for="feat-items">Items (PoE2)</label>
            <span class="expand-icon ${safeConfig.items.enabled ? 'expanded' : ''}">▶</span>
          </div>
          <div class="feature-subs ${safeConfig.items.enabled ? 'visible' : ''}" id="subs-items">
            <div class="feature-sub">
              <input type="checkbox" id="feat-items-uniques" ${checked(safeConfig.items.subcategories.uniques)}/>
              <label for="feat-items-uniques">Uniques</label>
            </div>
            <div class="feature-sub">
              <input type="checkbox" id="feat-items-bases" ${checked(safeConfig.items.subcategories.bases)}/>
              <label for="feat-items-bases">Bases</label>
            </div>
          </div>
        </div>

        <!-- PoE1 Items -->
        <div class="feature-group poe1-only">
          <div class="feature-main" onclick="toggleGroup('poe1Items')">
            <input type="checkbox" id="feat-poe1-items" ${checked(safeConfig.poe1Items.enabled)} onclick="event.stopPropagation()"/>
            <label for="feat-poe1-items">Items (PoE1)</label>
            <span class="expand-icon ${safeConfig.poe1Items.enabled ? 'expanded' : ''}">▶</span>
          </div>
          <div class="feature-subs ${safeConfig.poe1Items.enabled ? 'visible' : ''}" id="subs-poe1Items">
            <div class="feature-sub">
              <input type="checkbox" id="feat-poe1-items-uniques" ${checked(safeConfig.poe1Items.subcategories.uniques)}/>
              <label for="feat-poe1-items-uniques">Uniques</label>
            </div>
            <div class="feature-sub">
              <input type="checkbox" id="feat-poe1-items-bases" ${checked(safeConfig.poe1Items.subcategories.bases)}/>
              <label for="feat-poe1-items-bases">Bases</label>
            </div>
          </div>
        </div>

        <!-- Tools -->
        <div class="feature-group">
          <div class="feature-main" onclick="toggleGroup('tools')">
            <input type="checkbox" id="feat-tools" ${checked(safeConfig.tools.enabled)} onclick="event.stopPropagation()"/>
            <label for="feat-tools">Tools</label>
            <span class="expand-icon ${safeConfig.tools.enabled ? 'expanded' : ''}">▶</span>
          </div>
          <div class="feature-subs ${safeConfig.tools.enabled ? 'visible' : ''}" id="subs-tools">
            <div class="feature-sub poe2-only">
              <input type="checkbox" id="feat-tools-regex" ${checked(safeConfig.tools.subcategories.regex)}/>
              <label for="feat-tools-regex">Regex Builder</label>
            </div>
            <div class="feature-sub poe2-only">
              <input type="checkbox" id="feat-tools-poe2-leveling" ${checked(safeConfig.tools.subcategories.poe2Leveling)}/>
              <label for="feat-tools-poe2-leveling">Leveling Overlay</label>
            </div>
            <div class="feature-sub poe1-only">
              <input type="checkbox" id="feat-tools-poe1-regex" ${checked(safeConfig.tools.subcategories.poe1Regex)}/>
              <label for="feat-tools-poe1-regex">Map Regex</label>
            </div>
            <div class="feature-sub poe1-only">
              <input type="checkbox" id="feat-tools-poe1-vorici" ${checked(safeConfig.tools.subcategories.poe1Vorici)}/>
              <label for="feat-tools-poe1-vorici">Vorici Calculator</label>
            </div>
            <div class="feature-sub poe1-only">
              <input type="checkbox" id="feat-tools-poe1-leveling" ${checked(safeConfig.tools.subcategories.poe1Leveling)}/>
              <label for="feat-tools-poe1-leveling">Leveling Overlay</label>
            </div>
          </div>
        </div>

        <!-- Merchant History -->
        <div class="simple-checkbox merchant-option">
          <input type="checkbox" id="feat-merchant" ${checked(config.merchant)}/>
          <label for="feat-merchant">Merchant History</label>
          <span class="feature-note poe1-only">PoE1 mode keeps the tab read-only with refresh disabled until the new league launches and the API is online.</span>
        </div>
      </div>
    </div>

    <div class="footer">
      <div class="preset-buttons">
        <button class="btn-secondary" onclick="loadPreset('minimal')">Minimal</button>
        <button class="btn-secondary" onclick="loadPreset('recommended')">All Features</button>
      </div>
      <div class="action-buttons">
        <button class="btn-primary" onclick="saveAndContinue()">Save & Continue</button>
      </div>
    </div>
  </div>

  <script>
    // Toggle group expansion
    const GROUPS = {
      crafting: { checkboxId: 'feat-crafting' },
      poe1Crafting: { checkboxId: 'feat-poe1-crafting' },
      character: { checkboxId: 'feat-character' },
      poe1Character: { checkboxId: 'feat-poe1-character' },
      items: { checkboxId: 'feat-items' },
      poe1Items: { checkboxId: 'feat-poe1-items' },
      tools: { checkboxId: 'feat-tools' }
    };

    function getGroupCheckbox(groupName) {
      const group = GROUPS[groupName];
      const fallbackId = 'feat-' + groupName;
      return document.getElementById(group ? group.checkboxId : fallbackId);
    }

    function toggleGroup(groupName) {
      const checkbox = getGroupCheckbox(groupName);
      const subs = document.getElementById('subs-' + groupName);
      const icon = event.currentTarget.querySelector('.expand-icon');
      if (!checkbox || !subs || !icon) {
        return;
      }
      
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
    const GROUP_ORDER = ['crafting', 'poe1Crafting', 'character', 'poe1Character', 'items', 'poe1Items', 'tools'];

    GROUP_ORDER.forEach(group => {
      const checkbox = getGroupCheckbox(group);
      const subs = document.getElementById('subs-' + group);
      const icon = document.querySelector('[onclick*="' + group + '"] .expand-icon');
      if (!checkbox || !subs || !icon) {
        return;
      }
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
      document.getElementById('feat-poe1-modifiers').checked = preset.poe1Modifiers;
      document.getElementById('feat-merchant').checked = preset.merchant;
      
      // Crafting
      document.getElementById('feat-crafting').checked = preset.crafting.enabled;
      document.getElementById('feat-craft-liquid').checked = preset.crafting.subcategories.liquidEmotions;
      document.getElementById('feat-craft-essences').checked = preset.crafting.subcategories.essences;
      document.getElementById('feat-craft-omens').checked = preset.crafting.subcategories.omens;
      document.getElementById('feat-craft-currency').checked = preset.crafting.subcategories.currency;
      document.getElementById('feat-craft-catalysts').checked = preset.crafting.subcategories.catalysts;
      document.getElementById('feat-craft-socketables').checked = preset.crafting.subcategories.socketables;
      
      // PoE1 Crafting
      document.getElementById('feat-poe1-crafting').checked = preset.poe1Crafting.enabled;
      document.getElementById('feat-poe1-craft-scarabs').checked = preset.poe1Crafting.subcategories.scarabs;
  document.getElementById('feat-poe1-craft-runegrafts').checked = preset.poe1Crafting.subcategories.runegrafts;
      document.getElementById('feat-poe1-craft-currency').checked = preset.poe1Crafting.subcategories.currency;
      document.getElementById('feat-poe1-craft-essences').checked = preset.poe1Crafting.subcategories.essences;
      document.getElementById('feat-poe1-craft-fossils').checked = preset.poe1Crafting.subcategories.fossils;
      document.getElementById('feat-poe1-craft-embers').checked = preset.poe1Crafting.subcategories.embers;
    document.getElementById('feat-poe1-craft-horticrafting').checked = preset.poe1Crafting.subcategories.horticrafting;
    document.getElementById('feat-poe1-craft-bestiary').checked = preset.poe1Crafting.subcategories.bestiary;
      
      // Character
      document.getElementById('feat-character').checked = preset.character.enabled;
      document.getElementById('feat-char-quests').checked = preset.character.subcategories.questPassives;
  document.getElementById('feat-char-annoints').checked = preset.character.subcategories.annoints;
      document.getElementById('feat-char-keystones').checked = preset.character.subcategories.keystones;
      document.getElementById('feat-char-asc').checked = preset.character.subcategories.ascendancyPassives;
      document.getElementById('feat-char-atlas').checked = preset.character.subcategories.atlasNodes;
      document.getElementById('feat-char-gems').checked = preset.character.subcategories.gems;
      document.getElementById('feat-char-glossar').checked = preset.character.subcategories.glossar;
      
      // PoE1 Character
      document.getElementById('feat-poe1-character').checked = preset.poe1Character.enabled;
      document.getElementById('feat-poe1-char-divcards').checked = preset.poe1Character.subcategories.divinationCards;
  document.getElementById('feat-poe1-char-asc-notables').checked = preset.poe1Character.subcategories.ascendancyNotables;
    document.getElementById('feat-poe1-char-anointments').checked = preset.poe1Character.subcategories.anointments;
      document.getElementById('feat-poe1-char-tattoos').checked = preset.poe1Character.subcategories.tattoos;
      document.getElementById('feat-poe1-char-gems').checked = preset.poe1Character.subcategories.gems;
      
      // Items (PoE2)
      document.getElementById('feat-items').checked = preset.items.enabled;
      document.getElementById('feat-items-uniques').checked = preset.items.subcategories.uniques;
      document.getElementById('feat-items-bases').checked = preset.items.subcategories.bases;
      
      // Items (PoE1)
      document.getElementById('feat-poe1-items').checked = preset.poe1Items.enabled;
      document.getElementById('feat-poe1-items-uniques').checked = preset.poe1Items.subcategories.uniques;
      document.getElementById('feat-poe1-items-bases').checked = preset.poe1Items.subcategories.bases;
      
      // Tools
      document.getElementById('feat-tools').checked = preset.tools.enabled;
      document.getElementById('feat-tools-regex').checked = preset.tools.subcategories.regex;
      document.getElementById('feat-tools-poe2-leveling').checked = preset.tools.subcategories.poe2Leveling;
      document.getElementById('feat-tools-poe1-regex').checked = preset.tools.subcategories.poe1Regex;
      document.getElementById('feat-tools-poe1-vorici').checked = preset.tools.subcategories.poe1Vorici;
      document.getElementById('feat-tools-poe1-leveling').checked = preset.tools.subcategories.poe1Leveling;
      
      // Update visibility
      GROUP_ORDER.forEach(group => {
        const checkbox = getGroupCheckbox(group);
        const subs = document.getElementById('subs-' + group);
        const icon = document.querySelector('[onclick*="' + group + '"] .expand-icon');
        if (!checkbox || !subs || !icon) {
          return;
        }
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
      
      const merchantCheckbox = document.getElementById('feat-merchant');
      console.log('[FeatureSplash] Merchant checkbox element:', merchantCheckbox);
      console.log('[FeatureSplash] Merchant checkbox checked:', merchantCheckbox?.checked);
      console.log('[FeatureSplash] Merchant checkbox type:', merchantCheckbox?.type);
      console.log('[FeatureSplash] Merchant checkbox visible:', merchantCheckbox ? window.getComputedStyle(merchantCheckbox.parentElement).display : 'N/A');
      
      const config = {
        modifiers: document.getElementById('feat-modifiers').checked,
        poe1Modifiers: document.getElementById('feat-poe1-modifiers').checked,
        crafting: {
          enabled: document.getElementById('feat-crafting').checked,
          subcategories: {
            liquidEmotions: document.getElementById('feat-craft-liquid').checked,
            essences: document.getElementById('feat-craft-essences').checked,
            omens: document.getElementById('feat-craft-omens').checked,
            currency: document.getElementById('feat-craft-currency').checked,
            catalysts: document.getElementById('feat-craft-catalysts').checked,
            socketables: document.getElementById('feat-craft-socketables').checked
          }
        },
        poe1Crafting: {
          enabled: document.getElementById('feat-poe1-crafting').checked,
          subcategories: {
            runegrafts: document.getElementById('feat-poe1-craft-runegrafts').checked,
            scarabs: document.getElementById('feat-poe1-craft-scarabs').checked,
            currency: document.getElementById('feat-poe1-craft-currency').checked,
            essences: document.getElementById('feat-poe1-craft-essences').checked,
            fossils: document.getElementById('feat-poe1-craft-fossils').checked,
            embers: document.getElementById('feat-poe1-craft-embers').checked,
            horticrafting: document.getElementById('feat-poe1-craft-horticrafting').checked,
            bestiary: document.getElementById('feat-poe1-craft-bestiary').checked
          }
        },
        character: {
          enabled: document.getElementById('feat-character').checked,
          subcategories: {
            questPassives: document.getElementById('feat-char-quests').checked,
            annoints: document.getElementById('feat-char-annoints').checked,
            keystones: document.getElementById('feat-char-keystones').checked,
            ascendancyPassives: document.getElementById('feat-char-asc').checked,
            atlasNodes: document.getElementById('feat-char-atlas').checked,
            gems: document.getElementById('feat-char-gems').checked,
            glossar: document.getElementById('feat-char-glossar').checked
          }
        },
        poe1Character: {
          enabled: document.getElementById('feat-poe1-character').checked,
          subcategories: {
            ascendancyNotables: document.getElementById('feat-poe1-char-asc-notables').checked,
            divinationCards: document.getElementById('feat-poe1-char-divcards').checked,
            anointments: document.getElementById('feat-poe1-char-anointments').checked,
            tattoos: document.getElementById('feat-poe1-char-tattoos').checked,
            gems: document.getElementById('feat-poe1-char-gems').checked
          }
        },
        items: {
          enabled: document.getElementById('feat-items').checked,
          subcategories: {
            uniques: document.getElementById('feat-items-uniques').checked,
            bases: document.getElementById('feat-items-bases').checked
          }
        },
        poe1Items: {
          enabled: document.getElementById('feat-poe1-items').checked,
          subcategories: {
            uniques: document.getElementById('feat-poe1-items-uniques').checked,
            bases: document.getElementById('feat-poe1-items-bases').checked
          }
        },
        tools: {
          enabled: document.getElementById('feat-tools').checked,
          subcategories: {
            regex: document.getElementById('feat-tools-regex').checked,
            poe2Leveling: document.getElementById('feat-tools-poe2-leveling').checked,
            poe1Regex: document.getElementById('feat-tools-poe1-regex').checked,
            poe1Vorici: document.getElementById('feat-tools-poe1-vorici').checked,
            poe1Leveling: document.getElementById('feat-tools-poe1-leveling').checked
          }
        },
        merchant: document.getElementById('feat-merchant').checked
      };
      
      // Validate at least one feature enabled
      const hasAny = config.modifiers || config.poe1Modifiers || config.merchant || 
        config.crafting.enabled || config.poe1Crafting.enabled || config.character.enabled || 
        config.poe1Character.enabled || config.items.enabled || config.poe1Items.enabled || config.tools.enabled;
      
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
export function showFeatureSplash(currentConfig?: FeatureConfig, overlayVersion: OverlayVersion = 'poe2'): Promise<FeatureConfig> {
  return new Promise((resolve, reject) => {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    
    // Get preload script path - it's in dist/main/, not dist/main/ui/
    const path = require('path');
    const preloadPath = path.join(__dirname, '..', 'preload.js');
    
    // Use wide design similar to settings splash
    const splashWidth = 960;
    const splashHeight = 770;
    
    const win = new BrowserWindow({
      width: splashWidth,
      height: splashHeight,
      x: Math.round(width / 2 - splashWidth / 2),
      y: Math.round(height / 2 - splashHeight / 2),
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

  const html = buildFeatureSplashHtml(currentConfig, overlayVersion);
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
