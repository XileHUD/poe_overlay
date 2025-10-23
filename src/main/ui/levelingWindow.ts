import { BrowserWindow, screen, ipcMain } from 'electron';
import { SettingsService } from '../services/settingsService.js';
import { buildLevelingPopoutHtml } from '../popouts/levelingPopoutTemplate.js';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface LevelingWindowParams {
  settingsService: SettingsService;
}

export class LevelingWindow {
  private window: BrowserWindow | null = null;
  private settingsService: SettingsService;
  private levelingData: any = null;
  private completedSteps: Set<string> = new Set();
  private layoutMode: 'tall' | 'wide' = 'tall';
  private isWideMode = false;

  constructor(params: LevelingWindowParams) {
    this.settingsService = params.settingsService;
    const saved = this.settingsService.get('levelingWindow');
    this.isWideMode = saved?.wideMode ?? false;
    this.loadLevelingData();
    this.loadProgress();
    this.registerIpcHandlers();
  }

  show(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      return;
    }
    this.createWindow();
    this.settingsService.update('levelingWindow', (c) => ({ ...c, enabled: true }));
  }

  hide(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.savePosition();
      this.window.close();
      this.window = null;
    }
    this.settingsService.update('levelingWindow', (c) => ({ ...c, enabled: false }));
  }

  toggle(): void {
    this.isVisible() ? this.hide() : this.show();
  }

  isVisible(): boolean {
    return !!this.window && !this.window.isDestroyed() && this.window.isVisible();
  }

  toggleWideMode(): void {
    this.isWideMode = !this.isWideMode;
    this.settingsService.update('levelingWindow', (c) => ({
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
    const saved = this.settingsService.get('levelingWindow');
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
    const saved = this.settingsService.get('levelingWindow');

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
    this.settingsService.update('levelingWindow', (c) => ({
      ...(c || {}),
      position: { x: b.x, y: b.y },
    }));
  }

  private saveSize(): void {
    if (!this.window || this.window.isDestroyed()) return;
    const b = this.window.getBounds();
    this.settingsService.update('levelingWindow', (c) => ({
      ...(c || {}),
      size: { width: b.width, height: b.height },
    }));
  }

  private loadLevelingData(): void {
    try {
      // Try multiple possible paths
      const possiblePaths = [
        path.join(app.getAppPath(), 'data', 'poe1', 'Leveling', 'leveling-data-v2.json'),
        path.join(process.cwd(), 'data', 'poe1', 'Leveling', 'leveling-data-v2.json'),
        path.join(__dirname, '../../data/poe1/Leveling/leveling-data-v2.json'),
        path.join(__dirname, '../../../data/poe1/Leveling/leveling-data-v2.json'),
      ];
      
      let loaded = false;
      for (const dataPath of possiblePaths) {
        if (fs.existsSync(dataPath)) {
          const rawData = fs.readFileSync(dataPath, 'utf-8');
          this.levelingData = JSON.parse(rawData);
          console.log('[LevelingWindow] Data loaded from:', dataPath);
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
    const saved = this.settingsService.get('levelingWindow');
    if (saved && saved.progress && Array.isArray(saved.progress)) {
      this.completedSteps = new Set(saved.progress);
    }
  }

  private saveProgress(): void {
    this.settingsService.update('levelingWindow', (c) => ({ 
      ...c, 
      progress: Array.from(this.completedSteps) 
    }));
  }

  private registerIpcHandlers(): void {
    // Provide leveling data to renderer
    ipcMain.handle('get-leveling-data', async () => {
      const saved = this.settingsService.get('levelingWindow');
      return {
        data: this.levelingData,
        progress: Array.from(this.completedSteps),
        currentActIndex: saved?.currentActIndex ?? 0
      };
    });

    // Save progress
    ipcMain.handle('save-leveling-progress', async (event, stepIds: string[]) => {
      this.completedSteps = new Set(stepIds);
      this.saveProgress();
      return true;
    });

    // Save current act index
    ipcMain.handle('save-current-act-index', async (event, actIndex: number) => {
      this.settingsService.update('levelingWindow', (c) => ({
        ...c,
        currentActIndex: actIndex
      }));
      return true;
    });

    // Reset progress
    ipcMain.handle('reset-leveling-progress', async () => {
      this.completedSteps = new Set();
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

    // Auto-detect client.txt path
    ipcMain.handle('auto-detect-client-txt', async () => {
      const driveLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(letter => {
        try {
          return fs.existsSync(letter + ':\\');
        } catch {
          return false;
        }
      });

      const relativePaths = [
        'Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile\\logs\\Client.txt',
        'Program Files\\Steam\\steamapps\\common\\Path of Exile\\logs\\Client.txt',
        'Steam\\steamapps\\common\\Path of Exile\\logs\\Client.txt',
        'SteamLibrary\\steamapps\\common\\Path of Exile\\logs\\Client.txt',
        'Program Files (x86)\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt',
        'Grinding Gear Games\\Path of Exile\\logs\\Client.txt'
      ];

      for (const drive of driveLetters) {
        for (const rel of relativePaths) {
          const testPath = path.join(drive + ':\\', rel);
          if (fs.existsSync(testPath)) {
            this.settingsService.set('clientTxtPath', testPath);
            this.settingsService.set('clientTxtAutoDetected', true);
            this.settingsService.set('clientTxtLastChecked', Date.now());
            return { success: true, path: testPath };
          }
        }
      }

      return { success: false, path: null };
    });

    // Manual select client.txt path
    ipcMain.handle('select-client-txt', async () => {
      const { dialog } = await import('electron');
      const result = await dialog.showOpenDialog({
        title: 'Select Client.txt',
        defaultPath: 'C:\\Program Files (x86)',
        filters: [
          { name: 'Text Files', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0];
        this.settingsService.set('clientTxtPath', selectedPath);
        this.settingsService.set('clientTxtAutoDetected', false);
        this.settingsService.set('clientTxtLastChecked', Date.now());
        return { success: true, path: selectedPath };
      }

      return { success: false, path: null };
    });

    // Get current client.txt path
    ipcMain.handle('get-client-txt-path', async () => {
      const path = this.settingsService.get('clientTxtPath');
      const autoDetected = this.settingsService.get('clientTxtAutoDetected') ?? false;
      return { path, autoDetected };
    });

    // Clean client.txt file
    ipcMain.handle('clean-client-txt', async () => {
      try {
        const clientPath = this.settingsService.get('clientTxtPath');
        if (!clientPath) {
          return { success: false, error: 'Client.txt path not configured' };
        }
        
        if (!fs.existsSync(clientPath)) {
          return { success: false, error: 'Client.txt file not found at configured path' };
        }

        // Clear the file by writing an empty string
        fs.writeFileSync(clientPath, '', 'utf8');
        return { success: true };
      } catch (error) {
        console.error('Error cleaning Client.txt:', error);
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

    // Start watching client.txt for zone changes
    this.startClientTxtWatcher();
  }

  private clientTxtWatcher: fs.FSWatcher | null = null;
  private clientTxtPath: string | null = null;
  private lastFilePosition: number = 0;

  private startClientTxtWatcher() {
    // Stop any existing watcher
    this.stopClientTxtWatcher();

    const clientPath = this.settingsService.get('clientTxtPath');
    if (!clientPath || !fs.existsSync(clientPath)) {
      console.log('Client.txt not configured or not found, skipping file watch');
      return;
    }

    this.clientTxtPath = clientPath;
    console.log('Starting Client.txt watcher at:', clientPath);
    
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

      // Parse for zone entry lines
      // Format: 2025/06/13 09:49:29 98539734 cff94598 [INFO Client 39308] : You have entered The Forest Encampment.
      const zoneRegex = /\[INFO Client \d+\] : You have entered (.+)\./g;
      let match;
      let matchCount = 0;
      
      while ((match = zoneRegex.exec(newContent)) !== null) {
        const zoneName = match[1].trim();
        matchCount++;
        console.log(`[${matchCount}] Detected zone entry:`, zoneName);
        
        // Send to renderer to auto-check the step
        if (this.window && !this.window.isDestroyed()) {
          this.window.webContents.send('zone-entered', zoneName);
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

  private buildDataUrl(): string {
    const html = buildLevelingPopoutHtml();
    return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  }
}
