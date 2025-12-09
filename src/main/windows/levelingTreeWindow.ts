/**
 * Passive Tree Window
 * 
 * Displays PoB passive skill tree progression with pan/zoom viewport.
 * Shows delta between tree specs (active/added/removed nodes).
 */

import { BrowserWindow, screen, ipcMain } from 'electron';
import { registerOverlayWindow, unregisterOverlayWindow, bringToFront } from '../ui/windowZManager.js';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

const TREE_WINDOW_BOUNDS_FILE = path.join(app.getPath('userData'), 'tree-window-bounds.json');

let treeWindow: BrowserWindow | null = null;
let currentUltraMinimal: boolean = false;
let currentPinned: boolean = true; // Default to always on top

interface TreeWindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  ultraMinimal?: boolean;
  pinned?: boolean; // Always on top state
  simplifiedView?: boolean; // Show only allocated nodes in single color
  viewBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

function saveTreeWindowBounds(bounds: { x: number; y: number; width: number; height: number }, ultraMinimal?: boolean, viewBox?: { x: number; y: number; width: number; height: number }, pinned?: boolean, simplifiedView?: boolean) {
  try {
    const state: TreeWindowState = { ...bounds, ultraMinimal, pinned, viewBox, simplifiedView };
    fs.writeFileSync(TREE_WINDOW_BOUNDS_FILE, JSON.stringify(state), 'utf-8');
  } catch (err) {
    console.error('[Tree Window] Failed to save bounds:', err);
  }
}

function loadTreeWindowBounds(): TreeWindowState | null {
  try {
    if (fs.existsSync(TREE_WINDOW_BOUNDS_FILE)) {
      const data = fs.readFileSync(TREE_WINDOW_BOUNDS_FILE, 'utf-8');
      const state = JSON.parse(data);
      
      // Validate bounds are on screen
      const displays = screen.getAllDisplays();
      const isOnScreen = displays.some(display => {
        const area = display.workArea;
        return state.x >= area.x && state.x < area.x + area.width &&
               state.y >= area.y && state.y < area.y + area.height;
      });
      
      return isOnScreen ? state : null;
    }
  } catch (err) {
    console.error('[Tree Window] Failed to load bounds:', err);
  }
  return null;
}

