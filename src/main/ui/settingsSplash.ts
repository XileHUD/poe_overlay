/**
 * Settings splash screen.
 * Provides a unified interface for all app settings.
 */

import { BrowserWindow, ipcMain, screen, shell, dialog, app } from 'electron';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as https from 'https';
import type { SettingsService } from '../services/settingsService.js';
import { isOverlayVersion, type OverlayVersion } from '../../types/overlayVersion.js';

// Optional updater (will be active in packaged builds)
let autoUpdater: any = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch {}

interface LeagueOption {
  value: string;
  label: string;
}

const POE2_LEAGUES: LeagueOption[] = [
  { value: 'Rise of the Abyssal', label: 'Rise of the Abyssal (Softcore)' },
  { value: 'HC Rise of the Abyssal', label: 'HC Rise of the Abyssal' },
  { value: 'Standard', label: 'Standard (Legacy)' },
  { value: 'Hardcore', label: 'Hardcore (Legacy)' }
];

const POE1_LEAGUES: LeagueOption[] = [
  { value: 'Keepers of the Flame', label: 'Keepers of the Flame (Softcore)' },
  { value: 'HC Keepers of the Flame', label: 'HC Keepers of the Flame' },
  { value: 'Standard', label: 'Standard' },
  { value: 'Hardcore', label: 'Hardcore' }
];

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
  getConfigDir: () => string;
  reloadData: () => void;
  onHotkeySave: (newKey: string) => void;
  onLeagueSave: (league: string) => void;
  onFeatureConfigOpen: () => void;
  onRequestOverlayRestart: (options?: { message?: string; detail?: string }) => void;
  onShowOverlay: () => void;
  overlayWindow: any; // BrowserWindow to send font size updates to
  overlayVersion: OverlayVersion;
}

/**
 * Show settings splash and wait for user interaction
 */
