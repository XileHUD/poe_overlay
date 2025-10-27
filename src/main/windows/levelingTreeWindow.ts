/**
 * Passive Tree Window
 * 
 * Displays PoB passive skill tree progression with pan/zoom viewport.
 * Shows delta between tree specs (active/added/removed nodes).
 */

import { BrowserWindow, screen, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

const TREE_WINDOW_BOUNDS_FILE = path.join(app.getPath('userData'), 'tree-window-bounds.json');

let treeWindow: BrowserWindow | null = null;
let currentUltraMinimal: boolean = false;

interface TreeWindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  ultraMinimal?: boolean;
}

function saveTreeWindowBounds(bounds: { x: number; y: number; width: number; height: number }, ultraMinimal?: boolean) {
  try {
    const state: TreeWindowState = { ...bounds, ultraMinimal };
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

function buildTreeWindowHtml(ultraMinimal: boolean = false): string {
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
      z-index: 10;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
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
    }

    #spec-selector:hover {
      border-color: #4a4a4a;
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
    }

    #tree-viewport {
      width: 100%;
      height: 100%;
      cursor: grab;
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
    }

    #tree-svg svg {
      display: block;
      transform-origin: center center;
      will-change: transform;
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
      fill: transparent;
      stroke: transparent;
    }

    svg .border {
      fill: none;
      stroke: hsl(215, 15%, 40%);
      stroke-width: 20;
    }

    svg .ascendancy {
      opacity: 0.15;
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
      pointer-events: none;
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
    }

    #zoom-controls button {
      background: rgba(42, 42, 42, 0.95);
      color: #c8c8c8;
      border: 1px solid #3a3a3a;
      width: 32px;
      height: 32px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      font-weight: bold;
      transition: all 0.2s;
    }

    #zoom-controls button:hover {
      background: #3a3a3a;
      border-color: #4a4a4a;
    }
  </style>