function buildTreeWindowHtml(ultraMinimal: boolean = false, pinned: boolean = true, simplifiedView: boolean = false): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Passive Skill Tree</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Fontin', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: transparent;
      color: #c8c8c8;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
      -webkit-app-region: no-drag;
      user-select: none;
      -webkit-user-select: none;
      /* Force crisp rendering even when window is not focused */
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;

      /* Always allow text selection and typing inside form controls */
      input, select, textarea, button {
        user-select: auto;
        -webkit-user-select: auto;
        -moz-user-select: auto;
      }
      transform: translateZ(0);
      -webkit-transform: translateZ(0);
      will-change: transform;
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
    }

    #window-container {
      background: rgba(20, 20, 20, 0.95);
      border: 2px solid #3a3a3a;
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 200px;
    }

    #header {
      background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
      padding: 4px 8px;
      display: flex;
      justify-content: flex-end;
      align-items: center;
      border-bottom: 1px solid #3a3a3a;
      -webkit-app-region: drag;
      cursor: move;
      min-height: 20px;
    }

    #header-controls {
      display: flex;
      gap: 4px;
      -webkit-app-region: no-drag;
      opacity: 1;
      transition: opacity 0.3s ease;
    }

    .header-btn {
      background: transparent;
      color: #888;
      border: 1px solid #444;
      width: 20px;
      height: 20px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .header-btn:hover {
      background: #3a3a3a;
      color: #c8c8c8;
      border-color: #555;
    }
    
    .header-btn.minimal-btn.active {
      background: rgba(74, 158, 255, 0.3);
      border-color: rgba(74, 158, 255, 0.6);
      color: #4a9eff;
    }
    
    .header-btn.pin-btn.active {
      background: rgba(74, 158, 255, 0.3);
      border-color: rgba(74, 158, 255, 0.6);
      color: #4a9eff;
    }
    
    /* Ultra Minimal Mode */
    body.ultra-minimal #window-container {
      background: transparent;
      border: none;
      box-shadow: none;
      pointer-events: none;
    }
    
    body.ultra-minimal #header {
      background: transparent;
      border-bottom: none;
      pointer-events: auto;
    }
    
    body.ultra-minimal #viewport-container {
      background: transparent;
      pointer-events: auto;
    }
    
    body.ultra-minimal #navigation {
      background: rgba(26, 26, 26, 0.7);
      border: 1px solid rgba(74, 158, 255, 0.3);
      backdrop-filter: blur(4px);
      pointer-events: auto;
    }
    
    body.ultra-minimal #spec-selector {
      background: rgba(42, 42, 42, 0.7);
      border: 1px solid rgba(74, 158, 255, 0.3);
      min-width: 120px;
      padding: 3px 6px;
      font-size: 11px;
    }
    
    body.ultra-minimal .nav-btn {
      background: rgba(42, 42, 42, 0.7);
      border: 1px solid rgba(74, 158, 255, 0.3);
    }

    #navigation {
      position: absolute;
      bottom: 16px;
      left: 16px;
      background: rgba(26, 26, 26, 0.95);
      padding: 8px;
      display: flex;
      gap: 6px;
      align-items: center;
      border: 1px solid #3a3a3a;
      border-radius: 6px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      opacity: 1;
      transition: opacity 0.3s ease;
    }

    #spec-selector {
      background: #2a2a2a;
      color: #c8c8c8;
      border: 1px solid #3a3a3a;
      padding: 5px 10px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      min-width: 180px;
      position: relative;
      z-index: 10000;
    }

    #spec-selector:hover {
      border-color: #4a4a4a;
    }
    
    #spec-selector option {
      background: #2a2a2a;
      color: #c8c8c8;
      padding: 4px;
    }

    #navigation button {
      background: #2a2a2a;
      color: #c8c8c8;
      border: 1px solid #3a3a3a;
      padding: 5px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.2s;
    }

    #navigation button:hover {
      background: #3a3a3a;
      border-color: #4a4a4a;
    }

    #navigation button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    #viewport-container {
      flex: 1;
      position: relative;
      overflow: hidden;
      background: #0a0a0a;
      min-height: 100px;
    }

    #tree-viewport {
      width: 100%;
      height: 100%;
      min-height: 100px;
      cursor: grab;
      pointer-events: none;
    }

    #tree-viewport.panning {
      cursor: grabbing;
    }

    #tree-content {
      padding: 20px;
      text-align: center;
      color: #c8c8c8;
      display: flex;
      flex-direction: column;
      height: 100%;
      gap: 16px;
    }

    #tree-content h2 {
      color: #e8e8e8;
      margin-bottom: 16px;
    }

    #tree-content p {
      margin: 12px 0;
      line-height: 1.6;
    }

    #tree-svg {
      flex: 1;
      width: 100%;
      background: rgba(10, 10, 10, 0.6);
      border-radius: 6px;
      overflow: hidden;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1;
      pointer-events: auto;
    }

    #tree-svg svg {
      display: block;
      transform-origin: center center;
      will-change: transform;
      position: relative;
      z-index: 1;
    }

  
    svg .nodes {
      fill: hsl(215, 15%, 50%);
      stroke: hsl(215, 15%, 50%);
      stroke-width: 0;
    }

    svg .connections {
      fill: none;
      stroke: hsl(215, 15%, 40%);
      stroke-width: 20;
    }

    svg .mastery {
      fill: hsl(215, 15%, 40%);
      stroke: hsl(215, 15%, 40%);
    }

    svg .border {
      fill: none;
      stroke: hsl(215, 15%, 40%);
      stroke-width: 20;
    }

    svg .ascendancy {
      opacity: 1;
    }

    /* Reduce console output noise */

    #tree-stats {
      position: absolute;
      top: 12px;
      left: 12px;
      padding: 10px 14px;
      background: rgba(20, 20, 20, 0.85);
      border: 1px solid rgba(58, 58, 58, 0.8);
      border-radius: 6px;
      z-index: 10;
      pointer-events: auto;
      opacity: 1;
      transition: opacity 0.3s ease;
    }

    .stat-line {
      display: inline-block;
      margin: 0 12px;
    }

    .stat-active { color: #4a9eff; }
    .stat-added { color: #4ade80; }
    .stat-removed { color: #ef4444; }

    #zoom-controls {
      position: absolute;
      bottom: 16px;
      right: 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      opacity: 1;
      transition: opacity 0.3s ease;
      z-index: 20;
      pointer-events: auto;
    }

    #zoom-controls button {
      background: rgba(42, 42, 42, 0.95);
      color: #c8c8c8;
      border: 1px solid #3a3a3a;
      width: 44px;
      height: 44px;
      padding: 0;
      border-radius: 4px;
      cursor: pointer;
      font-size: 18px;
      font-weight: bold;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: auto;
    }

    #zoom-controls button:hover {
      background: #3a3a3a;
      border-color: #4a4a4a;
    }

    /* Node Progression Controls */
    #node-progression-controls {
      position: absolute;
      top: 16px;
      right: 16px;
      display: flex;
      gap: 6px;
      align-items: center;
      opacity: 1;
      transition: opacity 0.3s ease;
      z-index: 20;
      pointer-events: auto;
    }

    #node-progression-controls select {
      background: rgba(42, 42, 42, 0.95);
      color: #c8c8c8;
      border: 1px solid #3a3a3a;
      width: 90px;
      height: 44px;
      padding: 0 8px;
      border-radius: 4px;
      font-size: 14px;
      text-align: center;
      pointer-events: auto;
      user-select: auto;
      -webkit-user-select: auto;
      cursor: pointer;
      outline: none;
    }

    #node-progression-controls select:hover {
      border-color: #4a9eff;
      background: rgba(52, 52, 52, 0.95);
    }

    #node-progression-controls select:focus {
      outline: 2px solid #4a9eff;
      outline-offset: -1px;
      border-color: #4a9eff;
      background: rgba(52, 52, 52, 0.95);
    }
    
    #node-progression-controls select option {
      background: rgba(45, 45, 45, 1);
      color: #ffffff;
    }

    #node-progression-controls button {
      background: rgba(42, 42, 42, 0.95);
      color: #c8c8c8;
      border: 1px solid #3a3a3a;
      width: 44px;
      height: 44px;
      padding: 0;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      font-weight: bold;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: auto;
    }

    #node-progression-controls button:hover {
      background: #3a3a3a;
      border-color: #4a4a4a;
    }

    #node-progression-controls button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    /* Auto-hide controls when mouse not over window */
    body.controls-hidden #tree-stats,
    body.controls-hidden #zoom-controls,
    body.controls-hidden #node-progression-controls,
    body.controls-hidden #navigation,
    body.controls-hidden #header-controls {
      opacity: 0;
      pointer-events: none;
    }

    body.controls-hidden #navigation {
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div id="window-container">
    <div id="header">
      <div id="header-controls">
        <button class="header-btn pin-btn ${pinned ? 'active' : ''}" onclick="togglePinned()" id="pinBtn" title="Toggle Always On Top">📌</button>
        <button class="header-btn minimal-btn" onclick="toggleMinimalMode()" id="minimalBtn" title="Toggle Ultra Minimal Mode">◐</button>
        <button class="header-btn" onclick="window.close()" title="Close">✕</button>
      </div>
    </div>

    <div id="viewport-container">
      <div id="tree-viewport">
        <div id="tree-content"></div>
      </div>

      <div id="navigation">
        <button id="prev-btn" onclick="previousSpec()">◄</button>
        <select id="spec-selector" onchange="selectSpec()">
          <option value="0">Loading...</option>
        </select>
        <button id="next-btn" onclick="nextSpec()">►</button>
      </div>

      <div id="zoom-controls">
        <button onclick="zoomIn()" title="Zoom In">+</button>
        <button onclick="zoomOut()" title="Zoom Out">−</button>
        <button onclick="resetZoom()" style="font-size: 13px;" title="Reset">⊙</button>
      </div>

      <!-- Node Progression Controls (for Mobalytics/Maxroll builds) -->
      <div id="node-progression-controls" style="display: none;">
        <button onclick="prevNode()" title="Previous Node">◄</button>
        <select id="node-count-select" title="Number of nodes to show"></select>
        <button onclick="nextNode()" title="Next Node">►</button>
      </div>
    </div>
  </div>

  <script>
    const { ipcRenderer } = require('electron');
    // Ensure clicking this window brings it to front above other overlays
    try {
      document.addEventListener('mousedown', () => {
        try { ipcRenderer.send('overlay-window-focus', 'tree'); } catch {}
      }, { capture: true });
      window.addEventListener('focus', () => {
        try { ipcRenderer.send('overlay-window-focus', 'tree'); } catch {}
      });
    } catch {}
    
    // Auto-hide controls when mouse leaves window
    let hideControlsTimer = null;
    
    document.addEventListener('mouseenter', () => {
      if (hideControlsTimer) {
        clearTimeout(hideControlsTimer);
        hideControlsTimer = null;
      }
      document.body.classList.remove('controls-hidden');
    });
    
    document.addEventListener('mouseleave', () => {
      // Add small delay before hiding to prevent flickering
      hideControlsTimer = setTimeout(() => {
        document.body.classList.add('controls-hidden');
      }, 300);
    });
    
    let treeSvgData = '';
    let treeViewBox = '';
    let currentSpecs = [];
    let currentIndex = 0;
    let currentGameVersion = 'poe1'; // Track game version
    let currentTreeData = null; // Store tree data for connection coloring
    let isPanning = false;
    let lastPanPosition = { x: 0, y: 0 };
    let isUltraMinimal = ${ultraMinimal};
    let isPinned = ${pinned};
    let autoDetectEnabled = true; // Track auto-detect setting
    let viewBoxSaveTimer = null; // Debounce timer for saving viewBox
    let buildSource = null; // Track build source (mobalytics, maxroll, pob)
    let nodeProgressionCount = null; // Current node count for progression (null = show all)
    let maxAvailableNodes = 0; // Maximum nodes available in current tree
    let simplifiedViewEnabled = ${simplifiedView}; // Show only allocated nodes in single color (saved via IPC)
    let connectedAllocatedNodes = []; // Connectivity-pruned ordered nodes
    let lastProgressionEvent = 'manual'; // 'step' when using arrows, 'manual' for typed

    // Initialize simplified view checkbox once DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
      const cb = document.getElementById('simplified-view-toggle');
      if (cb) cb.checked = simplifiedViewEnabled;
    });

    // Debounced function to save viewBox state
    function saveViewBoxState(svgElement) {
      if (viewBoxSaveTimer) clearTimeout(viewBoxSaveTimer);
      viewBoxSaveTimer = setTimeout(() => {
        if (!svgElement) return;
        const vb = svgElement.viewBox.baseVal;
        if (vb && vb.width > 0 && vb.height > 0) {
          const viewBoxData = {
            x: vb.x,
            y: vb.y,
            width: vb.width,
            height: vb.height
          };
          ipcRenderer.send('tree-window-viewbox-changed', viewBoxData);
        }
      }, 500); // Save 500ms after user stops zooming/panning
    }

    window.addEventListener('error', (event) => {
      console.error('[Tree Window] Uncaught error:', event.message, event.filename, event.lineno, event.colno);
    });

    // Listen for tree data from main process
    ipcRenderer.on('tree-data-update', (event, payload) => {
      if (!payload) {
        console.error('[Tree Window] Tree data update received without payload');
        return;
      }

      const { specs, treeSvg, viewBox, treeData, gameVersion, currentAct, characterLevel, autoDetectEnabled: autoDetectFromPayload, savedTreeIndex, savedViewBox, buildSource: buildSourceFromPayload } = payload;

      if (!specs || specs.length === 0) {
        console.error('[Tree Window] No specs received!');
        return;
      }

      treeSvgData = treeSvg || '';
      treeViewBox = viewBox || '';
      currentSpecs = specs;
      currentGameVersion = gameVersion || 'poe1'; // Store game version
      currentTreeData = treeData; // Store tree data for connection lookup
      autoDetectEnabled = autoDetectFromPayload ?? true; // Store auto-detect setting (default to true if undefined)
      buildSource = buildSourceFromPayload || 'pob'; // Store build source (default to 'pob')
      
      // Show/hide node progression controls based on whether current tree has ordered nodes
      const progressionControls = document.getElementById('node-progression-controls');
      if (progressionControls) {
        // Show controls if any tree has allocatedNodes array (which preserves order)
        const hasOrderedNodes = specs.some(spec => spec.allocatedNodes && spec.allocatedNodes.length > 0);
        if (hasOrderedNodes) {
          progressionControls.style.display = 'flex';
        } else {
          progressionControls.style.display = 'none';
        }
      }
      
      // Determine initial spec index: use auto-detect if enabled, otherwise use saved selection
      let initialIndex;
      if (autoDetectEnabled) {
        // Use smart matching to find the best spec to display initially
        const bestIndex = findBestTreeSpec(specs, currentAct || 1, characterLevel || 1);
        
        if (bestIndex >= 0) {
          // Found a good match
          initialIndex = bestIndex;
          console.log('[Tree Window] Auto-detect enabled, found best spec:', initialIndex);
        } else if (typeof savedTreeIndex === 'number' && savedTreeIndex >= 0 && savedTreeIndex < specs.length) {
          // No good match, use saved selection
          initialIndex = savedTreeIndex;
          console.log('[Tree Window] Auto-detect enabled, no good match, using saved selection:', initialIndex);
        } else {
          // No good match and no saved selection, use 0
          initialIndex = 0;
          console.log('[Tree Window] Auto-detect enabled, no good match, defaulting to index 0');
        }
      } else if (typeof savedTreeIndex === 'number' && savedTreeIndex >= 0 && savedTreeIndex < specs.length) {
        // Use saved selection
        initialIndex = savedTreeIndex;
        console.log('[Tree Window] Auto-detect disabled, using saved selection:', initialIndex);
      } else {
        // Fallback to 0 if no saved index
        initialIndex = 0;
        console.log('[Tree Window] No saved selection, defaulting to index 0');
      }
      
      currentIndex = initialIndex;

      console.log('[Tree Window] Calling populateSelector...');
      populateSelector();
      console.log('[Tree Window] Calling renderTree...');
      renderTree();
      
      // Apply saved viewBox (zoom/pan state) if available
      if (savedViewBox && savedViewBox.x !== undefined && savedViewBox.y !== undefined && savedViewBox.width && savedViewBox.height) {
        setTimeout(() => {
          const svgElement = document.querySelector('#tree-svg svg');
          if (svgElement) {
            svgElement.setAttribute('viewBox', savedViewBox.x + ' ' + savedViewBox.y + ' ' + savedViewBox.width + ' ' + savedViewBox.height);
            console.log('[Tree Window] Applied saved viewBox:', savedViewBox);
          }
        }, 100); // Small delay to ensure SVG is rendered
      }
      
      // Setup tooltips after tree data is loaded
      setupNodeTooltips();
    });
    
    // Helper to parse level range from spec title (same logic as gems window)
    function parseLevelRange(title) {
      if (!title) return null;
      
      const rangeMatch = title.match(/(\d+)\s*[-–—]\s*(\d+)/);
      if (rangeMatch) {
        const min = parseInt(rangeMatch[1], 10);
        const max = parseInt(rangeMatch[2], 10);
        if (!isNaN(min) && !isNaN(max)) {
          return { min, max };
        }
      }
      
      const singleMatch = title.match(/(?:level|lv|lvl)?\s*(\d+)/i);
      if (singleMatch) {
        const level = parseInt(singleMatch[1], 10);
        if (!isNaN(level)) {
          return { min: level, max: level };
        }
      }
      
      return null;
    }
    
    // Helper to detect if a spec name contains act reference
    function hasActReference(title) {
      if (!title) return false;
      const lower = title.toLowerCase();
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
    
    // Find best matching tree spec based on act (preferred) or level (fallback)
    // Returns index of best match, or -1 if no good match found
    function findBestTreeSpec(specs, currentAct, characterLevel) {
      if (!specs || specs.length === 0) return -1;
      
      console.log(\`[Tree Window] Finding best tree spec for act \${currentAct}, level \${characterLevel}\`);
      
      // First, try to find by act reference
      for (let i = 0; i < specs.length; i++) {
        const spec = specs[i];
        if (hasActReference(spec.title)) {
          const actNum = extractActNumber(spec.title);
          if (actNum === currentAct) {
            console.log(\`[Tree Window] Matched by act: "\${spec.title}" (index \${i})\`);
            return i;
          }
        }
      }
      
      // Fallback: match by level range
      console.log(\`[Tree Window] No act match found, trying level-based matching for level \${characterLevel}\`);
      for (let i = 0; i < specs.length; i++) {
        const spec = specs[i];
        const range = parseLevelRange(spec.title);
        if (range && characterLevel >= range.min && characterLevel <= range.max) {
          console.log(\`[Tree Window] Matched by level: "\${spec.title}" (range \${range.min}-\${range.max}, index \${i})\`);
          return i;
        }
      }
      
      // Node count fallback: find tree with closest node count to character level
      // Only use this if we couldn't match by act or level
      console.log(\`[Tree Window] No act/level match found, trying node count matching for level \${characterLevel}\`);
      
      // Estimate expected nodes: level - 1 (accounting for no point at level 1)
      // In PoE1, players also lose 2 points from bandit rewards, but we'll keep it simple
      const expectedNodes = Math.max(1, characterLevel - 1);
      
      let bestMatchIndex = -1;
      let bestMatchDiff = Infinity;
      
      for (let i = 0; i < specs.length; i++) {
        const spec = specs[i];
        if (spec.nodeCount === undefined) continue;
        
        // Prefer trees with node count <= expected (don't suggest overpowered builds)
        // Calculate difference, penalizing trees with too many nodes
        const diff = spec.nodeCount <= expectedNodes
          ? Math.abs(expectedNodes - spec.nodeCount) // Reward close matches below expected
          : (spec.nodeCount - expectedNodes) * 2; // Penalize overspec'd trees more heavily
        
        if (diff < bestMatchDiff) {
          bestMatchDiff = diff;
          bestMatchIndex = i;
        }
      }
      
      if (bestMatchIndex !== -1) {
        console.log(\`[Tree Window] Matched by node count: "\${specs[bestMatchIndex].title}" (\${specs[bestMatchIndex].nodeCount} nodes, expected ~\${expectedNodes}, index \${bestMatchIndex})\`);
        return bestMatchIndex;
      }
      
      // No good match found - return -1 so caller can use saved selection
      console.log(\`[Tree Window] No good match found, returning -1 to use saved selection\`);
      return -1;
    }
    
    // Listen for context updates (act/level changes)
    ipcRenderer.on('tree-context-update', (event, payload) => {
      const { currentAct, characterLevel } = payload;
      
      // Only run auto-detection if enabled
      if (!autoDetectEnabled) {
        console.log(\`[Tree Window] Auto-detect disabled, keeping current selection: \${currentIndex}\`);
        return;
      }
      
      if (currentSpecs && currentSpecs.length > 0) {
        const bestSpecIndex = findBestTreeSpec(currentSpecs, currentAct, characterLevel);
        
        // Only switch if we found a good match (>= 0) and it's different
        if (bestSpecIndex >= 0 && bestSpecIndex !== currentIndex) {
          console.log(\`[Tree Window] Context changed, switching from spec \${currentIndex} to \${bestSpecIndex}\`);
          currentIndex = bestSpecIndex;
          document.getElementById('spec-selector').value = currentIndex;
          renderTree();
        } else if (bestSpecIndex < 0) {
          console.log(\`[Tree Window] Context changed, but no good match found, keeping current selection: \${currentIndex}\`);
        }
      }
    });

    // Notify main process that renderer is ready to receive data
    // Use setTimeout to ensure listener is fully registered
    setTimeout(() => {
      ipcRenderer.send('tree-window-ready');
      
      // Apply saved minimal mode state
      if (isUltraMinimal) {
        document.body.classList.add('ultra-minimal');
        document.getElementById('minimalBtn').classList.add('active');
      }
    }, 100);

    function populateSelector() {
      const selector = document.getElementById('spec-selector');
      
      selector.innerHTML = currentSpecs.map((spec, i) => {
        let displayName = spec.title || \`Tree \${i + 1}\`;
        
        // Always append node count for informational purposes
        if (spec.nodeCount !== undefined) {
          displayName = \`\${displayName} (\${spec.nodeCount} Nodes)\`;
        }
        
        return \`<option value="\${i}">\${displayName}</option>\`;
      }).join('');
      
      selector.value = currentIndex;
      updateNavigation();
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
      
      // Just notify main process (no click-through needed)
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('tree-window-toggle-minimal', isUltraMinimal);
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
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('tree-window-toggle-pinned', isPinned);
    }

    function selectSpec() {
      currentIndex = parseInt(document.getElementById('spec-selector').value);
      // Reset node progression to full tree when switching specs
      nodeProgressionCount = null;
      renderTree();
      
      // Save user's manual selection
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('tree-spec-selected', currentIndex);
    }

    function previousSpec() {
      if (currentIndex > 0) {
        currentIndex--;
        document.getElementById('spec-selector').value = currentIndex;
        // Reset node progression to full tree when switching specs
        nodeProgressionCount = null;
        renderTree();
        // Persist user's manual selection when navigating with prev button
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('tree-spec-selected', currentIndex);
      }
    }

    function nextSpec() {
      if (currentIndex < currentSpecs.length - 1) {
        currentIndex++;
        document.getElementById('spec-selector').value = currentIndex;
        // Reset node progression to full tree when switching specs
        nodeProgressionCount = null;
        renderTree();
        // Persist user's manual selection when navigating with next button
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('tree-spec-selected', currentIndex);
      }
    }

    // Node Progression Functions (for Mobalytics/Maxroll builds)
    function updateNodeProgression() {
      const select = document.getElementById('node-count-select');
      const currentSpec = currentSpecs[currentIndex];
      
      if (!currentSpec || connectedAllocatedNodes.length === 0) {
        maxAvailableNodes = 0;
        nodeProgressionCount = null;
        return;
      }

      maxAvailableNodes = connectedAllocatedNodes.length;
      
      if (nodeProgressionCount === null || nodeProgressionCount > maxAvailableNodes) {
        nodeProgressionCount = maxAvailableNodes;
      }

      // Populate dropdown only if empty (first time) to preserve all entries
      if (!select || select.options.length === 0) {
        populateNodeDropdown();
      } else {
        // Just update the selected value without regenerating options
        const currentValue = nodeProgressionCount !== null ? nodeProgressionCount : maxAvailableNodes;
        
        // Check if current value exists in options, if not add it
        let foundOption = false;
        for (let i = 0; i < select.options.length; i++) {
          if (parseInt(select.options[i].value) === currentValue) {
            foundOption = true;
            break;
          }
        }
        
        if (!foundOption && currentValue >= 0) {
          // Add the missing value and re-sort
          const option = document.createElement('option');
          option.value = String(currentValue);
          option.text = String(currentValue);
          select.add(option);
          
          // Re-sort options
          const options = Array.from(select.options);
          options.sort((a, b) => parseInt(a.value) - parseInt(b.value));
          select.innerHTML = '';
          options.forEach(opt => select.add(opt));
        }
        
        select.value = String(currentValue);
      }
    }

    function prevNode() {
      if (nodeProgressionCount === null) {
        nodeProgressionCount = maxAvailableNodes;
      }
      
      if (nodeProgressionCount > 0) {
        nodeProgressionCount--;
        lastProgressionEvent = 'step';
        renderTree();
      }
    }

    function nextNode() {
      if (nodeProgressionCount === null) {
        nodeProgressionCount = 0;
      }
      
      if (nodeProgressionCount < maxAvailableNodes) {
        nodeProgressionCount++;
        lastProgressionEvent = 'step';
        renderTree();
      }
    }

    // Populate dropdown options based on total nodes
    function populateNodeDropdown() {
      const select = document.getElementById('node-count-select');
      if (!select) return;
      
      const options = [];
      const targetEntries = 10;
      const maxNodes = maxAvailableNodes;
      
      if (maxNodes <= 0) {
        options.push(0);
      } else if (maxNodes <= 10) {
        // Show each node individually for small trees
        for (let i = 0; i <= maxNodes; i++) {
          options.push(i);
        }
      } else {
        // Calculate step size to have ~10 entries
        const step = Math.ceil(maxNodes / targetEntries);
        const roundedStep = step <= 5 ? 5 : (step <= 10 ? 10 : (step <= 20 ? 20 : (step <= 50 ? 50 : 100)));
        
        for (let i = 0; i <= maxNodes; i += roundedStep) {
          options.push(i);
        }
        
        // Always include the max if not already included
        if (options[options.length - 1] !== maxNodes) {
          options.push(maxNodes);
        }
      }
      
      const currentValue = nodeProgressionCount !== null ? nodeProgressionCount : maxNodes;
      
      // If current value is not in options, add it as a custom option
      const hasCurrentValue = options.indexOf(currentValue) !== -1;
      if (!hasCurrentValue && currentValue >= 0 && currentValue <= maxNodes) {
        options.push(currentValue);
        options.sort(function(a, b) { return a - b; });
      }
      
      select.innerHTML = options.map(function(val) { 
        return '<option value="' + val + '" ' + (val === currentValue ? 'selected' : '') + '>' + val + '</option>';
      }).join('');
      
      // Set the value directly to ensure it displays correctly
      select.value = currentValue;
    }

    // Handle dropdown change
    document.addEventListener('DOMContentLoaded', () => {
      const select = document.getElementById('node-count-select');
      if (select) {
        select.addEventListener('change', () => {
          const value = parseInt(select.value, 10);
          if (!isNaN(value) && value >= 0 && value <= maxAvailableNodes) {
            nodeProgressionCount = value;
            lastProgressionEvent = 'manual';
            renderTree();
          }
        });
      }
    });

    // Build adjacency map from tree graph connections for connectivity validation
    function buildAdjacencyMap() {
      const adj = new Map();
      if (!currentTreeData || !currentTreeData.graphs) return adj;

      for (const graph of currentTreeData.graphs) {
        for (const conn of graph.connections) {
          const a = String(conn.a);
          const b = String(conn.b);
          if (!adj.has(a)) adj.set(a, new Set());
          if (!adj.has(b)) adj.set(b, new Set());
          adj.get(a).add(b);
          adj.get(b).add(a);
        }
      }
      return adj;
    }

    // Ensure ordered nodes stay connected to the existing kept set
    function enforceConnectivity(orderedNodes) {
      if (!orderedNodes || orderedNodes.length === 0) return [];

      const adj = buildAdjacencyMap();
      const ordered = orderedNodes.map(n => String(n));
      const selectedSet = new Set(ordered);

      // Anchor set: class start nodes if available, else first node
      const anchors = new Set();
      if (currentTreeData?.startNodeId) anchors.add(String(currentTreeData.startNodeId));
      if (Array.isArray(currentTreeData?.startNodeIds)) {
        currentTreeData.startNodeIds.forEach((n) => anchors.add(String(n)));
      }
      if (currentTreeData?.constants?.startNodeIds) {
        Object.values(currentTreeData.constants.startNodeIds).forEach((n) => anchors.add(String(n)));
      }
      // Always include first ordered node as fallback anchor
      anchors.add(ordered[0]);

      // Build connected components within the selected set
      const visited = new Set();
      const components = [];

      for (const nodeId of ordered) {
        if (visited.has(nodeId)) continue;
        const queue = [nodeId];
        const comp = [];
        visited.add(nodeId);

        while (queue.length) {
          const cur = queue.shift();
          comp.push(cur);
          const neighbors = adj.get(cur);
          if (!neighbors) continue;
          for (const nb of neighbors) {
            if (selectedSet.has(String(nb)) && !visited.has(String(nb))) {
              visited.add(String(nb));
              queue.push(String(nb));
            }
          }
        }
        components.push(comp);
      }

      if (components.length === 0) return [];

      // Prefer component that contains any anchor; otherwise largest
      let keepComp = components.find(c => c.some(n => anchors.has(n)));
      if (!keepComp) {
        components.sort((a, b) => b.length - a.length);
        keepComp = components[0];
      }
      const keepSet = new Set(keepComp);

      // Preserve original order but drop nodes not in kept component
      const kept = ordered.filter(id => keepSet.has(id));
      const dropped = ordered.filter(id => !keepSet.has(id));
      if (dropped.length > 0) {
        console.warn('[Tree] Dropping disconnected nodes (kept size', kept.length, 'dropped', dropped.length, ')');
      }

      return kept;
    }

    function toggleSimplifiedView() {
      simplifiedViewEnabled = !simplifiedViewEnabled;
      
      // Save via IPC to main process
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('tree-window-simplified-view-changed', simplifiedViewEnabled);
      
      // Re-render tree with new setting
      renderTree();
    }

    function updateNavigation() {
      document.getElementById('prev-btn').disabled = currentIndex === 0;
      document.getElementById('next-btn').disabled = currentIndex === currentSpecs.length - 1;
    }

    function renderTree() {
      if (currentSpecs.length === 0) {
        console.log('[Tree] No specs to render');
        return;
      }

      if (!treeSvgData || !treeViewBox) {
        console.error('[Tree] Tree template data missing', { hasSvg: !!treeSvgData, viewBox: treeViewBox });
        document.getElementById('tree-content').innerHTML = \`
          <p style="color: #ef4444;">Tree template not loaded. Please rebuild overlay.</p>
        \`;
        return;
      }

      const currentSpec = currentSpecs[currentIndex];
      const previousSpec = currentIndex > 0 ? currentSpecs[currentIndex - 1] : null;

      // Track last rendered nodes per spec so we can diff progression steps against the previous render
      if (!window.__lastRenderedNodes) {
        window.__lastRenderedNodes = new Set();
        window.__lastRenderedSpecIndex = -1;
      }

      // Prepare ordered nodes - use allocated nodes if available
      const orderedNodes = currentSpec.allocatedNodes && currentSpec.allocatedNodes.length > 0
        ? currentSpec.allocatedNodes.map(n => String(n))
        : (currentSpec.parsedUrl?.nodes || []);

      // Identify ascendancy nodes from tree data that are allocated in this spec
      const ascendancyNodeSet = new Set();
      const ascAllocated = new Set();
      if (currentTreeData && currentTreeData.ascendancies && currentTreeData.graphs) {
        for (const ascData of Object.values(currentTreeData.ascendancies)) {
          const ascGraph = ascData?.graphIndex != null ? currentTreeData.graphs[ascData.graphIndex] : null;
          const graphNodes = ascGraph?.nodes ? Object.keys(ascGraph.nodes) : [];
          graphNodes.forEach(id => ascendancyNodeSet.add(id));
          // Keep only ascendancy nodes that are allocated in this spec
          graphNodes.forEach(id => { if (orderedNodes.includes(id)) ascAllocated.add(id); });
          if (ascData.startNodeId) ascendancyNodeSet.add(String(ascData.startNodeId));
        }
        console.log('[Tree] Ascendancy detection: total asc nodes=' + ascendancyNodeSet.size + ', allocated asc=' + ascAllocated.size);
        if (ascAllocated.size > 0) {
          console.log('[Tree] Allocated ascendancy nodes:', Array.from(ascAllocated).slice(0, 10));
        }
      }

      // Split ordered nodes into ascendancy vs main tree
      const orderedAsc = orderedNodes.filter(id => ascendancyNodeSet.has(id) || ascAllocated.has(id));
      const orderedMain = orderedNodes.filter(id => !ascendancyNodeSet.has(id));

      // Enforce connectivity on full main tree first
      const keptMain = enforceConnectivity(orderedMain);

      if (keptMain.length === 0 && orderedAsc.length === 0) {
        maxAvailableNodes = 0;
        nodeProgressionCount = null;
        updateNodeProgression();
        return;
      }

      // Progression applies only to main nodes; ascendancy always shown
      maxAvailableNodes = keptMain.length;
      if (nodeProgressionCount === null || nodeProgressionCount > maxAvailableNodes) {
        nodeProgressionCount = maxAvailableNodes;
      }

      // Smart island prevention: ensure all nodes stay connected to start
      const targetCount = nodeProgressionCount ?? maxAvailableNodes;
      let mainNodesToShow = [...keptMain]; // Start with all connected nodes
      
      if (targetCount < keptMain.length) {
        // Build adjacency for connectivity check
        const adj = buildAdjacencyMap();
        
        // Get start node (first node in the list is guaranteed to be the anchor)
        const startNode = keptMain[0];
        
        // Function to check if all nodes in a list are reachable from start
        const allReachableFromStart = (nodeList) => {
          if (nodeList.length === 0) return true;
          const testSet = new Set(nodeList);
          if (!testSet.has(startNode)) return false; // Start must always be included
          
          const visited = new Set();
          const queue = [startNode];
          visited.add(startNode);
          
          while (queue.length > 0) {
            const cur = queue.shift();
            const neighbors = adj.get(cur) || [];
            for (const nb of neighbors) {
              const nbStr = String(nb);
              if (testSet.has(nbStr) && !visited.has(nbStr)) {
                visited.add(nbStr);
                queue.push(nbStr);
              }
            }
          }
          return visited.size === nodeList.length;
        };
        
        // Try to remove nodes from the end, keeping only those we need to keep
        // We remove nodes one by one, skipping bridge nodes
        const toRemove = new Set();
        for (let i = keptMain.length - 1; i >= 0 && keptMain.length - toRemove.size > targetCount; i--) {
          const nodeToTest = keptMain[i];
          if (i === 0) break; // Never remove the start node
          
          // Test if we can remove this node
          const testList = keptMain.filter((n, idx) => idx !== i && !toRemove.has(idx));
          if (allReachableFromStart(testList)) {
            // Safe to remove
            toRemove.add(i);
          }
          // If not safe, skip it (it's a bridge node) and try the next one
        }
        
        mainNodesToShow = keptMain.filter((n, idx) => !toRemove.has(idx));
        console.log('[Tree] Island prevention: target=' + targetCount + ', actual=' + mainNodesToShow.length + ', removed=' + toRemove.size + ' nodes');
      }
      
      const nodesToShow = Array.from(ascAllocated).concat(mainNodesToShow);

      connectedAllocatedNodes = nodesToShow;

      const currentNodes = new Set(nodesToShow);
      const previousNodes = new Set(previousSpec?.parsedUrl?.nodes || []);
      
      // Update node progression controls
      updateNodeProgression();

      // Track which nodes are in ascendancy graphs for special styling
      const ascendancyNodes = new Set();
      let activeAscendancyName = null;
      let activeAscendancyStartNodeId = null;
      
      // Add ascendancy start node if we have an ascendancy selected
      // This node is implicit and not included in the PoB node list, but needs to be colored
      if (currentSpec.parsedUrl?.ascendancyId && currentTreeData && currentTreeData.ascendancies) {
        // Find the ascendancy by ID (ascendancy IDs in PoB are numeric, but our tree data uses string keys)
        for (const [ascKey, ascData] of Object.entries(currentTreeData.ascendancies)) {
          // Match by index or by checking if we have nodes allocated in that ascendancy graph
          const ascGraph = currentTreeData.graphs[ascData.graphIndex];
          if (ascGraph && ascGraph.nodes) {
            // Check if any of our current nodes are in this ascendancy graph
            const hasNodesInThisAsc = [...currentNodes].some(nodeId => ascGraph.nodes[nodeId]);
            if (hasNodesInThisAsc) {
              const ascendancyStartNodeId = ascData.startNodeId;
              activeAscendancyName = ascKey;
              activeAscendancyStartNodeId = ascendancyStartNodeId; // Track for coloring
              console.log('[Tree] Found ascendancy start node:', ascendancyStartNodeId, 'for', ascKey);
              currentNodes.add(ascendancyStartNodeId);
              
              // Mark all nodes in this ascendancy graph for special styling
              for (const nodeId of Object.keys(ascGraph.nodes)) {
                ascendancyNodes.add(nodeId);
              }
              ascendancyNodes.add(ascendancyStartNodeId);
              break;
            }
          }
        }
      }

      // Choose diff source: if staying on same spec, diff against last rendered nodes; otherwise diff against prior spec
      const prevRenderNodes = (window.__lastRenderedSpecIndex === currentIndex)
        ? window.__lastRenderedNodes
        : previousNodes;

      const nodesActive = [...prevRenderNodes].filter(id => currentNodes.has(id));
      const nodesAdded = [...currentNodes].filter(id => !prevRenderNodes.has(id));
      const nodesRemoved = [...prevRenderNodes].filter(id => !currentNodes.has(id));

      console.log(\`[Tree] Delta - Active: \${nodesActive.length}, Added: \${nodesAdded.length}, Removed: \${nodesRemoved.length}\`);
      if (nodesAdded.length > 0) {
        console.log('[Tree] Sample added nodes:', nodesAdded.slice(0, 5));
      }

      // Generate CSS for node highlighting
      // Separate ascendancy nodes from regular nodes for different styling
      const activeAscNodes = nodesActive.filter(id => ascendancyNodes.has(id));
      const addedAscNodes = nodesAdded.filter(id => ascendancyNodes.has(id));
      const removedAscNodes = nodesRemoved.filter(id => ascendancyNodes.has(id));
      
      const activeRegularNodes = nodesActive.filter(id => !ascendancyNodes.has(id));
      const addedRegularNodes = nodesAdded.filter(id => !ascendancyNodes.has(id));
      const removedRegularNodes = nodesRemoved.filter(id => !ascendancyNodes.has(id));
      
      // Get the last added/removed nodes for special highlighting (only in step mode)
      const lastAddedNode = lastProgressionEvent === 'step' && addedRegularNodes.length > 0 
        ? addedRegularNodes[addedRegularNodes.length - 1] 
        : null;
      const lastRemovedNode = lastProgressionEvent === 'step' && removedRegularNodes.length > 0 
        ? removedRegularNodes[removedRegularNodes.length - 1] 
        : null;
      
      // For added/removed styles, exclude the last node if in step mode (it gets special highlighting)
      const addedForStyling = lastAddedNode 
        ? addedRegularNodes.slice(0, -1) 
        : addedRegularNodes;
      const removedForStyling = lastRemovedNode 
        ? removedRegularNodes.slice(0, -1) 
        : removedRegularNodes;
      
      const activeStyles = activeRegularNodes.map(id => \`#n\${id}\`).join(', ');
      const addedStyles = addedForStyling.map(id => \`#n\${id}\`).join(', ');
      const removedStyles = removedForStyling.map(id => \`#n\${id}\`).join(', ');
      
      const activeAscStyles = activeAscNodes.map(id => \`#n\${id}\`).join(', ');
      const addedAscStyles = addedAscNodes.map(id => \`#n\${id}\`).join(', ');
      const removedAscStyles = removedAscNodes.map(id => \`#n\${id}\`).join(', ');
      
      console.log('[Tree] Last added node:', lastAddedNode, 'lastProgressionEvent:', lastProgressionEvent);
      console.log('[Tree] Last removed node:', lastRemovedNode, 'lastProgressionEvent:', lastProgressionEvent);
      
      // Build connection ID lists from actual graph connections
      const connectionActiveIds = [];
      const connectionAddedIds = [];
      const connectionRemovedIds = [];

      // Use tree data from payload instead of require()
      if (currentTreeData && currentTreeData.graphs) {
        const nodesActiveSet = new Set(nodesActive);
        const nodesAddedSet = new Set(nodesAdded);
        const nodesRemovedSet = new Set(nodesRemoved);

        for (const graph of currentTreeData.graphs) {
          for (const conn of graph.connections) {
            const id = conn.a + '-' + conn.b;
            const aIsActive = nodesActiveSet.has(conn.a);
            const bIsActive = nodesActiveSet.has(conn.b);
            const aIsAdded = nodesAddedSet.has(conn.a);
            const bIsAdded = nodesAddedSet.has(conn.b);
            const aIsRemoved = nodesRemovedSet.has(conn.a);
            const bIsRemoved = nodesRemovedSet.has(conn.b);

            if (aIsActive && bIsActive) {
              connectionActiveIds.push(id);
            }
            if ((aIsAdded && (bIsAdded || bIsActive)) || (bIsAdded && (aIsAdded || aIsActive))) {
              connectionAddedIds.push(id);
            }
            if ((aIsRemoved && (bIsRemoved || bIsActive)) || (bIsRemoved && (aIsRemoved || aIsActive))) {
              connectionRemovedIds.push(id);
            }
          }
        }
        console.log('[Tree] Built connection lists: active=' + connectionActiveIds.length + ', added=' + connectionAddedIds.length + ', removed=' + connectionRemovedIds.length);
      } else {
        console.warn('[Tree] No tree data available for connection coloring');
      }

      const activeConnStyles = connectionActiveIds.map(id => \`#c\${id}\`).join(', ');
      const addedConnStyles = connectionAddedIds.map(id => \`#c\${id}\`).join(', ');
      const removedConnStyles = connectionRemovedIds.map(id => \`#c\${id}\`).join(', ');

      // In simplified view, combine all allocated nodes (active + added) into single orange style
      let simplifiedNodeStyles = '';
      let simplifiedConnStyles = '';
      
      if (simplifiedViewEnabled) {
        const allAllocatedNodes = [...new Set([...nodesActive, ...nodesAdded])];
        const allAllocatedRegularNodes = allAllocatedNodes.filter(id => !ascendancyNodes.has(id));
        const allAllocatedAscNodes = allAllocatedNodes.filter(id => ascendancyNodes.has(id));
        
        simplifiedNodeStyles = allAllocatedRegularNodes.map(id => \`#n\${id}\`).join(', ');
        const simplifiedAscStyles = allAllocatedAscNodes.map(id => \`#n\${id}\`).join(', ');
        
        // Connections: show only between allocated nodes
        const allAllocatedSet = new Set(allAllocatedNodes);
        const simplifiedConnIds = [];
        
        if (currentTreeData && currentTreeData.graphs) {
          for (const graph of currentTreeData.graphs) {
            for (const conn of graph.connections) {
              if (allAllocatedSet.has(conn.a) && allAllocatedSet.has(conn.b)) {
                simplifiedConnIds.push(conn.a + '-' + conn.b);
              }
            }
          }
        }
        
        simplifiedConnStyles = simplifiedConnIds.map(id => \`#c\${id}\`).join(', ');
        
        // Combine regular and ascendancy node styles
        if (simplifiedAscStyles) {
          simplifiedNodeStyles = simplifiedNodeStyles ? \`\${simplifiedNodeStyles}, \${simplifiedAscStyles}\` : simplifiedAscStyles;
        }
      }

      // Build weapon set styles (for Maxroll imports with weapon tree nodes)
      let weaponSet1Styles = '';
      let weaponSet2Styles = '';
      let weaponSet1ConnStyles = '';
      let weaponSet2ConnStyles = '';
      if (currentSpec.weaponSets && Object.keys(currentSpec.weaponSets).length > 0) {
        const set1Nodes = [];
        const set2Nodes = [];
        for (const [nodeId, setNum] of Object.entries(currentSpec.weaponSets)) {
          if (setNum === 1) set1Nodes.push(nodeId);
          else if (setNum === 2) set2Nodes.push(nodeId);
        }
        weaponSet1Styles = set1Nodes.map(id => \`#n\${id}\`).join(', ');
        weaponSet2Styles = set2Nodes.map(id => \`#n\${id}\`).join(', ');
        
        // Build connection styles for weapon sets
        const set1NodeSet = new Set(set1Nodes.map(String));
        const set2NodeSet = new Set(set2Nodes.map(String));
        const set1Conns = [];
        const set2Conns = [];
        
        if (currentTreeData && currentTreeData.graphs) {
          for (const graph of currentTreeData.graphs) {
            for (const conn of graph.connections) {
              const aStr = String(conn.a);
              const bStr = String(conn.b);
              const id = conn.a + '-' + conn.b;
              
              // If both nodes are in set 1, color the connection pink
              if (set1NodeSet.has(aStr) && set1NodeSet.has(bStr)) {
                set1Conns.push(id);
              }
              // If both nodes are in set 2, color the connection yellow
              else if (set2NodeSet.has(aStr) && set2NodeSet.has(bStr)) {
                set2Conns.push(id);
              }
            }
          }
        }
        
        weaponSet1ConnStyles = set1Conns.map(id => \`#c\${id}\`).join(', ');
        weaponSet2ConnStyles = set2Conns.map(id => \`#c\${id}\`).join(', ');
        console.log('[Tree] Weapon sets: set 1=' + set1Nodes.length + ' nodes + ' + set1Conns.length + ' conns, set 2=' + set2Nodes.length + ' nodes + ' + set2Conns.length + ' conns');
      }

      const dynamicCSS = \`
        <style id="tree-dynamic-css">
          svg .nodes { fill: hsl(215, 15%, 50%); stroke: hsl(215, 15%, 50%); stroke-width: 0; }
          svg .connections { fill: none; stroke: hsl(215, 15%, 40%); stroke-width: 20; }
          svg .mastery { fill: hsl(215, 15%, 40%); stroke: hsl(215, 15%, 40%); }
          svg .border { fill: none; stroke: hsl(215, 15%, 40%); stroke-width: 20; }
          svg .ascendancy { opacity: 0.15; }
          \${activeAscendancyName ? \`svg .ascendancy.\${activeAscendancyName} { opacity: 1 !important; }\` : ''}
          
          \${simplifiedViewEnabled ? \`
          /* Simplified view: single orange color for all allocated nodes */
          \${simplifiedNodeStyles ? \`svg :is(\${simplifiedNodeStyles}) { fill: hsl(30, 100%, 50%) !important; stroke: hsl(30, 100%, 50%) !important; }\` : ''}
          \${simplifiedConnStyles ? \`svg :is(\${simplifiedConnStyles}) { stroke: hsl(30, 100%, 40%) !important; stroke-width: 35 !important; }\` : ''}
          \` : \`
          /* Regular nodes - standard styling */
          \${activeStyles ? \`svg :is(\${activeStyles}) { fill: hsl(200, 80%, 50%) !important; stroke: hsl(200, 80%, 50%) !important; }\` : ''}
          \${addedStyles ? \`svg :is(\${addedStyles}) { fill: hsl(120, 90%, 50%) !important; stroke: hsl(120, 90%, 50%) !important; }\` : ''}
          \${removedStyles ? \`svg :is(\${removedStyles}) { fill: hsl(0, 90%, 50%) !important; stroke: hsl(0, 90%, 50%) !important; }\` : ''}
          
          /* Ascendancy nodes - same colors, parent group opacity handles visibility */
          \${activeAscStyles ? \`svg :is(\${activeAscStyles}) { fill: hsl(200, 80%, 50%) !important; stroke: hsl(200, 80%, 50%) !important; }\` : ''}
          \${addedAscStyles ? \`svg :is(\${addedAscStyles}) { fill: hsl(120, 90%, 50%) !important; stroke: hsl(120, 90%, 50%) !important; }\` : ''}
          \${removedAscStyles ? \`svg :is(\${removedAscStyles}) { fill: hsl(0, 90%, 50%) !important; stroke: hsl(0, 90%, 50%) !important; }\` : ''}
          
          /* Connections - standard styling */
          \${activeConnStyles ? \`svg :is(\${activeConnStyles}) { stroke: hsl(200, 80%, 40%) !important; stroke-width: 35 !important; }\` : ''}
          \${addedConnStyles ? \`svg :is(\${addedConnStyles}) { stroke: hsl(120, 90%, 40%) !important; stroke-width: 35 !important; }\` : ''}
          \${removedConnStyles ? \`svg :is(\${removedConnStyles}) { stroke: hsl(0, 90%, 40%) !important; stroke-width: 35 !important; }\` : ''}
          \`}
          
          /* Weapon set nodes (Maxroll): pink for set 1, yellow for set 2 (override other colors) */
          \${weaponSet1Styles ? \`svg :is(\${weaponSet1Styles}) { fill: hsl(330, 100%, 60%) !important; stroke: hsl(330, 100%, 60%) !important; }\` : ''}
          \${weaponSet2Styles ? \`svg :is(\${weaponSet2Styles}) { fill: hsl(60, 100%, 50%) !important; stroke: hsl(60, 100%, 50%) !important; }\` : ''}
          \${weaponSet1ConnStyles ? \`svg :is(\${weaponSet1ConnStyles}) { stroke: hsl(330, 100%, 50%) !important; stroke-width: 35 !important; }\` : ''}
          \${weaponSet2ConnStyles ? \`svg :is(\${weaponSet2ConnStyles}) { stroke: hsl(60, 100%, 40%) !important; stroke-width: 35 !important; }\` : ''}
          
          /* Ascendancy start node: distinct purple color */
          \${activeAscendancyStartNodeId ? \`svg #n\${activeAscendancyStartNodeId} { fill: hsl(280, 80%, 60%) !important; stroke: hsl(280, 80%, 60%) !important; }\` : ''}
          
          /* Highlight last added/removed node with brighter green/red (works in both modes) */
          \${lastAddedNode ? \`svg #n\${lastAddedNode} { fill: #0f0 !important; stroke: #0f0 !important; }\` : ''}
          \${lastRemovedNode ? \`svg #n\${lastRemovedNode} { fill: #f00 !important; stroke: #f00 !important; }\` : ''}
        </style>
      \`;

      // Render: stats overlaid on top of tree for space efficiency
      document.getElementById('tree-content').innerHTML = \`
        \${dynamicCSS}
        <div id="tree-stats">
          <p style="font-size: 13px; margin: 0;">
            <strong>\${currentSpec.parsedUrl?.nodes?.length || 0}</strong> nodes allocated
          </p>
          <p style="margin: 6px 0 0 0; font-size: 12px;">
            <span class="stat-line stat-active">Active: <strong>\${nodesActive.length}</strong></span>
            <span class="stat-line stat-added">Added: <strong>\${nodesAdded.length}</strong></span>
            <span class="stat-line stat-removed">Removed: <strong>\${nodesRemoved.length}</strong></span>
          </p>
          <label style="display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 12px; cursor: pointer; user-select: none; pointer-events: auto;">
            <input type="checkbox" id="simplified-view-toggle" onchange="toggleSimplifiedView()" \${simplifiedViewEnabled ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer; accent-color: #ff8c00; pointer-events: auto; margin: 0;">
            <span style="pointer-events: auto;">Simplified View</span>
          </label>
        </div>
        <div id="tree-svg">
          \${treeSvgData}
        </div>
      \`;

      const svgWrapper = document.getElementById('tree-svg');
      const svgElement = svgWrapper ? svgWrapper.querySelector('svg') : null;

      if (!svgElement) {
        console.error('[Tree Window] SVG element not found after render!');
        console.error('[Tree Window] tree-svg wrapper exists?', !!svgWrapper);
        console.error('[Tree Window] treeSvgData length:', treeSvgData.length);
        return;
      }

      console.log('[Tree Window] SVG element found, width:', svgElement.getAttribute('width'), 'height:', svgElement.getAttribute('height'));

      // Use SVG's native viewBox for zoom/pan - keeps rendering sharp at all zoom levels
      svgElement.removeAttribute('width');
      svgElement.removeAttribute('height');
      svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svgElement.style.width = '100%';
      svgElement.style.height = '100%';

      // Calculate focus bounds for allocated nodes (try DOM lookup first)
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let foundNodes = 0;

      const focusNodes = (lastProgressionEvent === 'step' && (nodesAdded.length > 0 || nodesRemoved.length > 0))
        ? [...nodesAdded, ...nodesRemoved]
        : (mainNodesToShow && mainNodesToShow.length > 0 ? mainNodesToShow : [...nodesAdded, ...nodesActive]);

      focusNodes.forEach((nodeId) => {
        const node = svgElement.querySelector('#n' + nodeId);
        if (node) {
          const cx = parseFloat(node.getAttribute('cx') || '0');
          const cy = parseFloat(node.getAttribute('cy') || '0');
          minX = Math.min(minX, cx);
          minY = Math.min(minY, cy);
          maxX = Math.max(maxX, cx);
          maxY = Math.max(maxY, cy);
          foundNodes++;
        }
      });

      console.log('[Tree] Found', foundNodes, 'allocated nodes for zoom calculation (DOM)');

      // Fallback: if DOM lookup failed to find nodes (race or SVG IDs missing),
      // compute bounds directly from the tree data (node coordinates) using the
      // parsed PoB node IDs. This ensures we can center on selected nodes even
      // when a saved viewBox is absent and the DOM isn't queryable yet.
      if ((foundNodes === 0 || !isFinite(minX)) && currentTreeData && currentSpec.parsedUrl?.nodes && currentSpec.parsedUrl.nodes.length > 0) {
        console.log('[Tree] DOM lookup failed, falling back to treeData coordinates for focus bounds');
        const nodeLookup = {};
        currentTreeData.graphs.forEach(graph => {
          if (graph.nodes) Object.assign(nodeLookup, graph.nodes);
        });

        let fallbackCount = 0;
        for (const nodeId of currentSpec.parsedUrl.nodes) {
          const n = nodeLookup[nodeId];
          if (n && typeof n.x === 'number' && typeof n.y === 'number') {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x);
            maxY = Math.max(maxY, n.y);
            fallbackCount++;
          }
        }

        if (fallbackCount > 0) {
          foundNodes = fallbackCount;
          console.log('[Tree] Fallback bounds found for', fallbackCount, 'nodes');
        } else {
          console.log('[Tree] Fallback also found no node coordinates');
        }
      }

      if (foundNodes > 0 && isFinite(minX)) {
        console.log('[Tree] Node bounds: minX=' + minX.toFixed(0) + ', maxX=' + maxX.toFixed(0) + ', minY=' + minY.toFixed(0) + ', maxY=' + maxY.toFixed(0));
      }

      // Always use the full tree viewBox as base
      const baseViewBox = typeof treeViewBox === 'object'
        ? [treeViewBox.x, treeViewBox.y, treeViewBox.w, treeViewBox.h].join(' ')
        : (treeViewBox || '-11436 -10569 22679 21254');

      // Parse base viewBox numbers
      const vbParts = baseViewBox.split(' ').map(function (v) { return parseFloat(v); });
      const vbX = vbParts[0];
      const vbY = vbParts[1];
      const vbW = vbParts[2];
      const vbH = vbParts[3];

      // Store original viewBox for zoom calculations
      window.treeViewBoxBase = { x: vbX, y: vbY, w: vbW, h: vbH };

      // Initial viewBox: zoom to focus area for sharp rendering
      var containerRect = (document.getElementById('tree-viewport') || svgWrapper).getBoundingClientRect();
      var containerWidth = containerRect.width;
      var containerHeight = containerRect.height;

      if (foundNodes > 0 && isFinite(minX)) {
        // For step progression events (arrow clicks), zoom to changed nodes without expansion
        // For manual input or initial load, show wider area with context
        const isStepEvent = (lastProgressionEvent === 'step' && (nodesAdded.length > 0 || nodesRemoved.length > 0));
        
        // Use moderate padding for step events to avoid over-zooming
        const padding = isStepEvent ? 2200 : 1250;
        
        let focusMinX = minX;
        let focusMaxX = maxX;
        let focusMinY = minY;
        let focusMaxY = maxY;
        
        // Only expand focus area for non-step events (manual selection, initial load)
        if (!isStepEvent) {
          const nodeSpreadX = maxX - minX;
          const nodeSpreadY = maxY - minY;
          const minSpread = 3000;
          
          if (nodeSpreadX < minSpread || nodeSpreadY < minSpread) {
            const treeCenterX = (vbX + vbW / 2);
            const treeCenterY = (vbY + vbH / 2);
            const nodeCenterX = (minX + maxX) / 2;
            const nodeCenterY = (minY + maxY) / 2;
            
            focusMinX = Math.min(minX, Math.min(nodeCenterX, treeCenterX) - minSpread / 2);
            focusMaxX = Math.max(maxX, Math.max(nodeCenterX, treeCenterX) + minSpread / 2);
            focusMinY = Math.min(minY, Math.min(nodeCenterY, treeCenterY) - minSpread / 2);
            focusMaxY = Math.max(maxY, Math.max(nodeCenterY, treeCenterY) + minSpread / 2);
            
            console.log('[Tree] Expanded focus area to include more context (manual selection)');
          }
        } else {
          console.log('[Tree] Step event - focusing tightly on changed nodes (padding=' + padding + ')');
        }
        
        const focusCenterX = (focusMinX + focusMaxX) / 2;
        const focusCenterY = (focusMinY + focusMaxY) / 2;
        const focusWidth = (focusMaxX - focusMinX) + padding * 2;
        const focusHeight = (focusMaxY - focusMinY) + padding * 2;
        
        // Adjust viewBox dimensions to match container aspect ratio
        const containerAspect = containerWidth / containerHeight;
        const focusAspect = focusWidth / focusHeight;
        
        let finalWidth = focusWidth;
        let finalHeight = focusHeight;
        
        if (containerAspect > focusAspect) {
          finalWidth = focusHeight * containerAspect;
        } else {
          finalHeight = focusWidth / containerAspect;
        }
        
        // Set viewBox to show focus area - this keeps SVG sharp!
        const newVbX = focusCenterX - finalWidth / 2;
        const newVbY = focusCenterY - finalHeight / 2;
        
        svgElement.setAttribute('viewBox', newVbX + ' ' + newVbY + ' ' + finalWidth + ' ' + finalHeight);
        console.log('[Tree] Set initial viewBox to focus area');
      } else {
        svgElement.setAttribute('viewBox', baseViewBox);
      }

      // Persist render state for next diff
      window.__lastRenderedNodes = new Set(nodesToShow);
      window.__lastRenderedSpecIndex = currentIndex;

      // Debug: sample node
      const sampleNodeId = nodesAdded[0] || nodesActive[0];
      if (sampleNodeId) {
  const nodeElement = svgElement.querySelector('#n' + sampleNodeId);
        console.log('[Tree] Sample node #' + sampleNodeId + ' exists:', !!nodeElement, nodeElement?.tagName || '');
        if (nodeElement) {
          console.log('[Tree] Sample node fill:', window.getComputedStyle(nodeElement).fill);
        }
      }

      updateNavigation();
    }

    function zoomIn() {
      const svgElement = document.querySelector('#tree-svg svg');
      if (!svgElement) return;
      
      const viewport = document.getElementById('tree-viewport');
      const rect = viewport.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      zoomViewBoxToPoint(svgElement, centerX, centerY, 0.8); // Smaller viewBox = zoom in
      saveViewBoxState(svgElement);
    }

    function zoomOut() {
      const svgElement = document.querySelector('#tree-svg svg');
      if (!svgElement) return;
      
      const viewport = document.getElementById('tree-viewport');
      const rect = viewport.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      zoomViewBoxToPoint(svgElement, centerX, centerY, 1.25); // Bigger viewBox = zoom out
      saveViewBoxState(svgElement);
    }

    function resetZoom() {
      const svgElement = document.querySelector('#tree-svg svg');
      if (!svgElement || !window.treeViewBoxBase) return;
      
      const base = window.treeViewBoxBase;
      svgElement.setAttribute('viewBox', base.x + ' ' + base.y + ' ' + base.w + ' ' + base.h);
      saveViewBoxState(svgElement);
    }

    function zoomViewBoxToPoint(svgElement, screenX, screenY, scaleFactor) {
      const vb = svgElement.viewBox.baseVal;
      const oldX = vb.x;
      const oldY = vb.y;
      const oldW = vb.width;
      const oldH = vb.height;
      
      const container = svgElement.getBoundingClientRect();
      const containerW = container.width;
      const containerH = container.height;
      
      // Convert screen point to SVG coordinates
      const svgX = oldX + (screenX / containerW) * oldW;
      const svgY = oldY + (screenY / containerH) * oldH;
      
      // Calculate new viewBox dimensions
      const newW = oldW * scaleFactor;
      const newH = oldH * scaleFactor;
      
      // Constrain to reasonable limits
      const base = window.treeViewBoxBase;
      const minW = Math.max(base.w * 0.05, 500);
      const maxW = base.w * 2;
      const minH = Math.max(base.h * 0.05, 500);
      const maxH = base.h * 2;
      
      const finalW = Math.max(minW, Math.min(maxW, newW));
      const finalH = Math.max(minH, Math.min(maxH, newH));
      
      // Keep the point under cursor in same place
      const newX = svgX - (svgX - oldX) * (finalW / oldW);
      const newY = svgY - (svgY - oldY) * (finalH / oldH);
      
      svgElement.setAttribute('viewBox', newX + ' ' + newY + ' ' + finalW + ' ' + finalH);
    }

    function panViewBox(svgElement, dx, dy) {
      const vb = svgElement.viewBox.baseVal;
      const container = svgElement.getBoundingClientRect();
      
      // Convert screen delta to SVG delta
      const svgDx = dx * (vb.width / container.width);
      const svgDy = dy * (vb.height / container.height);
      
      svgElement.setAttribute('viewBox', (vb.x - svgDx) + ' ' + (vb.y - svgDy) + ' ' + vb.width + ' ' + vb.height);
    }

    // Pan handling
    const viewport = document.getElementById('tree-viewport');
    
    viewport.addEventListener('mousedown', (e) => {
      isPanning = true;
      lastPanPosition = { x: e.clientX, y: e.clientY };
      viewport.classList.add('panning');
    });

    viewport.addEventListener('mousemove', (e) => {
      if (!isPanning) return;
      
      const svgElement = document.querySelector('#tree-svg svg');
      if (!svgElement) return;
      
      const dx = e.clientX - lastPanPosition.x;
      const dy = e.clientY - lastPanPosition.y;
      
      panViewBox(svgElement, dx, dy);
      
      lastPanPosition = { x: e.clientX, y: e.clientY };
    });

    viewport.addEventListener('mouseup', () => {
      isPanning = false;
      viewport.classList.remove('panning');
      // Save viewBox after panning stops
      const svgElement = document.querySelector('#tree-svg svg');
      if (svgElement) saveViewBoxState(svgElement);
    });

    viewport.addEventListener('mouseleave', () => {
      isPanning = false;
      viewport.classList.remove('panning');
      // Save viewBox after panning stops
      const svgElement = document.querySelector('#tree-svg svg');
      if (svgElement) saveViewBoxState(svgElement);
    });

    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      
      const svgElement = document.querySelector('#tree-svg svg');
      if (!svgElement) return;
      
      const rect = viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Zoom toward/away from mouse cursor
      const scaleFactor = e.deltaY > 0 ? 1.25 : 0.8;
      zoomViewBoxToPoint(svgElement, mouseX, mouseY, scaleFactor);
      saveViewBoxState(svgElement);
    });

    // Setup node hover tooltips if setting is enabled
    async function setupNodeTooltips() {
      try {
        const { ipcRenderer } = require('electron');
        
        // Get the setting from leveling window UI settings
        // Use local variable (not on window) and default to poe1
        const overlayVersion = (typeof currentGameVersion !== 'undefined' && currentGameVersion) ? currentGameVersion : 'poe1';
        const levelingKey = overlayVersion === 'poe1' ? 'levelingWindowPoe1' : 'levelingWindowPoe2';
        const levelingSettings = await ipcRenderer.invoke('get-setting', levelingKey);
        const showTooltips = levelingSettings?.uiSettings?.showTreeNodeDetails || false;
        
        console.log('[Tree] Overlay version:', overlayVersion);
        console.log('[Tree] Leveling settings:', levelingSettings);
        console.log('[Tree] Show tooltips setting:', showTooltips);
        
        if (!showTooltips) {
          console.log('[Tree] Node tooltips disabled');
          return;
        }
        
        console.log('[Tree] Setting up node tooltips...');
        
        // Create tooltip element
        const tooltip = document.createElement('div');
        tooltip.id = 'node-tooltip';
        tooltip.style.cssText = \`
          position: fixed;
          background: rgba(0, 0, 0, 0.95);
          color: white;
          padding: 12px 16px;
          border-radius: 6px;
          font-size: 13px;
          line-height: 1.6;
          pointer-events: none;
          z-index: 100000;
          display: none;
          max-width: 350px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        \`;
        document.body.appendChild(tooltip);
        
        // Get current tree data (use local variable, not window)
        const treeData = (typeof currentTreeData !== 'undefined') ? currentTreeData : null;
        if (!treeData || !treeData.graphs) {
          console.warn('[Tree] No tree data available for tooltips');
          return;
        }
        
        // Build a lookup map of all nodes from all graphs
        const nodeLookup = {};
        treeData.graphs.forEach(graph => {
          if (graph.nodes) {
            Object.entries(graph.nodes).forEach(([nodeId, nodeData]) => {
              nodeLookup[nodeId] = nodeData;
            });
          }
        });
        
        console.log('[Tree] Built node lookup with', Object.keys(nodeLookup).length, 'nodes');
        
        // Get current spec to access mastery selections
        const getCurrentMasteries = () => {
          if (typeof currentIndex !== 'undefined' && typeof currentSpecs !== 'undefined' && currentSpecs[currentIndex]) {
            return currentSpecs[currentIndex].parsedUrl?.masteries || {};
          }
          return {};
        };
        
        // Add hover listeners to all node circles in the SVG
        document.addEventListener('mouseover', (e) => {
          const target = e.target;
          const tag = (target && target.tagName ? String(target.tagName) : '').toLowerCase();
          const elemId = (target && target.id) ? String(target.id) : '';
          if (tag === 'circle' && elemId && elemId.startsWith('n')) {
            const nodeId = elemId.substring(1); // Remove 'n' prefix
            const nodeData = nodeLookup[nodeId];
            
            if (nodeData) {
              const nodeName = nodeData.text || 'Unknown Node';
              const stats = nodeData.stats || [];
              
              let tooltipHTML = \`<div style="font-weight: 600; margin-bottom: 8px; color: #4a9eff;">\${nodeName}</div>\`;
              
              // Check if this is a mastery node and if a specific effect is selected
              const masteries = getCurrentMasteries();
              const selectedEffectId = masteries[nodeId];
              
              if (nodeData.k === 'Mastery' && selectedEffectId && treeData.masteryEffects && treeData.masteryEffects[selectedEffectId]) {
                const masteryEffect = treeData.masteryEffects[selectedEffectId];
                if (masteryEffect.stats && masteryEffect.stats.length > 0) {
                  tooltipHTML += \`<div style="color: #ffd700; font-size: 12px; font-weight: 600; margin-top: 8px;">Selected Mastery:</div>\`;
                  tooltipHTML += \`<div style="color: #90ee90; font-size: 12px;">\`;
                  masteryEffect.stats.forEach(stat => {
                    tooltipHTML += \`<div style="margin: 2px 0;">• \${stat}</div>\`;
                  });
                  tooltipHTML += \`</div>\`;
                }
              } else if (stats.length > 0) {
                tooltipHTML += \`<div style="color: #b0b0b0; font-size: 12px;">\`;
                stats.forEach(stat => {
                  tooltipHTML += \`<div style="margin: 2px 0;">• \${stat}</div>\`;
                });
                tooltipHTML += \`</div>\`;
              }
              
              tooltip.innerHTML = tooltipHTML;
              tooltip.style.display = 'block';
              
              // Position tooltip near mouse
              const updateTooltipPosition = (event) => {
                tooltip.style.left = (event.clientX + 15) + 'px';
                tooltip.style.top = (event.clientY + 15) + 'px';
              };
              
              updateTooltipPosition(e);
              
              const mouseMoveHandler = (event) => updateTooltipPosition(event);
              const mouseOutHandler = () => {
                tooltip.style.display = 'none';
                document.removeEventListener('mousemove', mouseMoveHandler);
                if (target && target.removeEventListener) target.removeEventListener('mouseout', mouseOutHandler);
              };
              
              document.addEventListener('mousemove', mouseMoveHandler);
              if (target && target.addEventListener) target.addEventListener('mouseout', mouseOutHandler);
            }
          }
        });
        
        console.log('[Tree] Node tooltips enabled');
      } catch (e) {
        console.error('[Tree] Failed to setup tooltips:', e);
      }
    }

    console.log('[Tree Window] Ready');
  </script>
</body>
</html>`;
}

export function createPassiveTreeWindow(): BrowserWindow {
  if (treeWindow && !treeWindow.isDestroyed()) {
    treeWindow.focus();
    return treeWindow;
  }

  const savedBounds = loadTreeWindowBounds();
  const defaultBounds = { width: 900, height: 700, x: 120, y: 120 };
  const bounds = savedBounds || defaultBounds;
  const ultraMinimal = savedBounds?.ultraMinimal || false;
  const pinned = savedBounds?.pinned !== undefined ? savedBounds.pinned : true; // Default to always on top
  const simplifiedView = savedBounds?.simplifiedView || false;
  currentUltraMinimal = ultraMinimal;
  currentPinned = pinned;

  treeWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: pinned,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  treeWindow.setIgnoreMouseEvents(false);

  // Register with overlay z-order manager
  try { registerOverlayWindow('tree', treeWindow, pinned, false); } catch {}

  const html = buildTreeWindowHtml(ultraMinimal, pinned, simplifiedView);
  const base64Html = Buffer.from(html, 'utf-8').toString('base64');
  treeWindow.loadURL(`data:text/html;charset=utf-8;base64,${base64Html}`);

  treeWindow.webContents.on('console-message', (_event, level, message) => {
    // Strip base64 noise from logs
    const cleanMessage = message.split('(data:text/html')[0].trim();
    if (cleanMessage) {
      console.log('[Tree Window console][' + level + '] ' + cleanMessage);
    }
  });

  // Enable F12 to open DevTools for debugging
  treeWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown' && treeWindow) {
      if (treeWindow.webContents.isDevToolsOpened()) {
        treeWindow.webContents.closeDevTools();
      } else {
        treeWindow.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });

  // Save bounds on move or resize
  const saveBounds = () => {
    if (!treeWindow || treeWindow.isDestroyed()) return;
    const bounds = treeWindow.getBounds();
    saveTreeWindowBounds(bounds, currentUltraMinimal, undefined, currentPinned);
  };

  treeWindow.on('moved', saveBounds);
  treeWindow.on('resized', saveBounds);

  treeWindow.on('closed', () => {
    unregisterOverlayWindow('tree');
    treeWindow = null;
  });
  
  // Handle ultra minimal mode toggle
  ipcMain.on('tree-window-toggle-minimal', (event, isMinimal) => {
    if (!treeWindow || treeWindow.isDestroyed()) return;
    currentUltraMinimal = isMinimal;
    // Save the state immediately
    const bounds = treeWindow.getBounds();
    const savedState = loadTreeWindowBounds();
    saveTreeWindowBounds(bounds, currentUltraMinimal, savedState?.viewBox, currentPinned, savedState?.simplifiedView);
  });
  
  // Handle pin toggle
  ipcMain.on('tree-window-toggle-pinned', (event, isPinned) => {
    if (!treeWindow || treeWindow.isDestroyed()) return;
    currentPinned = isPinned;
    
    // Update via windowZManager instead of setting directly
    try { registerOverlayWindow('tree', treeWindow, isPinned, false); } catch {}
    
    // Save the state immediately
    const bounds = treeWindow.getBounds();
    const savedState = loadTreeWindowBounds();
    saveTreeWindowBounds(bounds, currentUltraMinimal, savedState?.viewBox, currentPinned, savedState?.simplifiedView);
  });

  // Handle viewBox state changes (zoom/pan)
  ipcMain.on('tree-window-viewbox-changed', (event, viewBox: { x: number; y: number; width: number; height: number }) => {
    if (!treeWindow || treeWindow.isDestroyed()) return;
    // Save the viewBox state along with bounds
    const bounds = treeWindow.getBounds();
    const savedState = loadTreeWindowBounds();
    saveTreeWindowBounds(bounds, currentUltraMinimal, viewBox, currentPinned, savedState?.simplifiedView);
  });

  // Handle simplified view toggle
  ipcMain.on('tree-window-simplified-view-changed', (event, isSimplified: boolean) => {
    if (!treeWindow || treeWindow.isDestroyed()) return;
    // Save the simplified view state along with bounds
    const bounds = treeWindow.getBounds();
    const savedState = loadTreeWindowBounds();
    saveTreeWindowBounds(bounds, currentUltraMinimal, savedState?.viewBox, currentPinned, isSimplified);
  });

  // Explicit focus request from renderer (e.g., when clicking the node input)
  ipcMain.on('tree-window-request-focus', () => {
    if (!treeWindow || treeWindow.isDestroyed()) return;
    try { bringToFront('tree'); } catch {}
    treeWindow.focus();
    treeWindow.webContents.focus();
  });

  // Bring window to front when first opened
  bringToFront('tree');

  return treeWindow;
}

export function getPassiveTreeWindow(): BrowserWindow | null {
  return treeWindow;
}

export function sendTreeData(treeSpecs: any[], gameVersion: 'poe1' | 'poe2' = 'poe1', currentAct: number = 1, characterLevel: number = 1, autoDetectEnabled: boolean = true, savedTreeIndex?: number, treeVersion: string = '3_26', buildSource?: 'pob' | 'mobalytics' | 'maxroll'): void {
  if (!treeWindow || treeWindow.isDestroyed()) {
    console.warn('[Tree Window] Cannot send tree data - window not available');
    return;
  }

  let treeSvg = '';
  let viewBox = '';
  let treeData: any = null;

  try {
    const template = require('../../shared/pob/treeLoader');
    
    // Use appropriate tree based on game version and tree version
    if (gameVersion === 'poe2') {
      treeSvg = template.poe2Template?.svg || '';
      viewBox = template.poe2Template?.viewBox || '';
      treeData = template.skillTreePoe2;
      console.log('[Tree Window] Using PoE2 tree template');
    } else {
      // For PoE1, use tree version to select the correct tree
      if (treeVersion === '3_27') {
        treeSvg = template.template327?.svg || '';
        viewBox = template.template327?.viewBox || '';
        treeData = template.skillTree327;
        console.log('[Tree Window] Using PoE1 3.27 tree template');
      } else {
        // Default to 3.26
        treeSvg = template.template326?.svg || '';
        viewBox = template.template326?.viewBox || '';
        treeData = template.skillTree326;
        console.log('[Tree Window] Using PoE1 3.26 tree template');
      }
    }
    
    console.log('[Tree Window] Prepared template for payload', {
      gameVersion,
      treeVersion,
      svgLength: treeSvg?.length || 0,
      viewBox,
      hasTreeData: !!treeData,
    });
  } catch (err) {
    console.error('[Tree Window] Failed to load tree template for payload:', err);
  }

  // Filter out empty header-style specs (no allocated nodes)
  const filteredSpecs = Array.isArray(treeSpecs) ? treeSpecs.filter((spec) => {
    const a = (spec as any)?.parsedUrl?.nodes;
    const b = (spec as any)?.allocatedNodes;
    const hasNodes = (Array.isArray(a) && a.length > 0) || (Array.isArray(b) && b.length > 0);
    return !!hasNodes;
  }) : [];

  console.log('[Tree Window] Sending tree data to renderer', {
    specCount: filteredSpecs?.length || 0,
    hasSvg: !!treeSvg,
    gameVersion,
    treeVersion,
    currentAct,
    characterLevel,
    autoDetectEnabled,
    savedTreeIndex,
    buildSource,
  });

  // Load saved viewBox state
  const savedBounds = loadTreeWindowBounds();
  const savedViewBox = savedBounds?.viewBox;

  treeWindow.webContents.send('tree-data-update', {
    specs: filteredSpecs,
    treeSvg,
    viewBox,
    treeData,
    gameVersion,
    treeVersion,
    currentAct,
    characterLevel,
    autoDetectEnabled,
    savedTreeIndex,
    savedViewBox,
    buildSource, // Send buildSource to renderer for node progression UI
  });
}

export function isTreeWindowOpen(): boolean {
  return treeWindow !== null && !treeWindow.isDestroyed();
}

export function updateTreeWindowContext(currentAct: number, characterLevel: number): void {
  if (!treeWindow || treeWindow.isDestroyed()) return;
  
  // Send context update so the tree window can re-evaluate the best spec
  treeWindow.webContents.send('tree-context-update', {
    currentAct,
    characterLevel,
  });
}

export function closeTreeWindow() {
  if (treeWindow && !treeWindow.isDestroyed()) {
    treeWindow.close();
    treeWindow = null;
  }
}