export async function showSettingsSplash(params: SettingsSplashParams): Promise<void> {
  const {
    settingsService,
    featureService,
    currentHotkey,
    getConfigDir,
    reloadData,
    onHotkeySave,
    onLeagueSave,
    onFeatureConfigOpen,
    onRequestOverlayRestart,
    onShowOverlay,
    overlayWindow,
    overlayVersion
  } = params;

  let currentOverlayVersion: OverlayVersion = isOverlayVersion(overlayVersion) ? overlayVersion : 'poe2';

  return new Promise((resolve) => {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const splashWidth = 960;
    const splashHeight = 640;
    let initialX = Math.round(width / 2 - splashWidth / 2);
    let initialY = Math.round(height / 2 - splashHeight / 2);

    try {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        const overlayBounds = overlayWindow.getBounds();
        
        // Center the settings splash on the overlay window
        initialX = Math.round(overlayBounds.x + overlayBounds.width / 2 - splashWidth / 2);
        initialY = Math.round(overlayBounds.y + overlayBounds.height / 2 - splashHeight / 2);
        
        // Ensure it stays within screen bounds
        const display = screen.getDisplayMatching(overlayBounds);
        const workArea = (display.workArea || display.workAreaSize || { width, height, x: 0, y: 0 }) as any;
        const workX = typeof workArea.x === 'number' ? workArea.x : 0;
        const workY = typeof workArea.y === 'number' ? workArea.y : 0;
        const workWidth = typeof workArea.width === 'number' ? workArea.width : width;
        const workHeight = typeof workArea.height === 'number' ? workArea.height : height;

        if (initialX < workX) initialX = workX + 16;
        if (initialY < workY) initialY = workY + 16;
        if (initialX + splashWidth > workX + workWidth) {
          initialX = workX + workWidth - splashWidth - 16;
        }
        if (initialY + splashHeight > workY + workHeight) {
          initialY = workY + workHeight - splashHeight - 16;
        }
      }
    } catch {}

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

    ipcMain.on('settings-save-overlay-version', (event, version: unknown) => {
      try {
        if (!isOverlayVersion(version)) {
          throw new Error('Please choose a valid overlay version.');
        }
        const changed = version !== currentOverlayVersion;
        settingsService.set('overlayVersion', version);
        settingsService.update('featureSplashSeen', (current) => {
          const next: Partial<Record<OverlayVersion, boolean>> = {
            ...(current && typeof current === 'object' ? current : {})
          };
          if (version === 'poe2') {
            next['poe2'] = false;
          } else {
            next['poe1'] = true;
          }
          return next;
        });
        if (version === 'poe2') {
          settingsService.clear('seenFeatureSplash');
        }
        currentOverlayVersion = version;
        event.reply('settings-overlay-version-saved', { version, changed });
        if (changed) {
          setTimeout(() => {
            try { window.close(); } catch {}
            try {
              onRequestOverlayRestart?.({
                message: 'Overlay version changed',
                detail: 'Restart to load the correct data set for the selected Path of Exile version.'
              });
            } catch (err) {
              console.error('[Settings] Failed to request restart prompt:', err);
            }
          }, 120);
        }
      } catch (error: any) {
        const message = error?.message || 'Failed to save overlay version.';
        event.reply('settings-overlay-version-saved', { error: message });
      }
    });

  const fontSize = settingsService.get('fontSize') || 100;
  // Read from config file - use version-specific league settings
  const leagueKey = currentOverlayVersion === 'poe1' ? 'merchantHistoryLeaguePoe1' : 'merchantHistoryLeaguePoe2';
  const sourceKey = currentOverlayVersion === 'poe1' ? 'merchantHistoryLeagueSourcePoe1' : 'merchantHistoryLeagueSourcePoe2';
  const storedMerchantLeague = settingsService.get(leagueKey);
  const storedMerchantLeagueSource = settingsService.get(sourceKey);
  const leagueOptions = currentOverlayVersion === 'poe1' ? POE1_LEAGUES : POE2_LEAGUES;
  const defaultLeague = leagueOptions[0]?.value ?? '';
  const trimmedStoredLeague = typeof storedMerchantLeague === 'string' ? storedMerchantLeague.trim() : '';
  const hasManualStoredLeague = storedMerchantLeagueSource === 'manual' && trimmedStoredLeague.length > 0;

  let merchantHistoryLeague = trimmedStoredLeague || defaultLeague;
  const displayLeagueOptions: LeagueOption[] = [...leagueOptions];

  if (merchantHistoryLeague && !displayLeagueOptions.some((option) => option.value === merchantHistoryLeague)) {
    if (hasManualStoredLeague) {
      // Keep the user's manual league visible even when switching overlay versions to avoid losing the preference
      displayLeagueOptions.unshift({ value: merchantHistoryLeague, label: `${trimmedStoredLeague} (Saved)` });
    } else {
      merchantHistoryLeague = defaultLeague;
      if (merchantHistoryLeague) {
        try {
          settingsService.set(leagueKey, merchantHistoryLeague);
          settingsService.set(sourceKey, 'auto');
        } catch (err) {
          console.warn('[Settings] Failed to reset merchant league for overlay version:', err);
        }
      }
    }
  } else if (!merchantHistoryLeague && defaultLeague) {
    merchantHistoryLeague = defaultLeague;
  }
  const merchantHistoryAutoFetch = settingsService.get('merchantHistoryAutoFetch') !== false; // default true
  const merchantHistoryRefreshInterval = settingsService.get('merchantHistoryRefreshInterval') || 0; // 0 = smart auto
  const appVersion = getAppVersion();
  const html = buildSettingsSplashHtml(
    currentHotkey, 
    getConfigDir(), 
    Number(fontSize), 
    appVersion, 
    String(merchantHistoryLeague),
    Boolean(merchantHistoryAutoFetch),
    Number(merchantHistoryRefreshInterval),
    overlayVersion,
    displayLeagueOptions
  );
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

    // Handle league save
    ipcMain.on('settings-save-league', (event, league: string) => {
      try {
        // Save to version-specific settings
        const leagueKey = currentOverlayVersion === 'poe1' ? 'merchantHistoryLeaguePoe1' : 'merchantHistoryLeaguePoe2';
        const sourceKey = currentOverlayVersion === 'poe1' ? 'merchantHistoryLeagueSourcePoe1' : 'merchantHistoryLeagueSourcePoe2';
        settingsService.set(leagueKey, league);
        settingsService.set(sourceKey, 'manual');
        console.log('[Settings] Saved merchant history league for', currentOverlayVersion, ':', league);
        // Notify Main instance to update its state and notify renderer
        onLeagueSave(league);
      } catch (error) {
        console.error('Failed to save league:', error);
      }
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

    // Handle open config folder
    ipcMain.once('settings-open-folder', async () => {
      try {
        await shell.openPath(getConfigDir());
      } catch (error) {
        console.error('Failed to open config folder:', error);
      }
    });

    // Handle merchant history config save
    ipcMain.on('settings-save-merchant-history-config', (event, data: { autoFetch: boolean; interval: number }) => {
      try {
        let sanitizedInterval = 0; // 0 = smart auto
        if (data.interval > 0) {
          sanitizedInterval = Math.max(15, Math.min(240, Math.round(data.interval)));
        }
        
        settingsService.set('merchantHistoryAutoFetch', data.autoFetch);
        settingsService.set('merchantHistoryRefreshInterval', sanitizedInterval);
        
        // Notify overlay window for live update
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.webContents.send('merchant-history-config-changed', {
            autoFetch: data.autoFetch,
            interval: sanitizedInterval
          });
        }
        
        event.reply('settings-merchant-history-config-saved', {
          autoFetch: data.autoFetch,
          interval: sanitizedInterval
        });
      } catch (error) {
        console.error('Failed to save merchant history config:', error);
      }
    });

    window.on('closed', () => {
      // Cleanup IPC handlers
      ipcMain.removeAllListeners('settings-check-updates');
      ipcMain.removeAllListeners('settings-font-size-preview');
      ipcMain.removeAllListeners('settings-font-size-save');
      ipcMain.removeAllListeners('settings-save-hotkey');
      ipcMain.removeAllListeners('settings-show-overlay');
      ipcMain.removeAllListeners('settings-save-overlay-version');
      resolve();
    });
  });
}

