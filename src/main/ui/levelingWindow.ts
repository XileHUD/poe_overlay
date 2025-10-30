import { BrowserWindow, screen, ipcMain, globalShortcut } from 'electron';
import { SettingsService, type CustomHotkey } from '../services/settingsService.js';
import { buildLevelingPopoutHtml } from '../popouts/levelingPopoutTemplate.js';
import { registerOverlayWindow, bringToFront } from './windowZManager.js';
import { openLevelingSettingsSplash } from './levelingSettingsSplash.js';
import { openPobInfoBar, closePobInfoBar, updatePobInfoBar, isPobInfoBarOpen } from './pobInfoBar.js';
import { openLevelingGemsWindow, updateLevelingGemsWindow, updateLevelingGemsWindowBuild, updateLevelingGemsWindowCharacterLevel, closeLevelingGemsWindow, isGemsWindowOpen } from './levelingGemsWindow.js';
import { openLevelingNotesWindow, updateNotesWindow, closeNotesWindow, isNotesWindowOpen } from './levelingNotesWindow.js';
import { openLevelingGearWindow, updateGearWindow, updateGearWindowContext, closeGearWindow, isGearWindowOpen } from './levelingGearWindow.js';
import { createPassiveTreeWindow, sendTreeData, updateTreeWindowContext, isTreeWindowOpen, closeTreeWindow } from '../windows/levelingTreeWindow.js';
import { levelingHotkeyManager } from '../hotkeys/levelingHotkeyManager.js';
import { executeLogout, typeInChat } from '../utils/chatCommand.js';
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
  private registeredHotkeys: string[] = [];
  // Ultra-mode hover tracker
  private ultraHoverInterval: NodeJS.Timeout | null = null;
  private ultraHoverActive: boolean = false;

  constructor(params: LevelingWindowParams) {
    this.settingsService = params.settingsService;
    this.overlayVersion = params.overlayVersion;
    const saved = this.settingsService.get(this.getLevelingWindowKey());
    this.isWideMode = saved?.wideMode ?? false;
    this.loadLevelingData();
    this.loadZoneRegistry();
    this.loadProgress();
    this.registerIpcHandlers();
    this.registerHotkeys();
    
    // Auto-detect client.txt on first run (if not already attempted)
    this.autoDetectClientTxtOnStartup();
  }

  // Hotkeys are global again; no foreground gating.

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
    this.startClientTxtWatcher();
    this.settingsService.update(this.getLevelingWindowKey(), (c) => ({ ...c, enabled: true }));
  }

  hide(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.savePosition();
      this.window.close();
      this.window = null;
    }
    this.stopClientTxtWatcher();
    this.settingsService.update(this.getLevelingWindowKey(), (c) => ({ ...c, enabled: false }));
  }

  toggle(): void {
    this.isVisible() ? this.hide() : this.show();
  }

  forceToPrimaryMonitor(): void {
    if (!this.window || this.window.isDestroyed()) {
      console.warn('[LevelingWindow] Cannot force to primary - window not open');
      return;
    }
    
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    const primaryBounds = primaryDisplay.bounds;
    const { w, h } = this.getTargetSize();
    
    // Position on primary monitor (top-right corner with margin)
    const x = Math.round(primaryBounds.x + width - w - 20);
    const y = primaryBounds.y + 20;
    
    this.window.setPosition(x, y);
    
    // Save the new position
    this.settingsService.update(this.getLevelingWindowKey(), (c) => ({
      ...c,
      position: { x, y }
    }));
    
    console.log(`[LevelingWindow] Forced window to primary monitor at (${x}, ${y})`);
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
    
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    const primaryBounds = primaryDisplay.bounds;
    
    // Get all displays to check if saved position is off-screen
    const allDisplays = screen.getAllDisplays();

    const { w, h } = this.getTargetSize();
    let x = saved?.position?.x ?? Math.round(width - w - 20);
    let y = saved?.position?.y ?? 20;
    let positionReset = false;
    
    // Check if the saved position is visible on any current display
    if (saved?.position) {
      const savedX = saved.position.x;
      const savedY = saved.position.y;
      
      // Check if ANY part of the window would be visible on ANY display
      const isOnScreen = allDisplays.some(display => {
        const bounds = display.bounds;
        // Window is visible if it overlaps with the display bounds
        const windowRight = savedX + w;
        const windowBottom = savedY + h;
        const displayRight = bounds.x + bounds.width;
        const displayBottom = bounds.y + bounds.height;
        
        const horizontalOverlap = savedX < displayRight && windowRight > bounds.x;
        const verticalOverlap = savedY < displayBottom && windowBottom > bounds.y;
        
        return horizontalOverlap && verticalOverlap;
      });
      
      if (!isOnScreen) {
        console.warn(`[LevelingWindow] Saved position is off-screen (monitor disconnected?), moving to primary display`);
        // Use primary display bounds to ensure window is within the primary screen
        x = Math.round(primaryBounds.x + width - w - 20);
        y = primaryBounds.y + 20;
        positionReset = true;
      }
    }
    
    // Only reset position if it's completely off-screen (already handled above)
    // Do NOT clamp to primary display - allow positioning on secondary monitors
    
    // Save the corrected position immediately if we reset it
    if (positionReset) {
      this.settingsService.update(this.getLevelingWindowKey(), (c) => ({
        ...c,
        position: { x, y }
      }));
    }

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
        webSecurity: false,
        devTools: true,
      },
    });

    // Enable F12 to open DevTools
    this.window.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' && input.type === 'keyDown') {
          if (this.window && !this.window.isDestroyed()) {
            if (this.window.webContents.isDevToolsOpened()) {
              this.window.webContents.closeDevTools();
            } else {
              this.window.webContents.openDevTools({ mode: 'detach' });
            }
          }
        }
      });

      // Set higher z-order (platform-tuned)
      console.log(`[LevelingWindow] Setting z-order (platform: ${process.platform})...`);
      try {
        if (process.platform === 'win32') {
          this.window.setAlwaysOnTop(true, 'screen-saver');
        } else {
          this.window.setAlwaysOnTop(true, 'pop-up-menu');
        }
        console.log(`[LevelingWindow] ✓ Z-order set successfully`);
      } catch (e) {
        console.warn('[LevelingWindow] ⚠ Failed to set z-order:', e);
      }

      this.window.setIgnoreMouseEvents(false);

      // Register with overlay z-order manager for consistent behavior
      console.log(`[LevelingWindow] Registering window with overlay z-order manager...`);
      try { 
        registerOverlayWindow('leveling', this.window);
        console.log(`[LevelingWindow] ✓ Registered with overlay manager`);
      } catch (e) {
        console.warn(`[LevelingWindow] ⚠ Failed to register with overlay manager:`, e);
      }

      // Load inline HTML (like floating button does)
      console.log(`[LevelingWindow] Loading window HTML via data URL...`);
      const dataUrl = this.buildDataUrl();
      this.window.loadURL(dataUrl);
      console.log(`[LevelingWindow] ✓ Window HTML loaded`);

      // Check if there's a saved PoB build and auto-open the info bar
      this.window.webContents.once('did-finish-load', () => {
        const saved = this.settingsService.get(this.getLevelingWindowKey());
        const pobBuild = (saved as any)?.pobBuild;
        if (pobBuild) {
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
        console.log(`[LevelingWindow] Window 'closed' event fired`);
        this.stopClientTxtWatcher();
        this.stopUltraHoverTracker();
        this.window = null;
      });

      // Extra z-order protection: on blur (e.g. user clicks the game), aggressively
      // re-assert always-on-top and moveTop for this leveling window. This helps
      // when minimal/ultra modes interact oddly with some fullscreen/borderless games
      // where the OS can demote our window despite setAlwaysOnTop.
      try {
        this.window.on('blur', () => {
          if (!this.window || this.window.isDestroyed() || !this.window.isVisible()) return;

          // Fire a few nudges over time to try and regain topmost state.
          const nudge = () => {
            try {
              // Reassert high-level topmost
              this.window?.setAlwaysOnTop(true, 'screen-saver', 1);
              // If moveTop is available (native window helper), call it
              if (typeof (this.window as any).moveTop === 'function') {
                try { (this.window as any).moveTop(); } catch {}
              }
            } catch {}
          };

          // Immediate and delayed nudges
          setTimeout(nudge, 20);
          setTimeout(nudge, 120);
          setTimeout(nudge, 500);
        });
      } catch (e) {
        // Non-fatal
      }

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

  /**
   * Check if a zone name is a valid zone in the zone registry.
   * Uses fuzzy matching to handle "The" prefix differences.
   * This prevents false positives from null/empty SCENE entries.
   */
  private isValidZone(zoneName: string): boolean {
    if (!zoneName || zoneName.trim() === '' || zoneName === '(null)' || zoneName === 'null') {
      return false;
    }
    
    if (!this.zoneRegistry || !this.zoneRegistry.zonesByAct) {
      return false;
    }

    // Normalize zone name for fuzzy matching (remove "The" prefix, trim, lowercase)
    const normalizeZone = (name: string): string => {
      return name.trim().toLowerCase().replace(/^the\s+/i, '');
    };
    
    const normalizedInput = normalizeZone(zoneName);
    
    // Check if zone exists in any act with fuzzy matching
    for (const act of this.zoneRegistry.zonesByAct) {
      if (act.locations) {
        for (const location of act.locations) {
          // Check main zone name
          if (normalizeZone(location.zoneName) === normalizedInput) {
            return true;
          }
          // Check alternative name if it exists
          if (location.alternativeName && normalizeZone(location.alternativeName) === normalizedInput) {
            return true;
          }
        }
      }
    }
    
    return false;
  }

  /**
   * Get zone name from area code (like "1_1_11_1").
   * This is the CORRECT way to detect zones - area codes are unique and reliable.
   * Based on how Exile-UI does zone detection.
   */
  private getZoneNameFromAreaCode(areaCode: string): string | null {
    if (!areaCode || !this.zoneRegistry || !this.zoneRegistry.zonesByAct) {
      return null;
    }

    // Search through all acts to find the zone with this area code
    for (const act of this.zoneRegistry.zonesByAct) {
      if (act.locations) {
        for (const location of act.locations) {
          // Check if this location has the matching area code (zoneKey)
          if (location.zoneKey === areaCode) {
            return location.zoneName;
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Get the act number from an area code.
   * Returns null if area code not found in registry.
   */
  private getActNumberFromAreaCode(areaCode: string): number | null {
    if (!areaCode || !this.zoneRegistry || !this.zoneRegistry.zonesByAct) {
      return null;
    }

    // Search through all acts to find the zone with this area code
    for (const act of this.zoneRegistry.zonesByAct) {
      if (act.locations) {
        for (const location of act.locations) {
          if (location.zoneKey === areaCode) {
            return act.actId; // Return the act number
          }
        }
      }
    }
    
    return null;
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
        settings: saved?.uiSettings ?? {},
        characterName: saved?.characterName ?? null,
        characterClass: saved?.characterClass ?? null,
        characterLevel: saved?.characterLevel ?? null
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
      
      // Update tree and gear windows with new act
      const saved = this.settingsService.get(this.getLevelingWindowKey());
      const characterLevel = (saved as any)?.characterLevel || 1;
      updateTreeWindowContext(actIndex + 1, characterLevel);
      updateGearWindowContext(actIndex + 1, characterLevel);
      
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

    // Save character info
    ipcMain.handle('set-character-info', async (event, info: { name?: string, class?: string, level?: number }) => {
      this.settingsService.update(this.getLevelingWindowKey(), (c) => ({
        ...c,
        characterName: info.name !== undefined ? info.name : c?.characterName,
        characterClass: info.class !== undefined ? info.class : c?.characterClass,
        characterLevel: info.level !== undefined ? info.level : c?.characterLevel
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
      
      // Reset act timers, current act index, and character info
      const saved = this.settingsService.get(this.getLevelingWindowKey());
      if (saved) {
        saved.actTimers = {};
        saved.currentActIndex = 0;
        saved.characterLevel = undefined;
        saved.characterName = undefined;
        saved.characterClass = undefined;
        this.settingsService.set(this.getLevelingWindowKey(), saved);
      }
      this.saveProgress();
      
      // Notify renderer to clear character display
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('character-level-up', {
          name: null,
          class: null,
          level: null
        });
      }
      
      return true;
    });

    // Get act times summary
    ipcMain.handle('get-act-times-summary', async () => {
      const saved = this.settingsService.get(this.getLevelingWindowKey());
      if (!saved || !saved.actTimers || Object.keys(saved.actTimers).length === 0) {
        return null;
      }

      const formatTime = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');
      };

      const lines: string[] = ['Act Speedrunning Summary\n========================'];
      let total = 0;

      const actTimers = saved.actTimers;
      Object.keys(actTimers).sort((a, b) => parseInt(a) - parseInt(b)).forEach(actNum => {
        const time = actTimers[parseInt(actNum)];
        if (time !== undefined) {
          lines.push('Act ' + actNum + ': ' + formatTime(time));
          total += time;
        }
      });

      lines.push('------------------------');
      lines.push('Total: ' + formatTime(total));
      
      return lines.join('\n');
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

    // Ultra mode: renderer notifies main to enable header hover tracking
    ipcMain.on('ultra-mode-change', (_event, payload: { enabled: boolean }) => {
      const enabled = !!(payload && payload.enabled);
      if (enabled) {
        this.startUltraHoverTracker();
      } else {
        this.stopUltraHoverTracker();
        if (this.window && !this.window.isDestroyed()) {
          this.window.setIgnoreMouseEvents(false);
        }
      }
    });

    // Open leveling settings splash
    ipcMain.handle('open-leveling-settings', async (event, tabName?: string) => {
      openLevelingSettingsSplash({
        settingsService: this.settingsService,
        overlayVersion: this.overlayVersion,
        overlayWindow: this.window,
        initialTab: tabName
      });
      return true;
    });

    // Handle settings updates from settings splash
    ipcMain.on('leveling-settings-update', (event, updates: any) => {
      try { console.log('[LevelingWindow] settings-update incoming:', updates); } catch {}
      this.settingsService.update(this.getLevelingWindowKey(), (current: any) => {
        const updated: any = { ...(current || {}) };
        
        // UI settings should be nested under uiSettings
        const uiSettingKeys = ['opacity', 'fontSize', 'zoomLevel', 'visibleSteps', 'groupByZone', 'showHints', 'showOptional', 'showTreeNodeDetails', 'autoDetectLevelingSets'];
        const uiUpdates: any = {};
        const otherUpdates: any = {};
        
        for (const [key, value] of Object.entries(updates)) {
          if (uiSettingKeys.includes(key)) {
            uiUpdates[key] = value;
          } else {
            otherUpdates[key] = value;
          }
        }
        
        // Merge UI settings properly
        if (Object.keys(uiUpdates).length > 0) {
          updated.uiSettings = { ...((current || {}).uiSettings || {}), ...uiUpdates };
        }
        
        const finalSettings = { ...updated, ...otherUpdates };
        try { console.log('[LevelingWindow] settings-update merged:', finalSettings?.uiSettings); } catch {}
        return finalSettings;
      });
      
      // Notify renderer of setting changes
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('leveling-settings-changed', updates);
      }
    });

    // Handle hotkey updates from settings splash
    ipcMain.on('leveling-hotkey-update', (event, { hotkeyName, accelerator }) => {
      const current = this.settingsService.get(this.getLevelingWindowKey()) || {};
      const currentHotkeys = (current as any).hotkeys || {};
      
      this.settingsService.update(this.getLevelingWindowKey(), (c) => ({
        ...c,
        hotkeys: {
          ...currentHotkeys,
          [hotkeyName]: accelerator
        }
      } as any));
      
      // Re-register hotkeys
      this.registerHotkeys();
    });

    // Handle custom hotkeys update
    ipcMain.on('leveling-custom-hotkeys-update', (event, customHotkeys: CustomHotkey[]) => {
      this.settingsService.update(this.getLevelingWindowKey(), (c) => ({
        ...c,
        customHotkeys
      } as any));
      
      // Re-register hotkeys
      this.registerHotkeys();
    });

    // Open/toggle gems window from PoB info bar
    ipcMain.on('open-pob-gems-window', () => {
      const currentSettings = this.settingsService.get(this.getLevelingWindowKey()) || {};
      const pobBuild = (currentSettings as any).pobBuild || null;
      const currentActIndex = (currentSettings as any).currentActIndex || 0;
      const currentAct = currentActIndex + 1; // Convert index to act number
      
      if (!pobBuild) {
        console.warn('[LevelingWindow] Cannot open gems window - no PoB build loaded');
        return;
      }
      
      if (isGemsWindowOpen()) {
        closeLevelingGemsWindow();
        // Reassert leveling overlay order without stealing focus
        try { bringToFront('leveling'); } catch {}
        console.log('[LevelingWindow] Gems window closed (toggle)');
      } else {
        console.log('[LevelingWindow] Opening gems window for Act', currentAct);
        openLevelingGemsWindow({
          settingsService: this.settingsService,
          overlayVersion: this.overlayVersion,
          parentWindow: this.window || undefined
        });
      }
    });

    // Open/toggle passive tree window from PoB info bar
    ipcMain.on('open-pob-tree-window', () => {
      const currentSettings = this.settingsService.get(this.getLevelingWindowKey()) || {};
      const pobBuild = (currentSettings as any).pobBuild || null;
      
      if (!pobBuild || !pobBuild.treeSpecs || pobBuild.treeSpecs.length === 0) {
        console.warn('[LevelingWindow] Cannot open tree window - no PoB build with trees loaded');
        return;
      }
      
      if (isTreeWindowOpen()) {
        closeTreeWindow();
        console.log('[LevelingWindow] Tree window closed (toggle)');
      } else {
        console.log('[LevelingWindow] Opening tree window with', pobBuild.treeSpecs.length, 'tree specs for', this.overlayVersion);
  const saved = this.settingsService.get(this.getLevelingWindowKey());
        const currentActIndex = (saved as any)?.currentActIndex || 0;
        const characterLevel = (saved as any)?.characterLevel || 1;
        const autoDetectEnabled = (saved as any)?.uiSettings?.autoDetectLevelingSets ?? true;
  const savedTreeIndex = (saved as any)?.selectedTreeIndex;
        const onTreeWindowReady = () => {
          console.log('[LevelingWindow] Tree window reported ready, sending data');
          sendTreeData(pobBuild.treeSpecs, this.overlayVersion, currentActIndex + 1, characterLevel, autoDetectEnabled, savedTreeIndex);
        };
        ipcMain.once('tree-window-ready', onTreeWindowReady);
        const treeWindow = createPassiveTreeWindow();
        if (!treeWindow.webContents.isLoading()) {
          ipcMain.removeListener('tree-window-ready', onTreeWindowReady);
          console.log('[LevelingWindow] Tree window already loaded, sending data immediately');
          sendTreeData(pobBuild.treeSpecs, this.overlayVersion, currentActIndex + 1, characterLevel, autoDetectEnabled, savedTreeIndex);
        }
      }
    });

    // Open/toggle notes window from PoB info bar
    ipcMain.on('open-pob-notes-window', () => {
      const currentSettings = this.settingsService.get(this.getLevelingWindowKey()) || {};
      const pobBuild = (currentSettings as any).pobBuild || null;
      
      if (isNotesWindowOpen()) {
        closeNotesWindow();
        // Reassert leveling overlay order without stealing focus
        try { bringToFront('leveling'); } catch {}
        console.log('[LevelingWindow] Notes window closed (toggle)');
      } else {
        console.log('[LevelingWindow] Opening notes window');
        openLevelingNotesWindow({
          settingsService: this.settingsService,
          overlayVersion: this.overlayVersion,
          parentWindow: this.window || undefined
        });
      }
    });

    // Open/toggle gear window from PoB info bar
    ipcMain.on('open-pob-gear-window', () => {
      const currentSettings = this.settingsService.get(this.getLevelingWindowKey()) || {};
      const pobBuild = (currentSettings as any).pobBuild || null;
      
      if (isGearWindowOpen()) {
        closeGearWindow();
        // Reassert leveling overlay order without stealing focus
        try { bringToFront('leveling'); } catch {}
        console.log('[LevelingWindow] Gear window closed (toggle)');
      } else {
        console.log('[LevelingWindow] Opening gear window');
        openLevelingGearWindow({
          settingsService: this.settingsService,
          overlayVersion: this.overlayVersion,
          parentWindow: this.window || undefined
        });
        
        // Send initial context for auto-detection
        const saved = this.settingsService.get(this.getLevelingWindowKey());
        const currentAct = (saved as any)?.currentActIndex + 1 || 1;
        const characterLevel = (saved as any)?.characterLevel || 1;
        
        // Use setTimeout to ensure window is ready
        setTimeout(() => {
          updateGearWindowContext(currentAct, characterLevel);
        }, 100);
      }
    });

    // Close gems window
    ipcMain.on('leveling-gems-window-close', () => {
      closeLevelingGemsWindow();
    });
    
    // Close notes window
    ipcMain.on('leveling-notes-window-close', () => {
      closeNotesWindow();
    });
    
    // Close gear window
    ipcMain.on('leveling-gear-window-close', () => {
      closeGearWindow();
    });
    
    // Handle tree spec selection (save user's manual choice)
    ipcMain.on('tree-spec-selected', (event, specIndex: number) => {
      console.log('[LevelingWindow] Saving tree spec selection:', specIndex, 'to key:', this.getLevelingWindowKey());
      this.settingsService.update(this.getLevelingWindowKey(), (current: any) => {
        const updated = {
          ...current,
          selectedTreeIndex: specIndex, // Root-level persistent selection
        };
        console.log('[LevelingWindow] Updated settings:', updated);
        return updated;
      });
      console.log('[LevelingWindow] Settings saved successfully');
    });
    
    // Handle gems set selection (save user's manual choice)
    ipcMain.on('gems-set-selected', (event, setIndex: number) => {
      this.settingsService.update(this.getLevelingWindowKey(), (current: any) => ({
        ...current,
        selectedGemsIndex: setIndex, // Root-level persistent selection
      }));
    });
    
    // Act changed - notify gems, tree, and gear windows
    ipcMain.on('leveling-act-changed', (event, actNumber: number) => {
      updateLevelingGemsWindow(actNumber, this.overlayVersion, this.settingsService);
      
      const saved = this.settingsService.get(this.getLevelingWindowKey());
      const characterLevel = (saved as any)?.characterLevel || 1;
      updateTreeWindowContext(actNumber, characterLevel);
      updateGearWindowContext(actNumber, characterLevel);
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

    // Force window to primary monitor
    ipcMain.handle('force-to-primary-monitor', async () => {
      if (!this.window || this.window.isDestroyed()) {
        return { success: false, message: 'Window not open' };
      }
      
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.workAreaSize;
      const primaryBounds = primaryDisplay.bounds;
      const { w, h } = this.getTargetSize();
      
      // Position on primary monitor (top-right corner with margin)
      const x = Math.round(primaryBounds.x + width - w - 20);
      const y = primaryBounds.y + 20;
      
      this.window.setPosition(x, y);
      
      // Save the new position
      this.settingsService.update(this.getLevelingWindowKey(), (c) => ({
        ...c,
        position: { x, y }
      }));
      
      console.log(`[LevelingWindow] Moved window to primary monitor at (${x}, ${y})`);
      return { success: true };
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

    // Note: Client.txt watcher is started/stopped via show()/hide() methods
    // to ensure it only runs when the leveling window is actually open
  }

  private clientTxtWatcher: fs.FSWatcher | null = null;
  private clientTxtPath: string | null = null;
  private lastFilePosition: number = 0;
  private lastZoneAreaCode: string | null = null; // Track last zone area code (simple prev/current tracking)

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
    
    // Find the LAST "Generating level" entry in the file to detect current zone
    try {
      const stats = fs.statSync(clientPath);
      const fileSize = stats.size;
      
      // Read last chunk of file (last 50KB should be enough to find recent zone)
      const chunkSize = Math.min(50000, fileSize);
      const buffer = Buffer.alloc(chunkSize);
      const fd = fs.openSync(clientPath, 'r');
      fs.readSync(fd, buffer, 0, chunkSize, fileSize - chunkSize);
      fs.closeSync(fd);
      
      const recentContent = buffer.toString('utf8');
      const lines = recentContent.split('\n');
      
      // Search backwards for the LAST "Generating level" entry
      let lastZoneEntry = null;
      for (let i = lines.length - 1; i >= 0; i--) {
        const match = lines[i].match(/\[DEBUG Client \d+\] Generating level (\d+) area "([^"]+)" with seed (\d+)/);
        if (match) {
          lastZoneEntry = { areaCode: match[2], seed: match[3], level: match[1], zoneName: this.getZoneNameFromAreaCode(match[2]) };
          console.log(`[STARTUP] Found zone entry: level ${match[1]}, area "${match[2]}", seed ${match[3]}`);
          break;
        }
      }
      
      if (lastZoneEntry && lastZoneEntry.zoneName) {
        const actNumber = this.getActNumberFromAreaCode(lastZoneEntry.areaCode);
        console.log(`[STARTUP] Detected current zone: ${lastZoneEntry.areaCode} → "${lastZoneEntry.zoneName}" (Act ${actNumber})`);
        
        // Set as last zone (no dedup needed on startup)
        this.lastZoneAreaCode = lastZoneEntry.areaCode;
        
        // Send to renderer to auto-check the current zone
        if (this.window && !this.window.isDestroyed()) {
          this.window.webContents.send('zone-entered', { zoneName: lastZoneEntry.zoneName, actNumber });
        }
      } else {
        console.log(`[STARTUP] No recent zone detected in last ${chunkSize} bytes`);
      }
      
      // Set file position to end for future monitoring
      this.lastFilePosition = fileSize;
      console.log(`[STARTUP] File position set to: ${this.lastFilePosition}`);
    } catch (error) {
      console.error('[STARTUP] Error reading initial file state:', error);
      this.lastFilePosition = 0;
    }

    // Use fs.watchFile (polling-based) instead of fs.watch for better reliability on Windows
    // Check every 500ms for changes
    fs.watchFile(clientPath, { interval: 500 }, (curr, prev) => {
      if (curr.mtime > prev.mtime) {
        console.log('[WATCHER] File modified, checking for changes...');
        this.handleClientTxtChange(clientPath);
      }
    });
    
    console.log('[WATCHER] File watcher started successfully');
  }

  private handleClientTxtChange(filePath: string) {
    try {
      const stats = fs.statSync(filePath);
      const currentSize = stats.size;

      console.log(`[CLIENT.TXT] Current size: ${currentSize}, Last position: ${this.lastFilePosition}`);

      // Handle truncation or rotation: if file shrank, reset pointer to 0 to avoid missing new lines
      if (currentSize < this.lastFilePosition) {
        console.log('[CLIENT.TXT] File truncated or rotated. Resetting read position to 0.');
        this.lastFilePosition = 0;
      }

      // Only read if file has grown beyond last position
      if (currentSize === this.lastFilePosition) {
        console.log('[CLIENT.TXT] No new content (file size unchanged)');
        return;
      }

      const bytesToRead = currentSize - this.lastFilePosition;
      console.log(`[CLIENT.TXT] Reading ${bytesToRead} bytes from position ${this.lastFilePosition} to ${currentSize}`);

      // Read only the new content
      const buffer = Buffer.alloc(bytesToRead);
      const fd = fs.openSync(filePath, 'r');
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, this.lastFilePosition);
      fs.closeSync(fd);

      console.log(`[CLIENT.TXT] Actually read ${bytesRead} bytes`);

      const newContent = buffer.toString('utf8');
      this.lastFilePosition = currentSize;

      const lineCount = newContent.split('\n').filter(l => l.trim()).length;
      console.log(`[CLIENT.TXT] Parsed ${lineCount} lines from new content`);
      console.log('[CLIENT.TXT] First 300 chars:', newContent.substring(0, 300));

      // CORRECT Zone Detection: Use "Generating level" pattern with area codes
      // Format: [DEBUG Client XXXX] Generating level XX area "AREA_CODE" with seed XXXXXXXX
      // Example: 2025/10/30 02:00:50 30813843 1186a003 [DEBUG Client 3488] Generating level 12 area "1_1_11_1" with seed 2987920182
      // This is how Exile-UI does it - area codes are unique and never NULL
      
      const lines = newContent.split('\n');
      console.log(`[ZONE DETECTION] Processing ${lines.length} lines for zone detection...`);
      
      let zoneDetectionCount = 0;
      let lineNumber = 0;
      
      for (const line of lines) {
        lineNumber++;
        
        // PRIMARY DETECTION: Area code from "Generating level" entry (uses double quotes)
        const generatingMatch = line.match(/\[DEBUG Client \d+\] Generating level (\d+) area "([^"]+)" with seed (\d+)/);
        
        if (generatingMatch) {
          const [fullMatch, areaLevel, areaCode, areaSeed] = generatingMatch;
          console.log(`[ZONE DETECTION] Line ${lineNumber}: Found "Generating level" pattern`);
          console.log(`[ZONE DETECTION]   Full match: ${fullMatch}`);
          console.log(`[ZONE DETECTION]   Area code: "${areaCode}", Level: ${areaLevel}, Seed: ${areaSeed}`);
          
          // Look up the zone name from the area code using the zone registry
          const zoneName = this.getZoneNameFromAreaCode(areaCode);
          const actNumber = this.getActNumberFromAreaCode(areaCode);
          
          if (!zoneName || actNumber === null) {
            console.log(`[ZONE DETECTION]   ❌ Unknown area code: "${areaCode}" (level ${areaLevel})`);
            continue;
          }
          
          zoneDetectionCount++;
          console.log(`[ZONE DETECTION]   ✅ Mapped to zone: "${zoneName}" (Act ${actNumber})`);
          
          // Simple zone tracking: Only send if this is a DIFFERENT zone than last time
          // NO deduplication, NO seed checking - just prev/current zone tracking
          if (areaCode !== this.lastZoneAreaCode) {
            console.log(`[ZONE DETECTION]   🎯 ZONE CHANGED! From "${this.lastZoneAreaCode || 'none'}" to "${areaCode}"`);
            console.log(`[ZONE DETECTION]   Sending "${zoneName}" (Act ${actNumber}) to renderer`);
            
            // Update last zone
            this.lastZoneAreaCode = areaCode;
            
            // Send zone NAME and ACT NUMBER to renderer
            if (this.window && !this.window.isDestroyed()) {
              this.window.webContents.send('zone-entered', { zoneName, actNumber });
            } else {
              console.log(`[ZONE DETECTION]   ⚠️ Window not available, cannot send zone-entered event`);
            }
          } else {
            console.log(`[ZONE DETECTION]   ⏭️ Same zone as before: ${areaCode} (${zoneName})`);
          }
        }
      }

      console.log(`[ZONE DETECTION] Summary: Found ${zoneDetectionCount} "Generating level" entries in ${lines.length} lines`);
      
      if (zoneDetectionCount === 0) {
        console.log('[ZONE DETECTION] ⚠️ No "Generating level" entries found in new content');
        console.log('[ZONE DETECTION] Sample lines from content:');
        lines.slice(0, 5).forEach((line, i) => {
          console.log(`  Line ${i + 1}: ${line.substring(0, 100)}`);
        });
      }

      // Level-up detection (same for both POE1 and POE2)
      const levelRegex = /\[INFO Client \d+\] : (.+?) \((\w+)\) is now level (\d+)/g;
      let match;
      while ((match = levelRegex.exec(newContent)) !== null) {
        const [, characterName, className, levelStr] = match;
        const level = parseInt(levelStr, 10);
        console.log(`Character level up: ${characterName} (${className}) → Level ${level}`);

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
        
        // Update gems window with new character level
        updateLevelingGemsWindowCharacterLevel(level);
        
        // Update tree and gear windows context with new level
        const saved = this.settingsService.get(this.getLevelingWindowKey());
        const currentAct = (saved as any)?.currentActIndex + 1 || 1;
        updateTreeWindowContext(currentAct, level);
        updateGearWindowContext(currentAct, level);
      }
    } catch (error: any) {
      // Provide more detailed error information
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        console.error('[Client.txt] Access denied - file may be locked by antivirus or permissions issue:', error.message);
      } else if (error.code === 'ENOENT') {
        console.error('[Client.txt] File not found - it may have been moved or deleted:', error.message);
      } else {
        console.error('[Client.txt] Error reading file changes:', error);
      }
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

  // Toggle window click-through based on cursor hovering the ultra header area
  private startUltraHoverTracker() {
    if (this.ultraHoverInterval) return;
    this.ultraHoverActive = true;
    const headerHeight = 72; // px, matches ultra header stack
    const pollIntervalMs = 40;

    this.ultraHoverInterval = setInterval(() => {
      if (!this.window || this.window.isDestroyed()) return;
      try {
        const bounds = this.window.getBounds();
        const pt = screen.getCursorScreenPoint();
        const withinX = pt.x >= bounds.x && pt.x <= bounds.x + bounds.width;
        const withinY = pt.y >= bounds.y && pt.y <= bounds.y + headerHeight;
        const overHeader = withinX && withinY;

        if (overHeader) {
          this.window.setIgnoreMouseEvents(false);
        } else {
          this.window.setIgnoreMouseEvents(true, { forward: true });
        }
      } catch (e) {
        // Fail-safe: keep window interactive
        this.window?.setIgnoreMouseEvents(false);
      }
    }, pollIntervalMs);
  }

  private stopUltraHoverTracker() {
    this.ultraHoverActive = false;
    if (this.ultraHoverInterval) {
      clearInterval(this.ultraHoverInterval);
      this.ultraHoverInterval = null;
    }
  }

  private async importPobCode(code: string): Promise<any> {
    try {
      console.log('[PoB Import] Parsing PoB code...');
      
      // Parse PoB code (now async to support fetching pobb.in URLs)
      const build = await parsePobCode(code, this.overlayVersion);
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

      // Filter out header-only tree specs with no nodes before saving/using
      const hasNodes = (spec: any) => {
        const a = Array.isArray(spec?.parsedUrl?.nodes) ? spec.parsedUrl.nodes : [];
        const b = Array.isArray(spec?.allocatedNodes) ? spec.allocatedNodes : [];
        return (a.length > 0) || (b.length > 0);
      };
      const filteredTreeSpecs = (build.treeSpecs || []).filter(hasNodes);
      const treeSpecsToUse = filteredTreeSpecs.length > 0 ? filteredTreeSpecs : build.treeSpecs;

      // Use the first non-empty tree spec
      const firstTreeSpec = treeSpecsToUse[0];
      const allocatedNodes = firstTreeSpec.allocatedNodes;

  console.log('[PoB Import] Using tree spec:', firstTreeSpec.title);
  console.log('[PoB Import] Tree specs available:', treeSpecsToUse.map(s => s.title).join(', '));

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
      
      // Extract gems without quest matching - matching happens at render time per-step
      const pobGems = matchGemsToQuestSteps(uniqueGems, this.levelingData, build.className);

      console.log('[PoB Import] Extracted', pobGems.length, 'unique gems for dynamic matching');
      
      // Enrich socket groups with gem names for display
      const enrichedSocketGroups = build.gems.map(group => ({
        ...group,
        gems: group.gems.map(gem => {
          const matchedGem = pobGems.find(g => g.name.toLowerCase() === (gem.nameSpec || '').toLowerCase());
          return matchedGem ? { ...gem, ...matchedGem } : gem;
        })
      }));

      // Enrich ALL skill sets with gem info (not just the first one)
      const enrichedSkillSets = (build.skillSets || []).map(skillSet => ({
        ...skillSet,
        socketGroups: skillSet.socketGroups.map(group => ({
          ...group,
          gems: group.gems.map(gem => {
            const matchedGem = pobGems.find(g => g.name.toLowerCase() === (gem.nameSpec || '').toLowerCase());
            return matchedGem ? { ...gem, ...matchedGem } : gem;
          })
        }))
      }));

      console.log('[PoB Import] Enriched', enrichedSkillSets.length, 'skill sets with gem data');

      // Store the flat gem list for dynamic matching at render time
      // No quest data attached - matching happens per-step
      const allGems = pobGems.map(gem => ({
        name: gem.name,
        level: gem.level || 1,
        quality: 0,
        enabled: true,
        isSupport: gem.isSupport,
        act: 0, // Will be determined at render time
        quest: undefined,
        vendor: undefined,
        rewardType: undefined as 'quest' | 'vendor' | undefined,
        availableFrom: undefined,
        skillSetTitle: gem.skillSetTitle // Preserve skillSet title
      }));
      
      console.log('[PoB Import] Stored', allGems.length, 'gems for per-step matching');

      // Store PoB build in settings
      const pobBuild: StoredPobBuild = {
        code: code,
        className: build.className,
        ascendancyName: build.ascendancyName,
        characterName: build.characterName,
        level: build.level,
  treeSpecs: treeSpecsToUse, // Store only non-empty specs
        allocatedNodes: allocatedNodes, // Current selected spec nodes
        treeProgression: treeProgression,
        gems: allGems, // Flat list of gems without quest data - matching happens at render time
        socketGroups: enrichedSocketGroups, // Socket groups with gem info (from first skill set)
        skillSets: enrichedSkillSets, // ALL skill sets with gem info enriched
        itemSets: build.itemSets, // Item sets (gear)
        treeVersion: build.treeVersion,
        notes: build.notes, // Notes from PoB Notes tab
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
          gemsFound: allGems.length
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

  private async registerHotkeys(): Promise<void> {
    // Initialize UIOhook if not already done
    await levelingHotkeyManager.initialize();
    
    // Unregister all previously registered hotkeys
    levelingHotkeyManager.unregisterAll();
    this.registeredHotkeys = [];
    
    // Get current hotkey settings
    const settings = this.settingsService.get(this.getLevelingWindowKey()) || {};
    const hotkeys = (settings as any).hotkeys || {};
    
    // Register prev hotkey
    if (hotkeys.prev) {
      const success = levelingHotkeyManager.register('prev', hotkeys.prev, () => {
        if (this.window && !this.window.isDestroyed()) {
          this.window.webContents.send('hotkey-action', 'prev');
        }
      });
      if (success) {
        this.registeredHotkeys.push(hotkeys.prev);
      }
    }
    
    // Register next hotkey
    if (hotkeys.next) {
      const success = levelingHotkeyManager.register('next', hotkeys.next, () => {
        if (this.window && !this.window.isDestroyed()) {
          this.window.webContents.send('hotkey-action', 'next');
        }
      });
      if (success) {
        this.registeredHotkeys.push(hotkeys.next);
      }
    }
    
    // Register tree hotkey
    if (hotkeys.tree) {
      const success = levelingHotkeyManager.register('tree', hotkeys.tree, () => {
        // Toggle tree window (close if open, open if closed)
        if (isTreeWindowOpen()) {
          closeTreeWindow();
        } else {
          const currentSettings = this.settingsService.get(this.getLevelingWindowKey()) || {};
          const pobBuild = (currentSettings as any).pobBuild || null;
          
          if (pobBuild && pobBuild.treeSpecs && pobBuild.treeSpecs.length > 0) {
            const currentActIndex = (currentSettings as any)?.currentActIndex || 0;
            const characterLevel = (currentSettings as any)?.characterLevel || 1;
            const autoDetectEnabled = (currentSettings as any)?.uiSettings?.autoDetectLevelingSets ?? true;
            const savedTreeIndex = (currentSettings as any)?.selectedTreeIndex;
            
            const onTreeWindowReady = () => {
              sendTreeData(pobBuild.treeSpecs, this.overlayVersion, currentActIndex + 1, characterLevel, autoDetectEnabled, savedTreeIndex);
            };
            ipcMain.once('tree-window-ready', onTreeWindowReady);
            const treeWindow = createPassiveTreeWindow();
            if (!treeWindow.webContents.isLoading()) {
              ipcMain.removeListener('tree-window-ready', onTreeWindowReady);
              sendTreeData(pobBuild.treeSpecs, this.overlayVersion, currentActIndex + 1, characterLevel, autoDetectEnabled, savedTreeIndex);
            }
          }
        }
      });
      if (success) {
        this.registeredHotkeys.push(hotkeys.tree);
      }
    }
    
    // Register gems hotkey
    if (hotkeys.gems) {
      const success = levelingHotkeyManager.register('gems', hotkeys.gems, () => {
        // Toggle gems window (close if open, open if closed)
        if (isGemsWindowOpen()) {
          closeLevelingGemsWindow();
          // Reassert leveling overlay order without stealing focus
          try { bringToFront('leveling'); } catch {}
        } else {
          const currentSettings = this.settingsService.get(this.getLevelingWindowKey()) || {};
          const pobBuild = (currentSettings as any).pobBuild || null;
          
          if (pobBuild) {
            openLevelingGemsWindow({
              settingsService: this.settingsService,
              overlayVersion: this.overlayVersion,
              parentWindow: this.window || undefined
            });
          }
        }
      });
      if (success) {
        this.registeredHotkeys.push(hotkeys.gems);
      }
    }

    // Register gear hotkey
    if (hotkeys.gear) {
      const success = levelingHotkeyManager.register('gear', hotkeys.gear, () => {
        if (isGearWindowOpen()) {
          closeGearWindow();
          // Reassert leveling overlay order without stealing focus
          try { bringToFront('leveling'); } catch {}
        } else {
          const currentSettings = this.settingsService.get(this.getLevelingWindowKey()) || {};
          const pobBuild = (currentSettings as any).pobBuild || null;
          if (pobBuild && pobBuild.itemSets && pobBuild.itemSets.length > 0) {
            openLevelingGearWindow({
              settingsService: this.settingsService,
              overlayVersion: this.overlayVersion,
              parentWindow: this.window || undefined
            });
          }
        }
      });
      if (success) {
        this.registeredHotkeys.push(hotkeys.gear);
      }
    }

    // Register notes hotkey
    if (hotkeys.notes) {
      const success = levelingHotkeyManager.register('notes', hotkeys.notes, () => {
        if (isNotesWindowOpen()) {
          closeNotesWindow();
          // Reassert leveling overlay order without stealing focus
          try { bringToFront('leveling'); } catch {}
        } else {
          const currentSettings = this.settingsService.get(this.getLevelingWindowKey()) || {};
          const pobBuild = (currentSettings as any).pobBuild || null;
          if (pobBuild) {
            openLevelingNotesWindow({
              settingsService: this.settingsService,
              overlayVersion: this.overlayVersion,
              parentWindow: this.window || undefined
            });
          }
        }
      });
      if (success) {
        this.registeredHotkeys.push(hotkeys.notes);
      }
    }

    // Register "Toggle All Windows" hotkey (Gems, Tree, Gear, Notes)
    if (hotkeys.allWindows) {
      const success = levelingHotkeyManager.register('allWindows', hotkeys.allWindows, () => {
        const currentSettings = this.settingsService.get(this.getLevelingWindowKey()) || {};
        const pobBuild = (currentSettings as any).pobBuild || null;
        
        if (!pobBuild) return;
        
        // Check if ANY of the windows are open
        const anyOpen = isGemsWindowOpen() || isTreeWindowOpen() || isGearWindowOpen() || isNotesWindowOpen();
        
        if (anyOpen) {
          // Close all windows
          if (isGemsWindowOpen()) closeLevelingGemsWindow();
          if (isTreeWindowOpen()) closeTreeWindow();
          if (isGearWindowOpen()) closeGearWindow();
          if (isNotesWindowOpen()) closeNotesWindow();
          // Reassert leveling overlay order
          try { bringToFront('leveling'); } catch {}
        } else {
          // Open all windows
          const currentActIndex = (currentSettings as any)?.currentActIndex || 0;
          const characterLevel = (currentSettings as any)?.characterLevel || 1;
          const autoDetectEnabled = (currentSettings as any)?.uiSettings?.autoDetectLevelingSets ?? true;
          const savedTreeIndex = (currentSettings as any)?.selectedTreeIndex;
          
          // Open gems window
          openLevelingGemsWindow({
            settingsService: this.settingsService,
            overlayVersion: this.overlayVersion,
            parentWindow: this.window || undefined
          });
          
          // Open tree window if there are tree specs
          if (pobBuild.treeSpecs && pobBuild.treeSpecs.length > 0) {
            const onTreeWindowReady = () => {
              sendTreeData(pobBuild.treeSpecs, this.overlayVersion, currentActIndex + 1, characterLevel, autoDetectEnabled, savedTreeIndex);
            };
            ipcMain.once('tree-window-ready', onTreeWindowReady);
            const treeWindow = createPassiveTreeWindow();
            if (!treeWindow.webContents.isLoading()) {
              ipcMain.removeListener('tree-window-ready', onTreeWindowReady);
              sendTreeData(pobBuild.treeSpecs, this.overlayVersion, currentActIndex + 1, characterLevel, autoDetectEnabled, savedTreeIndex);
            }
          }
          
          // Open gear window if there are item sets
          if (pobBuild.itemSets && pobBuild.itemSets.length > 0) {
            openLevelingGearWindow({
              settingsService: this.settingsService,
              overlayVersion: this.overlayVersion,
              parentWindow: this.window || undefined
            });
          }
          
          // Open notes window
          openLevelingNotesWindow({
            settingsService: this.settingsService,
            overlayVersion: this.overlayVersion,
            parentWindow: this.window || undefined
          });
        }
      });
      if (success) {
        this.registeredHotkeys.push(hotkeys.allWindows);
      }
    }

    // Register PoB Info Bar toggle hotkey
    if ((hotkeys as any).pobBar) {
      const accel = (hotkeys as any).pobBar as string;
      const success = levelingHotkeyManager.register('pobBar', accel, () => {
        const currentSettings = this.settingsService.get(this.getLevelingWindowKey()) || {};
        const pobBuild = (currentSettings as any).pobBuild || null;
        if (isPobInfoBarOpen()) {
          closePobInfoBar();
          // Reassert leveling overlay order without stealing focus
          try { bringToFront('leveling'); } catch {}
        } else if (pobBuild) {
          const currentActIndex = (currentSettings as any)?.currentActIndex ?? 0;
          openPobInfoBar({
            settingsService: this.settingsService,
            overlayVersion: this.overlayVersion,
            pobBuild,
            currentAct: currentActIndex + 1,
          });
        }
      });
      if (success) {
        this.registeredHotkeys.push(accel);
      }
    }

    // Register Leveling window toggle hotkey
    if ((hotkeys as any).leveling) {
      const accel = (hotkeys as any).leveling as string;
      const success = levelingHotkeyManager.register('leveling', accel, () => {
        // Toggle the main leveling window visibility
        this.toggle();
      });
      if (success) {
        this.registeredHotkeys.push(accel);
      }
    }

    // Register Logout hotkey
    if ((hotkeys as any).logout) {
      const accel = (hotkeys as any).logout as string;
      const success = levelingHotkeyManager.register('logout', accel, async () => {
        await executeLogout();
      });
      if (success) {
        this.registeredHotkeys.push(accel);
      }
    }

    // Register Custom Hotkeys
    const customHotkeys = (settings as any).customHotkeys as CustomHotkey[] | undefined;
    if (customHotkeys && customHotkeys.length > 0) {
      for (const customHotkey of customHotkeys) {
        if (customHotkey.hotkey) {
          const success = levelingHotkeyManager.register(`custom-${customHotkey.id}`, customHotkey.hotkey, async () => {
            await typeInChat(customHotkey.command, customHotkey.pressEnter);
          });
          if (success) {
            this.registeredHotkeys.push(customHotkey.hotkey);
          }
        }
      }
    }
  }

  private buildDataUrl(): string {
    const html = buildLevelingPopoutHtml(this.overlayVersion);
    return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  }
}
