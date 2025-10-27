import { BrowserWindow, ipcMain } from 'electron';
import type { OverlayVersion } from '../../types/overlayVersion.js';
import type { SettingsService } from '../services/settingsService.js';
import gemsData from '../../data/leveling-data/gems.json';
import gemColoursData from '../../data/leveling-data/gem-colours.json';
import questsData from '../../data/leveling-data/quests.json';

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
  const { x = 100, y = 100, width = 450, height = 600 } = gemsWindowSettings;

  gemsWindow = new BrowserWindow({
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
    parent: parentWindow,
  });

  gemsWindow.setIgnoreMouseEvents(false);

  // Open dev tools for debugging
  gemsWindow.webContents.openDevTools({ mode: 'detach' });

  // Get current PoB build data and current act
  const pobBuild = (savedSettings as any).pobBuild || null;
  const currentActIndex = (savedSettings as any).currentActIndex || 0;
  const currentAct = currentActIndex + 1; // Convert index to act number

  const html = buildLevelingGemsWindowHtml(pobBuild, currentAct, overlayVersion);
  gemsWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  // Save position on move
  gemsWindow.on('move', () => {
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
  });

  // Save size on resize
  gemsWindow.on('resize', () => {
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
  });

  gemsWindow.on('closed', () => {
    gemsWindow = null;
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

export function closeLevelingGemsWindow() {
  if (gemsWindow && !gemsWindow.isDestroyed()) {
    gemsWindow.close();
    gemsWindow = null;
  }
}

export function isGemsWindowOpen(): boolean {
  return gemsWindow !== null && !gemsWindow.isDestroyed();
}

function buildLevelingGemsWindowHtml(pobBuild: any, currentAct: number, overlayVersion: OverlayVersion): string {
  const className = pobBuild?.className || 'No Build Loaded';
  const ascendancy = pobBuild?.ascendancyName || '';
  const level = pobBuild?.level || 0;

  // Inject JSON data
  const gemsJSON = JSON.stringify(gemsData);
  const gemColoursJSON = JSON.stringify(gemColoursData);
  const questsJSON = JSON.stringify(questsData);

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
      overflow: hidden;
      user-select: none;
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
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
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
      gap: 6px;
      padding-bottom: 4px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    }
    
    .socket-group-icon {
      font-size: 13px;
    }
    
    .socket-group-title {
      font-size: 11px;
      font-weight: 500;
      color: var(--accent-blue);
      flex: 1;
    }
    
    .socket-count {
      font-size: 9px;
      color: var(--text-muted);
      background: rgba(255, 255, 255, 0.04);
      padding: 1px 6px;
      border-radius: 3px;
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
  </style>
</head>
<body>
  <div class="header">
    <div class="header-title">
      <h1>💎 Gem Links</h1>
      <div class="header-subtitle">${ascendancy || className} - Level ${level}</div>
    </div>
    <div class="header-controls">
      <div class="close-btn" onclick="closeWindow()">×</div>
    </div>
  </div>
  
  <div class="content" id="content">
    <!-- Content will be rendered by JavaScript -->
  </div>
  
  <script>
    const { ipcRenderer } = require('electron');
    const path = require('path');
    const fs = require('fs');
    
    let currentBuild = ${JSON.stringify(pobBuild)};
    let currentAct = ${currentAct};
    let gemDatabase = {};
    let gemColours = {};
    let questData = {};
    const overlayVersion = '${overlayVersion}';
    
    // Injected JSON data from main process
    const INJECTED_GEMS_DATA = ${gemsJSON};
    const INJECTED_GEM_COLOURS = ${gemColoursJSON};
    const INJECTED_QUESTS_DATA = ${questsJSON};
    
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
    
    // Load quest data for gem rewards
    async function loadQuestData() {
      try {
        questData = INJECTED_QUESTS_DATA;
        console.log('[GemsWindow] Loaded quests data from injected data');
      } catch (err) {
        console.error('Failed to load quest data:', err);
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
    
    function getGemQuestInfo(gem, actNum) {
      // The gem already has quest info from matchGemsToQuestSteps
      // Since we're now showing the correct skill set for the act, just check if gem has quest info
      if (!gem.quest && !gem.vendor) {
        return null;
      }
      
      return {
        type: gem.rewardType === 'quest' ? 'TAKE' : 'BUY',
        quest: gem.quest || 'Unknown Quest',
        npc: gem.vendor || 'Unknown NPC'
      };
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
      
      // Determine which skill set we're showing
      let currentSkillSetTitle = 'Act ' + currentAct;
      if (hasSkillSets && currentBuild.skillSets[currentAct - 1]) {
        currentSkillSetTitle = currentBuild.skillSets[currentAct - 1].title || ('Act ' + currentAct);
      }
      
      let html = \`
        <div class="act-filter">
          <div class="act-filter-info">
            <span class="act-filter-label">Showing gems for:</span>
            <span class="act-filter-value">\${currentSkillSetTitle}</span>
          </div>
          <div class="act-filter-controls">
            <div class="act-nav-btn" id="prevActBtn" onclick="changeAct(-1)" title="Previous Act">◀</div>
            <div class="act-nav-btn" id="nextActBtn" onclick="changeAct(1)" title="Next Act">▶</div>
          </div>
        </div>
      \`;
      
      // Determine which socket groups to use based on current act
      let socketGroupsToShow = [];
      
      if (hasSkillSets) {
        // Use skill set by index (currentAct - 1)
        // If currentAct is beyond skill sets length, use the last one
        const skillSetIndex = Math.min(currentAct - 1, currentBuild.skillSets.length - 1);
        const matchedSkillSet = currentBuild.skillSets[skillSetIndex];
        
        if (matchedSkillSet) {
          console.log(\`[GemsWindow] Using skill set "\${matchedSkillSet.title}" (index \${skillSetIndex}) for page \${currentAct}\`);
          socketGroupsToShow = matchedSkillSet.socketGroups || [];
        }
      } else {
        // Fallback to old logic using socketGroups directly
        socketGroupsToShow = currentBuild.socketGroups;
      }
      
      // Group socket groups by size
      const sortedGroups = [...socketGroupsToShow].sort((a, b) => b.gems.length - a.gems.length);
      
      for (const group of sortedGroups) {
        if (!group.gems || group.gems.length === 0) continue;
        
        const socketCount = group.gems.length;
        const linkIcon = socketCount === 6 ? '🔗' : socketCount === 5 ? '⛓️' : socketCount >= 3 ? '🔗' : '⚡';
        const linkLabel = socketCount >= 2 ? \`\${socketCount}-Link\` : \`\${socketCount} Socket\`;
        
        html += \`
          <div class="socket-group">
            <div class="socket-group-header">
              <span class="socket-group-icon">\${linkIcon}</span>
              <span class="socket-group-title">\${group.label || 'Socket Group'}</span>
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
          
          const questInfo = getGemQuestInfo(gem, currentAct);
          const questBadge = questInfo 
            ? \`<span class="gem-quest-info \${questInfo.type === 'BUY' ? 'buy' : ''}" title="\${questInfo.type} from \${questInfo.npc}\${questInfo.quest ? ' - ' + questInfo.quest : ''}">\${questInfo.type}</span>\`
            : '';
          
          // Build tooltip text
          const tooltipParts = [];
          if (gem.quest) tooltipParts.push(\`Quest: \${gem.quest}\`);
          if (gem.vendor) tooltipParts.push(\`Vendor: \${gem.vendor}\`);
          if (gem.rewardType) tooltipParts.push(\`Type: \${gem.rewardType === 'quest' ? 'TAKE' : 'BUY'}\`);
          const tooltipText = tooltipParts.length > 0 ? tooltipParts.join(' | ') : '';
          
          // Get gem image path - EXACT same logic as working task list
          const imagePath = getGemImagePath(gemName, isSupport);
          const imageClass = overlayVersion === 'poe2' ? 'gem-image poe2' : 'gem-image';
          
          // Build gem item HTML with safe string concatenation to avoid nested template pitfalls
          html += '<div class="gem-item ' + colorClass + (isSupport ? ' support' : '') + '" title="' + tooltipText + '">';
          if (imagePath) {
            html += '<img data-gem-img="' + imagePath + '" class="' + imageClass + '" style="display:none;" />';
          }
          html += '<span class="gem-name ' + (isSupport ? 'support' : '') + '">' + gemName.replace('Support: ', '') + '</span>';
          html += questBadge;
          html += '<span class="gem-level">L' + level + (quality > 0 ? ' Q' + quality : '') + '</span>';
          html += '</div>';
        }
        
        html += \`
            </div>
          </div>
        \`;
      }
      
      content.innerHTML = html;
      
      // Resolve all gem images asynchronously - same as task list
      const gemImages = content.querySelectorAll('img[data-gem-img]');
      gemImages.forEach(img => {
        const localPath = img.getAttribute('data-gem-img');
        if (localPath) {
          resolveGemImage(img, localPath);
        }
      });
      
      // Update navigation button states
      updateNavButtons();
    }
    
    function updateNavButtons() {
      const prevBtn = document.getElementById('prevActBtn');
      const nextBtn = document.getElementById('nextActBtn');
      const maxPages = currentBuild && currentBuild.skillSets ? currentBuild.skillSets.length : 10;
      
      if (prevBtn) {
        if (currentAct <= 1) {
          prevBtn.classList.add('disabled');
        } else {
          prevBtn.classList.remove('disabled');
        }
      }
      
      if (nextBtn) {
        if (currentAct >= maxPages) {
          nextBtn.classList.add('disabled');
        } else {
          nextBtn.classList.remove('disabled');
        }
      }
    }
    
    function changeAct(delta) {
      // Determine max pages based on skill sets available
      const maxPages = currentBuild && currentBuild.skillSets ? currentBuild.skillSets.length : 10;
      
      const newAct = currentAct + delta;
      if (newAct < 1 || newAct > maxPages) return;
      
      currentAct = newAct;
      renderGems();
    }
    
    function closeWindow() {
      ipcRenderer.send('leveling-gems-window-close');
    }
    
    // Listen for act changes
    ipcRenderer.on('gems-window-act-changed', (event, newAct) => {
      currentAct = newAct;
      renderGems();
    });
    
    // Listen for build updates
    ipcRenderer.on('gems-window-build-updated', (event, newBuild) => {
      currentBuild = newBuild;
      renderGems();
    });
    
    // Initialize
    (async () => {
      await loadGemDatabase();
      await loadGemColors();
      await loadQuestData();
      renderGems();
    })();
  </script>
</body>
</html>
  `;
}
