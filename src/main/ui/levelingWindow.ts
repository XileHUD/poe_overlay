import { BrowserWindow, screen, ipcMain } from 'electron';
import { SettingsService } from '../services/settingsService.js';
import { buildLevelingPopoutHtml } from '../popouts/levelingPopoutTemplate.js';
import { openLevelingSettingsSplash } from './levelingSettingsSplash.js';
import { openPobInfoBar, closePobInfoBar, updatePobInfoBar } from './pobInfoBar.js';
import { openLevelingGemsWindow, updateLevelingGemsWindow, updateLevelingGemsWindowBuild, closeLevelingGemsWindow } from './levelingGemsWindow.js';
import { createPassiveTreeWindow, sendTreeData } from '../windows/levelingTreeWindow.js';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { execSync } from 'child_process';
import type { OverlayVersion } from '../../types/overlayVersion.js';
import { 
  parsePobCode, 
  extractUniqueGems, 
  matchGemsToQuestSteps,
  calculateTreeProgressionByAct,
  type StoredPobBuild,
  type GemSocketGroup
} from '../../shared/pob/index.js';

export interface LevelingWindowParams {
  settingsService: SettingsService;
  overlayVersion: OverlayVersion;
}

export class LevelingWindow {
  private window: BrowserWindow | null = null;
  private settingsService: SettingsService;
  private overlayVersion: OverlayVersion;
  private levelingData: any = null;
  private zoneRegistry: any = null;
  private completedSteps: Set<string> = new Set();
  private layoutMode: 'tall' | 'wide' = 'tall';
  private isWideMode = false;

  constructor(params: LevelingWindowParams) {
    this.settingsService = params.settingsService;
    this.overlayVersion = params.overlayVersion;
    const saved = this.settingsService.get(this.getLevelingWindowKey());
    this.isWideMode = saved?.wideMode ?? false;
    this.loadLevelingData();
    this.loadZoneRegistry();
    this.loadProgress();
    this.registerIpcHandlers();
    
    // Auto-detect client.txt on first run (if not already attempted)
    this.autoDetectClientTxtOnStartup();
  }

  // Helper methods to get game-specific setting keys
  private getClientTxtPathKey(): 'clientTxtPathPoe1' | 'clientTxtPathPoe2' {
    return this.overlayVersion === 'poe1' ? 'clientTxtPathPoe1' : 'clientTxtPathPoe2';
  }

  private getClientTxtAutoDetectedKey(): 'clientTxtAutoDetectedPoe1' | 'clientTxtAutoDetectedPoe2' {
    return this.overlayVersion === 'poe1' ? 'clientTxtAutoDetectedPoe1' : 'clientTxtAutoDetectedPoe2';
  }

  private getClientTxtLastCheckedKey(): 'clientTxtLastCheckedPoe1' | 'clientTxtLastCheckedPoe2' {
    return this.overlayVersion === 'poe1' ? 'clientTxtLastCheckedPoe1' : 'clientTxtLastCheckedPoe2';
  }

  private getClientTxtDetectionAttemptedKey(): 'clientTxtDetectionAttemptedPoe1' | 'clientTxtDetectionAttemptedPoe2' {
    return this.overlayVersion === 'poe1' ? 'clientTxtDetectionAttemptedPoe1' : 'clientTxtDetectionAttemptedPoe2';
  }

  private getClientTxtNotificationShownKey(): 'clientTxtNotificationShownPoe1' | 'clientTxtNotificationShownPoe2' {
    return this.overlayVersion === 'poe1' ? 'clientTxtNotificationShownPoe1' : 'clientTxtNotificationShownPoe2';
  }

  private getLevelingWindowKey(): 'levelingWindowPoe1' | 'levelingWindowPoe2' {
    return this.overlayVersion === 'poe1' ? 'levelingWindowPoe1' : 'levelingWindowPoe2';
  }