/**
 * Build HTML for settings splash
 */
function buildSettingsSplashHtml(
  currentHotkey: string,
  configDir: string,
  fontSize: number,
  appVersion: string,
  merchantHistoryLeague: string,
  merchantHistoryAutoFetch: boolean,
  merchantHistoryRefreshInterval: number,
  overlayVersion: OverlayVersion,
  leagueOptions: LeagueOption[]
): string {
  const normalizedOverlayVersion: OverlayVersion = isOverlayVersion(overlayVersion) ? overlayVersion : 'poe2';
  const escapeHtml = (value: string): string =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  const safeConfigDir = escapeHtml(configDir);

  const effectiveLeagueOptions = (leagueOptions && leagueOptions.length) ? leagueOptions : POE2_LEAGUES;
  const leagueOptionsMarkup = effectiveLeagueOptions
    .map(({ value, label }) => {
      const selected = value === merchantHistoryLeague ? ' selected' : '';
      return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
    })
    .join('\n        ');
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
      border: 1px solid rgba(240, 173, 78, 0.3);
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.5), 0 0 40px rgba(240, 173, 78, 0.15);
      border-radius: 8px;
    }
    
    .header {
      padding: 14px 24px 12px;
      background: linear-gradient(135deg, rgba(240, 173, 78, 0.12) 0%, rgba(240, 173, 78, 0.06) 100%);
      border-bottom: 2px solid rgba(240, 173, 78, 0.25);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
      -webkit-app-region: drag;
      border-radius: 8px 8px 0 0;
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
    
    /* Tab Navigation */
    .tab-nav {
      display: flex;
      background: var(--bg-secondary);
      border-bottom: 2px solid var(--border-color);
      padding: 0 20px;
      gap: 4px;
      flex-shrink: 0;
      -webkit-app-region: no-drag;
    }
    
    .tab-button {
      padding: 12px 28px;
      background: transparent;
      border: none;
      color: var(--text-secondary);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      position: relative;
      transition: all 0.2s ease;
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
    }
    
    .tab-button:hover {
      color: var(--text-primary);
      background: rgba(255, 255, 255, 0.03);
    }
    
    .tab-button.active {
      color: var(--accent-orange);
      border-bottom-color: var(--accent-orange);
      background: rgba(240, 173, 78, 0.06);
    }
    
    .tab-button .tab-icon {
      margin-right: 8px;
      font-size: 16px;
    }
    
    /* Content Wrapper */
    .content-wrapper {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    
    /* Tab Panels */
    .tab-panel {
      display: none;
      flex: 1;
      padding: 24px 32px;
      overflow-y: auto;
      animation: fadeIn 0.25s ease;
    }
    
    .tab-panel.active {
      display: block;
    }
    
    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    /* Dark scrollbar */
    .tab-panel::-webkit-scrollbar {
      width: 10px;
    }
    
    .tab-panel::-webkit-scrollbar-track {
      background: var(--bg-primary);
    }
    
    .tab-panel::-webkit-scrollbar-thumb {
      background: var(--bg-tertiary);
      border-radius: 5px;
    }
    
    .tab-panel::-webkit-scrollbar-thumb:hover {
      background: #505050;
    }
    
    .section {
      margin-bottom: 24px;
      padding: 20px 24px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
    }
    
    .section-title {
      margin: 0 0 14px;
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .section-desc {
      margin: 0 0 16px;
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    .section-content {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    /* Grid for multi-column layouts */
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    
    @media (max-width: 800px) {
      .grid-2 {
        grid-template-columns: 1fr;
      }
    }

    .game-choice-grid {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .game-choice {
      flex: 1 1 48%;
      min-width: 220px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 16px 18px;
      color: var(--text-primary);
      text-align: left;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 12px;
      transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
    }

    .game-choice:hover {
      transform: translateY(-2px);
      border-color: var(--accent-blue);
      background: rgba(74, 158, 255, 0.08);
    }

    .game-choice.selected {
      border-color: var(--accent-orange);
      box-shadow: 0 0 0 1px rgba(240, 173, 78, 0.3);
      background: rgba(240, 173, 78, 0.08);
    }

    .game-choice-title {
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .game-choice-title span.badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(74, 158, 255, 0.2);
      color: var(--accent-blue);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.04em;
    }

    .setting-hint {
      font-size: 11px;
      color: var(--text-secondary);
      margin-top: 10px;
      line-height: 1.5;
    }

    .setting-status {
      margin-top: 10px;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      border: 1px solid transparent;
      display: none;
    }

    .setting-status.success {
      display: block;
      border-color: rgba(46, 160, 67, 0.4);
      background: rgba(46, 160, 67, 0.15);
      color: var(--accent-green);
    }

    .setting-status.error {
      display: block;
      border-color: rgba(248, 81, 73, 0.4);
      background: rgba(248, 81, 73, 0.15);
      color: #f85149;
    }

    .setting-status.info {
      display: block;
      border-color: rgba(158, 203, 255, 0.4);
      background: rgba(158, 203, 255, 0.15);
      color: var(--accent-blue);
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
    
    .text-input {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      color: var(--text-primary);
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s ease;
    }
    
    .text-input:focus {
      border-color: var(--accent-blue);
    }
    
    /* Toggle Switch */
    .switch {
      position: relative;
      display: inline-block;
      width: 48px;
      height: 24px;
    }
    
    .switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    
    .switch-slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      transition: 0.3s;
      border-radius: 24px;
    }
    
    .switch-slider:before {
      position: absolute;
      content: "";
      height: 16px;
      width: 16px;
      left: 3px;
      bottom: 3px;
      background-color: var(--text-secondary);
      transition: 0.3s;
      border-radius: 50%;
    }
    
    .switch input:checked + .switch-slider {
      background-color: var(--accent-green);
      border-color: var(--accent-green);
    }
    
    .switch input:checked + .switch-slider:before {
      transform: translateX(24px);
      background-color: white;
    }
    
    /* Empty state for tabs with minimal content */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      text-align: center;
      color: var(--text-muted);
      min-height: 300px;
    }
    
    .empty-state-icon {
      font-size: 64px;
      margin-bottom: 16px;
      opacity: 0.3;
    }
    
    .empty-state-text {
      font-size: 16px;
      font-weight: 500;
      margin-bottom: 8px;
    }
    
    .empty-state-desc {
      font-size: 13px;
      color: var(--text-secondary);
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
    
    /* Info boxes */
    .info-box {
      display: flex;
      gap: 12px;
      padding: 14px 16px;
      border-radius: 8px;
      border: 1px solid var(--border-color);
      background: rgba(0, 0, 0, 0.25);
      font-size: 13px;
      line-height: 1.6;
    }
    
    .info-box.info-important {
      border-color: rgba(240, 173, 78, 0.4);
      background: rgba(240, 173, 78, 0.08);
    }
    
    .info-icon {
      font-size: 20px;
      flex-shrink: 0;
      line-height: 1;
    }
    
    .info-content {
      flex: 1;
    }
    
    .info-title {
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 6px;
    }
    
    .info-text {
      color: var(--text-secondary);
    }
    
    .info-text strong {
      color: var(--text-primary);
      font-weight: 600;
    }
    
    .info-text ul {
      color: var(--text-secondary);
    }
    
    /* Social links */
    .social-link:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      border-color: rgba(255, 255, 255, 0.3);
    }
    
    .social-link:active {
      transform: translateY(0);
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
  
  <!-- Tab Navigation -->
  <div class="tab-nav">
    <button class="tab-button active" data-tab="general">
      <span class="tab-icon">🏠</span>General
    </button>
    <button class="tab-button" data-tab="controls">
      <span class="tab-icon">🎮</span>Controls
    </button>
    <button class="tab-button" data-tab="trading">
      <span class="tab-icon">📊</span>Trading
    </button>
    <button class="tab-button" data-tab="appearance">
      <span class="tab-icon">🎨</span>Appearance
    </button>
    <button class="tab-button" data-tab="data">
      <span class="tab-icon">📁</span>Data
    </button>
    <button class="tab-button" data-tab="about">
      <span class="tab-icon">💡</span>About
    </button>
  </div>
  
  <div class="content-wrapper">
    
    <!-- GENERAL TAB -->
    <div class="tab-panel active" data-panel="general">
      
  <!-- Overlay Version Section -->
  <div class="section">
    <div class="section-title">🛡 Overlay Version</div>
    <div class="section-desc">Pick the Path of Exile version this overlay should use. The other game's files stay unloaded.</div>
    <div class="game-choice-grid">
      <button class="game-choice ${normalizedOverlayVersion === 'poe1' ? 'selected' : ''}" data-overlay-version="poe1" type="button">
        <div class="game-choice-title"><span class="badge">1</span>Path of Exile 1</div>
      </button>
      <button class="game-choice ${normalizedOverlayVersion === 'poe2' ? 'selected' : ''}" data-overlay-version="poe2" type="button">
        <div class="game-choice-title"><span class="badge">2</span>Path of Exile 2</div>
      </button>
    </div>
    <div class="setting-hint">You can swap games here whenever you like. We'll prompt you to restart after saving so the new data loads cleanly.</div>
    <button class="btn btn-green" id="saveOverlayVersionBtn" style="display: none; margin-top: 12px;">Save Overlay Version</button>
    <div class="setting-status" id="overlayVersionStatus"></div>
  </div>

  <!-- Two Column Grid for Features and Updates -->
  <div class="grid-2">
    
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
    
  </div><!-- End grid-2 -->
    
    </div><!-- End General Tab -->
    
    <!-- CONTROLS TAB -->
    <div class="tab-panel" data-panel="controls">
      
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
    
    <!-- Admin Privilege Info -->
    <div class="info-box info-important" style="margin-top: 16px;">
      <div class="info-icon">⚠️</div>
      <div class="info-content">
        <div class="info-title">Item Copy Not Working? Check Administrator Privileges</div>
        <div class="info-text">
          If Path of Exile is running as administrator (e.g., via Steam "Run as administrator" or compatibility settings), 
          the overlay must also run as administrator for the item copy feature to work. This is a Windows security restriction 
          that prevents non-elevated apps from sending input to elevated processes.
          <br><br>
          <strong>Solutions:</strong>
          <ul style="margin: 8px 0 0 20px; padding: 0;">
            <li>Run the overlay as administrator when PoE runs elevated, OR</li>
            <li>Disable "Run as administrator" for Path of Exile</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
      
    </div><!-- End Controls Tab -->
    
    <!-- TRADING TAB -->
    <div class="tab-panel" data-panel="trading">
      
  <!-- Merchant History League Section -->
  <div class="section">
    <div class="section-title">📊 Merchant History League</div>
    <div class="section-desc">Choose which trade league to track for merchant history</div>
    <div class="setting-item">
      <div class="setting-label">
        <span class="setting-label-text">Trade League</span>
        <span class="setting-label-desc">Select the league for tracking your merchant trades</span>
      </div>
      <select class="btn btn-secondary" id="leagueSelect" style="min-width: 220px;">
        ${leagueOptionsMarkup}
      </select>
    </div>
    <button class="btn btn-green" id="saveLeagueBtn" style="margin-top: 10px; display: none;">Save League</button>
    
    <!-- Info about incomplete item data -->
    <div style="margin-top: 16px; padding: 12px 14px; background: rgba(33, 150, 243, 0.08); border-left: 3px solid rgba(33, 150, 243, 0.5); border-radius: 4px; font-size: 12px; line-height: 1.65; color: var(--text-secondary);">
      <div style="display: flex; align-items: flex-start; gap: 10px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 2px; color: rgba(33, 150, 243, 0.9);">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        <div>
          <strong style="color: var(--text-primary); font-size: 12px;">About Incomplete Item Data</strong><br>
          <span style="margin-top: 4px; display: block;">When items appear as "ITEM" without images or statistics, the trade API is returning incomplete data. This limitation also affects the official trade site. XileHUD automatically tracks these placeholder entries and updates them with complete information once the API provides proper data. These entries are preserved to maintain accurate profit totals and chart continuity.</span>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Merchant History Automation -->
  <div class="section">
    <div class="section-title">🗓 Merchant History Automation</div>
    <div class="section-desc">Control how often the overlay polls merchant history in the background</div>
    
    <!-- Two Column Grid for Auto-Fetch Settings -->
    <div class="grid-2">
      
      <!-- Enable Auto-Fetch -->
      <div style="padding: 16px; background: rgba(255, 193, 7, 0.08); border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 8px;">
        <div style="font-weight: 600; font-size: 14px; margin-bottom: 12px; color: var(--text-primary);">⚙️ Enable Auto-Fetch</div>
        <div class="setting-item" style="border: none; padding: 0;">
          <div class="setting-label">
            <span class="setting-label-text">Auto-Fetch Toggle</span>
            <span class="setting-label-desc">Automatically fetch merchant history from trade site (smart interval based on rate limit headers)</span>
          </div>
          <label class="switch">
            <input type="checkbox" id="merchantHistoryAutoFetchToggle" ${merchantHistoryAutoFetch !== false ? 'checked' : ''}>
            <span class="switch-slider"></span>
          </label>
        </div>
      </div>

      <!-- Override Interval -->
      <div style="padding: 16px; background: rgba(255, 193, 7, 0.08); border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 8px;">
        <div style="font-weight: 600; font-size: 14px; margin-bottom: 12px; color: var(--text-primary);">⏱️ Override Interval</div>
        <div class="setting-item" style="border: none; padding: 0;">
          <div class="setting-label">
            <span class="setting-label-text">Fixed Interval (optional)</span>
            <span class="setting-label-desc">Force a fixed interval instead of smart fetching. Leave empty for automatic. Min 15 min.</span>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <input type="number" min="15" max="240" step="5" value="${merchantHistoryRefreshInterval || ''}" placeholder="Auto" class="text-input" id="merchantHistoryIntervalInput" style="width: 100px; padding: 6px 8px; font-size: 13px;">
            <span class="slider-value" id="merchantHistoryIntervalDisplay" style="font-size: 12px;">${merchantHistoryRefreshInterval ? merchantHistoryRefreshInterval + ' min' : 'Smart Auto'}</span>
          </div>
        </div>
      </div>
      
    </div><!-- End grid-2 -->

    <div style="margin-top: 12px; display: flex; gap: 8px;">
      <button class="btn btn-green" id="saveMerchantHistorySettingsBtn" style="display: none;">Save Settings</button>
    </div>

    <div style="margin-top: 12px; padding: 10px; background: rgba(244, 67, 54, 0.1); border: 1px solid rgba(244, 67, 54, 0.3); border-radius: 6px; font-size: 11px; line-height: 1.5; color: var(--text-secondary);">
      <strong style="color: var(--accent-red);">⚠️ WARNING:</strong> Do not change these settings unless you know what you're doing!<br>
      By default, the overlay uses <strong>smart fetching</strong> based on rate limit headers from the trade site for optimal performance.<br>
      Only set a manual interval if you experience issues or heavily use the trade history in your browser.<br>
      <strong>Going below 15 minutes will almost certainly get you rate-limited by the history site.</strong>
    </div>
  </div>
      
    </div><!-- End Trading Tab -->
    
    <!-- APPEARANCE TAB -->
    <div class="tab-panel" data-panel="appearance">
  
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
      
    </div><!-- End Appearance Tab -->
    
    <!-- DATA TAB -->
    <div class="tab-panel" data-panel="data">
  
  <!-- Data Section -->
  <div class="section">
    <div class="section-title">📁 Data Management</div>
    <div class="section-desc">Manage your overlay data and cache</div>
    <div class="setting-item">
      <div class="setting-label">
  <span class="setting-label-text">Config Folder</span>
  <span class="setting-label-desc" style="max-width: 280px; word-break: break-all;">${safeConfigDir}</span>
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
      
    </div><!-- End Data Tab -->
    
    <!-- ABOUT TAB -->
    <div class="tab-panel" data-panel="about">
  
  <!-- About Section -->
  <div class="section">
    <div class="section-title">💡 About XileHUD</div>
    <div class="section-desc">Version ${getAppVersion()}</div>
    
    <div style="margin-top: 20px; display: flex; flex-direction: column; gap: 16px;">
      
      <!-- Social Links -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        
        <!-- GitHub -->
        <a href="https://github.com/XileHUD/poe_overlay" class="social-link" id="githubLink" style="text-decoration: none; display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-color); border-radius: 8px; transition: all 0.2s ease; cursor: pointer;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" fill="currentColor"/>
          </svg>
          <div style="flex: 1;">
            <div style="font-weight: 600; color: var(--text-primary); font-size: 13px;">GitHub</div>
            <div style="font-size: 11px; color: var(--text-secondary);">Source code & releases</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="opacity: 0.5;">
            <path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </a>

        <!-- Discord -->
        <a href="https://discord.gg/eRY6UMg4" class="social-link" id="discordLink" style="text-decoration: none; display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: rgba(88, 101, 242, 0.1); border: 1px solid rgba(88, 101, 242, 0.3); border-radius: 8px; transition: all 0.2s ease; cursor: pointer;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" fill="#5865F2"/>
          </svg>
          <div style="flex: 1;">
            <div style="font-weight: 600; color: #5865F2; font-size: 13px;">Discord</div>
            <div style="font-size: 11px; color: var(--text-secondary);">Join our community</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="opacity: 0.5;">
            <path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </a>

        <!-- YouTube -->
        <a href="https://www.youtube.com/@XileHUD" class="social-link" id="youtubeLink" style="grid-column: 1 / -1; text-decoration: none; display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: rgba(255, 0, 0, 0.1); border: 1px solid rgba(255, 0, 0, 0.3); border-radius: 8px; transition: all 0.2s ease; cursor: pointer;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="#FF0000"/>
          </svg>
          <div style="flex: 1;">
            <div style="font-weight: 600; color: #FF0000; font-size: 13px;">YouTube</div>
            <div style="font-size: 11px; color: var(--text-secondary);">Tutorials & updates</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="opacity: 0.5;">
            <path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </a>

      </div>

      <!-- Disclaimer -->
      <div style="padding: 16px; background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 8px; margin-top: 8px;">
        <div style="font-weight: 600; color: var(--accent-orange); margin-bottom: 8px; font-size: 13px;">⚠️ Disclaimer</div>
        <div style="font-size: 12px; line-height: 1.6; color: var(--text-secondary);">
          This product isn't affiliated with or endorsed by Grinding Gear Games in any way.<br>
          XileHUD is a community-developed overlay tool. Use at your own discretion.
        </div>
      </div>

      <!-- Contact Info -->
      <div style="padding: 14px; background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-color); border-radius: 8px; font-size: 11px; color: var(--text-secondary); line-height: 1.6;">
        <strong style="color: var(--text-primary);">Contact:</strong> hello@xile.wtf<br>
        <strong style="color: var(--text-primary);">User-Agent:</strong> XileHUD/${getAppVersion()} (contact: hello@xile.wtf)
      </div>

    </div>
  </div>
      
    </div><!-- End About Tab -->
    
  </div><!-- end content-wrapper -->
  
  <script>
    (function() {
      const { ipcRenderer } = require('electron');
      
      // Tab switching functionality
      const tabButtons = document.querySelectorAll('.tab-button');
      const tabPanels = document.querySelectorAll('.tab-panel');
      
      tabButtons.forEach(button => {
        button.addEventListener('click', () => {
          const targetTab = button.getAttribute('data-tab');
          
          // Update button states
          tabButtons.forEach(btn => btn.classList.remove('active'));
          button.classList.add('active');
          
          // Update panel visibility
          tabPanels.forEach(panel => {
            panel.classList.remove('active');
            if (panel.getAttribute('data-panel') === targetTab) {
              panel.classList.add('active');
            }
          });
        });
      });
      
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

      // Overlay version selection
  const overlayVersionButtons = Array.from(document.querySelectorAll('[data-overlay-version]'));
  const overlayVersionSaveBtn = document.getElementById('saveOverlayVersionBtn');
  const overlayVersionStatus = document.getElementById('overlayVersionStatus');
  let originalOverlayVersion = ${JSON.stringify(normalizedOverlayVersion)};
  let selectedOverlayVersion = originalOverlayVersion;

      const updateOverlayVersionUI = () => {
        overlayVersionButtons.forEach((btn) => {
          const version = btn.getAttribute('data-overlay-version');
          btn.classList.toggle('selected', version === selectedOverlayVersion);
        });
        if (overlayVersionSaveBtn) {
          overlayVersionSaveBtn.style.display = selectedOverlayVersion !== originalOverlayVersion ? 'block' : 'none';
        }
      };

      updateOverlayVersionUI();

      overlayVersionButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const version = btn.getAttribute('data-overlay-version');
          if (!version) return;
          selectedOverlayVersion = version;
          updateOverlayVersionUI();
          if (overlayVersionStatus) {
            overlayVersionStatus.className = 'setting-status';
            overlayVersionStatus.textContent = '';
          }
        });
      });

      overlayVersionSaveBtn?.addEventListener('click', () => {
        ipcRenderer.send('settings-save-overlay-version', selectedOverlayVersion);
        if (overlayVersionStatus) {
          overlayVersionStatus.className = 'setting-status info';
          overlayVersionStatus.textContent = 'Saving overlay version...';
        }
      });

      ipcRenderer.on('settings-overlay-version-saved', (_event, payload) => {
            if (!overlayVersionStatus) return;
            if (payload?.error) {
              overlayVersionStatus.className = 'setting-status error';
              overlayVersionStatus.textContent = payload.error;
              return;
            }
            originalOverlayVersion = payload?.version || selectedOverlayVersion;
            selectedOverlayVersion = originalOverlayVersion;
            updateOverlayVersionUI();
            overlayVersionSaveBtn?.style && (overlayVersionSaveBtn.style.display = 'none');
            if (payload?.changed) {
              overlayVersionStatus.className = 'setting-status success';
              overlayVersionStatus.textContent = 'Saved. Preparing restart…';
            } else {
              overlayVersionStatus.className = 'setting-status info';
              overlayVersionStatus.textContent = 'Already using that version.';
            }
      });
      
      // League selection
  const leagueSelect = document.getElementById('leagueSelect');
  const saveLeagueBtn = document.getElementById('saveLeagueBtn');
  let originalLeague = ${JSON.stringify(merchantHistoryLeague)};
      
      // Set initial value
      if (leagueSelect) {
        leagueSelect.value = originalLeague;
      }
      if (leagueSelect && saveLeagueBtn) {
        leagueSelect.addEventListener('change', () => {
          if (leagueSelect.value !== originalLeague) {
            saveLeagueBtn.style.display = 'block';
          } else {
            saveLeagueBtn.style.display = 'none';
          }
        });
      }

      // Save league
      if (saveLeagueBtn) {
        saveLeagueBtn.addEventListener('click', () => {
          if (!leagueSelect) return;
          const newLeague = leagueSelect.value;
          ipcRenderer.send('settings-save-league', newLeague);
          originalLeague = newLeague;
          saveLeagueBtn.style.display = 'none';
        });
      }
      
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
      
  // Open config folder
      document.getElementById('openFolderBtn').addEventListener('click', () => {
        ipcRenderer.send('settings-open-folder');
      });
      
      // Merchant History Auto-Fetch Settings
      const merchantHistoryAutoFetchToggle = document.getElementById('merchantHistoryAutoFetchToggle');
      const merchantHistoryIntervalInput = document.getElementById('merchantHistoryIntervalInput');
      const merchantHistoryIntervalDisplay = document.getElementById('merchantHistoryIntervalDisplay');
      const saveMerchantHistorySettingsBtn = document.getElementById('saveMerchantHistorySettingsBtn');
      
      let originalAutoFetch = ${merchantHistoryAutoFetch};
      let originalInterval = ${merchantHistoryRefreshInterval || 0}; // 0 = smart auto
      let pendingAutoFetch = originalAutoFetch;
      let pendingInterval = originalInterval;
      
      const updateMerchantHistorySaveBtn = () => {
        const changed = (pendingAutoFetch !== originalAutoFetch) || (pendingInterval !== originalInterval);
        saveMerchantHistorySettingsBtn.style.display = changed ? 'block' : 'none';
      };
      
      const updateIntervalDisplay = (value) => {
        if (!value || value === 0) {
          merchantHistoryIntervalDisplay.textContent = 'Smart Auto';
        } else {
          merchantHistoryIntervalDisplay.textContent = value + ' min';
        }
      };
      
      if (merchantHistoryAutoFetchToggle) {
        merchantHistoryAutoFetchToggle.addEventListener('change', (e) => {
          pendingAutoFetch = e.target.checked;
          updateMerchantHistorySaveBtn();
        });
      }
      
      if (merchantHistoryIntervalInput) {
        merchantHistoryIntervalInput.addEventListener('input', (e) => {
          let value = e.target.value.trim() === '' ? 0 : Number(e.target.value);
          if (value > 0 && value < 15) value = 15;
          if (value > 240) value = 240;
          pendingInterval = value;
          updateIntervalDisplay(value);
          updateMerchantHistorySaveBtn();
        });
      }
      
      if (saveMerchantHistorySettingsBtn) {
        saveMerchantHistorySettingsBtn.addEventListener('click', () => {
          ipcRenderer.send('settings-save-merchant-history-config', {
            autoFetch: pendingAutoFetch,
            interval: pendingInterval
          });
        });
        
        ipcRenderer.on('settings-merchant-history-config-saved', (event, data) => {
          console.log('Merchant history config saved:', data);
          originalAutoFetch = data.autoFetch;
          originalInterval = data.interval;
          pendingAutoFetch = data.autoFetch;
          pendingInterval = data.interval;
          merchantHistoryAutoFetchToggle.checked = data.autoFetch;
          merchantHistoryIntervalInput.value = data.interval > 0 ? String(data.interval) : '';
          updateIntervalDisplay(data.interval);
          saveMerchantHistorySettingsBtn.style.display = 'none';
        });
      }
      
      // Social links in About tab
      const { shell } = require('electron');
      
      const githubLink = document.getElementById('githubLink');
      const discordLink = document.getElementById('discordLink');
      const youtubeLink = document.getElementById('youtubeLink');
      
      if (githubLink) {
        githubLink.addEventListener('click', (e) => {
          e.preventDefault();
          shell.openExternal('https://github.com/XileHUD/poe_overlay');
        });
      }
      
      if (discordLink) {
        discordLink.addEventListener('click', (e) => {
          e.preventDefault();
          shell.openExternal('https://discord.gg/eRY6UMg4');
        });
      }
      
      if (youtubeLink) {
        youtubeLink.addEventListener('click', (e) => {
          e.preventDefault();
          shell.openExternal('https://www.youtube.com/@XileHUD');
        });
      }
    })();
  </script>
</body>
</html>
  `;
}