</head>
<body>
  <div id="window-container">
    <div id="header">
      <div id="header-controls">
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
    </div>
  </div>

  <script>
    const { ipcRenderer } = require('electron');
    
    let treeSvgData = '';
    let treeViewBox = '';
    let currentSpecs = [];
    let currentIndex = 0;
    let currentGameVersion = 'poe1'; // Track game version
    let currentTreeData = null; // Store tree data for connection coloring
    let isPanning = false;
    let lastPanPosition = { x: 0, y: 0 };
    let isUltraMinimal = ${ultraMinimal};

    window.addEventListener('error', (event) => {
      console.error('[Tree Window] Uncaught error:', event.message, event.filename, event.lineno, event.colno);
    });

    // Listen for tree data from main process
    ipcRenderer.on('tree-data-update', (event, payload) => {
      if (!payload) {
        console.error('[Tree Window] Tree data update received without payload');
        return;
      }

      const { specs, treeSvg, viewBox, treeData, gameVersion, currentAct, characterLevel } = payload;

      if (!specs || specs.length === 0) {
        console.error('[Tree Window] No specs received!');
        return;
      }

      treeSvgData = treeSvg || '';
      treeViewBox = viewBox || '';
      currentSpecs = specs;
      currentGameVersion = gameVersion || 'poe1'; // Store game version
      currentTreeData = treeData; // Store tree data for connection lookup
      
      // Use smart matching to find the best spec to display initially
      const bestSpecIndex = findBestTreeSpec(specs, currentAct || 1, characterLevel || 1);
      currentIndex = bestSpecIndex;

      console.log('[Tree Window] Calling populateSelector...');
      populateSelector();
      console.log('[Tree Window] Calling renderTree...');
      renderTree();
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
    function findBestTreeSpec(specs, currentAct, characterLevel) {
      if (!specs || specs.length === 0) return 0;
      
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
      
      // Ultimate fallback: use index-based matching (old behavior)
      const fallbackIndex = Math.min(currentAct - 1, specs.length - 1);
      console.log(\`[Tree Window] Using fallback index-based match: index \${fallbackIndex}\`);
      return fallbackIndex;
    }
    
    // Listen for context updates (act/level changes)
    ipcRenderer.on('tree-context-update', (event, payload) => {
      const { currentAct, characterLevel } = payload;
      if (currentSpecs && currentSpecs.length > 0) {
        const bestSpecIndex = findBestTreeSpec(currentSpecs, currentAct, characterLevel);
        if (bestSpecIndex !== currentIndex) {
          console.log(\`[Tree Window] Context changed, switching from spec \${currentIndex} to \${bestSpecIndex}\`);
          currentIndex = bestSpecIndex;
          document.getElementById('spec-selector').value = currentIndex;
          renderTree();
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
      selector.innerHTML = currentSpecs.map((spec, i) => 
        \`<option value="\${i}">\${spec.title || \`Tree \${i + 1}\`}</option>\`
      ).join('');
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

    function selectSpec() {
      currentIndex = parseInt(document.getElementById('spec-selector').value);
      renderTree();
    }

    function previousSpec() {
      if (currentIndex > 0) {
        currentIndex--;
        document.getElementById('spec-selector').value = currentIndex;
        renderTree();
      }
    }

    function nextSpec() {
      if (currentIndex < currentSpecs.length - 1) {
        currentIndex++;
        document.getElementById('spec-selector').value = currentIndex;
        renderTree();
      }
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

      const currentNodes = new Set(currentSpec.parsedUrl?.nodes || []);
      const previousNodes = new Set(previousSpec?.parsedUrl?.nodes || []);

      const nodesActive = [...previousNodes].filter(id => currentNodes.has(id));
      const nodesAdded = [...currentNodes].filter(id => !previousNodes.has(id));
      const nodesRemoved = [...previousNodes].filter(id => !currentNodes.has(id));

      console.log(\`[Tree] Delta - Active: \${nodesActive.length}, Added: \${nodesAdded.length}, Removed: \${nodesRemoved.length}\`);
      if (nodesAdded.length > 0) {
        console.log('[Tree] Sample added nodes:', nodesAdded.slice(0, 5));
      }

      // Generate CSS for node highlighting
      const activeStyles = nodesActive.map(id => \`#n\${id}\`).join(', ');
      const addedStyles = nodesAdded.map(id => \`#n\${id}\`).join(', ');
      const removedStyles = nodesRemoved.map(id => \`#n\${id}\`).join(', ');
      
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

      // Get ascendancy ID if present
      const ascendancyId = currentSpec.parsedUrl?.ascendancyId;

      const dynamicCSS = \`
        <style id="tree-dynamic-css">
          svg .nodes { fill: hsl(215, 15%, 50%); stroke: hsl(215, 15%, 50%); stroke-width: 0; }
          svg .connections { fill: none; stroke: hsl(215, 15%, 40%); stroke-width: 20; }
          svg .mastery { fill: transparent; stroke: transparent; }
          svg .border { fill: none; stroke: hsl(215, 15%, 40%); stroke-width: 20; }
          svg .ascendancy { opacity: 0.15; }
          \${ascendancyId ? \`svg .ascendancy.\${ascendancyId} { opacity: 1 !important; }\` : ''}
          \${activeStyles ? \`svg :is(\${activeStyles}) { fill: hsl(200, 80%, 50%) !important; stroke: hsl(200, 80%, 50%) !important; }\` : ''}
          \${addedStyles ? \`svg :is(\${addedStyles}) { fill: hsl(120, 90%, 50%) !important; stroke: hsl(120, 90%, 50%) !important; }\` : ''}
          \${removedStyles ? \`svg :is(\${removedStyles}) { fill: hsl(0, 90%, 50%) !important; stroke: hsl(0, 90%, 50%) !important; }\` : ''}
          \${activeConnStyles ? \`svg :is(\${activeConnStyles}) { stroke: hsl(200, 80%, 40%) !important; stroke-width: 35 !important; }\` : ''}
          \${addedConnStyles ? \`svg :is(\${addedConnStyles}) { stroke: hsl(120, 90%, 40%) !important; stroke-width: 35 !important; }\` : ''}
          \${removedConnStyles ? \`svg :is(\${removedConnStyles}) { stroke: hsl(0, 90%, 40%) !important; stroke-width: 35 !important; }\` : ''}
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

      // Calculate focus bounds for allocated nodes
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let foundNodes = 0;

      const allNodes = [...nodesAdded, ...nodesActive];
      allNodes.forEach((nodeId) => {
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

      console.log('[Tree] Found', foundNodes, 'allocated nodes for zoom calculation');
      
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
      const padding = 1250;

      if (foundNodes > 0 && isFinite(minX)) {
        // If we have very few nodes in a small area, expand the focus to include more context
        let focusMinX = minX;
        let focusMaxX = maxX;
        let focusMinY = minY;
        let focusMaxY = maxY;
        
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
          
          console.log('[Tree] Expanded focus area to include more context');
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
    }

    function zoomOut() {
      const svgElement = document.querySelector('#tree-svg svg');
      if (!svgElement) return;
      
      const viewport = document.getElementById('tree-viewport');
      const rect = viewport.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      zoomViewBoxToPoint(svgElement, centerX, centerY, 1.25); // Bigger viewBox = zoom out
    }

    function resetZoom() {
      const svgElement = document.querySelector('#tree-svg svg');
      if (!svgElement || !window.treeViewBoxBase) return;
      
      const base = window.treeViewBoxBase;
      svgElement.setAttribute('viewBox', base.x + ' ' + base.y + ' ' + base.w + ' ' + base.h);
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
    });

    viewport.addEventListener('mouseleave', () => {
      isPanning = false;
      viewport.classList.remove('panning');
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
    });

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
  currentUltraMinimal = ultraMinimal;

  treeWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  treeWindow.setIgnoreMouseEvents(false);

  const html = buildTreeWindowHtml(ultraMinimal);
  const base64Html = Buffer.from(html, 'utf-8').toString('base64');
  treeWindow.loadURL(`data:text/html;charset=utf-8;base64,${base64Html}`);

  treeWindow.webContents.on('console-message', (_event, level, message) => {
    // Strip base64 noise from logs
    const cleanMessage = message.split('(data:text/html')[0].trim();
    if (cleanMessage) {
      console.log('[Tree Window console][' + level + '] ' + cleanMessage);
    }
  });

  // Save bounds on move or resize
  const saveBounds = () => {
    if (!treeWindow || treeWindow.isDestroyed()) return;
    const bounds = treeWindow.getBounds();
    saveTreeWindowBounds(bounds, currentUltraMinimal);
  };

  treeWindow.on('moved', saveBounds);
  treeWindow.on('resized', saveBounds);

  treeWindow.on('closed', () => {
    treeWindow = null;
  });
  
  // Handle ultra minimal mode toggle
  ipcMain.on('tree-window-toggle-minimal', (event, isMinimal) => {
    if (!treeWindow || treeWindow.isDestroyed()) return;
    currentUltraMinimal = isMinimal;
    // Save the state immediately
    const bounds = treeWindow.getBounds();
    saveTreeWindowBounds(bounds, currentUltraMinimal);
  });

  return treeWindow;
}

export function getPassiveTreeWindow(): BrowserWindow | null {
  return treeWindow;
}

export function sendTreeData(treeSpecs: any[], gameVersion: 'poe1' | 'poe2' = 'poe1', currentAct: number = 1, characterLevel: number = 1): void {
  if (!treeWindow || treeWindow.isDestroyed()) {
    console.warn('[Tree Window] Cannot send tree data - window not available');
    return;
  }

  let treeSvg = '';
  let viewBox = '';
  let treeData: any = null;

  try {
    const template = require('../../shared/pob/treeLoader');
    
    // Use appropriate tree based on game version
    if (gameVersion === 'poe2') {
      treeSvg = template.poe2Template?.svg || '';
      viewBox = template.poe2Template?.viewBox || '';
      treeData = template.skillTreePoe2;
      console.log('[Tree Window] Using PoE2 tree template');
    } else {
      treeSvg = template.svg;
      viewBox = template.viewBox;
      treeData = template.skillTree;
      console.log('[Tree Window] Using PoE1 tree template');
    }
    
    console.log('[Tree Window] Prepared template for payload', {
      gameVersion,
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
    currentAct,
    characterLevel,
  });

  treeWindow.webContents.send('tree-data-update', {
    specs: filteredSpecs,
    treeSvg,
    viewBox,
    treeData,
    gameVersion,
    currentAct,
    characterLevel,
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