  show(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      return;
    }
    this.createWindow();
    this.settingsService.update(this.getLevelingWindowKey(), (c) => ({ ...c, enabled: true }));
  }

  hide(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.savePosition();
      this.window.close();
      this.window = null;
    }
    this.settingsService.update(this.getLevelingWindowKey(), (c) => ({ ...c, enabled: false }));
  }

  toggle(): void {
    this.isVisible() ? this.hide() : this.show();
  }

  isVisible(): boolean {
    return !!this.window && !this.window.isDestroyed() && this.window.isVisible();
  }

  toggleWideMode(): void {
    this.isWideMode = !this.isWideMode;
    this.settingsService.update(this.getLevelingWindowKey(), (c) => ({
      ...c,
      wideMode: this.isWideMode,
    }));

    if (this.window && !this.window.isDestroyed()) {
      const { w, h } = this.getTargetSize();
      this.window.setSize(w, h);
      this.window.webContents.send('leveling-layout-mode', this.isWideMode ? 'wide' : 'tall');
    }
  }

  private createWindow(): void {
    const saved = this.settingsService.get(this.getLevelingWindowKey());
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    const { w, h } = this.getTargetSize();
    const x = saved?.position?.x ?? Math.round(width - w - 20);
    const y = saved?.position?.y ?? 20;

    this.window = new BrowserWindow({
      width: w,
      height: h,
      x,
      y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false,
      },
    });

    // Set higher z-order
    try {
      this.window.setAlwaysOnTop(true, 'pop-up-menu');
    } catch (e) {
      console.warn('[LevelingWindow] Failed to set z-order:', e);
    }

    this.window.setIgnoreMouseEvents(false);

    // Load inline HTML (like floating button does)
    this.window.loadURL(this.buildDataUrl());

    // Check if there's a saved PoB build and auto-open the info bar
    this.window.webContents.once('did-finish-load', () => {
      const saved = this.settingsService.get(this.getLevelingWindowKey());
      const pobBuild = (saved as any)?.pobBuild;
      if (pobBuild) {
        console.log('[LevelingWindow] Found saved PoB build, opening info bar');
        const currentActIndex = (saved as any)?.currentActIndex ?? 0;
        openPobInfoBar({
          settingsService: this.settingsService,
          overlayVersion: this.overlayVersion,
          pobBuild: pobBuild,
          currentAct: currentActIndex + 1
        });
      }
    });

    this.window.on('moved', () => {
      this.savePosition();
    });

    this.window.on('resize', () => {
      this.saveSize();
    });

    this.window.on('closed', () => {
      this.stopClientTxtWatcher();
      this.window = null;
    });

    // Setup IPC handlers
    this.setupIpcHandlers();
  }

  private setupIpcHandlers(): void {
    ipcMain.removeHandler('leveling-toggle-wide');
    ipcMain.handle('leveling-toggle-wide', () => {
      this.toggleWideMode();
      return this.isWideMode;
    });

    ipcMain.removeHandler('leveling-close');
    ipcMain.handle('leveling-close', () => {
      this.hide();
    });
  }

  private getTargetSize(): { w: number; h: number } {
    const saved = this.settingsService.get(this.getLevelingWindowKey());

    if (saved?.size) {
      return { w: saved.size.width, h: saved.size.height };
    }

    if (this.isWideMode) {
      return { w: 800, h: 500 };
    }
    return { w: 380, h: 600 };
  }

  private savePosition(): void {
    if (!this.window || this.window.isDestroyed()) return;
    const b = this.window.getBounds();
    this.settingsService.update(this.getLevelingWindowKey(), (c) => ({
      ...(c || {}),
      position: { x: b.x, y: b.y },
    }));
  }

  private saveSize(): void {
    if (!this.window || this.window.isDestroyed()) return;
    const b = this.window.getBounds();
    this.settingsService.update(this.getLevelingWindowKey(), (c) => ({
      ...(c || {}),
      size: { width: b.width, height: b.height },
    }));
  }

  private loadLevelingData(): void {
    try {
      const gameFolder = this.overlayVersion; // 'poe1' or 'poe2'
      
      // Try multiple possible paths (including extraResources path for packaged app)
      const possiblePaths = [
        path.join(process.resourcesPath || '', 'data', gameFolder, 'Leveling', 'leveling-data-v2.json'), // Packaged app
        path.join(app.getAppPath(), 'data', gameFolder, 'Leveling', 'leveling-data-v2.json'),
        path.join(process.cwd(), 'data', gameFolder, 'Leveling', 'leveling-data-v2.json'),
        path.join(__dirname, `../../data/${gameFolder}/Leveling/leveling-data-v2.json`),
        path.join(__dirname, `../../../data/${gameFolder}/Leveling/leveling-data-v2.json`),
      ];
      
      let loaded = false;
      for (const dataPath of possiblePaths) {
        if (fs.existsSync(dataPath)) {
          const rawData = fs.readFileSync(dataPath, 'utf-8');
          const parsedData = JSON.parse(rawData);
          // Filter to only include acts that have steps
          if (parsedData && parsedData.acts) {
            parsedData.acts = parsedData.acts.filter((act: any) => act.steps && act.steps.length > 0);
          }
          this.levelingData = parsedData;
          console.log(`[LevelingWindow] ${gameFolder.toUpperCase()} data loaded from:`, dataPath);
          console.log('[LevelingWindow] Loaded acts:', parsedData.acts.map((a: any) => `Act ${a.actNumber}`).join(', '));
          loaded = true;
          break;
        }
      }
      
      if (!loaded) {
        console.warn('[LevelingWindow] Data file not found in any location, using embedded');
        this.levelingData = this.getEmbeddedData();
      }
    } catch (err) {
      console.error('[LevelingWindow] Failed to load leveling data:', err);
      this.levelingData = this.getEmbeddedData();
    }
  }

  private loadZoneRegistry(): void {
    try {
      const gameFolder = this.overlayVersion; // 'poe1' or 'poe2'
      
      // Try multiple possible paths for zone registry (including extraResources path for packaged app)
      const possiblePaths = [
        path.join(process.resourcesPath || '', 'data', gameFolder, 'Leveling', `${gameFolder}-zone-registry.json`), // Packaged app
        path.join(app.getAppPath(), 'data', gameFolder, 'Leveling', `${gameFolder}-zone-registry.json`),
        path.join(process.cwd(), 'data', gameFolder, 'Leveling', `${gameFolder}-zone-registry.json`),
        path.join(__dirname, `../../data/${gameFolder}/Leveling/${gameFolder}-zone-registry.json`),
        path.join(__dirname, `../../../data/${gameFolder}/Leveling/${gameFolder}-zone-registry.json`),
      ];
      
      let loaded = false;
      for (const dataPath of possiblePaths) {
        if (fs.existsSync(dataPath)) {
          const rawData = fs.readFileSync(dataPath, 'utf-8');
          this.zoneRegistry = JSON.parse(rawData);
          console.log(`[LevelingWindow] ${gameFolder.toUpperCase()} zone registry loaded from:`, dataPath);
          console.log('[LevelingWindow] Zone registry version:', this.zoneRegistry.version);
          loaded = true;
          break;
        }
      }
      
      if (!loaded) {
        console.warn(`[LevelingWindow] ${gameFolder.toUpperCase()} zone registry file not found`);
        this.zoneRegistry = { version: '2.0', zonesByAct: [] };
      }
    } catch (err) {
      console.error('[LevelingWindow] Failed to load zone registry:', err);
      this.zoneRegistry = { version: '2.0', zonesByAct: [] };
    }
  }

  private getEmbeddedData(): any {
    // Minimal embedded data for Act 1 (copied from module.ts)
    return {
      acts: [{
        actNumber: 1,
        actName: "The Awakening",
        recommendedEndLevel: 12,
        steps: [
          { id: "a1_s1", type: "kill_boss", zone: "The Twilight Strand", description: "Kill Hillock", hint: "Guaranteed Level 2", layoutTip: "Walk East/North-East along the coastline. Hillock is always at the far East end. Ignore all enemies - only grab weapon, skill gem, and support gem.", checkable: true },
          { id: "a1_s2", type: "town", zone: "Lioneye's Watch", description: "Enter Lioneye's Watch", checkable: true },
          { id: "a1_s3", type: "npc_quest", zone: "Lioneye's Watch", description: "Talk to Tarkleigh", quest: "Enemy at the Gate", reward: "Level 1 Skill Gem", checkable: true }
          // ... Add more steps as needed
        ]
      }],
      stepTypes: {
        navigation: { icon: "arrow-right", color: "#E0E0E0", label: "Navigate" },
        waypoint: { icon: "waypoint", color: "#00D4FF", label: "Waypoint" },
        town: { icon: "home", color: "#FEC076", label: "Town" },
        npc_quest: { icon: "chat", color: "#FFB84D", label: "Quest Turn-in" },
        quest: { icon: "exclamation", color: "#FFEB3B", label: "Quest Objective" },
        kill_boss: { icon: "skull", color: "#FF5252", label: "Boss Fight" },
        trial: { icon: "lab", color: "#4ADE80", label: "Labyrinth Trial" },
        passive: { icon: "star", color: "#4ADE80", label: "Passive Point" },
        optional: { icon: "info", color: "#9E9E9E", label: "Optional" }
      }
    };
  }

  private loadProgress(): void {
    const saved = this.settingsService.get(this.getLevelingWindowKey());
    if (saved && saved.progress && Array.isArray(saved.progress)) {
      this.completedSteps = new Set(saved.progress);
    }
  }

  private saveProgress(): void {
    this.settingsService.update(this.getLevelingWindowKey(), (c) => ({ 
      ...c, 
      progress: Array.from(this.completedSteps) 
    }));
  }

  private registerIpcHandlers(): void {
    // Provide leveling data to renderer
    ipcMain.handle('get-leveling-data', async () => {
      const saved = this.settingsService.get(this.getLevelingWindowKey());
      
      // Validate that currentActIndex is valid for the loaded data
      let currentActIndex = saved?.currentActIndex ?? 0;
      if (this.levelingData?.acts && currentActIndex >= this.levelingData.acts.length) {
        // Reset to 0 if the saved index is out of bounds (e.g., switching from POE1 to POE2)
        console.log(`[LevelingWindow] currentActIndex ${currentActIndex} out of bounds, resetting to 0`);
        currentActIndex = 0;
      }
      
      return {
        data: this.levelingData,
        progress: Array.from(this.completedSteps),
        currentActIndex: currentActIndex,
        actTimers: saved?.actTimers ?? {},
        settings: saved?.uiSettings ?? {}
      };
    });

    // Provide zone registry data to renderer
    ipcMain.handle('get-zone-registry', async () => {
      return this.zoneRegistry;
    });

    // Save progress
    ipcMain.handle('save-leveling-progress', async (event, stepIds: string[]) => {
      this.completedSteps = new Set(stepIds);
      this.saveProgress();
      return true;
    });

    // Set current act index
    ipcMain.handle('set-current-act-index', async (event, actIndex: number) => {
      this.settingsService.update(this.getLevelingWindowKey(), (c) => ({
        ...c,
        currentActIndex: actIndex
      }));
      
      // Update gems window with new act
      updateLevelingGemsWindow(actIndex + 1, this.overlayVersion, this.settingsService);
      
      // Update PoB info bar with new act
      const currentSettings = this.settingsService.get(this.getLevelingWindowKey()) || {};
      const pobBuild = (currentSettings as any).pobBuild;
      if (pobBuild) {
        updatePobInfoBar(pobBuild, actIndex + 1);
      }
      
      return true;
    });

    // Save act timers
    ipcMain.handle('save-act-timers', async (event, actTimers: Record<number, number>) => {
      this.settingsService.update(this.getLevelingWindowKey(), (c) => ({
        ...c,
        actTimers: actTimers
      }));
      return true;
    });

    // Save UI settings
    ipcMain.handle('save-leveling-settings', async (event, uiSettings: any) => {
      this.settingsService.update(this.getLevelingWindowKey(), (c) => ({
        ...c,
        uiSettings: uiSettings
      }));
      return true;
    });

    // Get run history for an act
    ipcMain.handle('get-run-history', async (event, actNumber: number) => {
      const saved = this.settingsService.get(this.getLevelingWindowKey());
      const runHistory = saved?.runHistory || {};
      return runHistory[actNumber] || [];
    });

    // Get all run histories
    ipcMain.handle('get-all-run-histories', async () => {
      const saved = this.settingsService.get(this.getLevelingWindowKey());
      return saved?.runHistory || {};
    });

    // Save a completed run for an act
    ipcMain.handle('save-run', async (event, actNumber: number, time: number) => {
      const saved = this.settingsService.get(this.getLevelingWindowKey());
      const runHistory = saved?.runHistory || {};
      
      if (!runHistory[actNumber]) {
        runHistory[actNumber] = [];
      }
      
      // Add new run with timestamp
      runHistory[actNumber].push({
        time: time,
        timestamp: Date.now(),
        date: new Date().toISOString()
      });
      
      // Keep only last 50 runs per act to prevent bloat
      if (runHistory[actNumber].length > 50) {
        runHistory[actNumber] = runHistory[actNumber].slice(-50);
      }
      
      this.settingsService.update(this.getLevelingWindowKey(), (c) => ({
        ...c,
        runHistory: runHistory
      }));
      
      return true;
    });

    // Get best and previous run times for an act
    ipcMain.handle('get-run-comparison', async (event, actNumber: number) => {
      const saved = this.settingsService.get(this.getLevelingWindowKey());
      const runHistory = saved?.runHistory || {};
      const runs = runHistory[actNumber] || [];
      
      if (runs.length === 0) {
        return { best: null, previous: null, averag: null };
      }
      
      // Get best time
      const best = Math.min(...runs.map((r: any) => r.time));
      
      // Get previous time (last completed run)
      const previous = runs.length > 0 ? runs[runs.length - 1].time : null;
      
      // Get average
      const average = runs.length > 0 
        ? Math.round(runs.reduce((sum: number, r: any) => sum + r.time, 0) / runs.length)
        : null;
      
      return { best, previous, average, totalRuns: runs.length };
    });

    // Delete a specific run
    ipcMain.handle('delete-run', async (event, actNumber: number, timestamp: number) => {
      const saved = this.settingsService.get(this.getLevelingWindowKey());
      const runHistory = saved?.runHistory || {};
      
      if (runHistory[actNumber]) {
        runHistory[actNumber] = runHistory[actNumber].filter((r: any) => r.timestamp !== timestamp);
        
        this.settingsService.update(this.getLevelingWindowKey(), (c) => ({
          ...c,
          runHistory: runHistory
        }));
      }
      
      return true;
    });

    // Clear all runs for an act
    ipcMain.handle('clear-act-runs', async (event, actNumber: number) => {
      const saved = this.settingsService.get(this.getLevelingWindowKey());
      const runHistory = saved?.runHistory || {};
      
      delete runHistory[actNumber];
      
      this.settingsService.update(this.getLevelingWindowKey(), (c) => ({
        ...c,
        runHistory: runHistory
      }));
      
      return true;
    });

    // Clear all run history
    ipcMain.handle('clear-all-run-history', async () => {
      this.settingsService.update(this.getLevelingWindowKey(), (c) => ({
        ...c,
        runHistory: {}
      }));
      
      return true;
    });

    // Reset progress
    ipcMain.handle('reset-leveling-progress', async () => {
      this.completedSteps = new Set();
      // Reset act timers and current act index
      const saved = this.settingsService.get(this.getLevelingWindowKey());
      if (saved) {
        saved.actTimers = {};
        saved.currentActIndex = 0;
        this.settingsService.set(this.getLevelingWindowKey(), saved);
      }
      this.saveProgress();
      return true;
    });

    // Set layout mode
    ipcMain.on('leveling-set-layout', (event, mode: 'tall' | 'wide') => {
      this.layoutMode = mode;
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('leveling-layout-mode', mode);
      }
    });

    // Resize to preset dimensions
    ipcMain.on('leveling-resize-preset', (event, size: { width: number; height: number }) => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.setSize(size.width, size.height, true);
      }
    });

    // Set click-through (ignore mouse events)
    ipcMain.on('set-ignore-mouse-events', (event, ignore: boolean, options?: { forward: boolean }) => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.setIgnoreMouseEvents(ignore, options);
      }
    });

    // Open leveling settings splash
    ipcMain.handle('open-leveling-settings', async () => {
      openLevelingSettingsSplash({
        settingsService: this.settingsService,
        overlayVersion: this.overlayVersion,
        overlayWindow: this.window
      });
      return true;
    });

    // Handle settings updates from settings splash
    ipcMain.on('leveling-settings-update', (event, updates: any) => {
      this.settingsService.update(this.getLevelingWindowKey(), (current) => ({
        ...current,
        ...updates
      }));
      
      // Notify renderer of setting changes
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('leveling-settings-changed', updates);
      }
    });

    // Open gems window from PoB info bar
    ipcMain.on('open-pob-gems-window', () => {
      const currentSettings = this.settingsService.get(this.getLevelingWindowKey()) || {};
      const pobBuild = (currentSettings as any).pobBuild || null;
      const currentActIndex = (currentSettings as any).currentActIndex || 0;
      const currentAct = currentActIndex + 1; // Convert index to act number
      
      if (!pobBuild) {
        console.warn('[LevelingWindow] Cannot open gems window - no PoB build loaded');
        return;
      }
      
      console.log('[LevelingWindow] Opening gems window for Act', currentAct);
      
      openLevelingGemsWindow({
        settingsService: this.settingsService,
        overlayVersion: this.overlayVersion,
        parentWindow: this.window || undefined
      });
    });

    // Open passive tree window from PoB info bar
    ipcMain.on('open-pob-tree-window', () => {
      const currentSettings = this.settingsService.get(this.getLevelingWindowKey()) || {};
      const pobBuild = (currentSettings as any).pobBuild || null;
      
      if (!pobBuild || !pobBuild.treeSpecs || pobBuild.treeSpecs.length === 0) {
        console.warn('[LevelingWindow] Cannot open tree window - no PoB build with trees loaded');
        return;
      }
      
      console.log('[LevelingWindow] Opening tree window with', pobBuild.treeSpecs.length, 'tree specs');
      
      const onTreeWindowReady = () => {
        console.log('[LevelingWindow] Tree window reported ready, sending data');
        sendTreeData(pobBuild.treeSpecs);
      };

      ipcMain.once('tree-window-ready', onTreeWindowReady);

      const treeWindow = createPassiveTreeWindow();
      
      // If window already loaded (existing instance), send data immediately and cleanup listener
      if (!treeWindow.webContents.isLoading()) {
        ipcMain.removeListener('tree-window-ready', onTreeWindowReady);
        console.log('[LevelingWindow] Tree window already loaded, sending data immediately');
        sendTreeData(pobBuild.treeSpecs);
      }
    });

    // Close gems window
    ipcMain.on('leveling-gems-window-close', () => {
      closeLevelingGemsWindow();
    });
    
    // Act changed - notify gems window
    ipcMain.on('leveling-act-changed', (event, actNumber: number) => {
      updateLevelingGemsWindow(actNumber, this.overlayVersion, this.settingsService);
    });
    
    // Show PoB info bar
    ipcMain.on('show-pob-info-bar', () => {
      const config = this.settingsService.get(this.getLevelingWindowKey());
      const pobBuild = config?.pobBuild as any;
      
      if (pobBuild) {
        const currentAct = (config?.currentActIndex || 0) + 1;
        openPobInfoBar({
          settingsService: this.settingsService,
          overlayVersion: this.overlayVersion,
          pobBuild: pobBuild,
          currentAct: currentAct
        });
      }
    });

    // Import PoB build from settings splash
    ipcMain.handle('import-pob-from-settings', async (event, code: string) => {
      return await this.importPobCode(code);
    });

    // Remove PoB build
    ipcMain.handle('remove-pob-build', async () => {
      this.settingsService.update(this.getLevelingWindowKey(), (c: any) => ({
        ...c,
        pobBuild: undefined
      }));
      
      // Close PoB info bar
      closePobInfoBar();
      
      // Notify renderer
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('pob-build-removed');
      }
      
      return { success: true };
    });

    // Auto-detect client.txt path
    ipcMain.handle('auto-detect-client-txt', async () => {
      // First, try to find the path from a running POE process
      const processDir = this.findPoeProcessPath();
      if (processDir) {
        const processBasedPath = path.join(processDir, 'logs', 'Client.txt');
        if (fs.existsSync(processBasedPath)) {
          this.settingsService.set(this.getClientTxtPathKey(), processBasedPath);
          this.settingsService.set(this.getClientTxtAutoDetectedKey(), true);
          this.settingsService.set(this.getClientTxtLastCheckedKey(), Date.now());
          console.log(`[LevelingWindow] Found ${this.overlayVersion.toUpperCase()} Client.txt via running process`);
          return { success: true, path: processBasedPath };
        }
      }

      // Fall back to scanning common locations
      const driveLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(letter => {
        try {
          return fs.existsSync(letter + ':\\');
        } catch {
          return false;
        }
      });

      // Different folder names for POE1 vs POE2
      const gameFolders = this.overlayVersion === 'poe1' 
        ? ['Path of Exile', 'Path of Exile 1']
        : ['Path of Exile 2', 'Path of Exile II', 'PathOfExile2'];

      const relativePaths: string[] = [];
      for (const gameFolder of gameFolders) {
        relativePaths.push(
          `Program Files (x86)\\Steam\\steamapps\\common\\${gameFolder}\\logs\\Client.txt`,
          `Program Files\\Steam\\steamapps\\common\\${gameFolder}\\logs\\Client.txt`,
          `Steam\\steamapps\\common\\${gameFolder}\\logs\\Client.txt`,
          `SteamLibrary\\steamapps\\common\\${gameFolder}\\logs\\Client.txt`,
          `Program Files (x86)\\Grinding Gear Games\\${gameFolder}\\logs\\Client.txt`,
          `Grinding Gear Games\\${gameFolder}\\logs\\Client.txt`
        );
      }

      for (const drive of driveLetters) {
        for (const rel of relativePaths) {
          const testPath = path.join(drive + ':\\', rel);
          if (fs.existsSync(testPath)) {
            // Validate the path matches the current version
            const testDir = path.dirname(path.dirname(testPath)); // Go up from logs/Client.txt to game root
            if (this.isPathValidForVersion(testDir)) {
              this.settingsService.set(this.getClientTxtPathKey(), testPath);
              this.settingsService.set(this.getClientTxtAutoDetectedKey(), true);
              this.settingsService.set(this.getClientTxtLastCheckedKey(), Date.now());
              console.log(`[LevelingWindow] Found ${this.overlayVersion.toUpperCase()} Client.txt via path scanning`);
              return { success: true, path: testPath };
            } else {
              console.log(`[LevelingWindow] Rejected path (wrong version):`, testPath);
            }
          }
        }
      }

      console.log(`[LevelingWindow] Could not auto-detect ${this.overlayVersion.toUpperCase()} Client.txt`);
      return { success: false, path: null };
    });

    // Manual select client.txt path (shared logic)
    const selectClientTxt = async () => {
      const { dialog } = await import('electron');
      const result = await dialog.showOpenDialog({
        title: `Select ${this.overlayVersion.toUpperCase()} Client.txt`,
        defaultPath: 'C:\\Program Files (x86)',
        filters: [
          { name: 'Text Files', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0];
        this.settingsService.set(this.getClientTxtPathKey(), selectedPath);
        this.settingsService.set(this.getClientTxtAutoDetectedKey(), false);
        this.settingsService.set(this.getClientTxtLastCheckedKey(), Date.now());
        return { success: true, path: selectedPath };
      }

      return { success: false, path: null };
    };

    ipcMain.handle('select-client-txt', selectClientTxt);
    ipcMain.handle('select-client-txt-path', selectClientTxt);

    // Get current client.txt path
    ipcMain.handle('get-client-txt-path', async () => {
      const savedPath = this.settingsService.get(this.getClientTxtPathKey());
      const autoDetected = this.settingsService.get(this.getClientTxtAutoDetectedKey()) ?? false;
      
      // Validate that the path actually exists
      let exists = false;
      if (savedPath && typeof savedPath === 'string') {
        try {
          exists = fs.existsSync(savedPath);
        } catch {
          exists = false;
        }
      }
      
      return { path: savedPath, autoDetected, exists };
    });

    // Clean client.txt file
    ipcMain.handle('clean-client-txt', async () => {
      try {
        const clientPath = this.settingsService.get(this.getClientTxtPathKey());
        if (!clientPath) {
          return { success: false, error: `${this.overlayVersion.toUpperCase()} Client.txt path not configured` };
        }
        
        if (!fs.existsSync(clientPath)) {
          return { success: false, error: `${this.overlayVersion.toUpperCase()} Client.txt file not found at configured path` };
        }

        // Clear the file by writing an empty string
        fs.writeFileSync(clientPath, '', 'utf8');
        return { success: true };
      } catch (error) {
        console.error(`Error cleaning ${this.overlayVersion.toUpperCase()} Client.txt:`, error);
        return { success: false, error: String(error) };
      }
    });

    // Toggle auto-detect zones
    ipcMain.handle('toggle-auto-detect-zones', async (event, enabled: boolean) => {
      if (enabled) {
        this.startClientTxtWatcher();
      } else {
        this.stopClientTxtWatcher();
      }
      return { success: true };
    });

    // Import PoB code
    ipcMain.handle('import-pob-code', async (event, code: string) => {
      return await this.importPobCode(code);
    });

    // Get stored PoB build
    ipcMain.handle('get-pob-build', async () => {
      const saved = this.settingsService.get(this.getLevelingWindowKey());
      return saved?.pobBuild || null;
    });

    // Start watching client.txt for zone changes
    this.startClientTxtWatcher();
  }

  private clientTxtWatcher: fs.FSWatcher | null = null;
  private clientTxtPath: string | null = null;
  private lastFilePosition: number = 0;

  /**
   * Try to find the Path of Exile installation directory by looking for running processes
   */
  private findPoeProcessPath(): string | null {
    try {
      // Use PowerShell to get process path (more reliable than wmic on modern Windows)
      const command = `powershell -Command "Get-Process | Where-Object {$_.ProcessName -like '*PathOfExile*'} | Select-Object -ExpandProperty Path"`;
      const output = execSync(command, { encoding: 'utf8', timeout: 5000 });
      
      if (output && output.trim()) {
        // Get all matching process paths
        const processPaths = output.trim().split('\n').map(p => p.trim()).filter(Boolean);
        
        // Filter for version-specific paths
        for (const processPath of processPaths) {
          if (processPath && fs.existsSync(processPath)) {
            const processDir = path.dirname(processPath);
            
            // Validate this path matches the current overlay version
            if (this.isPathValidForVersion(processDir)) {
              console.log(`[LevelingWindow] Found ${this.overlayVersion.toUpperCase()} process at:`, processDir);
              return processDir;
            } else {
              console.log(`[LevelingWindow] Rejected path (wrong version):`, processDir);
            }
          }
        }
      }
    } catch (error) {
      console.log('[LevelingWindow] Could not detect running POE process:', error);
    }
    return null;
  }

  /**
   * Check if a path is valid for the current overlay version.
   * Prevents cross-contamination between PoE1 and PoE2 paths.
   */
  private isPathValidForVersion(dirPath: string): boolean {
    const normalizedPath = dirPath.toLowerCase().replace(/\\/g, '/');
    
    if (this.overlayVersion === 'poe1') {
      // PoE1 should NOT contain "path of exile 2" or similar patterns
      if (normalizedPath.includes('path of exile 2') || 
          normalizedPath.includes('path of exile ii') ||
          normalizedPath.includes('pathofexile2') ||
          normalizedPath.includes('pathofexileii') ||
          normalizedPath.includes('poe2')) {
        return false;
      }
      // Valid if it contains "path of exile" (but not the above)
      return normalizedPath.includes('path of exile');
    } else {
      // PoE2 MUST contain "2" or "ii" in the path
      if (normalizedPath.includes('path of exile 2') || 
          normalizedPath.includes('path of exile ii') ||
          normalizedPath.includes('pathofexile2') ||
          normalizedPath.includes('pathofexileii')) {
        return true;
      }
      return false;
    }
  }

  /**
   * Auto-detect client.txt path on startup (only runs once per installation)
   */
  private async autoDetectClientTxtOnStartup(): Promise<void> {
    // Check if we've already attempted detection
    const detectionAttempted = this.settingsService.get(this.getClientTxtDetectionAttemptedKey());
    const existingPath = this.settingsService.get(this.getClientTxtPathKey());
    
    // Skip if we've already tried OR if user has manually set a path
    if (detectionAttempted || (existingPath && !this.settingsService.get(this.getClientTxtAutoDetectedKey()))) {
      console.log(`[LevelingWindow] Skipping ${this.overlayVersion.toUpperCase()} auto-detection (already attempted or manually set)`);
      return;
    }

    // If we have an existing auto-detected path, verify it still exists AND is for the correct version
    if (existingPath && this.settingsService.get(this.getClientTxtAutoDetectedKey())) {
      if (fs.existsSync(existingPath)) {
        const existingDir = path.dirname(path.dirname(existingPath)); // Go up from logs/Client.txt to game root
        if (this.isPathValidForVersion(existingDir)) {
          console.log(`[LevelingWindow] Using existing auto-detected ${this.overlayVersion.toUpperCase()} path:`, existingPath);
          return;
        } else {
          console.log(`[LevelingWindow] Previous auto-detected path is for wrong game version, re-detecting`);
          // Clear the invalid path
          this.settingsService.clear(this.getClientTxtPathKey());
          this.settingsService.clear(this.getClientTxtAutoDetectedKey());
        }
      } else {
        console.log(`[LevelingWindow] Previous auto-detected ${this.overlayVersion.toUpperCase()} path no longer exists, re-detecting`);
      }
    }

    console.log(`[LevelingWindow] Attempting auto-detection of ${this.overlayVersion.toUpperCase()} Client.txt...`);
    
    // Mark that we've attempted detection (even if it fails)
    this.settingsService.set(this.getClientTxtDetectionAttemptedKey(), true);
    
    // Try to find from running process first
    const processDir = this.findPoeProcessPath();
    if (processDir) {
      const processBasedPath = path.join(processDir, 'logs', 'Client.txt');
      if (fs.existsSync(processBasedPath)) {
        this.settingsService.set(this.getClientTxtPathKey(), processBasedPath);
        this.settingsService.set(this.getClientTxtAutoDetectedKey(), true);
        this.settingsService.set(this.getClientTxtLastCheckedKey(), Date.now());
        console.log(`[LevelingWindow] Auto-detected ${this.overlayVersion.toUpperCase()} Client.txt via running process:`, processBasedPath);
        return;
      }
    }

    // Fall back to scanning common locations
    const driveLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(letter => {
      try {
        return fs.existsSync(letter + ':\\');
      } catch {
        return false;
      }
    });

    // Different folder names for POE1 vs POE2
    const gameFolders = this.overlayVersion === 'poe1' 
      ? ['Path of Exile', 'Path of Exile 1']
      : ['Path of Exile 2', 'Path of Exile II', 'PathOfExile2'];

    const relativePaths: string[] = [];
    for (const gameFolder of gameFolders) {
      relativePaths.push(
        `Program Files (x86)\\Steam\\steamapps\\common\\${gameFolder}\\logs\\Client.txt`,
        `Program Files\\Steam\\steamapps\\common\\${gameFolder}\\logs\\Client.txt`,
        `Steam\\steamapps\\common\\${gameFolder}\\logs\\Client.txt`,
        `SteamLibrary\\steamapps\\common\\${gameFolder}\\logs\\Client.txt`,
        `Program Files (x86)\\Grinding Gear Games\\${gameFolder}\\logs\\Client.txt`,
        `Grinding Gear Games\\${gameFolder}\\logs\\Client.txt`
      );
    }

    for (const drive of driveLetters) {
      for (const rel of relativePaths) {
        const testPath = path.join(drive + ':\\', rel);
        if (fs.existsSync(testPath)) {
          // Validate the path matches the current version
          const testDir = path.dirname(path.dirname(testPath)); // Go up from logs/Client.txt to game root
          if (this.isPathValidForVersion(testDir)) {
            this.settingsService.set(this.getClientTxtPathKey(), testPath);
            this.settingsService.set(this.getClientTxtAutoDetectedKey(), true);
            this.settingsService.set(this.getClientTxtLastCheckedKey(), Date.now());
            console.log(`[LevelingWindow] Auto-detected ${this.overlayVersion.toUpperCase()} Client.txt via path scanning:`, testPath);
            return;
          } else {
            console.log(`[LevelingWindow] Rejected path (wrong version):`, testPath);
          }
        }
      }
    }

    // If we get here, we couldn't find Client.txt
    console.log(`[LevelingWindow] Could not auto-detect ${this.overlayVersion.toUpperCase()} Client.txt`);
    
    // Show notification if not already shown
    const notificationShown = this.settingsService.get(this.getClientTxtNotificationShownKey());
    if (!notificationShown) {
      this.showClientTxtNotFoundNotification();
      this.settingsService.set(this.getClientTxtNotificationShownKey(), true);
    }
  }

  /**
   * Show a notification when Client.txt cannot be found
   */
  private showClientTxtNotFoundNotification(): void {
    const { dialog } = require('electron');
    
    // Use setTimeout to avoid blocking startup
    setTimeout(() => {
      dialog.showMessageBox({
        type: 'info',
        title: `${this.overlayVersion.toUpperCase()} Client.txt Not Found`,
        message: 'Auto Zone Detection',
        detail: `We couldn\'t automatically detect the ${this.overlayVersion.toUpperCase()} Client.txt file.\n\n` +
                'If you want to use auto zone detection in the leveling overlay, ' +
                'please set the path manually in the leveling overlay settings.\n\n' +
                'This message will only be shown once.',
        buttons: ['OK'],
        defaultId: 0,
        noLink: true
      }).catch((err: any) => {
        console.error('[LevelingWindow] Error showing notification:', err);
      });
    }, 1000);
  }

  private startClientTxtWatcher() {
    // Stop any existing watcher
    this.stopClientTxtWatcher();

    const clientPath = this.settingsService.get(this.getClientTxtPathKey());
    if (!clientPath || !fs.existsSync(clientPath)) {
      console.log(`${this.overlayVersion.toUpperCase()} Client.txt not configured or not found, skipping file watch`);
      return;
    }

    this.clientTxtPath = clientPath;
    console.log(`Starting ${this.overlayVersion.toUpperCase()} Client.txt watcher at:`, clientPath);
    
    // Initialize last position to end of file
    try {
      const stats = fs.statSync(clientPath);
      this.lastFilePosition = stats.size;
      console.log('Initial file position:', this.lastFilePosition);
    } catch (error) {
      console.error('Error getting initial file stats:', error);
      this.lastFilePosition = 0;
    }

    // Use fs.watchFile (polling-based) instead of fs.watch for better reliability on Windows
    // Check every 500ms for changes
    fs.watchFile(clientPath, { interval: 500 }, (curr, prev) => {
      if (curr.mtime > prev.mtime) {
        console.log('File modified, checking for changes...');
        this.handleClientTxtChange(clientPath);
      }
    });
    
    console.log('File watcher started successfully');
  }

  private handleClientTxtChange(filePath: string) {
    try {
      const stats = fs.statSync(filePath);
      const currentSize = stats.size;

      // Only read if file has grown
      if (currentSize <= this.lastFilePosition) {
        console.log('File size unchanged or decreased, skipping');
        return;
      }

      console.log(`Reading Client.txt from position ${this.lastFilePosition} to ${currentSize}`);

      // Read only the new content
      const buffer = Buffer.alloc(currentSize - this.lastFilePosition);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, buffer.length, this.lastFilePosition);
      fs.closeSync(fd);

      const newContent = buffer.toString('utf8');
      this.lastFilePosition = currentSize;

      console.log('New content:', newContent.substring(0, 200)); // Log first 200 chars

      // Parse for zone entry lines and level ups
      // POE1 Zone Format: 2025/06/13 09:49:29 98539734 cff94598 [INFO Client 39308] : You have entered The Forest Encampment.
      // POE1 Level Format: 2025/06/14 03:26:55 161985515 cff945b9 [INFO Client 34512] : SnakeInHerFissure (Marauder) is now level 2
      // POE2 Zone Format: 2025/10/24 12:20:06 46081515 775aed1e [INFO Client 14056] [SCENE] Set Source [Clearfell]
      
      let matchCount = 0;
      
      if (this.overlayVersion === 'poe1') {
        // POE1: Zone detection
        const zoneRegex = /\[INFO Client \d+\] : You have entered (.+)\./g;
        let match;
        
        while ((match = zoneRegex.exec(newContent)) !== null) {
          const zoneName = match[1].trim();
          matchCount++;
          console.log(`[${matchCount}] POE1 Detected zone entry:`, zoneName);
          
          // Send to renderer to auto-check the step
          if (this.window && !this.window.isDestroyed()) {
            this.window.webContents.send('zone-entered', zoneName);
          }
        }

        // POE1: Level-up detection
        const levelRegex = /\[INFO Client \d+\] : (.+?) \((\w+)\) is now level (\d+)/g;
        while ((match = levelRegex.exec(newContent)) !== null) {
          const [, characterName, className, levelStr] = match;
          const level = parseInt(levelStr, 10);
          console.log(`[POE1] Character level up: ${characterName} (${className}) → Level ${level}`);

          // Store character info and level
          this.settingsService.update(this.getLevelingWindowKey(), (c) => ({
            ...c,
            characterLevel: level,
            characterName: characterName,
            characterClass: className
          }));

          // Send to renderer
          if (this.window && !this.window.isDestroyed()) {
            this.window.webContents.send('character-level-up', {
              name: characterName,
              class: className,
              level: level
            });
          }
        }
      } else {
        // POE2: "[SCENE] Set Source [<zone name>]"
        const zoneRegex = /\[INFO Client \d+\] \[SCENE\] Set Source \[(.+?)\]/g;
        let match;
        
        while ((match = zoneRegex.exec(newContent)) !== null) {
          const zoneName = match[1].trim();
          matchCount++;
          console.log(`[${matchCount}] POE2 Detected zone entry:`, zoneName);
          
          // Send to renderer to auto-check the step
          if (this.window && !this.window.isDestroyed()) {
            this.window.webContents.send('zone-entered', zoneName);
          }
        }
      }

      if (matchCount === 0) {
        console.log('No zone entries found in new content');
      }
    } catch (error) {
      console.error('Error reading Client.txt changes:', error);
    }
  }

  private stopClientTxtWatcher() {
    if (this.clientTxtPath) {
      console.log('Stopping file watcher for:', this.clientTxtPath);
      fs.unwatchFile(this.clientTxtPath);
      this.clientTxtPath = null;
    }
    if (this.clientTxtWatcher) {
      this.clientTxtWatcher.close();
      this.clientTxtWatcher = null;
    }
  }

  private async importPobCode(code: string): Promise<any> {
    try {
      console.log('[PoB Import] Parsing PoB code...');
      
      // Parse PoB code (now async to support fetching pobb.in URLs)
      const build = await parsePobCode(code);
      if (!build) {
        return { success: false, error: 'Invalid PoB code' };
      }

      console.log('[PoB Import] Build parsed:', {
        class: build.className,
        ascendancy: build.ascendancyName,
        level: build.level,
        treeSpecs: build.treeSpecs.length,
        gems: build.gems.length
      });

      // Use the first tree spec (typically "Early Game" or default)
      const firstTreeSpec = build.treeSpecs[0];
      const allocatedNodes = firstTreeSpec.allocatedNodes;

      console.log('[PoB Import] Using tree spec:', firstTreeSpec.title);
      console.log('[PoB Import] Tree specs available:', build.treeSpecs.map(s => s.title).join(', '));

      // Calculate tree progression by act
      const treeProgression = calculateTreeProgressionByAct(
        allocatedNodes,
        build.level
      );

      console.log('[PoB Import] Tree progression calculated for', treeProgression.length, 'acts');

      // Extract unique gems from ALL skill sets (not just first one)
      const allSocketGroups: GemSocketGroup[] = [];
      if (build.skillSets && build.skillSets.length > 0) {
        // Collect socket groups from all skill sets
        for (const skillSet of build.skillSets) {
          allSocketGroups.push(...skillSet.socketGroups);
        }
        console.log('[PoB Import] Collected', allSocketGroups.length, 'socket groups from', build.skillSets.length, 'skill sets');
      } else {
        // Fallback to build.gems if no skill sets
        allSocketGroups.push(...build.gems);
      }
      
      const uniqueGems = extractUniqueGems(allSocketGroups);
      
      // Match gems to quest steps using quest data
      const gemsWithQuests = matchGemsToQuestSteps(uniqueGems, this.levelingData, build.className);

      console.log('[PoB Import] Gems extracted:', gemsWithQuests.length, 'unique gems from all acts');
      
      // Create a map of gem name -> quest info for easy lookup
      const gemQuestMap = new Map<string, any>();
      for (const gem of gemsWithQuests) {
        gemQuestMap.set(gem.name.toLowerCase(), gem);
      }
      
      // Enrich socket groups with quest info
      const enrichedSocketGroups = build.gems.map(group => ({
        ...group,
        gems: group.gems.map(gem => {
          const questInfo = gemQuestMap.get((gem.nameSpec || '').toLowerCase());
          return questInfo ? { ...gem, ...questInfo } : gem;
        })
      }));

      // Enrich ALL skill sets with quest info (not just the first one)
      const enrichedSkillSets = (build.skillSets || []).map(skillSet => ({
        ...skillSet,
        socketGroups: skillSet.socketGroups.map(group => ({
          ...group,
          gems: group.gems.map(gem => {
            const questInfo = gemQuestMap.get((gem.nameSpec || '').toLowerCase());
            return questInfo ? { ...gem, ...questInfo } : gem;
          })
        }))
      }));

      console.log('[PoB Import] Enriched', enrichedSkillSets.length, 'skill sets with quest data');

      // Create a flat list of ALL gems from ALL enriched skill sets (preserving per-act data)
      // Use a Map to deduplicate by (gemName + act + quest) to avoid showing same gem multiple times
      const gemMap = new Map<string, any>();
      
      for (const skillSet of enrichedSkillSets) {
        for (const group of skillSet.socketGroups) {
          for (const gem of group.gems) {
            if (gem.enabled !== false && gem.nameSpec) {
              // Create unique key: gemName + act + quest to deduplicate gems that appear in multiple skill sets
              const uniqueKey = `${gem.nameSpec}|${gem.act || 0}|${gem.quest || 'none'}`;
              
              // Only add if not already present (prevents duplicates from multiple skill sets using same gems)
              if (!gemMap.has(uniqueKey)) {
                gemMap.set(uniqueKey, {
                  name: gem.nameSpec,
                  level: gem.level || 1,
                  quality: gem.quality || 0,
                  enabled: gem.enabled,
                  // Quest info from enrichment
                  act: gem.act,
                  quest: gem.quest,
                  vendor: gem.vendor,
                  rewardType: gem.rewardType,
                  isSupport: gem.isSupport,
                  availableFrom: gem.availableFrom
                });
              }
            }
          }
        }
      }
      
      const allEnrichedGems = Array.from(gemMap.values());
      
      console.log('[PoB Import] Flattened', allEnrichedGems.length, 'unique enriched gems from all skill sets');
      console.log('[PoB Import] Gems per act:', 
        Array.from(new Set(allEnrichedGems.map(g => g.act)))
          .sort()
          .map(act => `Act ${act}: ${allEnrichedGems.filter(g => g.act === act).length} gems`)
          .join(', ')
      );

      // Store PoB build in settings
      const pobBuild: StoredPobBuild = {
        code: code,
        className: build.className,
        ascendancyName: build.ascendancyName,
        characterName: build.characterName,
        level: build.level,
        treeSpecs: build.treeSpecs, // Store ALL specs
        allocatedNodes: allocatedNodes, // Current selected spec nodes
        treeProgression: treeProgression,
        gems: allEnrichedGems, // Flat list of ALL gems from ALL skill sets with per-act quest info
        socketGroups: enrichedSocketGroups, // Socket groups with quest info (from first skill set)
        skillSets: enrichedSkillSets, // ALL skill sets with quest info enriched
        treeVersion: build.treeVersion,
        importedAt: Date.now()
      };

      this.settingsService.update(this.getLevelingWindowKey(), (c) => ({
        ...c,
        pobBuild: pobBuild
      }));

      console.log('[PoB Import] Build saved to settings');

      // Send update to renderer
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('pob-build-imported', pobBuild);
      }

      // Open PoB info bar with tree and gems buttons
      const currentActIndex = this.settingsService.get(this.getLevelingWindowKey())?.currentActIndex ?? 0;
      openPobInfoBar({
        settingsService: this.settingsService,
        overlayVersion: this.overlayVersion,
        pobBuild: pobBuild,
        currentAct: currentActIndex + 1
      });

      return {
        success: true,
        build: {
          className: build.className,
          ascendancyName: build.ascendancyName,
          level: build.level,
          totalNodes: firstTreeSpec.allocatedNodes.length,
          gemsFound: gemsWithQuests.length
        }
      };
    } catch (error: any) {
      console.error('[PoB Import] Error:', error);
      return {
        success: false,
        error: error.message || 'Failed to import PoB code'
      };
    }
  }

  private buildDataUrl(): string {
    const html = buildLevelingPopoutHtml();
    return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  }
}
