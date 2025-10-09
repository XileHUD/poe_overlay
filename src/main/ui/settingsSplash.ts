/**
 * Settings splash screen.
 * Provides a unified interface for all app settings.
 */

import { BrowserWindow, ipcMain, screen, shell, dialog, app } from 'electron';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as https from 'https';
import type { SettingsService } from '../services/settingsService.js';

// Optional updater (will be active in packaged builds)
let autoUpdater: any = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch {}

// Get version from package.json
function getAppVersion(): string {
  try {
    // Try to read from overlay package.json
    const packagePath = join(__dirname, '../../../package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
    return packageJson.version || '0.1.1';
  } catch {
    return app.getVersion();
  }
}

function normalizeVersion(version: string | null | undefined): string | null {
  if (!version) return null;
  return version.trim().replace(/^v/i, '');
}

function compareVersions(a: string, b: string): number {
  const segA = a.split('.').map(n => parseInt(n, 10) || 0);
  const segB = b.split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(segA.length, segB.length);
  for (let i = 0; i < len; i++) {
    const diff = (segA[i] || 0) - (segB[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

interface GithubReleaseInfo {
  version: string | null;
  url?: string;
}

function fetchLatestGithubRelease(): Promise<GithubReleaseInfo> {
  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: 'api.github.com',
      path: '/repos/XileHUD/poe_overlay/releases/latest',
      method: 'GET',
      headers: {
        'User-Agent': 'XileHUD-Updater',
        'Accept': 'application/vnd.github+json'
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        res.resume();
        reject(new Error(`GitHub API responded with ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf-8');
          const data = JSON.parse(body);
          resolve({
            version: typeof data?.tag_name === 'string' ? data.tag_name : null,
            url: typeof data?.html_url === 'string' ? data.html_url : undefined
          });
        } catch (err) {
          reject(err as Error);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function handleMissingLatestYaml(event: Electron.IpcMainEvent, currentVersion: string): Promise<boolean> {
  try {
    const github = await fetchLatestGithubRelease();
    if (!github.version) {
      return false;
    }
    const remoteNorm = normalizeVersion(github.version);
    const currentNorm = normalizeVersion(currentVersion);
    if (!remoteNorm || !currentNorm) {
      return false;
    }
    const comparison = compareVersions(remoteNorm, currentNorm);
    if (comparison > 0) {
      event.reply('settings-update-result', {
        available: true,
        version: github.version,
        message: `New version available: ${github.version}. Download it from the releases page.`
      });
    } else {
      event.reply('settings-update-result', {
        available: false,
        version: github.version,
        message: `You're already on the latest version (v${currentNorm}).`
      });
    }
    return true;
  } catch (err) {
    console.warn('[Settings] GitHub release lookup failed:', err);
    return false;
  }
}

export interface SettingsSplashParams {
  settingsService: SettingsService;
  featureService: any; // FeatureService
  currentHotkey: string;
  getDataDir: () => string;
  reloadData: () => void;
  onHotkeySave: (newKey: string) => void;
  onFeatureConfigOpen: () => void;
  onShowOverlay: () => void;
  overlayWindow: any; // BrowserWindow to send font size updates to
}

/**
 * Show settings splash and wait for user interaction
 */
export async function showSettingsSplash(params: SettingsSplashParams): Promise<void> {
  const {
    settingsService,
    featureService,
    currentHotkey,
    getDataDir,
    reloadData,
    onHotkeySave,
    onFeatureConfigOpen,
    onShowOverlay,
    overlayWindow
  } = params;

  return new Promise((resolve) => {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    
    const window = new BrowserWindow({
      width: 550,
      height: 600,
      x: Math.round(width / 2 - 275),
      y: Math.round(height / 2 - 300),
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

    const fontSize = settingsService.get('fontSize') || 100;
    const appVersion = getAppVersion();
    const html = buildSettingsSplashHtml(currentHotkey, getDataDir(), Number(fontSize), appVersion);
    
    window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    // Show when ready
    window.once('ready-to-show', () => {
      window.show();
    });

    // Handle close button
    ipcMain.once('settings-close', () => {
      try {
        window.close();
      } catch {}
      resolve();
    });

    // Handle check for updates
    ipcMain.on('settings-check-updates', async (event) => {
      try {
        if (autoUpdater) {
          // Check for updates with real feedback
          let hasUpdate = false;
          let updateInfo: any = null;

          const checkPromise = new Promise<void>((checkResolve) => {
            const timeoutId = setTimeout(() => {
              if (!hasUpdate) {
                event.reply('settings-update-result', { 
                  available: false,
                  version: getAppVersion(),
                  message: 'You are using the latest version!' 
                });
                checkResolve();
              }
            }, 5000); // 5 second timeout

            autoUpdater.once('update-available', (info: any) => {
              clearTimeout(timeoutId);
              hasUpdate = true;
              updateInfo = info;
              event.reply('settings-update-result', { 
                available: true, 
                version: info.version,
                message: `Update available: v${normalizeVersion(info.version) ?? info.version}\nDownloading...` 
              });
              checkResolve();
            });

            autoUpdater.once('update-not-available', (info: any) => {
              clearTimeout(timeoutId);
              event.reply('settings-update-result', { 
                available: false,
                version: info?.version || getAppVersion(),
                message: 'You are using the latest version!' 
              });
              checkResolve();
            });

            autoUpdater.once('error', async (err: any) => {
              clearTimeout(timeoutId);
              const rawMessage = err?.message || String(err || 'unknown error');
              const missingLatest = /latest\.yml/i.test(rawMessage);
              if (missingLatest) {
                const handled = await handleMissingLatestYaml(event, getAppVersion());
                if (!handled) {
                  event.reply('settings-update-result', {
                    available: false,
                    error: true,
                    message: 'Automatic updater is disabled for this local build. Visit GitHub releases to download updates.'
                  });
                  try { await shell.openExternal('https://github.com/XileHUD/poe_overlay/releases'); } catch {}
                }
              } else {
                event.reply('settings-update-result', {
                  available: false,
                  error: true,
                  message: 'Failed to check for updates. Please try again later.'
                });
              }
              checkResolve();
            });
          });

          try {
            await autoUpdater.checkForUpdates();
          } catch (err: any) {
            const rawMessage = err?.message || String(err || 'unknown error');
            const missingLatest = /latest\.yml/i.test(rawMessage);
            if (missingLatest) {
              const handled = await handleMissingLatestYaml(event, getAppVersion());
              if (!handled) {
                event.reply('settings-update-result', {
                  available: false,
                  error: true,
                  message: 'Automatic updater is disabled for this local build. Visit GitHub releases to download updates.'
                });
                try { await shell.openExternal('https://github.com/XileHUD/poe_overlay/releases'); } catch {}
              }
            } else {
              event.reply('settings-update-result', {
                available: false,
                error: true,
                message: 'Failed to check for updates. Please try again later.'
              });
            }
            return;
          }
          await checkPromise;
        } else {
          // No auto-updater available, provide option to check GitHub
          const handled = await handleMissingLatestYaml(event, getAppVersion());
          if (!handled) {
            event.reply('settings-update-result', { 
              available: false,
              version: getAppVersion(),
              message: 'Check GitHub for the latest release (opening browser...)' 
            });
            await shell.openExternal('https://github.com/XileHUD/poe_overlay/releases');
          }
        }
      } catch (error) {
        console.error('[Settings] Update check failed:', error);
        event.reply('settings-update-result', { 
          available: false, 
          error: true,
          message: 'Failed to check for updates. Please try again later.' 
        });
      }
    });

    // Handle hotkey save
    ipcMain.on('settings-save-hotkey', (event, newKey: string) => {
      try {
        // Call the hotkey save callback with the new key
        onHotkeySave(newKey);
        // Send confirmation back to renderer
        event.reply('settings-hotkey-saved', newKey);
      } catch (error) {
        console.error('Failed to save hotkey:', error);
      }
    });

  // Handle feature config
    ipcMain.once('settings-open-features', () => {
      try {
        window.close();
      } catch {}
      resolve();
      // Trigger feature configurator
      setTimeout(() => onFeatureConfigOpen(), 100);
    });

    // Handle font size preview (live update, not saved)
    ipcMain.on('settings-font-size-preview', (event, value: number) => {
      try {
        // Send to overlay window for live preview
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.webContents.send('font-size-changed', value);
        }
      } catch (error) {
        console.error('Failed to preview font size:', error);
      }
    });

    // Handle font size save
    ipcMain.on('settings-font-size-save', (event, value: number) => {
      try {
        settingsService.set('fontSize', value);
        // Also send to overlay for immediate application
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.webContents.send('font-size-changed', value);
        }
        event.reply('settings-font-size-saved', value);
      } catch (error) {
        console.error('Failed to save font size:', error);
      }
    });

    // Handle show overlay
    ipcMain.on('settings-show-overlay', () => {
      onShowOverlay();
    });

    // Handle reload data
    ipcMain.once('settings-reload-data', (event) => {
      try {
        reloadData();
        event.reply('settings-data-reloaded', { success: true });
      } catch (error) {
        event.reply('settings-data-reloaded', { success: false, error: String(error) });
      }
    });

    // Handle open data folder
    ipcMain.once('settings-open-folder', async () => {
      try {
        await shell.openPath(getDataDir());
      } catch (error) {
        console.error('Failed to open data folder:', error);
      }
    });

    window.on('closed', () => {
      // Cleanup IPC handlers
      ipcMain.removeAllListeners('settings-check-updates');
      ipcMain.removeAllListeners('settings-font-size-preview');
      ipcMain.removeAllListeners('settings-font-size-save');
      ipcMain.removeAllListeners('settings-save-hotkey');
      ipcMain.removeAllListeners('settings-show-overlay');
      resolve();
    });
  });
}

/**
 * Build HTML for settings splash
 */
function buildSettingsSplashHtml(currentHotkey: string, dataDir: string, fontSize: number, appVersion: string): string {
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
      overflow-y: auto;
      padding: 24px;
    }
    
    /* Dark scrollbar */
    .content-wrapper::-webkit-scrollbar {
      width: 12px;
    }
    
    .content-wrapper::-webkit-scrollbar-track {
      background: var(--bg-secondary);
      border-radius: 6px;
    }
    
    .content-wrapper::-webkit-scrollbar-thumb {
      background: var(--bg-tertiary);
      border-radius: 6px;
      border: 2px solid var(--bg-secondary);
    }
    
    .content-wrapper::-webkit-scrollbar-thumb:hover {
      background: #505050;
    }
    
    .section {
      margin-bottom: 16px;
      padding: 16px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
    }
    
    .section-title {
      margin: 0 0 12px;
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .section-desc {
      margin: 0 0 12px;
      font-size: 12px;
      color: var(--text-secondary);
    }
    .setting-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid var(--border-color);
    }
    
    .setting-item:last-child {
      border-bottom: none;
    }
    
    .setting-label {
      font-size: 13px;
      color: var(--text-primary);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    
    .setting-label-text {
      font-weight: 500;
    }
    
    .setting-label-desc {
      font-size: 11px;
      color: var(--text-secondary);
    }
    
    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    
    .btn-primary {
      background: var(--accent-blue);
      color: white;
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
    
    .btn-green {
      background: var(--accent-green);
      color: white;
    }
    
    .btn-green:hover {
      background: #6ec96e;
    }
    
    .btn-orange {
      background: var(--accent-orange);
      color: white;
    }
    
    .btn-orange:hover {
      background: #f7c166;
    }
    
    /* Segmented presets for font size */
    .segmented {
      display: inline-flex;
      gap: 6px;
      background: rgba(0,0,0,0.1);
      padding: 4px;
      border-radius: 8px;
      border: 1px solid var(--border-color);
    }
    .seg-btn {
      padding: 6px 10px;
      font-size: 12px;
      border-radius: 6px;
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      cursor: pointer;
      min-width: 56px;
      text-align: center;
    }
    .seg-btn.active { background: var(--accent-blue); color: #fff; border-color: var(--accent-blue); }
    
    .slider {
      flex: 1;
      height: 4px;
      background: var(--bg-tertiary);
      border-radius: 2px;
      outline: none;
      -webkit-appearance: none;
    }
    
    .slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 16px;
      height: 16px;
      background: var(--accent-purple);
      border-radius: 50%;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    
    .slider::-webkit-slider-thumb:hover {
      background: var(--accent-purple-hover);
    }
    
    .slider::-moz-range-thumb {
      width: 16px;
      height: 16px;
      background: var(--accent-purple);
      border-radius: 50%;
      cursor: pointer;
      border: none;
      transition: background 0.15s ease;
    }
    
    .slider::-moz-range-thumb:hover {
      background: var(--accent-purple-hover);
    }
    
    .slider-value {
      min-width: 45px;
      text-align: right;
      font-size: 13px;
      color: var(--accent-purple);
      font-weight: 600;
    }
    
    .footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid var(--border-color);
    }
    
    .update-status {
      margin-top: 8px;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
      white-space: pre-line;
      display: none;
    }
    
    .update-status.success {
      background: rgba(46, 160, 67, 0.15);
      border-color: var(--accent-green);
      color: var(--accent-green);
      display: block;
    }
    
    .update-status.error {
      background: rgba(248, 81, 73, 0.15);
      border-color: #f85149;
      color: #f85149;
      display: block;
    }
    
    .update-status.info {
      background: rgba(158, 203, 255, 0.15);
      border-color: var(--accent-blue);
      color: var(--accent-blue);
      display: block;
    }
    
    .data-reload-status {
      margin-top: 8px;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      display: none;
    }
    
    .data-reload-status.success {
      background: rgba(46, 160, 67, 0.15);
      border-color: var(--accent-green);
      color: var(--accent-green);
      display: block;
    }
    
    .data-reload-status.error {
      background: rgba(248, 81, 73, 0.15);
      border-color: #f85149;
      color: #f85149;
      display: block;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid var(--bg-tertiary);
      border-top-color: var(--accent-purple);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    
    .hotkey-capture {
      margin-top: 12px;
      padding: 16px;
      background: rgba(0, 0, 0, 0.3);
      border: 2px dashed rgba(255, 215, 0, 0.3);
      border-radius: 8px;
    }
    
    .hotkey-capture-box {
      text-align: center;
    }
    
    .hotkey-capture-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 4px;
    }
    
    .hotkey-capture-subtitle {
      font-size: 12px;
      color: var(--accent-orange);
      font-weight: 600;
      margin-bottom: 12px;
    }
    
    .hotkey-status {
      font-size: 18px;
      font-weight: bold;
      color: var(--accent-orange);
      padding: 12px;
      background: var(--bg-secondary);
      border-radius: 6px;
      border: 2px dashed var(--border-color);
      margin-bottom: 12px;
      min-height: 50px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .hotkey-status.captured {
      color: var(--accent-green);
      border-color: var(--accent-green);
    }
    
    .hotkey-capture-buttons {
      display: flex;
      gap: 8px;
      justify-content: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="header-title">
        <h1>⚙️ Settings</h1>
      </div>
      <div class="header-subtitle">Configure your XileHUD overlay preferences</div>
    </div>
    <button class="close-btn" id="closeBtn">×</button>
  </div>
  
  <div class="content-wrapper">
  <!-- Updates Section -->
  <div class="section">
    <div class="section-title">🔄 Updates</div>
    <div class="section-desc">Keep your overlay up-to-date with the latest features and fixes</div>
    <div class="setting-item">
      <div class="setting-label">
        <span class="setting-label-text">Current Version</span>
        <span class="setting-label-desc">v${appVersion}</span>
      </div>
      <span class="setting-label-text" id="latestVersionDisplay" style="color: var(--text-secondary); font-size: 12px;">Latest: -</span>
    </div>
    <div class="setting-item">
      <div class="setting-label">
        <span class="setting-label-text">Check for Updates</span>
        <span class="setting-label-desc">Checks for new versions on GitHub</span>
      </div>
      <button class="btn btn-green" id="checkUpdatesBtn">
        <span id="updateBtnText">Check Now</span>
      </button>
    </div>
    <button class="btn btn-orange" id="downloadUpdateBtn" style="display: none; margin-top: 10px;">Download Update</button>
    <div id="updateStatus" class="update-status"></div>
  </div>
  
  <!-- Features Section -->
  <div class="section">
    <div class="section-title">🎯 Features</div>
    <div class="section-desc">Enable or disable specific overlay features</div>
    <div class="setting-item">
      <div class="setting-label">
        <span class="setting-label-text">Feature Selection</span>
        <span class="setting-label-desc">Choose which features to load</span>
      </div>
      <button class="btn btn-primary" id="featuresBtn">Configure Features</button>
    </div>
  </div>
  
  <!-- Controls Section -->
  <div class="section">
    <div class="section-title">🎮 Controls</div>
    <div class="section-desc">Customize your keyboard shortcuts</div>
    <div class="setting-item">
      <div class="setting-label">
        <span class="setting-label-text">Toggle Hotkey</span>
        <span class="setting-label-desc" id="currentHotkeyDisplay">Current: ${currentHotkey}</span>
      </div>
      <button class="btn btn-secondary" id="hotkeyBtn">Change</button>
    </div>
    <div id="hotkeyCapture" class="hotkey-capture" style="display: none;">
      <div class="hotkey-capture-box">
        <div class="hotkey-capture-title">Press any key or key combination</div>
        <div class="hotkey-capture-subtitle">A-Z and 0-9 work standalone. Other keys need Ctrl, Alt, or Shift.</div>
        <div id="hotkeyStatus" class="hotkey-status">Waiting for key press...</div>
        <div class="hotkey-capture-buttons">
          <button class="btn btn-secondary" id="hotkeyCancelBtn">Cancel</button>
          <button class="btn btn-green" id="hotkeySaveBtn" disabled>Save</button>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Appearance Section -->
  <div class="section">
    <div class="section-title">🎨 Appearance</div>
    <div class="section-desc">Choose a global text size preset</div>
    <div class="setting-item">
      <div class="setting-label">
        <span class="setting-label-text">Font Size</span>
        <span class="setting-label-desc">Current: <span id="fontSizeValue">${fontSize}%</span></span>
      </div>
      <div class="segmented" id="fontPresetGroup">
        <button class="seg-btn" data-size="90">90%</button>
        <button class="seg-btn" data-size="100">100%</button>
        <button class="seg-btn" data-size="115">115%</button>
        <button class="seg-btn" data-size="130">130%</button>
        <button class="seg-btn" data-size="145">145%</button>
      </div>
    </div>
    <div class="setting-item">
      <div class="setting-label">
        <span class="setting-label-text">Preview Changes</span>
        <span class="setting-label-desc">Show overlay to see font size in action</span>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary" id="fontResetBtn" title="Reset to default (100%)">Reset</button>
        <button class="btn btn-primary" id="showOverlayBtn">Show Overlay</button>
      </div>
    </div>
    <button class="btn btn-green" id="saveFontSizeBtn" style="margin-top: 10px; display: none;">Save Font Size</button>
  </div>
  
  <!-- Data Section -->
  <div class="section">
    <div class="section-title">📁 Data Management</div>
    <div class="section-desc">Manage your overlay data and cache</div>
    <div class="setting-item">
      <div class="setting-label">
        <span class="setting-label-text">Data Folder</span>
        <span class="setting-label-desc" style="max-width: 280px; word-break: break-all;">${dataDir}</span>
      </div>
      <button class="btn btn-secondary" id="openFolderBtn">Open Folder</button>
    </div>
    <div class="setting-item">
      <div class="setting-label">
        <span class="setting-label-text">Reload Data</span>
        <span class="setting-label-desc">Refresh JSON data from disk</span>
      </div>
      <button class="btn btn-orange" id="reloadDataBtn">Reload JSON</button>
    </div>
    <div id="dataReloadStatus" class="data-reload-status"></div>
  </div>
  
  </div><!-- end content-wrapper -->
  
  <script>
    (function() {
      const { ipcRenderer } = require('electron');
      
      // Close buttons (header X)
      const closeBtns = document.querySelectorAll('#closeBtn');
      closeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          ipcRenderer.send('settings-close');
        });
      });
      
      // Check for updates
      const checkUpdatesBtn = document.getElementById('checkUpdatesBtn');
      const updateBtnText = document.getElementById('updateBtnText');
      const updateStatus = document.getElementById('updateStatus');
      
      checkUpdatesBtn.addEventListener('click', () => {
        updateBtnText.innerHTML = '<span class="spinner"></span>';
        checkUpdatesBtn.disabled = true;
        updateStatus.className = 'update-status';
        updateStatus.textContent = 'Checking for updates...';
        updateStatus.classList.add('info');
        
        ipcRenderer.send('settings-check-updates');
      });
      
      ipcRenderer.on('settings-update-result', (event, result) => {
        updateBtnText.textContent = 'Check Now';
        checkUpdatesBtn.disabled = false;
        
        // Update latest version display if available
        const latestVersionDisplay = document.getElementById('latestVersionDisplay');
        const downloadUpdateBtn = document.getElementById('downloadUpdateBtn');
        
        if (result.version && latestVersionDisplay) {
          latestVersionDisplay.textContent = 'Latest: v' + result.version;
          latestVersionDisplay.style.color = result.available ? 'var(--accent-orange)' : 'var(--accent-green)';
        }
        
        // Show/hide download button
        if (downloadUpdateBtn) {
          if (result.available) {
            downloadUpdateBtn.style.display = 'block';
          } else {
            downloadUpdateBtn.style.display = 'none';
          }
        }
        
        updateStatus.className = 'update-status';
        updateStatus.textContent = result.message;
        
        if (result.error) {
          updateStatus.classList.add('error');
        } else if (result.available) {
          updateStatus.classList.add('info');
        } else {
          updateStatus.classList.add('success');
        }
      });
      
      // Download update button
      document.getElementById('downloadUpdateBtn').addEventListener('click', () => {
        const { shell } = require('electron');
        shell.openExternal('https://github.com/XileHUD/poe_overlay/releases/latest');
      });
      
      // Feature configuration
      document.getElementById('featuresBtn').addEventListener('click', () => {
        ipcRenderer.send('settings-open-features');
      });
      
      // Hotkey configuration - inline capture
      let capturedKey = null;
      const hotkeyBtn = document.getElementById('hotkeyBtn');
      const hotkeyCapture = document.getElementById('hotkeyCapture');
      const hotkeyStatus = document.getElementById('hotkeyStatus');
      const hotkeySaveBtn = document.getElementById('hotkeySaveBtn');
      const hotkeyCancelBtn = document.getElementById('hotkeyCancelBtn');
      const currentHotkeyDisplay = document.getElementById('currentHotkeyDisplay');
      
      hotkeyBtn.addEventListener('click', () => {
        hotkeyCapture.style.display = 'block';
        hotkeyStatus.textContent = 'Waiting for key press...';
        hotkeyStatus.className = 'hotkey-status';
        hotkeySaveBtn.disabled = true;
        capturedKey = null;
        window.focus();
      });
      
      hotkeyCancelBtn.addEventListener('click', () => {
        hotkeyCapture.style.display = 'none';
        capturedKey = null;
      });
      
      hotkeySaveBtn.addEventListener('click', () => {
        if (capturedKey) {
          ipcRenderer.send('settings-save-hotkey', capturedKey);
          hotkeyCapture.style.display = 'none';
        }
      });
      
      // Listen for hotkey saved confirmation
      ipcRenderer.on('settings-hotkey-saved', (event, newKey) => {
        currentHotkeyDisplay.textContent = 'Current: ' + newKey;
        capturedKey = null;
      });
      
  // Capture key presses when hotkey capture is visible
      document.addEventListener('keydown', (e) => {
        // CRITICAL: Exit early before preventDefault if capture is not visible
        if (hotkeyCapture.style.display !== 'block') return;
        
        // Ignore modifier-only keys
        if (['Control', 'Meta', 'Command', 'Alt', 'Shift'].includes(e.key)) return;
        
        // Don't capture Enter/Escape as they're for buttons
        if (e.key === 'Enter') {
          e.preventDefault();
          if (!hotkeySaveBtn.disabled) {
            hotkeySaveBtn.click();
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          hotkeyCancelBtn.click();
          return;
        }
        
        // Now safe to prevent default since we're in capture mode
        e.preventDefault();
        
        // Capture modifiers
        const hasCtrl = e.ctrlKey || e.metaKey;
        const hasAlt = e.altKey;
        const hasShift = e.shiftKey;
        
        // Map the key
        let key = e.key;
        
        // Handle special keys
        if (key.startsWith('F') && /^F\d+$/.test(key)) {
          key = key.toUpperCase();
        } else if (key.length === 1) {
          key = key.toUpperCase();
        } else if (/^[0-9]$/.test(key)) {
          key = key;
        } else if (key === ' ') {
          key = 'Space';
        } else {
          key = key.charAt(0).toUpperCase() + key.slice(1);
        }
        
        // Build the hotkey string with modifiers
        let hotkeyString = '';
        if (hasCtrl) hotkeyString += 'Ctrl+';
        if (hasAlt) hotkeyString += 'Alt+';
        if (hasShift) hotkeyString += 'Shift+';
        hotkeyString += key;
        
        // Check if standalone A-Z or 0-9 is allowed
        const isStandalone = /^[A-Z0-9]$/.test(key) && !hasCtrl && !hasAlt && !hasShift;
        const hasModifier = hasCtrl || hasAlt || hasShift;
        
        // Validate: standalone only for A-Z and 0-9, others need modifiers
        if (!isStandalone && !hasModifier) {
          hotkeyStatus.textContent = 'This key needs Ctrl, Alt, or Shift';
          hotkeyStatus.className = 'hotkey-status';
          hotkeyStatus.style.color = 'var(--accent-orange)';
          hotkeySaveBtn.disabled = true;
          return;
        }
        
        // Update the UI
        capturedKey = hotkeyString;
        hotkeyStatus.textContent = 'Hotkey: ' + hotkeyString;
        hotkeyStatus.className = 'hotkey-status captured';
        hotkeySaveBtn.disabled = false;
      });
      
      // Font size presets
      const fontSizeValue = document.getElementById('fontSizeValue');
      const saveFontSizeBtn = document.getElementById('saveFontSizeBtn');
      const showOverlayBtn = document.getElementById('showOverlayBtn');
      const presetGroup = document.getElementById('fontPresetGroup');
      const fontResetBtn = document.getElementById('fontResetBtn');
      let originalFontSize = ${fontSize};
      let pendingFontSize = ${fontSize};

      function setActivePreset(val){
        pendingFontSize = Number(val)||100;
        if (fontSizeValue) fontSizeValue.textContent = pendingFontSize + '%';
        if (presetGroup){
          Array.from(presetGroup.querySelectorAll('.seg-btn')).forEach(btn=>{
            const active = String(btn.getAttribute('data-size')) === String(pendingFontSize);
            if (active) btn.classList.add('active'); else btn.classList.remove('active');
          });
        }
      }

      // Initialize to nearest preset
      (function initPreset(){
        const presets = [90,100,115,130,145];
        let best = presets[0], diff = Infinity;
        for (const p of presets){ const d = Math.abs(p - pendingFontSize); if (d < diff){ best = p; diff = d; } }
        setActivePreset(best);
      })();

      if (presetGroup){
        presetGroup.querySelectorAll('.seg-btn').forEach(btn=>{
          btn.addEventListener('click', ()=>{
            const v = Number(btn.getAttribute('data-size'))||100;
            setActivePreset(v);
            ipcRenderer.send('settings-font-size-preview', v);
            if (saveFontSizeBtn) saveFontSizeBtn.style.display = (v !== originalFontSize) ? 'block' : 'none';
          });
        });
      }

      if (fontResetBtn){
        fontResetBtn.addEventListener('click', ()=>{
          setActivePreset(100);
          ipcRenderer.send('settings-font-size-preview', 100);
          if (saveFontSizeBtn) saveFontSizeBtn.style.display = (100 !== originalFontSize) ? 'block' : 'none';
        });
      }

      // Save font size button
      saveFontSizeBtn.addEventListener('click', () => {
        ipcRenderer.send('settings-font-size-save', pendingFontSize);
      });
      
      // Show overlay button
      showOverlayBtn.addEventListener('click', () => {
        ipcRenderer.send('settings-show-overlay');
      });
      
      ipcRenderer.on('settings-font-size-saved', (event, value) => {
        console.log('Font size saved:', value);
        originalFontSize = value;
        setActivePreset(value);
        saveFontSizeBtn.style.display = 'none';
      });
      
      // Reload data
      const reloadDataBtn = document.getElementById('reloadDataBtn');
      const dataReloadStatus = document.getElementById('dataReloadStatus');
      
      reloadDataBtn.addEventListener('click', () => {
        reloadDataBtn.disabled = true;
        reloadDataBtn.textContent = 'Reloading...';
        dataReloadStatus.className = 'data-reload-status';
        
        ipcRenderer.send('settings-reload-data');
      });
      
      ipcRenderer.on('settings-data-reloaded', (event, result) => {
        reloadDataBtn.disabled = false;
        reloadDataBtn.textContent = 'Reload JSON';
        
        dataReloadStatus.className = 'data-reload-status';
        
        if (result.success) {
          dataReloadStatus.textContent = 'Data reloaded successfully!';
          dataReloadStatus.classList.add('success');
          setTimeout(() => {
            dataReloadStatus.className = 'data-reload-status';
          }, 3000);
        } else {
          dataReloadStatus.textContent = 'Failed to reload data: ' + result.error;
          dataReloadStatus.classList.add('error');
        }
      });
      
      // Open data folder
      document.getElementById('openFolderBtn').addEventListener('click', () => {
        ipcRenderer.send('settings-open-folder');
      });
    })();
  </script>
</body>
</html>
  `;
}
