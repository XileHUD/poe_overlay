import { app, BrowserWindow, globalShortcut, ipcMain, screen, Tray, Menu, nativeImage, clipboard, shell, session } from 'electron';
import * as os from 'os';
// Optional updater (will be active in packaged builds)
let autoUpdater: any = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch {}
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import { isDeepStrictEqual } from 'util';
import { pathToFileURL } from 'url';
// Heavy modules will be lazy-imported after splash is visible
import type { ClipboardMonitor } from './clipboard-monitor';
import type { ItemParser } from './item-parser';
import type { ModifierDatabase } from './modifier-database';
import type { KeyboardMonitor } from './keyboard-monitor';
import { buildHistoryPopoutHtml } from './popouts/historyPopoutTemplate'; // still used for mod popouts? kept for now
import { buildModPopoutHtml } from './popouts/modPopoutTemplate';
// Use explicit .js extension for NodeNext module resolution compatibility
import { buildSplashHtml } from './ui/splashTemplate.js';
import { createTray } from './ui/trayService.js';
import { initializeUiohookTrigger, registerGlobalMouseDown, shutdownUiohookTrigger, triggerCopyShortcut } from './hotkeys/uiohook-trigger.js';
// NodeNext sometimes fails transiently on newly added files with explicit .js; use extensionless for TS while runtime still resolves .js after build
import { FloatingButton } from './ui/floatingButton';
import { HotkeyConfigurator } from './ui/hotkeyConfigurator';
import { SettingsService, type UserSettings } from './services/settingsService.js';
import { FeatureService } from './services/featureService.js';
import { FeatureLoader } from './features/featureLoader.js';
import type { FeatureConfig } from './features/featureTypes.js';
import { showFeatureSplash } from './ui/featureSplash.js';
import { showSettingsSplash } from './ui/settingsSplash.js';
import { showOverlayVersionPrompt } from './ui/overlayVersionPrompt.js';
import { MerchantHistoryExportService } from './services/merchantHistoryExport.js';
import { MerchantHistoryCleanupService } from './services/merchantHistoryCleanup.js';
import { showRestartDialog, type RestartDialogOptions } from './ui/restartDialog.js';
import { showToast } from './utils/toastNotification.js';
import { registerDataIpc } from './ipc/dataHandlers.js';
import { registerHistoryPopoutIpc } from './ipc/historyPopoutHandlers.js';
import { PoeSessionHelper } from './network/poeSession.js';
import { ImageCacheService } from './services/imageCache.js';
import { resolveLocalImage, resolveByNameOrSlug, getImageIndexMeta } from './services/imageResolver.js';
import { rateLimiter } from './services/rateLimiter.js';
import { isOverlayVersion, type OverlayVersion } from '../types/overlayVersion.js';

// History popout debug log path (moved logging helpers into historyPopoutHandlers)
const historyPopoutDebugLogPath = path.join(app.getPath('userData'), 'history-popout-debug.log');

const OVERLAY_RELEASE_URL = 'https://github.com/XileHUD/poe_overlay/releases/latest';

interface GithubReleaseInfo {
    version: string | null;
    url?: string;
}

export interface OverlayUpdateCheckResult {
    available: boolean;
    version: string | null;
    message: string;
    url?: string;
    error?: boolean;
}

type OverlaySnapshot =
    | { kind: 'item'; sourceText?: string | null; payload: { item: any; modifiers: any[]; category: string } }
    | { kind: 'unique'; sourceText?: string | null; payload: { item: any } }
    | { kind: 'gems'; sourceText?: string | null; payload: { tab: string; action?: string; delay?: number } }
    | { kind: 'default'; sourceText?: string | null; payload?: Record<string, unknown> };

function normalizeVersionString(version: string | null | undefined): string | null {
    if (!version) return null;
    return version.trim().replace(/^v/i, '');
}

function compareSemanticVersions(a: string, b: string): number {
    const segA = a.split('.').map((n) => parseInt(n, 10) || 0);
    const segB = b.split('.').map((n) => parseInt(n, 10) || 0);
    const len = Math.max(segA.length, segB.length);
    for (let i = 0; i < len; i++) {
        const diff = (segA[i] || 0) - (segB[i] || 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

function fetchLatestReleaseInfo(): Promise<GithubReleaseInfo> {
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
                    reject(err);
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

function getOverlayAppVersion(): string {
    try {
        const packagePath = path.join(__dirname, '../../package.json');
        if (fs.existsSync(packagePath)) {
            const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
            if (packageJson?.version) return String(packageJson.version);
        }
    } catch {}
    try { return app.getVersion(); } catch { return '0.0.0'; }
}

async function checkOverlayUpdateStatus(currentVersion: string): Promise<OverlayUpdateCheckResult> {
    const currentNorm = normalizeVersionString(currentVersion) || '0.0.0';
    try {
        const release = await fetchLatestReleaseInfo();
        if (!release.version) {
            return {
                available: false,
                version: null,
                message: 'Unable to determine the latest version from GitHub.',
                error: true,
                url: OVERLAY_RELEASE_URL
            };
        }

        const remoteNorm = normalizeVersionString(release.version);
        if (!remoteNorm) {
            return {
                available: false,
                version: release.version,
                message: 'Received an invalid version from GitHub releases.',
                error: true,
                url: release.url || OVERLAY_RELEASE_URL
            };
        }

        const comparison = compareSemanticVersions(remoteNorm, currentNorm);
        if (comparison > 0) {
            return {
                available: true,
                version: release.version,
                message: `New version available: ${release.version}. Click to download the latest release.`,
                url: release.url || OVERLAY_RELEASE_URL
            };
        }

        return {
            available: false,
            version: release.version,
            message: `You're already on the latest version (v${currentNorm}).`,
            url: release.url || OVERLAY_RELEASE_URL
        };
    } catch (error: any) {
        return {
            available: false,
            version: currentNorm,
            message: 'Failed to check for updates. Please try again later.',
            error: true,
            url: OVERLAY_RELEASE_URL
        };
    }
}

// Configure Electron userData and Chromium caches to a writable directory before app is ready
try {
    const userDataDir = path.join(app.getPath('appData'), 'XileHUD');
    try { if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true }); } catch {}
    app.setPath('userData', userDataDir);
    const cacheDir = path.join(userDataDir, 'Cache');
    try { if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true }); } catch {}
    app.setPath('cache', cacheDir);
    // Ensure Chromium points at our cache dir and avoids shader disk cache issues
    app.commandLine.appendSwitch('disk-cache-dir', cacheDir);
    app.commandLine.appendSwitch('media-cache-dir', cacheDir);
    app.commandLine.appendSwitch('shader-disk-cache-size', '0');
    app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
} catch {}

// Early minimal splash: show as soon as 'ready' fires so users get instant feedback even if
// Windows Defender / extraction delays block JS event loop for a while after.
let earlySplash: BrowserWindow | null = null;
app.once('ready', () => {
    try {
        if (earlySplash) return;
        const { width, height } = screen.getPrimaryDisplay().workAreaSize;
        earlySplash = new BrowserWindow({
            width: 360,
            height: 200,
            x: Math.round(width/2 - 180),
            y: Math.round(height/2 - 100),
            frame: false,
            transparent: true,
            resizable: false,
            alwaysOnTop: true,
            skipTaskbar: true,
            show: true,
            webPreferences: { nodeIntegration: false, contextIsolation: true }
        });
        // Increase max listeners to prevent warning during startup
        earlySplash.webContents.setMaxListeners(20);
        const minimalHtml = `<!DOCTYPE html><html><head><meta charset='utf-8'/><style>body{margin:0;font-family:Segoe UI,Roboto,Arial,sans-serif;background:rgba(10,12,18,.9);color:#ddd;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;overflow:hidden;}h1{font-size:15px;margin:0 0 10px;color:#ffcc66;letter-spacing:.5px;text-shadow:0 0 4px #000}#msg{font-size:12px;opacity:.9;animation:pulse 2.6s ease-in-out infinite}@keyframes pulse{0%{opacity:.55}50%{opacity:1}100%{opacity:.55}}</style></head><body><h1>XileHUD Overlay</h1><div id="msg">Starting...</div></body></html>`;
        earlySplash.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(minimalHtml));
    } catch {}
});

class OverlayApp {
    private static readonly ITEM_CLIPBOARD_PREFIXES = [
        'Item Class: ',
        'Класс предмета: ',
        'Classe d\'objet: ',
        'Gegenstandsklasse: ',
        'Classe do Item: ',
        'Clase de objeto: ',
        'ชนิดไอเทม: ',
        '아이템 종류: ',
        '物品種類: ',
        '物品类别: '
    ];
    private static readonly FOREGROUND_WINDOW_PS_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class ForegroundWindowHelper {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
}
"@
$hwnd = [ForegroundWindowHelper]::GetForegroundWindow()
if ($hwnd -eq [System.IntPtr]::Zero) {
    ""
} else {
    $hwnd.ToInt64()
}`;
    private mainWindow: BrowserWindow | null = null;
    private overlayWindow: BrowserWindow | null = null;
    private splashWindow: BrowserWindow | null = null;
    private clipboardMonitor!: ClipboardMonitor;
    private itemParser!: ItemParser;
    private modifierDatabase!: ModifierDatabase;
    private poeAccountName: string | null = null;
    private historyWindow: BrowserWindow | null = null;
    private isOverlayVisible = false;
    private moveTimeout: NodeJS.Timeout | null = null;
    private tray: Tray | null = null;
    private pinned = true; // Default to pinned
    private overlayLoaded = false;
    private pendingItemData: any | null = null;
    private lastCopyTimestamp: number = 0;
    private keyboardMonitor: KeyboardMonitor | null = null;
    private armedCaptureUntil: number = 0; // time window (ms epoch) during which clipboard events are accepted
    private dataDirCache: string | null = null;
    private imageCache = new ImageCacheService();
    private poeSession = new PoeSessionHelper(() => this.poeAccountName, (n) => { this.poeAccountName = n; });
    private shortcutAwaitingCapture = false; // tracks if current Ctrl+Q press is still waiting for an item
    private pendingCategory: string | null = null; // category queued before overlay loads
    private pendingTab: string | null = null; // tab to activate after load (e.g. 'modifiers')
    private modPopoutWindows: Set<BrowserWindow> = new Set();
    private lastPopoutSpawnAt: number = 0;
    private historyPopoutWindow: BrowserWindow | null = null;
    private lastProcessedItemText: string = ''; // track last processed item to avoid duplicate handling
    private lastOverlaySnapshot: OverlaySnapshot | null = null;
    private lastHistoryFetchAt: number = 0; // global merchant history fetch timestamp (ms)
    private merchantHistoryLeague: string = 'Rise of the Abyssal';
    private merchantHistoryLeagueSource: 'auto' | 'manual' = 'auto';
    private pendingDefaultView = false; // request renderer to show last/default view when no item provided
    private readonly HISTORY_FETCH_MIN_INTERVAL = 5 * 60 * 1000; // 5 minutes
    private floatingButton: FloatingButton | null = null;
    private settingsService: SettingsService | null = null;
    private featureService: FeatureService | null = null;
    private hotkeyConfigurator: HotkeyConfigurator | null = null;
    private currentRegisteredHotkey: string | null = null; // Track currently registered hotkey to avoid re-registration
    private clickOutsideCheckInterval: NodeJS.Timeout | null = null; // Polling interval for click-outside detection
    private lastMousePosition: { x: number; y: number } | null = null; // Track mouse position for click detection
    private overlayUpdateCache: { timestamp: number; result: OverlayUpdateCheckResult } | null = null;
    private lastForegroundWindowHandle: { handle: string; capturedAt: number } | null = null;
    private uiohookInitialized = false;
    private lastTriggerUsedUiohook: boolean | null = null;
    private skipNextFocusRestore = false;
    private targetIndicatorWindow: BrowserWindow | null = null;
    private blurHandlingInProgress = false;
    private removeUiohookMouseDown: (() => void) | null = null;
    private overlayVersion: OverlayVersion = 'poe2';
    private readonly handleGlobalMouseDown = () => {
        this.hideTargetIndicator();
    };

    constructor() {
        app.whenReady().then(async () => {
            this.showSplash('Initializing application...');
            
            // Initialize settings first
            this.updateSplash('Loading settings');
            this.settingsService = new SettingsService(this.getUserConfigDir());
            this.featureService = new FeatureService(this.settingsService);

            let overlayVersionSetting = this.settingsService.get('overlayVersion');
            if (!isOverlayVersion(overlayVersionSetting)) {
                this.updateSplash('Awaiting overlay version selection...');
                this.closeSplash();
                const selected = await showOverlayVersionPrompt();
                overlayVersionSetting = selected;
                try {
                    this.settingsService.set('overlayVersion', selected);
                } catch (err) {
                    console.warn('[Init] Failed to persist overlay version selection:', err);
                }
                this.showSplash('Initializing application...');
                this.updateSplash('Loading settings');
            }
            const resolvedOverlayVersion: OverlayVersion = isOverlayVersion(overlayVersionSetting) ? overlayVersionSetting : 'poe2';
            this.overlayVersion = resolvedOverlayVersion;
            console.log('[Init] Overlay version set to', this.overlayVersion);

            this.migrateLegacyFeatureSplashFlag();

            this.migrateClipboardDelaySetting();

            this.initializeFontSize();

            try {
                const storedLeagueRaw = this.settingsService.get('merchantHistoryLeague');
                const storedSource = this.settingsService.get('merchantHistoryLeagueSource');
                const trimmedLeague = typeof storedLeagueRaw === 'string' ? storedLeagueRaw.trim() : '';
                const hasManualPreference = storedSource === 'manual' && trimmedLeague.length > 0;

                if (hasManualPreference) {
                    this.merchantHistoryLeague = trimmedLeague;
                    this.merchantHistoryLeagueSource = 'manual';
                } else {
                    this.merchantHistoryLeague = 'Rise of the Abyssal';
                    this.merchantHistoryLeagueSource = 'auto';

                    if (trimmedLeague.length > 0 || storedSource === 'auto') {
                        this.settingsService.clear('merchantHistoryLeague');
                        this.settingsService.clear('merchantHistoryLeagueSource');
                    }
                }
            } catch {}
            
            if (this.overlayVersion === 'poe1') {
                this.markFeatureSplashSeen('poe1');
                this.updateSplash('PoE1 mode detected');
            } else {
                let hasSeenSplash = this.hasSeenFeatureSplash('poe2');

                if (!hasSeenSplash) {
                    const existingFeatureConfig = this.settingsService.get('enabledFeatures');
                    if (existingFeatureConfig && typeof existingFeatureConfig === 'object') {
                        console.log('[Init] Feature config already present – skipping splash');
                        hasSeenSplash = true;
                        this.markFeatureSplashSeen('poe2');
                    }
                }

                if (!hasSeenSplash) {
                    this.updateSplash('Awaiting feature selection...');
                    this.closeSplash();
                    await this.showFeatureSelection();
                    this.markFeatureSplashSeen('poe2');
                    this.showSplash('Loading enabled features...');
                }
            }
            
            // Lazy load heavy modules after splash is visible
            const [ { ModifierDatabase }, { ItemParser }, { ClipboardMonitor }, { KeyboardMonitor } ] = await Promise.all([
                import('./modifier-database.js'),
                import('./item-parser.js'),
                import('./clipboard-monitor.js'),
                import('./keyboard-monitor.js')
            ]);

            this.updateSplash('Resolving data path');
            const initialDataPath = this.resolveInitialDataPath();
            
            if (this.overlayVersion === 'poe1') {
                this.updateSplash('PoE1 mode: loading PoE1 data');
                const modifiersPath = this.getModifiersDir();
                this.modifierDatabase = new ModifierDatabase(modifiersPath, false, 'poe1');
                await this.modifierDatabase.loadAsync((msg) => this.updateSplash(msg));
            } else {
                this.updateSplash('Loading enabled features');
                const featureLoader = new FeatureLoader(
                    this.featureService,
                    initialDataPath,
                    (msg) => this.updateSplash(msg),
                    this.overlayVersion as 'poe1' | 'poe2'
                );

                const { modifierDatabase } = await featureLoader.loadAll();
                this.modifierDatabase = modifierDatabase as any;
            }

            if (this.modifierDatabase) {
                this.updateSplash('Modifiers loaded');
                try {
                    const cats = await this.modifierDatabase.getAllCategories();
                    this.overlayWindow?.webContents.send('modifiers-loaded', cats);
                } catch {}
            }

            this.updateSplash('Starting parsers');
            this.itemParser = new ItemParser(this.overlayVersion as 'poe1' | 'poe2');
            this.clipboardMonitor = new ClipboardMonitor();
            this.keyboardMonitor = new KeyboardMonitor();
            try { this.keyboardMonitor!.start(); } catch {}
            try { this.keyboardMonitor?.on?.('mouse-down', this.handleGlobalMouseDown); } catch {}

            const hookLogger = (message: string, details?: unknown) => {
                if (details) {
                    console.debug(message, details);
                } else {
                    console.debug(message);
                }
            };
            const hookReady = await initializeUiohookTrigger(hookLogger);
            if (hookReady) {
                try {
                    this.removeUiohookMouseDown = await registerGlobalMouseDown(() => this.handleGlobalMouseDown(), hookLogger);
                } catch (err) {
                    console.warn('[Overlay] Failed to attach uIOhook mouse listener', err);
                }
            } else {
                console.warn('[Overlay] uIOhook trigger unavailable; global mouse-down listener disabled');
            }
            this.uiohookInitialized = hookReady;
            if (!hookReady) {
                console.warn('[Hotkey] uIOhook unavailable, falling back to RobotJS/SendKeys');
            }

            this.updateSplash('Creating overlay window');
            this.createOverlayWindow();
            
            this.floatingButton = new FloatingButton({
                settingsService: this.settingsService
            });
            
            this.updateSplash('Creating tray');
            this.tray = createTray({
                onToggleOverlay: () => this.toggleOverlayWithAllCategory(),
                onOpenModifiers: () => { this.toggleOverlayWithAllCategory(); setTimeout(()=> { this.safeSendToOverlay('set-active-tab','modifiers'); },140); },
                onOpenHistory: () => { this.toggleOverlayWithAllCategory(); setTimeout(()=> { this.safeSendToOverlay('set-active-tab','history'); this.safeSendToOverlay('invoke-action','merchant-history'); },180); },
                onExportHistory: () => this.exportMerchantHistoryToCsv(),
                onCleanupHistory: () => this.cleanupMerchantHistory(),
                onQuit: () => app.quit(),
                onToggleFloatingButton: () => this.toggleFloatingButton(),
                onOpenSettings: () => this.openSettings(),
                onShowOverlay: () => this.showDefaultOverlay({ focus: true }),
                currentHotkeyLabel: this.getHotkeyKey(),
                featureVisibility: this.overlayVersion === 'poe2'
                    ? {
                        modifiers: this.featureService?.isFeatureEnabled('modifiers') ?? false,
                        merchantHistory: this.featureService?.isFeatureEnabled('merchant') ?? false
                    }
                    : {
                        modifiers: true, // PoE1 has modifiers feature
                        merchantHistory: false
                    }
            });
            this.updateSplash('Registering shortcuts');
            this.registerShortcuts();
            this.updateSplash('Setting up services');
            this.setupIPC();
            this.setupClipboardMonitoring();
            this.imageCache.init();
            try { (this.clipboardMonitor as any).start?.(); } catch {}

            // Auto-update configuration
            try {
                if (autoUpdater) {
                    // Configure updater
                    autoUpdater.autoDownload = true;
                    autoUpdater.autoInstallOnAppQuit = true;
                    autoUpdater.logger = console;
                    
                    // Event handlers
                    autoUpdater.on('checking-for-update', () => {
                        console.log('[AutoUpdater] Checking for updates...');
                    });
                    
                    autoUpdater.on('update-available', (info: any) => {
                        console.log('[AutoUpdater] Update available:', info.version);
                        try { 
                            this.tray?.displayBalloon?.({ 
                                title: 'XileHUD Update Available', 
                                content: `Version ${info.version} is downloading...` 
                            }); 
                        } catch {}
                    });
                    
                    autoUpdater.on('update-not-available', () => {
                        console.log('[AutoUpdater] No updates available');
                    });
                    
                    autoUpdater.on('download-progress', (progress: any) => {
                        const percent = Math.round(progress.percent);
                        console.log(`[AutoUpdater] Download progress: ${percent}%`);
                    });
                    
                    autoUpdater.on('update-downloaded', (info: any) => {
                        console.log('[AutoUpdater] Update downloaded, will install on quit');
                        try { 
                            this.tray?.displayBalloon?.({ 
                                title: 'XileHUD Update Ready', 
                                content: 'Version ' + info.version + ' will install when you close the overlay.\n\nYour settings and history will be preserved.' 
                            }); 
                        } catch {}
                    });
                    
                    autoUpdater.on('error', (err: any) => {
                        console.error('[AutoUpdater] Error:', err);
                    });
                    
                    // Check for updates on startup (ignore missing latest.yml in local builds)
                    autoUpdater.checkForUpdatesAndNotify().catch((err: any) => {
                        const message = err?.message || String(err || 'unknown error');
                        if (/latest\.yml/i.test(message)) {
                            console.warn('[AutoUpdater] latest.yml missing (likely unsigned/local build). Skipping update check.');
                        } else {
                            console.error('[AutoUpdater] checkForUpdatesAndNotify failed:', message);
                        }
                    });
                }
            } catch (e) {
                console.error('[AutoUpdater] Setup failed:', e);
            }

            // Auto clean on quit
            app.on('will-quit', () => {
                try { globalShortcut.unregisterAll(); } catch {}
                try { (this.clipboardMonitor as any).stop?.(); } catch {}
                try { this.keyboardMonitor?.removeListener?.('mouse-down', this.handleGlobalMouseDown); } catch {}
                try { this.keyboardMonitor?.stop(); } catch {}
                try { this.removeUiohookMouseDown?.(); } catch {}
                this.removeUiohookMouseDown = null;
                try { shutdownUiohookTrigger((message, details) => {
                    if (details) {
                        console.debug(message, details);
                    } else {
                        console.debug(message);
                    }
                }); } catch {}
            });

            // Finalize splash
            this.updateSplash('Loaded and ready (running in background)');
            
            // Restore floating button state if it was enabled
            const floatingButtonSettings = this.settingsService.get('floatingButton');
            if (floatingButtonSettings?.enabled) {
                this.floatingButton?.show();
            }
            
            // Keep the final ready message visible a bit longer so users notice
            setTimeout(()=> this.closeSplash(), 3000);
        });
    }

    private showSplash(initial: string) {
        try {
            if (this.splashWindow && !this.splashWindow.isDestroyed()) {
                this.updateSplash(initial);
                return;
            }
            // Reuse earlySplash if available
            if (earlySplash && !earlySplash.isDestroyed()) {
                this.splashWindow = earlySplash;
                earlySplash = null; // transfer ownership
                const isFirstLaunch = !fs.existsSync(this.getUserConfigDir());
                const html = buildSplashHtml(initial, isFirstLaunch);
                this.splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
                return;
            }
            const { width, height } = screen.getPrimaryDisplay().workAreaSize;
            this.splashWindow = new BrowserWindow({
                width: 380,
                height: 220,
                x: Math.round(width/2 - 190),
                y: Math.round(height/2 - 110),
                frame: false,
                transparent: true,
                resizable: false,
                alwaysOnTop: true,
                skipTaskbar: true,
                show: true,
                webPreferences: { nodeIntegration: false, contextIsolation: true }
            });
            const isFirstLaunch = !fs.existsSync(this.getUserConfigDir());
            const html = buildSplashHtml(initial, isFirstLaunch);
            this.splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
        } catch (e) { console.warn('splash create failed', e); }
    }

    private updateSplash(msg: string) {
        try {
            if (!this.splashWindow || this.splashWindow.isDestroyed()) return;
            this.splashWindow.webContents.executeJavaScript(`(function(){ 
                const st=document.getElementById('st'); 
                if(st) st.textContent=${JSON.stringify(msg)}; 
                const note=document.getElementById('note');
                if(note) note.style.opacity='0';
            })();`).catch(()=>{});
        } catch {}
    }

    private closeSplash() {
        try {
            if (!this.splashWindow || this.splashWindow.isDestroyed()) return;
            this.splashWindow.webContents.executeJavaScript(`(function(){ const sp=document.getElementById('sp'); if(sp) sp.remove(); const st=document.getElementById('st'); if(st){ st.classList.add('ready'); } })();`).catch(()=>{});
            const ref = this.splashWindow;
            this.splashWindow = null;
            setTimeout(()=> { try { ref.close(); } catch {} }, 380);
        } catch {}
    }

    private validateDataDirCandidate(candidate: string | null | undefined, version: OverlayVersion): { valid: boolean; reason?: string } {
        if (typeof candidate !== 'string' || candidate.trim().length === 0) {
            return { valid: false, reason: 'invalid_path' };
        }
        try {
            const normalized = path.resolve(candidate);
            if (!fs.existsSync(normalized)) {
                return { valid: false, reason: 'missing' };
            }

            if (version === 'poe1') {
                const itemsDir = path.join(normalized, 'items');
                if (!fs.existsSync(itemsDir)) {
                    return { valid: false, reason: 'poe1_missing_items_dir' };
                }
                const expectedSubdirs = ['currency', 'essences', 'fossils', 'embers', 'scarabs'];
                const hasExpected = expectedSubdirs.some((dir) => fs.existsSync(path.join(itemsDir, dir)));
                if (!hasExpected) {
                    return { valid: false, reason: 'poe1_missing_expected_categories' };
                }
            } else {
                // PoE2: just check if directory exists and has some JSON files
                try {
                    const files = fs.readdirSync(normalized);
                    const hasJsonFiles = files.some(f => f.endsWith('.json'));
                    if (!hasJsonFiles) {
                        return { valid: false, reason: 'poe2_missing_json_files' };
                    }
                } catch {
                    return { valid: false, reason: 'poe2_read_error' };
                }
            }

            return { valid: true };
        } catch (error) {
            console.warn('[DataPath] validation error for', candidate, error);
            return { valid: false, reason: 'validation_error' };
        }
    }

    private resolveInitialDataPath(): string {
        const version: OverlayVersion = this.overlayVersion === 'poe1' ? 'poe1' : 'poe2';

        try {
            // 1) Environment override (version specific first, then generic)
            const specificEnvKey = version === 'poe1' ? 'XILEHUD_POE1_DATA_DIR' : 'XILEHUD_POE2_DATA_DIR';
            const specificEnv = process.env[specificEnvKey];
            const specificValidation = this.validateDataDirCandidate(specificEnv, version);
            if (specificValidation.valid && specificEnv) {
                return path.resolve(specificEnv);
            }

            const genericEnv = process.env.XILEHUD_DATA_DIR;
            const genericValidation = this.validateDataDirCandidate(genericEnv, version);
            if (genericValidation.valid && genericEnv) {
                return path.resolve(genericEnv);
            }
        } catch {}

        try {
            // 2) Config file under userData (store per-version override)
            const cfgDir = this.getUserConfigDir();
            const cfgPath = path.join(cfgDir, 'overlay-config.json');
            if (fs.existsSync(cfgPath)) {
                const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
                const keyed = typeof cfg === 'object' && cfg ? cfg : {};
                const versionKey = version === 'poe1' ? 'poe1DataDir' : 'poe2DataDir';
                const maybeSpecific = keyed?.[versionKey];
                const specificValidation = this.validateDataDirCandidate(maybeSpecific, version);
                if (specificValidation.valid && typeof maybeSpecific === 'string') {
                    return path.resolve(maybeSpecific);
                }
                const legacyShared = keyed?.dataDir;
                const legacyValidation = this.validateDataDirCandidate(legacyShared, version);
                if (legacyValidation.valid && typeof legacyShared === 'string') {
                    return path.resolve(legacyShared);
                }
            }
        } catch {}

        try {
            // 3) Repo relative default (dev)
            const devRoot = path.join(__dirname, '../../data', version);
            if (fs.existsSync(devRoot)) {
                const entries = fs.readdirSync(devRoot)
                    .map((entry) => path.join(devRoot, entry))
                    .filter((fullPath) => {
                        try { return fs.statSync(fullPath).isDirectory(); } catch { return false; }
                    });
                if (entries.length > 0) {
                    if (version === 'poe2') {
                        const abyssal = entries.find((candidate) => /Rise of the Abyssal/i.test(candidate));
                        if (abyssal) return abyssal;
                    } else if (version === 'poe1') {
                        // Look for PoE1Modules (items/gems/etc.)
                        const modules = entries.find((candidate) => /PoE1Modules/i.test(candidate));
                        if (modules) return modules;
                        // Legacy fallback: "Secret" or "Rise of the Abyssal"
                        const secret = entries.find((candidate) => /^Secret$/i.test(path.basename(candidate)));
                        if (secret && this.validateDataDirCandidate(secret, version).valid) return secret;
                    }
                    const firstValid = entries.find((entry) => this.validateDataDirCandidate(entry, version).valid);
                    if (firstValid) return firstValid;
                    return entries[0];
                }
                return devRoot;
            }
        } catch {}

        try {
            // 4) Packaged resources (electron-builder extraFiles)
            const base = path.join(process.resourcesPath || '', 'data', version);
            if (fs.existsSync(base)) {
                if (version === 'poe1') {
                    // PoE1: look for PoE1Modules subdirectory
                    const poe1Modules = path.join(base, 'PoE1Modules');
                    if (fs.existsSync(poe1Modules)) {
                        return poe1Modules;
                    }
                }
                // PoE2 or fallback: look for first subdirectory (e.g., "Rise of the Abyssal")
                const entries = fs.readdirSync(base)
                    .map((entry) => path.join(base, entry))
                    .filter((fullPath) => {
                        try { return fs.statSync(fullPath).isDirectory(); } catch { return false; }
                    });
                if (entries.length > 0) {
                    return entries[0];
                }
                return base;
            }
        } catch {}

        // 5) Fallback to userData/<version>
        const fallback = path.join(this.getUserConfigDir(), version);
        try { if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true }); } catch {}
        return fallback;
    }

    // (Legacy image cache methods removed; handled by ImageCacheService)

    private getDataDir(): string {
        // Always resolve based on current overlayVersion to ensure version-aware path
        return this.resolveInitialDataPath();
    }

    private getModifiersDir(): string {
        // For PoE1, modifiers are in a separate directory from items/gems
        const version: OverlayVersion = this.overlayVersion === 'poe1' ? 'poe1' : 'poe2';
        
        if (version === 'poe2') {
            // PoE2 modifiers and items are in the same directory
            return this.resolveInitialDataPath();
        }
        
        // PoE1: modifiers are in PoE1Modifiers, items/gems are in PoE1Modules
        // 1) Try dev path
        try {
            const poe1Root = path.join(__dirname, '../../data/poe1');
            if (fs.existsSync(poe1Root)) {
                const entries = fs.readdirSync(poe1Root)
                    .map((entry) => path.join(poe1Root, entry))
                    .filter((fullPath) => {
                        try { return fs.statSync(fullPath).isDirectory(); } catch { return false; }
                    });
                
                // Look for PoE1Modifiers directory
                const modifiersDir = entries.find((candidate) => /PoE1Modifiers/i.test(candidate));
                if (modifiersDir) return modifiersDir;
                
                // Legacy fallback: SecretLeague
                const legacyDir = entries.find((candidate) => /SecretLeague/i.test(candidate));
                if (legacyDir) return legacyDir;
            }
        } catch {}
        
        // 2) Try packaged resources path
        try {
            const poe1Root = path.join(process.resourcesPath || '', 'data', 'poe1');
            if (fs.existsSync(poe1Root)) {
                const poe1Modifiers = path.join(poe1Root, 'PoE1Modifiers');
                if (fs.existsSync(poe1Modifiers)) {
                    return poe1Modifiers;
                }
            }
        } catch {}
        
        // Fallback to same as items dir
        return this.resolveInitialDataPath();
    }

    private migrateLegacyFeatureSplashFlag(): void {
        if (!this.settingsService) return;
        const legacySeen = this.settingsService.get('seenFeatureSplash') === true;
        if (!legacySeen) return;
        const perVersion = this.settingsService.get('featureSplashSeen');
        if (perVersion && typeof perVersion === 'object' && (perVersion as Record<string, unknown>).poe2 === true) {
            return;
        }
        const next: Partial<Record<OverlayVersion, boolean>> = { ...(perVersion && typeof perVersion === 'object' ? perVersion : {}) };
        next.poe2 = true;
        this.settingsService.set('featureSplashSeen', next);
    }

    private hasSeenFeatureSplash(version: OverlayVersion): boolean {
        if (!this.settingsService) return false;
        const perVersion = this.settingsService.get('featureSplashSeen');
        if (perVersion && typeof perVersion === 'object') {
            const value = (perVersion as Record<string, unknown>)[version];
            if (value === true) return true;
            if (value === false) return false;
        }
        if (version === 'poe2') {
            return this.settingsService.get('seenFeatureSplash') === true;
        }
        return false;
    }

    private markFeatureSplashSeen(version: OverlayVersion): void {
        if (!this.settingsService) return;
        const perVersion = this.settingsService.get('featureSplashSeen');
        const next: Partial<Record<OverlayVersion, boolean>> = { ...(perVersion && typeof perVersion === 'object' ? perVersion : {}) };
        if (next[version] === true) {
            return;
        }
        next[version] = true;
        this.settingsService.set('featureSplashSeen', next);
        if (version === 'poe2' && this.settingsService.get('seenFeatureSplash') !== true) {
            this.settingsService.set('seenFeatureSplash', true);
        }
    }

    /**
     * Show feature selection splash (first launch or manual config)
     */
    private async showFeatureSelection(): Promise<void> {
        if (this.overlayVersion !== 'poe2') {
            return;
        }
        try {
            const selectedConfig = await showFeatureSplash(undefined, this.overlayVersion);
            if (selectedConfig) {
                this.featureService!.saveConfig(selectedConfig);
                this.updateSplash('Feature configuration saved');
            }
        } catch (err) {
            console.error('[showFeatureSelection] Error:', err);
        }
    }

    /**
     * Open feature configuration window (triggered from tray menu)
     */
    private async openFeatureConfiguration(): Promise<void> {
        try {
            const currentConfig = this.featureService!.getConfig();
            const selectedConfig = await showFeatureSplash(currentConfig, this.overlayVersion);

            if (!selectedConfig) return;

            if (currentConfig && isDeepStrictEqual(currentConfig, selectedConfig)) {
                return;
            }

            this.featureService!.saveConfig(selectedConfig);

            await this.promptForRestart();
        } catch (err) {
            console.error('[openFeatureConfiguration] Error:', err);
        }
    }

    private async promptForRestart(options?: RestartDialogOptions): Promise<void> {
        const overlayRef = (this.overlayWindow && !this.overlayWindow.isDestroyed()) ? this.overlayWindow : null;
        let restoreOverlayZ: (() => void) | undefined;

        if (overlayRef) {
            const wasAlwaysOnTop = overlayRef.isAlwaysOnTop();
            try {
                overlayRef.setAlwaysOnTop(false);
            } catch (err) {
                console.warn('[overlay] Failed to release always-on-top for restart dialog:', err);
            }
            restoreOverlayZ = () => {
                try {
                    if (!overlayRef || overlayRef.isDestroyed()) return;
                    if (this.pinned || wasAlwaysOnTop) {
                        overlayRef.setAlwaysOnTop(true, 'screen-saver');
                        if (typeof (overlayRef as any).moveTop === 'function') {
                            (overlayRef as any).moveTop();
                        }
                    } else {
                        overlayRef.setAlwaysOnTop(false);
                    }
                } catch (restoreErr) {
                    console.warn('[overlay] Failed to restore always-on-top after restart dialog:', restoreErr);
                }
            };
        }

        const dialogOptions: RestartDialogOptions = {
            title: options?.title,
            message: options?.message ?? 'Feature settings updated',
            detail: options?.detail ?? 'The overlay will restart to apply your changes.\n\nYour game will NOT be affected.'
        };

        let shouldRestart = false;
        try {
            shouldRestart = await showRestartDialog(overlayRef, dialogOptions);
        } finally {
            restoreOverlayZ?.();
        }

        if (shouldRestart) {
            app.relaunch();
            app.quit();
        }
    }

    private buildDisabledFeatureConfig(): FeatureConfig {
        return {
            modifiers: false,
            poe1Modifiers: false,
            crafting: {
                enabled: false,
                subcategories: {
                    liquidEmotions: false,
                    annoints: false,
                    essences: false,
                    omens: false,
                    currency: false,
                    catalysts: false,
                    socketables: false
                }
            },
            poe1Crafting: {
                enabled: false,
                subcategories: {
                    scarabs: false,
                    currency: false,
                    essences: false,
                    fossils: false,
                    embers: false
                }
            },
            character: {
                enabled: false,
                subcategories: {
                    questPassives: false,
                    keystones: false,
                    ascendancyPassives: false,
                    atlasNodes: false,
                    gems: false,
                    glossar: false
                }
            },
            poe1Character: {
                enabled: false,
                subcategories: {
                    divinationCards: false,
                    tattoos: false,
                    gems: false
                }
            },
            items: {
                enabled: false,
                subcategories: {
                    uniques: false,
                    bases: false
                }
            },
            poe1Items: {
                enabled: false,
                subcategories: {
                    uniques: false,
                    bases: false
                }
            },
            tools: {
                enabled: false,
                subcategories: {
                    regex: false,
                    poe1Regex: false
                }
            },
            merchant: false
        };
    }

    /**
     * Open settings splash window
     */
    private async openSettings(): Promise<void> {
        try {
            await showSettingsSplash({
                settingsService: this.settingsService!,
                featureService: this.featureService!,
                currentHotkey: this.getHotkeyKey(),
                getDataDir: () => this.getDataDir(),
                reloadData: () => (this.modifierDatabase as any)?.reload?.(),
                onHotkeySave: (newKey: string) => this.saveHotkey(newKey),
                onLeagueSave: (league: string) => this.handleLeagueChange(league),
                onFeatureConfigOpen: () => this.openFeatureConfiguration(),
                onRequestOverlayRestart: (options?: { message?: string; detail?: string }) => {
                    void this.promptForRestart({
                        message: options?.message ?? 'Overlay version changed',
                        detail: options?.detail ?? 'The overlay can reload into the selected game mode once it restarts.'
                    });
                },
                onShowOverlay: () => this.toggleOverlayWithAllCategory(),
                overlayWindow: this.overlayWindow,
                overlayVersion: this.overlayVersion
            });
        } catch (err) {
            console.error('[openSettings] Error:', err);
        }
    }

    /**
     * Handle league change from settings UI
     */
    private handleLeagueChange(league: string): void {
        const trimmedLeague = league.trim();
        if (!trimmedLeague) return;

        console.log('[Main] League changed in settings:', trimmedLeague);

        // Update instance variables
        this.merchantHistoryLeague = trimmedLeague;
        this.merchantHistoryLeagueSource = 'manual';

        // Notify overlay renderer of the league change
        if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
            try {
                this.overlayWindow.webContents.send('history-league-changed', {
                    league: trimmedLeague,
                    source: 'manual'
                });
                console.log('[Main] Sent league change notification to renderer:', trimmedLeague);
            } catch (err) {
                console.error('[Main] Failed to notify renderer of league change:', err);
            }
        }
    }

    // Safely send IPC to overlay renderer if loaded; else queue minimal (category + item)
    private safeSendToOverlay(channel: string, ...args: any[]) {
        try {
            if (this.overlayWindow && !this.overlayWindow.isDestroyed() && this.overlayLoaded) {
                this.overlayWindow.webContents.send(channel, ...args);
            } else {
                if (channel === 'item-data') this.pendingItemData = args[0];
                if (channel === 'set-active-category' && typeof args[0] === 'string') this.pendingCategory = args[0];
                if (channel === 'set-active-tab' && typeof args[0] === 'string') this.pendingTab = args[0];
            }
        } catch {}
    }

    // Retry helper for early sends (used previously; keep for compatibility)
    private sendToOverlayWithRetry(channel: string, args: any[], attempts = 5, delayMs = 120) {
        const trySend = (left: number) => {
            if (this.overlayWindow && this.overlayLoaded) {
                try { this.overlayWindow.webContents.send(channel, ...args); } catch {}
            } else if (left > 0) {
                setTimeout(()=> trySend(left-1), delayMs);
            }
        };
        trySend(attempts);
    }
    
    // Return directory used for persisting lightweight JSON configs
    private getUserConfigDir(): string {
        try {
            const dir = path.join(app.getPath('userData'), 'config');
            try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch {}
            return dir;
        } catch {
            return app.getPath('userData');
        }
    }

    // Export merchant history to CSV
    private async exportMerchantHistoryToCsv(): Promise<void> {
        try {
            const configDir = this.getUserConfigDir();
            await MerchantHistoryExportService.exportToCsv(configDir, this.overlayWindow, this.merchantHistoryLeague);
        } catch (e) {
            console.error('[Main] Failed to export merchant history:', e);
        }
    }

    // Clean up merchant history duplicates (smart deduplication)
    private async cleanupMerchantHistory(): Promise<void> {
        try {
            const configDir = this.getUserConfigDir();
            const { dialog, BrowserWindow } = await import('electron');
            
            // Scan all leagues to see what needs cleaning
            const allLeaguesScan = await MerchantHistoryCleanupService.scanAllLeagues(configDir);
            
            if (allLeaguesScan.totalInvalid === 0) {
                // Temporarily disable alwaysOnTop for overlay so dialog can appear on top
                const wasAlwaysOnTop = this.overlayWindow?.isAlwaysOnTop() || false;
                if (wasAlwaysOnTop && this.overlayWindow) {
                    this.overlayWindow.setAlwaysOnTop(false);
                }

                await dialog.showMessageBox(this.overlayWindow || undefined as any, {
                    type: 'info',
                    title: 'History Clean',
                    message: 'Your history is already clean!',
                    detail: 'No duplicate entries found. The new smart deduplication system will prevent future duplicates automatically.',
                    buttons: ['OK']
                });

                // Restore alwaysOnTop
                if (wasAlwaysOnTop && this.overlayWindow) {
                    this.overlayWindow.setAlwaysOnTop(true);
                }
                return;
            }

            // Build detail message showing all affected leagues
            let detailMessage = '🔍 **What we found:**\n\n';
            for (const file of allLeaguesScan.files) {
                detailMessage += `• ${file.fileName}\n`;
                detailMessage += `  ${file.invalidEntries} duplicates (${file.validEntries} valid)\n\n`;
            }
            detailMessage += `**Total duplicates:** ${allLeaguesScan.totalInvalid}\n\n`;
            detailMessage += `🔧 **What cleanup does:**\n`;
            detailMessage += `• Finds entries with same item_id + timestamp\n`;
            detailMessage += `• Keeps complete version (with item details)\n`;
            detailMessage += `• Removes incomplete version (item: null)\n`;
            detailMessage += `• Fixes inflated totals\n\n`;
            detailMessage += `✅ **Going forward:**\n`;
            detailMessage += `The new smart system prevents duplicates automatically!\n\n`;
            detailMessage += `💾 **Safety:** Backup created before any changes.`;

            // Show choice dialog: Clean all or just current league
            // Temporarily disable alwaysOnTop for overlay so dialog can appear on top
            const wasAlwaysOnTop = this.overlayWindow?.isAlwaysOnTop() || false;
            if (wasAlwaysOnTop && this.overlayWindow) {
                this.overlayWindow.setAlwaysOnTop(false);
            }

            const choiceResult = await dialog.showMessageBox(this.overlayWindow || undefined as any, {
                type: 'question',
                title: 'Clean Duplicate History Entries',
                message: `Found ${allLeaguesScan.totalInvalid} duplicate ${allLeaguesScan.totalInvalid === 1 ? 'entry' : 'entries'} from old data`,
                detail: detailMessage,
                buttons: ['Clean All Leagues', 'Clean Current League Only', 'Cancel'],
                defaultId: 0,
                cancelId: 2,
                noLink: true
            });

            // Restore alwaysOnTop
            if (wasAlwaysOnTop && this.overlayWindow) {
                this.overlayWindow.setAlwaysOnTop(true);
            }

            if (choiceResult.response === 2) {
                return; // Cancelled
            }

            if (choiceResult.response === 0) {
                // Clean all leagues
                const cleanupResult = await MerchantHistoryCleanupService.cleanupAllLeagues(configDir);

                if (cleanupResult.success && (cleanupResult.totalRemoved > 0 || cleanupResult.totalMerged > 0)) {
                    let successMessage = `✅ Cleaned ${cleanupResult.results.length} league ${cleanupResult.results.length === 1 ? 'file' : 'files'}:\n\n`;
                    for (const { file, result } of cleanupResult.results) {
                        if (result.success && (result.removedCount > 0 || result.mergedCount > 0)) {
                            successMessage += `• ${file}:\n`;
                            if (result.mergedCount > 0) successMessage += `  ${result.mergedCount} duplicates merged\n`;
                            if (result.removedCount > 0) successMessage += `  ${result.removedCount} entries removed\n`;
                        }
                    }
                    successMessage += `\nTotal: ${cleanupResult.totalMerged} merged, ${cleanupResult.totalRemoved} removed\nBackups saved. Refresh history to see changes.`;
                    
                    showToast(this.overlayWindow, successMessage, 'success');

                    // Notify renderer to refresh history
                    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
                        this.overlayWindow.webContents.send('history-cleaned', cleanupResult);
                    }
                } else if (cleanupResult.error) {
                    showToast(this.overlayWindow, cleanupResult.error, 'error');
                } else {
                    showToast(this.overlayWindow, 'No changes needed - history is already clean!', 'info');
                }
            } else {
                // Clean current league only
                const cleanupResult = await MerchantHistoryCleanupService.cleanupHistory(configDir, this.merchantHistoryLeague);

                if (cleanupResult.success && (cleanupResult.removedCount > 0 || cleanupResult.mergedCount > 0)) {
                    let message = '✅ Cleanup complete:\n';
                    if (cleanupResult.mergedCount > 0) message += `${cleanupResult.mergedCount} duplicates merged\n`;
                    if (cleanupResult.removedCount > 0) message += `${cleanupResult.removedCount} entries removed\n`;
                    message += '\nBackup saved. Refresh history to see changes.';
                    
                    showToast(this.overlayWindow, message, 'success');

                    // Notify renderer to refresh history
                    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
                        this.overlayWindow.webContents.send('history-cleaned', cleanupResult);
                    }
                } else if (cleanupResult.error) {
                    showToast(this.overlayWindow, cleanupResult.error, 'error');
                } else {
                    showToast(this.overlayWindow, 'No duplicates found in current league!', 'info');
                }
            }
        } catch (e) {
            console.error('[Main] Failed to cleanup merchant history:', e);
            showToast(this.overlayWindow, e instanceof Error ? e.message : String(e), 'error');
        }
    }

    // Load previously saved overlay window bounds (position + size)
    private loadWindowBounds(): { x: number; y: number; width: number; height: number } | null {
        try {
            const configDir = this.getUserConfigDir();
            const configPath = path.join(configDir, 'window-bounds.json');
            if (fs.existsSync(configPath)) {
                const raw = fs.readFileSync(configPath, 'utf8');
                const json = JSON.parse(raw);
                if (json && typeof json === 'object') {
                    const { x, y, width, height } = json as any;
                    if ([x,y,width,height].every(v => typeof v === 'number' && isFinite(v))) {
                        return { x, y, width, height };
                    }
                }
            }
        } catch {}
        return null;
    }

    // Persist current overlay window bounds
    private saveWindowBounds(): void {
        try {
            if (!this.overlayWindow) return;
            const bounds = this.overlayWindow.getBounds();
            const configDir = this.getUserConfigDir();
            try { if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true }); } catch {}
            const configPath = path.join(configDir, 'window-bounds.json');
            fs.writeFileSync(configPath, JSON.stringify(bounds, null, 2));
        } catch (error) {
            console.error('Error saving window bounds:', error);
        }
    }
    // Tray creation moved to trayService.ts

    private createOverlayWindow() {
        const displays = screen.getAllDisplays();
        const primaryDisplay = displays.find(display => display.bounds.x === 0 && display.bounds.y === 0) || displays[0];
        
        // Load saved position or default to bottom-left
        const savedBounds = this.loadWindowBounds();
        const windowWidth = savedBounds?.width ?? 1050; // allow restored width
        const windowHeight = savedBounds?.height ?? 675;  // allow restored height
        
        const defaultX = primaryDisplay.bounds.x + 50;  // Bottom-left corner
        const defaultY = primaryDisplay.bounds.y + primaryDisplay.bounds.height - windowHeight - 100;
        
        // Resolve icon once
        const iconPathCandidates = [
            path.join(process.resourcesPath || '', 'xile512.ico'),
            path.join(__dirname, '..', '..', 'xile512.ico'),
            path.join(process.cwd(), 'packages', 'overlay', 'xile512.ico')
        ];
        let windowIcon: string | undefined = undefined;
        for (const p of iconPathCandidates) { try { if (fs.existsSync(p)) { windowIcon = p; break; } } catch {} }

        this.overlayWindow = new BrowserWindow({
            width: windowWidth,
            height: windowHeight,
            x: (typeof savedBounds?.x === 'number') ? savedBounds!.x : defaultX,
            y: (typeof savedBounds?.y === 'number') ? savedBounds!.y : defaultY,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js')
            },
            frame: false,
            alwaysOnTop: true,
            skipTaskbar: true,
            resizable: true, // allow height-only resize (width constrained below)
            transparent: true,
            show: false,
            focusable: false,  // Start as non-focusable to avoid intercepting game input
            icon: windowIcon,
            // Critical for windowed fullscreen games: ensure overlay stays above game
            type: process.platform === 'win32' ? 'toolbar' : undefined
        });

        // Immediately enforce skipTaskbar and always-on-top for windowed fullscreen compatibility
        if (this.overlayWindow) {
            try {
                this.overlayWindow.setSkipTaskbar(true);
                // Use 'screen-saver' level which is above fullscreen windows but below system UI
                this.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
                // Ensure window doesn't steal focus from game (critical for clipboard capture)
                if (typeof (this.overlayWindow as any).setFocusable === 'function') {
                    (this.overlayWindow as any).setFocusable(false);
                }
            } catch (e) {
                console.warn('[Overlay] Failed to set initial window properties:', e);
            }
        }

    // --- Image diagnostics instrumentation ---
        try {
            const diag: { url: string; status?: number; method: string; error?: string; mime?: string; t: number; phase: string; }[] = [];
            const MAX = 250;
            const ses = this.overlayWindow.webContents.session;
            
            // Image request interception: prefer locally bundled assets; restrict unknown external image hosts.
            ses.webRequest.onBeforeRequest({ urls: ['https://*/*', 'http://*/*'] }, (details, cb) => {
                if (!/\bimage\b/i.test(details.resourceType)) { cb({}); return; }
                const lower = details.url.toLowerCase();

                // Attempt local resolution first for ANY image so we short‑circuit quickly.
                try {
                    const local = resolveLocalImage(details.url);
                    if (local && fs.existsSync(local)) {
                        return cb({ redirectURL: 'file:///' + local.replace(/\\/g,'/') });
                    }
                } catch {}

                // Disallow certain disused third-party hosts (all such assets expected to be bundled). Cancel if not locally resolved.
                if (/poe2db|poedb\.tw/.test(lower)) { return cb({ cancel: true }); }

                // Allow official PoE CDN (we do not mirror these entirely: account / trade history avatars, etc.)
                if (lower.includes('web.poecdn.com') || lower.includes('cdn.poecdn.net')) { cb({}); return; }

                // All other hosts: just allow.
                cb({});
            });
            
            // Ensure User-Agent for official PoE CDN requests (images now bundled, CDN is fallback only)
            ses.webRequest.onBeforeSendHeaders((details, cb) => {
                // Only handle official Path of Exile CDN
                if (/web\.poecdn\.com|cdn\.poecdn\.net/i.test(details.url)) {
                    const headers = { ...details.requestHeaders };
                    // Provide a stable UA to avoid 403 errors
                    if (!headers['User-Agent']) headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) XileHUD/1.0 Chrome/118.0.0.0 Safari/537.36';
                    // Encourage image content negotiation
                    headers['Accept'] = headers['Accept'] || 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8';
                    cb({ cancel: false, requestHeaders: headers });
                    return;
                }
                cb({ cancel: false, requestHeaders: details.requestHeaders });
            });
            // Capture completed (success or failure) requests for images
            ses.webRequest.onCompleted((details) => {
                if (!/\bimage\b/i.test(details.resourceType)) return;
                diag.push({ url: details.url, status: details.statusCode, method: details.method, mime: (details as any).mimeType, t: Date.now(), phase: 'completed' });
                if (diag.length > MAX) diag.splice(0, diag.length - MAX);
            });
            ses.webRequest.onErrorOccurred((details) => {
                if (!/\bimage\b/i.test(details.resourceType)) return;
                diag.push({ url: details.url, error: details.error, method: details.method, t: Date.now(), phase: 'error' });
                if (diag.length > MAX) diag.splice(0, diag.length - MAX);
            });
            // Expose on IPC for renderer pull (no heavy push spam)
            ipcMain.handle('debug-get-image-log', () => {
                return diag.slice(-150); // last entries
            });
            // Image caching (renderer will explicitly invoke to cache successes)
            ipcMain.handle('cache-image', async (_e, url: string) => {
                try {
                    if (!url || typeof url !== 'string') return { ok: false, reason: 'bad_url' };
                    if (this.imageCache.state.map[url]) return { ok: true, cached: this.imageCache.state.map[url] };
                    const dest = await this.downloadImageToCache(url);
                    if (dest) { this.imageCache.state.map[url] = dest; this.persistImageCacheMap(); return { ok: true, cached: dest }; }
                    return { ok: false };
                } catch (e) { return { ok: false, error: (e as Error).message }; }
            });
            ipcMain.handle('get-cached-image', (_e, url: string) => {
                if (url && this.imageCache.state.map[url] && fs.existsSync(this.imageCache.state.map[url])) {
                    return { path: this.imageCache.state.map[url] };
                }
                return { path: null };
            });
            // Resolve a local bundled image path (prefer local over network)
            ipcMain.handle('resolve-image', (_e, original: string) => {
                try {
                    const local = resolveLocalImage(original);
                    return { local, original, index: getImageIndexMeta() };
                } catch (e:any) { return { local: null, error: e?.message||'resolve_failed' }; }
            });
            ipcMain.handle('resolve-image-by-name', (_e, nameOrSlug: string) => {
                try {
                    const local = resolveByNameOrSlug(nameOrSlug);
                    return { local, nameOrSlug, index: getImageIndexMeta() };
                } catch (e:any) { return { local: null, error: e?.message||'resolve_failed' }; }
            });
            
            // NEW: Get bundled image path from imageLocal field (no URL resolution needed)
            ipcMain.handle('get-bundled-image-path', (_e, localPath: string) => {
                try {
                    if (!localPath) return null;
                    const normalizedLocal = localPath.replace(/^\/+/, '');
                    const roots: string[] = [];
                    const seen = new Set<string>();

                    const pushRoot = (candidate: string | null | undefined) => {
                        if (!candidate) return;
                        const resolved = path.resolve(candidate);
                        if (seen.has(resolved)) return;
                        seen.add(resolved);
                        roots.push(resolved);
                    };

                    // Production paths (packaged app)
                    pushRoot((process as any).resourcesPath ? path.join((process as any).resourcesPath, 'bundled-images') : undefined);
                    pushRoot(app.getAppPath ? path.join(app.getAppPath(), 'bundled-images') : undefined);
                    
                    // Development paths (npm start from packages/overlay)
                    pushRoot(path.join(__dirname, '../../bundled-images'));
                    pushRoot(path.join(__dirname, '../../../bundled-images'));
                    pushRoot(path.join(process.cwd(), 'bundled-images'));
                    pushRoot(path.join(process.cwd(), '..', 'bundled-images'));
                    pushRoot(path.join(process.cwd(), '../..', 'bundled-images'));

                    // Data directory images (PoE1 modules, custom data dir overrides, etc.)
                    const dataDir = typeof this.getDataDir === 'function' ? this.getDataDir() : null;
                    pushRoot(dataDir);
                    pushRoot(dataDir ? path.join(dataDir, 'images') : undefined);
                    if (dataDir) {
                        pushRoot(path.join(path.dirname(dataDir), 'images'));
                    }

                    // Temporary collector image staging (during development or manual scrape)
                    const collectorTmp = path.join(process.cwd(), 'tmp', 'collector-images', this.overlayVersion === 'poe1' ? 'poe1' : 'poe2');
                    pushRoot(collectorTmp);

                    for (const root of roots) {
                        const fullPath = path.resolve(root, normalizedLocal);
                        if (fs.existsSync(fullPath)) {
                            return pathToFileURL(fullPath).toString();
                        }
                    }
                    return null;
                } catch (e) {
                    console.error('[getBundledImagePath] Error:', e);
                    return null;
                }
            });
        } catch (e) {
            console.warn('Image diagnostics setup failed', e);
        }

    // Set reasonable min sizes; allow user to resize width now that we persist size
    const minW = 860;
    const minH = 480;
    this.overlayWindow.setMinimumSize(minW, minH);
    const maxH = primaryDisplay.bounds.height - 50;
    this.overlayWindow.setMaximumSize(primaryDisplay.bounds.width, maxH);

        // Additional Windows compatibility: ensure window is visible on all workspaces/desktops
        // This helps with Windows 10/11 virtual desktop issues
        try {
            if (process.platform === 'win32' && typeof this.overlayWindow.setVisibleOnAllWorkspaces === 'function') {
                this.overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
            }
        } catch (e) {
            console.warn('[Overlay] setVisibleOnAllWorkspaces not supported or failed:', e);
        }

        // Load the overlay UI
        if (process.env.NODE_ENV === 'development') {
            this.overlayWindow.loadURL('http://localhost:5173/overlay');
        } else {
            this.overlayWindow.loadFile(path.join(__dirname, '../renderer/src/renderer/overlay.html'));
        }
        
        // Enable F12 to open DevTools
        this.overlayWindow.webContents.on('before-input-event', (event, input) => {
            if (input.key === 'F12' && input.type === 'keyDown') {
                if (this.overlayWindow?.webContents.isDevToolsOpened()) {
                    this.overlayWindow.webContents.closeDevTools();
                } else {
                    this.overlayWindow?.webContents.openDevTools({ mode: 'detach' });
                }
            }
        });

        // Track load state to queue events safely
        this.overlayWindow.webContents.on('did-finish-load', () => {
            this.overlayLoaded = true;
            
            // Explicitly set always-on-top and skipTaskbar after window content loads
            // Use screen-saver level to stay above windowed fullscreen games
            try {
                if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
                    this.overlayWindow.setSkipTaskbar(true);
                    this.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
                }
            } catch (e) {
                console.warn('[Overlay] Failed to set window properties after load:', e);
            }
            
            if (this.pendingTab) { try { this.overlayWindow?.webContents.send('set-active-tab', this.pendingTab); } catch {} }
            if (this.pendingCategory) { try { this.overlayWindow?.webContents.send('set-active-category', this.pendingCategory); } catch {} }
            if (this.pendingItemData) {
                try { this.overlayWindow?.webContents.send('clear-filters'); } catch {}
                try { this.overlayWindow?.webContents.send('item-data', this.pendingItemData); } catch {}
            }
            this.pendingItemData = null;
            this.pendingCategory = null;
            this.pendingTab = null;
            if (this.pendingDefaultView) {
                try { this.overlayWindow?.webContents.send('show-default-view'); } catch {}
                this.pendingDefaultView = false;
            }
        });

        // Click-outside detection using blur event
        // The click-through handler in renderer makes the window click-through when not over interactive content
        // When user clicks outside on the game, Windows gives focus back to the game, triggering blur
        this.overlayWindow.on('blur', () => {
            console.log('[blur] overlay window blur event fired. isOverlayVisible=', this.isOverlayVisible, 'pinned=', this.pinned);
            this.hideTargetIndicator();
            // Instant close - no delay needed
            void this.handleOverlayBlur();
        });

        // Save window bounds when moved (handles native dragging)
        this.overlayWindow.on('moved', () => {
            // Debounce to avoid saving too frequently during drag
            if (this.moveTimeout) {
                clearTimeout(this.moveTimeout);
            }
            this.moveTimeout = setTimeout(() => {
                this.saveWindowBounds();
            }, 500);
        });

        // Save bounds when resized (if resizable in future)
        this.overlayWindow.on('resized', () => {
            this.saveWindowBounds();
        });

    }


    private persistImageCacheMap() { this.imageCache.persist(); }
    private async downloadImageToCache(url: string): Promise<string | null> { return this.imageCache.download(url); }

    // Attempt to capture the currently hovered item from the game by issuing a copy and parsing clipboard
    private async captureItemFromGame(): Promise<boolean> {
        const now = Date.now();
        this.armedCaptureUntil = now + 1200;
        this.lastCopyTimestamp = now;
        try { this.clipboardMonitor.resetLastSeen(); } catch {}

        const copyShortcutLabel = process.platform === 'darwin' ? 'Cmd+Alt+C' : 'Ctrl+Alt+C';
        console.log(`[Hotkey] Starting item capture: simulating ${copyShortcutLabel}`);

        let previousClipboardRaw = '';
        let clipboardHasNewItem = false;

        try {
            try {
                const cursor = screen.getCursorScreenPoint();
                this.lastMousePosition = cursor;
                this.showTargetIndicator(cursor);
            } catch {}

            previousClipboardRaw = clipboard.readText?.() ?? '';
            const previousClipboardTrimmed = previousClipboardRaw.trim();

            if (this.isLikelyItemClipboardText(previousClipboardTrimmed)) {
                try { clipboard.writeText(''); } catch (err) {
                    console.warn('[Hotkey] Failed to clear clipboard before copy', err);
                }
            }

            const copyTriggered = await this.trySimulateCopyShortcut();
            if (!copyTriggered) {
                console.warn('[Hotkey] Copy shortcut trigger unavailable (uIOhook failed)');
                this.hideTargetIndicator();
                return false;
            }

            const { interval: clipboardPollInterval, timeout: clipboardPollTimeout } = this.getClipboardPollConfig();
            const clipboardResult = await this.waitForClipboardItem(clipboardPollInterval, clipboardPollTimeout);
            if (!clipboardResult) {
                console.log('[Hotkey] Clipboard did not update with item text within timeout window');
                this.hideTargetIndicator();
                return false;
            }

            clipboardHasNewItem = true;
            const { rawText, trimmedText } = clipboardResult;

            if (trimmedText === this.lastProcessedItemText) {
                console.log('[Hotkey] Clipboard text matches last processed item; reusing existing overlay state without stealing focus');
                if (!this.isOverlayVisible) {
                    // Only restore if overlay is not visible - don't steal focus
                    if (!this.restoreLastOverlayView({ focus: false })) {
                        this.showDefaultOverlay({ focus: false });
                    }
                } else {
                    this.hideTargetIndicator();
                }
                // If overlay is already visible (pinned), do nothing - don't steal focus
                return true;
            }

            try {
                const parsed = await this.itemParser.parse(trimmedText);

                if (parsed && parsed.category && parsed.category !== 'unknown') {
                    console.log('[Hotkey] ✓ Parsed item. Category:', parsed.category, 'Rarity:', parsed.rarity);

                    if (!this.isParsedItemAllowed(parsed)) {
                        console.log('[Hotkey] Feature disabled for parsed item.', { category: parsed.category, rarity: parsed.rarity });
                        this.hideTargetIndicator();
                        return false;
                    }

                    if ((parsed.rarity || '').toLowerCase() === 'unique') {
                        this.showUniqueItem(parsed, { focus: false }, rawText);
                        return true;
                    }

                    if (parsed.category === 'Gems') {
                        this.rememberOverlaySnapshot({
                            kind: 'gems',
                            sourceText: rawText,
                            payload: { tab: 'characterTab', action: 'gems', delay: 140 }
                        });
                        this.showOverlay(undefined, { focus: false });
                        setTimeout(() => {
                            this.safeSendToOverlay('set-active-tab', 'characterTab');
                            this.safeSendToOverlay('invoke-action', 'gems');
                        }, 140);
                        return true;
                    }

                    let modifiers: any[] = [];
                    try { modifiers = await this.modifierDatabase.getModifiersForCategory(parsed.category); } catch {}
                    this.safeSendToOverlay('set-active-category', parsed.category);
                    this.rememberOverlaySnapshot({
                        kind: 'item',
                        sourceText: rawText,
                        payload: { item: parsed, modifiers, category: parsed.category }
                    });
                    this.showOverlay({ item: parsed, modifiers }, { focus: false });
                    return true;
                }

                if (parsed && parsed.category === 'unknown') {
                    console.log('[Hotkey] Parsed but unknown category, skipping overlay');
                    this.hideTargetIndicator();
                    return false;
                }
            } catch (parseErr) {
                console.log('[Hotkey] Item parse failed', parseErr);
                this.hideTargetIndicator();
                return false;
            }

            console.log('[Hotkey] No valid item detected after clipboard update');
            this.hideTargetIndicator();
            return false;
        } finally {
            this.armedCaptureUntil = 0;
            if (!clipboardHasNewItem) {
                try { clipboard.writeText(previousClipboardRaw); } catch {}
            }
        }
    }

    private async waitForClipboardItem(interval: number, timeout: number): Promise<{ rawText: string; trimmedText: string } | null> {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            await new Promise<void>(resolve => setTimeout(resolve, interval));
            let raw = '';
            try {
                raw = clipboard.readText() || '';
            } catch {
                continue;
            }

            const trimmed = raw.trim();
            if (!trimmed) continue;
            if (!this.isLikelyItemClipboardText(trimmed)) continue;

            return { rawText: raw, trimmedText: trimmed };
        }

        return null;
    }

    private isLikelyItemClipboardText(text: string): boolean {
        if (!text || text.length < 15) return false;
        const normalized = text.trim();
        if (normalized.length < 10) return false;
        const firstLine = normalized.split(/\r?\n/, 1)[0] ?? '';
        return OverlayApp.ITEM_CLIPBOARD_PREFIXES.some(prefix => firstLine.startsWith(prefix));
    }

    // === Session / network (delegated to PoeSessionHelper) ===
    private async hasPoeSession(): Promise<boolean> { return this.poeSession.hasSession(); }
    private async openPoeLoginWindow(): Promise<{ loggedIn: boolean; accountName?: string | null }> { return this.poeSession.openLoginWindow(); }
    private async fetchPoeHistory(league: string | null | undefined) {
        const targetLeague = (typeof league === 'string' && league.trim()) ? league.trim() : this.merchantHistoryLeague;
        return this.poeSession.fetchHistory(targetLeague);
    }
    private async isAuthenticated() { return this.poeSession.isAuthenticatedProbe(this.merchantHistoryLeague || 'Rise of the Abyssal'); }


    // Best-effort copy trigger: send real Ctrl/Command+C sequence to force a copy in PoE
    private async trySimulateCopyShortcut(): Promise<boolean> {
        const logger = (message: string, details?: unknown) => {
            if (details) {
                console.debug(message, details);
            } else {
                console.debug(message);
            }
        };

        const hookSuccess = await triggerCopyShortcut({ includeAlt: true, logger });
        this.lastTriggerUsedUiohook = hookSuccess;
        if (!hookSuccess) {
            console.warn('[Hotkey] uIOhook trigger failed to simulate copy');
        }
        return hookSuccess;
    }

    private showOverlay(data?: any, opts?: { silent?: boolean; focus?: boolean }) {
        if (!this.overlayWindow) return;
        
        if (data) {
            if (this.overlayLoaded) {
                this.safeSendToOverlay('clear-filters');
                this.safeSendToOverlay('item-data', data);
            } else {
                this.pendingItemData = data;
            }
        }
        console.log('[Overlay] showOverlay called with data=', Boolean(data), 'opts=', opts, 'wasVisible=', this.isOverlayVisible);
        const wasVisible = this.isOverlayVisible;
        const wasPinned = this.pinned;

        if (!wasVisible) {
            this.captureForegroundWindowHandle();
            this.skipNextFocusRestore = false;
        }
        
        // Always ensure window is visible when showOverlay is called
        // Passive mode just means "don't steal focus from game", not "don't show"
        const shouldFocus = opts?.focus !== false; // default true
        
        // Ensure taskbar icon is hidden (fix for some Windows configs)
        try {
            this.overlayWindow.setSkipTaskbar(true);
        } catch (e) {
            console.warn('[Overlay] Failed to set skipTaskbar:', e);
        }
        
        // If already visible and pinned and we don't want focus, just update data (passive)
        // But still ensure window is shown and on top
        if (this.isOverlayVisible && this.pinned && !shouldFocus) {
            try {
                if (!this.overlayWindow.isVisible()) {
                    this.overlayWindow.show();
                }
                this.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
            } catch (e) {
                console.warn('[Overlay] Passive update setAlwaysOnTop failed:', e);
            }
            console.log('[Overlay] Passive update (pinned, no focus steal)');
            return;
        }

        // Show overlay and optionally give it focus
        if (shouldFocus) {
            // Make window focusable when we want to give it focus
            if (typeof (this.overlayWindow as any).setFocusable === 'function') {
                try {
                    (this.overlayWindow as any).setFocusable(true);
                } catch {}
            }
            
            this.overlayWindow.show();
            // Use screen-saver level - this is ABOVE fullscreen windows
            // This fixes windowed fullscreen game overlay issues
            this.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
            this.overlayWindow.focus();
            console.log('[Overlay] Shown with immediate focus');
        } else {
            // Passive mode: show and immediately give it focus
            // This way when user clicks outside, blur event fires and overlay closes
            if (typeof (this.overlayWindow as any).setFocusable === 'function') {
                try {
                    (this.overlayWindow as any).setFocusable(true);
                } catch {}
            }
            
            this.overlayWindow.show();
            // Use screen-saver level even in passive mode to stay above game
            this.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
            
            // Give it focus so blur event can fire when clicking outside
            setTimeout(() => {
                try {
                    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
                        this.overlayWindow.focus();
                    }
                } catch {}
            }, 100);
        }
        this.isOverlayVisible = true;
        if (!data) {
            if (this.overlayLoaded && this.overlayWindow && !this.overlayWindow.isDestroyed()) {
                try { this.overlayWindow.webContents.send('show-default-view'); } catch {}
                this.pendingDefaultView = false;
            } else {
                this.pendingDefaultView = true;
            }
        } else {
            this.pendingDefaultView = false;
        }

        try {
            if (this.overlayWindow && typeof this.overlayWindow.isFocused === 'function' && this.overlayWindow.isFocused()) {
                this.hideTargetIndicator();
            }
        } catch {}
        
    console.log('[Overlay] shown. wasVisible=', wasVisible, 'pinned=', wasPinned, 'focus=', shouldFocus, 'overlayVisible=', this.isOverlayVisible);
    }

    private hideOverlay() {
        if (!this.overlayWindow) return;
        this.hideTargetIndicator();
        
        // Hide overlay normally
        this.overlayWindow.hide();
        this.isOverlayVisible = false;
    console.log('[Overlay] hideOverlay -> window hidden');
        // Do not clear clipboard if a capture is in progress
        const captureInProgress = this.shortcutAwaitingCapture || Date.now() <= this.armedCaptureUntil;
        console.log('[hideOverlay] captureInProgress=', captureInProgress, 'shortcutAwaitingCapture=', this.shortcutAwaitingCapture, 'armedCaptureUntil=', this.armedCaptureUntil, 'now=', Date.now());
        if (!captureInProgress) {
            console.log('[hideOverlay] Leaving clipboard contents intact');
            try { this.clipboardMonitor.resetLastSeen(); } catch {}
        } else {
            console.log('[hideOverlay] Skipping clipboard clear - capture in progress');
        }
        console.log('Overlay hidden');

        // Restore game focus shortly after overlay is hidden (Windows only)
        const shouldRestoreFocus = process.platform === 'win32' && !this.skipNextFocusRestore;
        if (process.platform === 'win32' && this.skipNextFocusRestore) {
            console.log('[Overlay] Skipping focus restore due to skipNextFocusRestore flag');
        }
        this.skipNextFocusRestore = false;

        if (shouldRestoreFocus) {
            setTimeout(() => {
                try {
                    if (this.restoreForegroundWindowFocus()) {
                        console.log('[Overlay] Requested PoE window focus restore');
                    }
                } catch (err) {
                    console.warn('[Overlay] Failed to restore foreground window', err);
                }
            }, 60);
        }
    }

    private async handleOverlayBlur(): Promise<void> {
        if (this.blurHandlingInProgress) return;
        this.blurHandlingInProgress = true;
        try {
            const overlay = this.overlayWindow;
            if (!overlay || overlay.isDestroyed()) return;
            if (this.pinned || !this.isOverlayVisible) return;

            const captureInProgress = this.shortcutAwaitingCapture || Date.now() <= this.armedCaptureUntil;
            if (captureInProgress) {
                console.log('[blur] Skipping hide - capture in progress');
                return;
            }

            const focused = BrowserWindow.getFocusedWindow();
            const popFocused = focused ? Array.from(this.modPopoutWindows).some(w => !w.isDestroyed() && w.id === focused.id) : false;
            const shouldHideInitial = !focused || (!popFocused && focused.id !== overlay.id);
            if (!shouldHideInitial) {
                return;
            }

            // INSTANT CLOSE: Hide immediately, then evaluate focus restoration in background
            this.hideOverlay();
            
            // Evaluate focus restoration async (don't block the hide)
            this.evaluateFocusRestoration().then(({ shouldRestore, currentHandle, capturedHandle }) => {
                if (process.platform === 'win32') {
                    this.skipNextFocusRestore = !shouldRestore;
                } else {
                    this.skipNextFocusRestore = false;
                }
                
                if (!focused) {
                    console.log('[blur] No focused window after blur; overlay hidden. currentHandle=', currentHandle, 'capturedHandle=', capturedHandle, 'shouldRestore=', shouldRestore);
                } else {
                    console.log('[blur] Focus moved to window id', focused.id, '- overlay hidden. currentHandle=', currentHandle, 'capturedHandle=', capturedHandle, 'shouldRestore=', shouldRestore);
                }
            }).catch(err => {
                console.warn('[blur] evaluateFocusRestoration failed', err);
                this.skipNextFocusRestore = false;
            });
        } catch (err) {
            console.warn('[blur] handleOverlayBlur failed', err);
        } finally {
            this.blurHandlingInProgress = false;
        }
    }

    private async evaluateFocusRestoration(): Promise<{ shouldRestore: boolean; currentHandle: string | null; capturedHandle: string | null }> {
        const capturedHandle = this.lastForegroundWindowHandle?.handle ?? null;
        if (process.platform !== 'win32') {
            return { shouldRestore: false, currentHandle: null, capturedHandle };
        }

        const currentHandle = await this.queryCurrentForegroundWindowHandle();
        const overlayHandle = this.getOverlayWindowHandleString();
        const shouldRestore = !!capturedHandle && !!currentHandle && currentHandle === capturedHandle && (!overlayHandle || capturedHandle !== overlayHandle);
        return { shouldRestore, currentHandle, capturedHandle };
    }

    private queryCurrentForegroundWindowHandle(): Promise<string | null> {
        if (process.platform !== 'win32') {
            return Promise.resolve(null);
        }

        return new Promise(resolve => {
            let settled = false;
            const safeResolve = (value: string | null) => {
                if (settled) return;
                settled = true;
                resolve(value);
            };

            try {
                const child = cp.execFile('powershell.exe', [
                    '-NoProfile',
                    '-Command',
                    OverlayApp.FOREGROUND_WINDOW_PS_SCRIPT
                ], {
                    encoding: 'utf8',
                    windowsHide: true,
                    timeout: 500,
                    maxBuffer: 1024 * 16
                }, (error, stdout) => {
                    if (error) {
                        console.warn('[Overlay] Failed to query current foreground window handle', error);
                        safeResolve(null);
                        return;
                    }
                    const handle = (stdout || '').trim();
                    if (handle && /^\d+$/.test(handle)) {
                        safeResolve(handle);
                    } else {
                        safeResolve(null);
                    }
                });

                child.on('error', err => {
                    console.warn('[Overlay] Failed to query current foreground window handle', err);
                    safeResolve(null);
                });
            } catch (err) {
                console.warn('[Overlay] Failed to query current foreground window handle', err);
                safeResolve(null);
            }
        });
    }

    private rememberOverlaySnapshot(snapshot: OverlaySnapshot, manualSourceText?: string | null) {
        const manual = typeof manualSourceText === 'string' ? manualSourceText.trim() : '';
        const existing = typeof snapshot.sourceText === 'string' ? snapshot.sourceText.trim() : '';
        const normalized = manual.length > 0 ? manual : existing;

        this.lastOverlaySnapshot = {
            ...snapshot,
            sourceText: normalized.length > 0 ? normalized : snapshot.sourceText
        };

        if (normalized.length > 0) {
            this.lastProcessedItemText = normalized;
            this.lastOverlaySnapshot.sourceText = normalized;
        }
    }

    private bringOverlayToFront(opts: { focus?: boolean } = {}) {
        if (!this.overlayWindow) return;
        const shouldFocus = opts.focus !== false;
        console.log('[Overlay] bringOverlayToFront called. focus=', shouldFocus, 'isVisible=', this.isOverlayVisible);

        try {
            this.overlayWindow.setSkipTaskbar(true);
        } catch (e) {
            console.warn('[Overlay] Failed to set skipTaskbar when bringing to front:', e);
        }

        if (typeof (this.overlayWindow as any).setFocusable === 'function') {
            try {
                (this.overlayWindow as any).setFocusable(true);
            } catch {}
        }

        try {
            if (!this.overlayWindow.isVisible()) {
                this.overlayWindow.show();
            }
            this.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
        } catch {}

        if (shouldFocus) {
            try { this.overlayWindow.focus(); } catch {}
        } else {
            setTimeout(() => {
                try {
                    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
                        this.overlayWindow.focus();
                    }
                } catch {}
            }, 100);
        }

        this.isOverlayVisible = true;
        console.log('[Overlay] bringOverlayToFront completed. visible=', this.overlayWindow?.isVisible());
    }

    private ensureTargetIndicatorWindow(): BrowserWindow | null {
        if (this.targetIndicatorWindow && !this.targetIndicatorWindow.isDestroyed()) {
            return this.targetIndicatorWindow;
        }

        try {
            const win = new BrowserWindow({
                width: 160,
                height: 160,
                frame: false,
                transparent: true,
                resizable: false,
                alwaysOnTop: true,
                skipTaskbar: true,
                focusable: false,
                show: false,
                hasShadow: false,
                backgroundColor: '#00000000',
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            });

            try { win.setIgnoreMouseEvents(true, { forward: true }); } catch {}
            win.on('closed', () => { this.targetIndicatorWindow = null; });

            const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
                html,body{margin:0;padding:0;width:100%;height:100%;background:transparent;overflow:hidden;}
                #ring{position:absolute;top:50%;left:50%;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;
                    border:3px solid rgba(255,255,255,0.82);box-shadow:0 0 18px rgba(255,255,255,0.45);
                    background:radial-gradient(circle,rgba(255,255,255,0.32)0%,rgba(255,255,255,0.12)55%,rgba(255,255,255,0)72%);
                    opacity:0;transform:scale(0.6);}
                #ring.anim{animation:ping 360ms ease-out forwards;}
                #marker{position:absolute;top:50%;left:50%;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;
                    border:2px solid rgba(255,255,255,0.9);box-shadow:0 0 14px rgba(255,255,255,0.44);
                    background:radial-gradient(circle,rgba(255,255,255,0.42)10%,rgba(255,255,255,0.08)70%,rgba(255,255,255,0)92%);
                    opacity:0;transform:scale(0.45);transition:opacity 180ms ease-out,transform 200ms ease-out;}
                #marker.visible{opacity:0.92;transform:scale(1);}
                @keyframes ping{0%{opacity:0.88;transform:scale(0.6);}55%{opacity:0.35;transform:scale(1);}100%{opacity:0;transform:scale(1.15);}}
            </style></head><body>
            <div id="ring"></div>
            <div id="marker"></div>
            <script>
                (function(){
                    const ring=document.getElementById('ring');
                    const marker=document.getElementById('marker');
                    function triggerPulse(){
                        if(!ring||!marker) return;
                        marker.classList.add('visible');
                        ring.classList.remove('anim');
                        void ring.offsetWidth;
                        ring.classList.add('anim');
                    }
                    function hideMarker(){
                        if(marker){ marker.classList.remove('visible'); }
                        if(ring){ ring.classList.remove('anim'); }
                    }
                    window.triggerPulse=triggerPulse;
                    window.hideMarker=hideMarker;
                    window.addEventListener('DOMContentLoaded',()=>{
                        triggerPulse();
                        setTimeout(()=>{ if(marker) marker.classList.add('visible'); }, 120);
                    });
                })();
            </script></body></html>`;

            win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
            this.targetIndicatorWindow = win;
            return win;
        } catch (error) {
            console.warn('[Indicator] Failed to create indicator window', error);
            this.targetIndicatorWindow = null;
            return null;
        }
    }

    private hideTargetIndicator() {
        if (!this.targetIndicatorWindow || this.targetIndicatorWindow.isDestroyed()) return;
        try { this.targetIndicatorWindow.webContents.executeJavaScript('window.hideMarker && window.hideMarker();', true).catch(() => {}); } catch {}
        try { this.targetIndicatorWindow.hide(); } catch {}
    }

    private showTargetIndicator(point: { x: number; y: number }) {
        const win = this.ensureTargetIndicatorWindow();
        if (!win) return;

        const size = 160;
        const display = screen.getDisplayNearestPoint(point);
        const bounds = display?.bounds || { x: 0, y: 0, width: size, height: size };
        let targetX = Math.round(point.x - size / 2);
        let targetY = Math.round(point.y - size / 2);
        targetX = Math.max(bounds.x, Math.min(bounds.x + bounds.width - size, targetX));
        targetY = Math.max(bounds.y, Math.min(bounds.y + bounds.height - size, targetY));

        try { win.setBounds({ x: targetX, y: targetY, width: size, height: size }); } catch {}

        try {
            if (typeof (win as any).showInactive === 'function') {
                (win as any).showInactive();
            } else {
                win.show();
            }
            win.setAlwaysOnTop(true, 'screen-saver');
        } catch {}

        win.webContents.executeJavaScript('window.triggerPulse && window.triggerPulse();', true).catch(() => {});
    }

    private restoreLastOverlayView(opts: { focus?: boolean } = {}): boolean {
        const snapshot = this.lastOverlaySnapshot;
        if (!snapshot) {
            console.log('[Overlay] restoreLastOverlayView -> no snapshot available');
            return false;
        }
        console.log('[Overlay] restoreLastOverlayView', { kind: snapshot.kind, focus: opts.focus, hasSource: Boolean(snapshot.sourceText) });

    const kind = snapshot.kind;

    switch (kind) {
            case 'item': {
                const { item, modifiers, category } = snapshot.payload;
                if (!item || !modifiers) return false;
                this.rememberOverlaySnapshot(snapshot);
                if (category) {
                    this.safeSendToOverlay('set-active-category', category);
                }
                // Resend item data to ensure whittling info and other data is displayed
                this.safeSendToOverlay('item-data', { item, modifiers });
                this.bringOverlayToFront(opts);
                console.log('[Overlay] restoreLastOverlayView -> item restored');
                return true;
            }
            case 'unique': {
                const { item } = snapshot.payload;
                if (!item) return false;
                this.rememberOverlaySnapshot(snapshot, snapshot.sourceText ?? undefined);
                // Resend unique item data to ensure all information is displayed
                this.safeSendToOverlay('item-data', { item, isUnique: true });
                // Send version-specific event based on current overlay version
                if (this.overlayVersion === 'poe1') {
                    this.safeSendToOverlay('show-poe1-unique-item', { name: item.name, baseType: item.baseType });
                } else {
                    this.safeSendToOverlay('show-unique-item', { name: item.name, baseType: item.baseType });
                }
                this.bringOverlayToFront(opts);
                console.log('[Overlay] restoreLastOverlayView -> unique restored');
                return true;
            }
            case 'gems': {
                const { tab, action, delay = 140 } = snapshot.payload;
                this.rememberOverlaySnapshot(snapshot);
                this.bringOverlayToFront(opts);
                setTimeout(() => {
                    if (tab) this.safeSendToOverlay('set-active-tab', tab);
                    if (action) this.safeSendToOverlay('invoke-action', action);
                }, delay);
                console.log('[Overlay] restoreLastOverlayView -> gems restored');
                return true;
            }
            case 'default': {
                this.rememberOverlaySnapshot(snapshot);
                this.bringOverlayToFront(opts);
                console.log('[Overlay] restoreLastOverlayView -> default restored');
                return true;
            }
            default:
                console.log('[Overlay] restoreLastOverlayView -> unsupported kind', kind);
                return false;
        }
    }

    private showDefaultOverlay(opts: { silent?: boolean; focus?: boolean } = {}) {
        this.rememberOverlaySnapshot({ kind: 'default' });
        this.showOverlay(undefined, opts);
    }

    private getOverlayWindowHandleString(): string | null {
        if (process.platform !== 'win32') return null;
        if (!this.overlayWindow || typeof this.overlayWindow.getNativeWindowHandle !== 'function') return null;
        try {
            const handleBuffer: Buffer = this.overlayWindow.getNativeWindowHandle();
            if (!handleBuffer) return null;

            if (handleBuffer.length >= 8 && typeof handleBuffer.readBigUInt64LE === 'function') {
                const handleValue = handleBuffer.readBigUInt64LE(0);
                return BigInt.asUintN(64, handleValue).toString();
            }

            if (handleBuffer.length >= 4) {
                return handleBuffer.readUInt32LE(0).toString();
            }
        } catch (err) {
            console.warn('[Overlay] Failed to read overlay window handle', err);
        }
        return null;
    }

    private captureForegroundWindowHandle() {
        if (process.platform !== 'win32') return;
        if (this.lastForegroundWindowHandle && (Date.now() - this.lastForegroundWindowHandle.capturedAt) < 200) {
            return;
        }
        try {
            const handle = cp.execFileSync('powershell.exe', [
                '-NoProfile',
                '-Command',
                OverlayApp.FOREGROUND_WINDOW_PS_SCRIPT
            ], { encoding: 'utf8', windowsHide: true }).trim();
            if (handle && /^\d+$/.test(handle)) {
                const overlayHandle = this.getOverlayWindowHandleString();
                if (overlayHandle && overlayHandle === handle) {
                    console.log('[Overlay] captureForegroundWindowHandle -> ignoring overlay handle', handle);
                    return;
                }
                console.log('[Overlay] captureForegroundWindowHandle -> stored handle', handle);
                this.lastForegroundWindowHandle = { handle, capturedAt: Date.now() };
            }
        } catch (err) {
            console.warn('[Overlay] Failed to capture foreground window handle', err);
        }
    }

    private restoreForegroundWindowFocus(): boolean {
        if (process.platform !== 'win32') return false;
        const entry = this.lastForegroundWindowHandle;
        this.lastForegroundWindowHandle = null;
        if (!entry || !entry.handle || !/^\d+$/.test(entry.handle)) return false;
        try {
            const handleValue = entry.handle.trim();
            console.log('[Overlay] restoreForegroundWindowFocus -> attempting handle', handleValue, 'capturedAt', entry.capturedAt);
            const script = `
$handleRaw = '${handleValue}'
if ([string]::IsNullOrWhiteSpace($handleRaw)) { return }
[long]$handleValue = 0
if (-not [long]::TryParse($handleRaw, [ref]$handleValue)) { return }
if ($handleValue -eq 0) { return }
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class ForegroundWindowHelper {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);
}
"@
$ptr = [System.IntPtr]$handleValue
if ($ptr -eq [System.IntPtr]::Zero) { return }
if ([ForegroundWindowHelper]::IsIconic($ptr)) {
    [ForegroundWindowHelper]::ShowWindow($ptr, 9) | Out-Null
}
[ForegroundWindowHelper]::SetForegroundWindow($ptr) | Out-Null
`;
            const ps = cp.spawn('powershell.exe', [
                '-NoProfile',
                '-WindowStyle', 'Hidden',
                '-Command',
                script
            ], { windowsHide: true, stdio: 'ignore' });
            ps.unref?.();
            return true;
        } catch (err) {
            console.warn('[Overlay] Failed to refocus captured window', err);
            return false;
        }
    }

    private getAdaptiveClipboardDelay(): number {
        const configured = this.settingsService?.get('clipboardDelay');
        if (typeof configured === 'number' && Number.isFinite(configured)) {
            return Math.max(0, configured);
        }

        const preferFast = this.lastTriggerUsedUiohook ?? this.uiohookInitialized;
        return preferFast ? 0 : 150;
    }

    private getClipboardPollConfig(): { interval: number; timeout: number } {
        const configured = this.settingsService?.get('clipboardDelay');
        const customDelay = typeof configured === 'number' && configured > 0 ? configured : 0;
        const usingUiohook = this.lastTriggerUsedUiohook ?? this.uiohookInitialized;

        const interval = usingUiohook ? 48 : 70;
        const baseTimeout = usingUiohook ? 650 : 950;

        return {
            interval,
            timeout: baseTimeout + customDelay
        };
    }

    private migrateClipboardDelaySetting(): void {
        if (!this.settingsService) return;

        const v2Done = this.settingsService.get('clipboardDelayMigratedV2');
        if (!v2Done) {
            this.settingsService.set('clipboardDelayMigratedV2', true);
        }

        const alreadyMigrated = this.settingsService.get('clipboardDelayMigratedV3');
        if (alreadyMigrated) return;

        const existingDelay = this.settingsService.get('clipboardDelay');
        if (existingDelay !== null && existingDelay !== undefined) {
            console.log('[Settings] Clearing clipboard delay override (previous value:', existingDelay, ') to enable Auto default');
            this.settingsService.set('clipboardDelay', null);
        }

        this.settingsService.set('clipboardDelayMigratedV3', true);
    }

    /**
     * Initialize font size to 115% on first install only.
     * Subsequent launches will respect the user's saved font size.
     */
    private initializeFontSize(): void {
        if (!this.settingsService) return;

        // Check if we've already initialized font size
        const fontSizeInitialized = this.settingsService.get('fontSizeInitialized');
        if (fontSizeInitialized) return;

        // Set default font size to 115 (115%)
        const currentFontSize = this.settingsService.get('fontSize');
        if (currentFontSize === null || currentFontSize === undefined) {
            console.log('[Settings] Setting default font size to 115% on first install');
            this.settingsService.set('fontSize', 115);
        }

        // Mark as initialized so we don't override user changes later
        this.settingsService.set('fontSizeInitialized', true);
    }

    private isParsedItemAllowed(parsed: any): boolean {
        if (!parsed) return false;
        if (!this.featureService) return true;

        const rarity = typeof parsed.rarity === 'string' ? parsed.rarity.toLowerCase() : '';
        if (rarity === 'unique') {
            return this.featureService.isCategoryEnabled('Uniques');
        }

        const category = typeof parsed.category === 'string' ? parsed.category : '';
        if (!category || category === 'unknown') return false;

        return this.featureService.isCategoryEnabled(category);
    }

    private showUniqueItem(parsed: any, opts: { silent?: boolean; focus?: boolean } = {}, sourceText?: string | null) {
        if (this.featureService && !this.featureService.isCategoryEnabled('Uniques')) {
            console.log('[Unique] Feature disabled - skipping unique overlay.');
            return;
        }
        const silent = opts.silent ?? false;
        const focus = opts.focus ?? true;
        const normalizedSource = typeof sourceText === 'string' && sourceText.trim().length > 0 ? sourceText.trim() : undefined;
        this.rememberOverlaySnapshot({
            kind: 'unique',
            sourceText: normalizedSource,
            payload: { item: parsed }
        });
        this.showOverlay({ item: parsed, isUnique: true }, { silent, focus });
        if (!silent) {
            // Send version-specific event based on current overlay version
            if (this.overlayVersion === 'poe1') {
                this.safeSendToOverlay('show-poe1-unique-item', { name: parsed.name, baseType: parsed.baseType });
            } else {
                this.safeSendToOverlay('show-unique-item', { name: parsed.name, baseType: parsed.baseType });
            }
        }
    }

    private toggleOverlayWithAllCategory() {
        if (this.isOverlayVisible) {
            this.hideOverlay();
        } else {
            this.showDefaultOverlay();
        }
    }

    // Toggle overlay from floating button - enables pinned mode
    private toggleOverlayFromButton() {
        if (this.isOverlayVisible) {
            this.hideOverlay();
        } else {
            // When opening from button, automatically enable pinned mode
            this.pinned = true;
            this.showDefaultOverlay();
            // Notify the overlay window that pinned mode is enabled
            if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
                this.overlayWindow.webContents.send('pinned-changed', true);
            }
        }
    }

    // Toggle floating button visibility
    private toggleFloatingButton() {
        if (!this.floatingButton) return;
        
        this.floatingButton.toggle();
        const isVisible = this.floatingButton.isVisible();
        this.settingsService?.set('floatingButton', {
            ...(this.settingsService.get('floatingButton') || {}),
            enabled: isVisible
        });
    }

    // Get current hotkey (default to "Ctrl+Q", with validation)
    private getHotkeyKey(): string {
        try {
            const hotkey = this.settingsService?.get('hotkey');
            if (!hotkey || typeof hotkey !== 'object') return 'Ctrl+Q';
            const { key } = hotkey as any;
            
            if (key && typeof key === 'string' && key.length > 0) {
                return key; // Return as-is (could be "Q", "Ctrl+Q", "Alt+F", etc.)
            }
            
            return 'Ctrl+Q';
        } catch (error) {
            console.error('[Hotkey] Error reading hotkey from settings:', error);
            return 'Ctrl+Q';
        }
    }

    // Open hotkey configurator
    private openHotkeyConfigurator() {
        if (!this.hotkeyConfigurator) {
            this.hotkeyConfigurator = new HotkeyConfigurator({
                currentKey: this.getHotkeyKey(),
                onSave: (newKey: string) => this.saveHotkey(newKey)
            });
        }
        this.hotkeyConfigurator.show();
    }

    // Save new hotkey and re-register shortcuts
    private saveHotkey(newKey: string) {
        this.settingsService?.set('hotkey', { key: newKey });
        this.registerShortcuts();
        // Update tray menu labels
        if (this.tray) {
            this.tray.destroy();
            this.tray = createTray({
                onToggleOverlay: () => this.toggleOverlayWithAllCategory(),
                onOpenModifiers: () => { this.toggleOverlayWithAllCategory(); setTimeout(()=> { this.safeSendToOverlay('set-active-tab','modifiers'); },140); },
                onOpenHistory: () => { this.toggleOverlayWithAllCategory(); setTimeout(()=> { this.safeSendToOverlay('set-active-tab','history'); this.safeSendToOverlay('invoke-action','merchant-history'); },180); },
                onExportHistory: () => this.exportMerchantHistoryToCsv(),
                onCleanupHistory: () => this.cleanupMerchantHistory(),
                onQuit: () => app.quit(),
                onToggleFloatingButton: () => this.toggleFloatingButton(),
                onOpenSettings: () => this.openSettings(),
                onShowOverlay: () => this.showDefaultOverlay({ focus: true }),
                currentHotkeyLabel: this.getHotkeyKey(),
                featureVisibility: this.overlayVersion === 'poe2'
                    ? {
                        modifiers: this.featureService?.isFeatureEnabled('modifiers') ?? false,
                        merchantHistory: this.featureService?.isFeatureEnabled('merchant') ?? false
                    }
                    : {
                        modifiers: true, // PoE1 has modifiers feature
                        merchantHistory: false
                    }
            });
        }
    }

    // Global keyboard shortcuts and simulation logic
    // This method GUARANTEES a hotkey will be registered, falling back to Q if necessary
    private registerShortcuts() {
        const accelerator = this.getHotkeyKey(); // Full string like "Q", "Ctrl+Q", "Alt+F"
        
        // Skip if already registered
        if (this.currentRegisteredHotkey === accelerator) {
            console.log(`[Hotkey] Already registered: ${accelerator}`);
            return;
        }
        
        // Unregister old shortcuts first
        if (this.currentRegisteredHotkey) {
            try {
                globalShortcut.unregister(this.currentRegisteredHotkey);
                console.log(`[Hotkey] Unregistered old shortcut: ${this.currentRegisteredHotkey}`);
            } catch (e) {
                console.warn('[Hotkey] Failed to unregister old shortcuts:', e);
            }
        }
        
        // Define handlers
        const captureHandler = async () => {
            // Simple debounce - ignore if already processing
            if (this.shortcutAwaitingCapture) return;

            this.shortcutAwaitingCapture = true;

            try {
                // CAPTURE FIRST, then show overlay with results
                // Don't show overlay before capture - it steals focus from game
                const itemCaptured = await this.captureItemFromGame();
                console.log('[Hotkey] captureHandler done. itemCaptured=', itemCaptured);
                
                // If we didn't capture anything, show empty overlay WITH focus
                // (so click-outside works immediately)
                if (!itemCaptured && !this.isOverlayVisible) {
                    if (!this.restoreLastOverlayView({ focus: true })) {
                        this.showDefaultOverlay({ focus: true });
                    }
                }
            } finally {
                this.shortcutAwaitingCapture = false;
            }
        };        const floatingButtonHandler = () => {
            this.toggleFloatingButton();
        };
        
        // Register the hotkeys - supports full accelerator strings
        // Examples: "Q", "Ctrl+Q", "Alt+F", "Shift+1"
        // NOTE: Avoid Ctrl+Alt combinations to not block AltGr
        try {
            globalShortcut.register(accelerator, captureHandler);
            this.currentRegisteredHotkey = accelerator;
            console.log(`[Hotkey] ✓ Registered: ${accelerator}`);
        } catch (e) {
            console.error(`[Hotkey] Failed to register ${accelerator}:`, e);
            this.currentRegisteredHotkey = null;
        }
    }

    // Monitors clipboard for external (manual) copies while armed
    private setupClipboardMonitoring() {
        try {
            if (!this.clipboardMonitor) return;
            this.clipboardMonitor.on('text-changed', async (text: string) => {
                if (!text || typeof text !== 'string') return;
                const trimmed = text.trim();
                if (!trimmed || trimmed.length < 15) return;
                // Only accept during armed window
                if (Date.now() > this.armedCaptureUntil) return;
                // Avoid duplicates
                if (trimmed === this.lastProcessedItemText) {
                    if (!this.isOverlayVisible) {
                        if (!this.restoreLastOverlayView({ focus: false })) {
                            this.showDefaultOverlay({ focus: false });
                        }
                    }
                    return;
                }
                try {
                    const parsed = await this.itemParser.parse(trimmed);
                    if (parsed && parsed.category && parsed.category !== 'unknown') {
                        if (!this.isParsedItemAllowed(parsed)) {
                            console.log('[Clipboard] Feature disabled for parsed item.', { category: parsed.category, rarity: parsed.rarity });
                            return;
                        }

                        if ((parsed.rarity || '').toLowerCase() === 'unique') {
                            this.showUniqueItem(parsed, { silent: true, focus: false }, trimmed);
                        } else if (parsed.category === 'Gems') {
                            this.rememberOverlaySnapshot({
                                kind: 'gems',
                                sourceText: trimmed,
                                payload: { tab: 'characterTab', action: 'gems', delay: 140 }
                            });
                            // Gem handling - switch to character tab and show gems panel
                            this.showOverlay(undefined, { silent: true, focus: false });
                            setTimeout(() => {
                                this.safeSendToOverlay('set-active-tab', 'characterTab');
                                this.safeSendToOverlay('invoke-action', 'gems');
                            }, 140);
                        } else {
                            let modifiers: any[] = [];
                            try { modifiers = await this.modifierDatabase.getModifiersForCategory(parsed.category); } catch {}
                            this.safeSendToOverlay('set-active-category', parsed.category);
                            this.rememberOverlaySnapshot({
                                kind: 'item',
                                sourceText: trimmed,
                                payload: { item: parsed, modifiers, category: parsed.category }
                            });
                            this.showOverlay({ item: parsed, modifiers }, { silent: true, focus: false });
                        }
                    }
                } catch {}
            });
        } catch {}
    }

    // IPC handlers
    private setupIPC() {
        ipcMain.on('open-settings', () => {
            this.openSettings().catch((err) => console.error('[IPC:open-settings] Error:', err));
        });

        ipcMain.on('open-releases-page', () => {
            try {
                const promise = shell.openExternal(OVERLAY_RELEASE_URL);
                if (promise && typeof (promise as Promise<void>).catch === 'function') {
                    (promise as Promise<void>).catch((err) => console.error('[IPC:open-releases-page] Error:', err));
                }
            } catch (err) {
                console.error('[IPC:open-releases-page] Error:', err);
            }
        });

        // Register bulk data handlers
        registerDataIpc({
            modifierDatabase: this.modifierDatabase,
            getDataDir: () => this.getDataDir(),
            getUserConfigDir: () => this.getUserConfigDir(),
            getOverlayVersion: () => this.overlayVersion,
            validateDataDir: (dirPath) => this.validateDataDirCandidate(dirPath, this.overlayVersion)
        });

        // Feature configuration IPC handlers
        ipcMain.handle('get-enabled-features', () => {
            try {
                const config = this.featureService?.getConfig() || this.buildDisabledFeatureConfig();

                if (this.overlayVersion === 'poe1') {
                    const disabled = this.buildDisabledFeatureConfig();

                    return {
                        ...disabled,
                        poe1Modifiers: config.poe1Modifiers ?? disabled.poe1Modifiers,
                        poe1Crafting: {
                            enabled: config.poe1Crafting?.enabled ?? disabled.poe1Crafting.enabled,
                            subcategories: {
                                scarabs: config.poe1Crafting?.subcategories?.scarabs ?? disabled.poe1Crafting.subcategories.scarabs,
                                currency: config.poe1Crafting?.subcategories?.currency ?? disabled.poe1Crafting.subcategories.currency,
                                essences: config.poe1Crafting?.subcategories?.essences ?? disabled.poe1Crafting.subcategories.essences,
                                fossils: config.poe1Crafting?.subcategories?.fossils ?? disabled.poe1Crafting.subcategories.fossils,
                                embers: config.poe1Crafting?.subcategories?.embers ?? disabled.poe1Crafting.subcategories.embers
                            }
                        },
                        poe1Character: {
                            enabled: config.poe1Character?.enabled ?? disabled.poe1Character.enabled,
                            subcategories: {
                                divinationCards: config.poe1Character?.subcategories?.divinationCards ?? disabled.poe1Character.subcategories.divinationCards,
                                tattoos: config.poe1Character?.subcategories?.tattoos ?? disabled.poe1Character.subcategories.tattoos,
                                gems: config.poe1Character?.subcategories?.gems ?? disabled.poe1Character.subcategories.gems
                            }
                        },
                        poe1Items: {
                            enabled: config.poe1Items?.enabled ?? disabled.poe1Items.enabled,
                            subcategories: {
                                uniques: config.poe1Items?.subcategories?.uniques ?? disabled.poe1Items.subcategories.uniques,
                                bases: config.poe1Items?.subcategories?.bases ?? disabled.poe1Items.subcategories.bases
                            }
                        },
                        tools: {
                            enabled: config.tools?.enabled ?? disabled.tools.enabled,
                            subcategories: {
                                regex: false,
                                poe1Regex: config.tools?.subcategories?.poe1Regex ?? disabled.tools.subcategories.poe1Regex
                            }
                        }
                    };
                }

                return config;
            } catch (e) {
                console.error('[IPC:get-enabled-features] Error:', e);
                return this.buildDisabledFeatureConfig();
            }
        });

        // Feature configuration save is now handled directly by featureSplash.ts
        // (no IPC handler needed - saves config and shows restart dialog there)

        // Font size handlers
        ipcMain.handle('get-font-size', () => {
            try {
                return this.settingsService?.get('fontSize') || 100;
            } catch (e) {
                console.error('[IPC:get-font-size] Error:', e);
                return 100;
            }
        });

        ipcMain.handle('check-updates', async () => {
            try {
                if (this.overlayUpdateCache) {
                    return this.overlayUpdateCache.result;
                }
                const currentVersion = getOverlayAppVersion();
                const result = await checkOverlayUpdateStatus(currentVersion);
                this.overlayUpdateCache = { timestamp: Date.now(), result };
                return result;
            } catch (err: any) {
                return {
                    available: false,
                    version: null,
                    message: err?.message || 'Failed to check for updates.',
                    error: true,
                    url: OVERLAY_RELEASE_URL
                } as OverlayUpdateCheckResult;
            }
        });

        // Open external URLs in system browser
        ipcMain.handle('open-external', async (_e, url: string) => {
            try {
                if (!url || typeof url !== 'string') {
                    console.warn('[IPC:open-external] Invalid URL:', url);
                    return { success: false, error: 'Invalid URL' };
                }
                await shell.openExternal(url);
                return { success: true };
            } catch (err: any) {
                console.error('[IPC:open-external] Error:', err);
                return { success: false, error: err?.message || 'Failed to open external URL' };
            }
        });
        // Remaining handlers below...

        // Open a lightweight transparent popout window for a modifier section (anchored to overlay)
        try { ipcMain.removeHandler('open-mod-popout'); } catch {}
        ipcMain.handle('open-mod-popout', async (_e, payload: any) => {
            try {
                const json = JSON.stringify(payload || {});
                const b64 = Buffer.from(json, 'utf8').toString('base64');
                // Anchor next to overlay (right side preferred)
                let baseX = 120, baseY = 120;
                try {
                    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
                        const b = this.overlayWindow.getBounds();
                        baseX = b.x + b.width + 8;
                        baseY = b.y;
                        const disp = screen.getPrimaryDisplay();
                        const sw = disp.workArea.width || disp.workAreaSize.width;
                        const sh = disp.workArea.height || disp.workAreaSize.height;
                        if (baseX + 340 > sw) baseX = Math.max(12, b.x - 340 - 8);
                        if (baseY + 260 > sh) baseY = Math.max(20, sh - 280);
                    }
                } catch {}
                const offset = this.modPopoutWindows.size * 26;
                const win = new BrowserWindow({
                    width: 320,
                    height: 260,
                    x: baseX + offset,
                    y: baseY + offset,
                    frame: false,
                    alwaysOnTop: true,
                    skipTaskbar: false,
                    resizable: true,
                    transparent: true,
                    show: true,
                    webPreferences: { contextIsolation: true, nodeIntegration: false }
                });
                this.modPopoutWindows.add(win);
                win.on('closed', () => { this.modPopoutWindows.delete(win); });
                this.lastPopoutSpawnAt = Date.now();
                const html = buildModPopoutHtml(b64);
                win.loadURL('data:text/html;base64,' + Buffer.from(html, 'utf8').toString('base64'));
                return { ok: true };
            } catch (e: any) {
                return { ok: false, error: e?.message || 'failed' };
            }
        });

        // History popout handlers extracted
        registerHistoryPopoutIpc({
            historyPopoutWindowRef: { current: this.historyPopoutWindow },
            overlayWindow: () => this.overlayWindow,
            getUserConfigDir: () => this.getUserConfigDir(),
            logPath: historyPopoutDebugLogPath
        });

        // Floating button IPC handlers
        ipcMain.on('floating-button-clicked', () => {
            console.log('[FloatingButton] Button clicked');
            this.toggleOverlayFromButton();
        });

        ipcMain.on('floating-button-pin-toggled', () => {
            console.log('[FloatingButton] Pin toggled');
            this.floatingButton?.togglePin();
        });

        ipcMain.on('floating-button-close', () => {
            console.log('[FloatingButton] Close button clicked');
            this.floatingButton?.hide();
        });

        ipcMain.on('hide-overlay', () => {
            this.hideOverlay();
        });

        ipcMain.on('overlay-ready', () => {
            console.log('Overlay renderer ready');
            this.overlayLoaded = true;
            
            // Send initial pinned state to renderer
            if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
                this.overlayWindow.webContents.send('pinned-changed', this.pinned);
                this.overlayWindow.webContents.send('overlay-version-mode', this.overlayVersion);
            }
            
            if (this.pendingItemData) {
                this.safeSendToOverlay('clear-filters');
                this.safeSendToOverlay('item-data', this.pendingItemData);
                this.pendingItemData = null;
            }
        });
        // Pinned toggle
        ipcMain.on('set-pinned', (_event, pinned: boolean) => {
            this.pinned = !!pinned;
            if (this.overlayWindow) {
                this.overlayWindow.webContents.send('pinned-changed', this.pinned);
            }
        });

        // Resize height only
        ipcMain.on('resize-overlay-height', (_event, newHeight: number) => {
            if (!this.overlayWindow) return;
            const [currentW] = this.overlayWindow.getSize();
            const minH = this.overlayWindow.getMinimumSize()[1] || 400;
            const maxH = this.overlayWindow.getMaximumSize()[1] || 1200;
            const clamped = Math.max(minH, Math.min(newHeight, maxH));
            this.overlayWindow.setSize(currentW, clamped);
            this.saveWindowBounds();
        });

        // PoE login and session
        ipcMain.handle('poe-get-session', async () => {
            // Fast cookie check first
            const hasCookie = await this.hasPoeSession();
            if (!hasCookie) {
                return { loggedIn: false, cookiePresent: false, accountName: null };
            }
            
            // Verify session by checking if we can access the trade page
            try {
                const cookies = await session.defaultSession.cookies.get({ domain: 'pathofexile.com' });
                const cookieStr = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
                
                const response = await fetch('https://www.pathofexile.com/trade2', {
                    method: 'GET',
                    headers: {
                        'Cookie': cookieStr,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    redirect: 'manual' // Don't follow redirects
                });
                
                // If we get 200, we're logged in. If 302/redirect, we need to login
                const loggedIn = response.status === 200;
                return { loggedIn, cookiePresent: hasCookie, accountName: this.poeAccountName };
            } catch (e) {
                console.warn('[Session] Failed to verify login status:', e);
                return { loggedIn: false, cookiePresent: hasCookie, accountName: this.poeAccountName };
            }
        });

        ipcMain.handle('poe-login', async () => {
            // If we have a CONFIRMED recent session, treat click as "manage / logout" action -> still open window.
            // If only a cookie is present but unconfirmed, we also open the login window to finish auth.
            const r = await this.openPoeLoginWindow();
            // If login was successful, set a timestamp so poe-get-session immediately recognizes it
            if (r.loggedIn) {
                this.lastHistoryFetchAt = Date.now() - 60000; // Set to 1min ago so session is confirmed
            }
            return r;
        });

        ipcMain.handle('poe-fetch-history', async (_e, league: string) => {
            // Rate limiter handles ALL timing - no manual interval checks
            const targetLeague = (typeof league === 'string' && league.trim()) ? league.trim() : this.merchantHistoryLeague;
            const { ok, status, data, headers, error, rateLimited, retryAfter } = await this.fetchPoeHistory(targetLeague);
            
            // Only update lastFetchAt on successful requests
            if (ok) {
                this.lastHistoryFetchAt = Date.now();
            }

            if (targetLeague && targetLeague !== this.merchantHistoryLeague) {
                this.merchantHistoryLeague = targetLeague;
            }
            
            return { 
                ok, 
                status, 
                data, 
                headers, 
                error, 
                rateLimited,
                retryAfter,
                accountName: this.poeAccountName, 
                lastFetchAt: this.lastHistoryFetchAt,
                league: targetLeague
            };
        });

        ipcMain.handle('poe-get-rate-limit-status', async () => {
            const budget = rateLimiter.canRequest();
            const status = rateLimiter.getStatus();
            return { budget, status };
        });


        ipcMain.handle('poe-open-history-window', async () => {
            if (this.historyWindow && !this.historyWindow.isDestroyed()) {
                this.historyWindow.focus();
                return true;
            }
            const win = new BrowserWindow({
                width: 1200,
                height: 900,
                title: 'PoE Trade History',
                webPreferences: { contextIsolation: true, nodeIntegration: false },
                icon: ((): string | undefined => {
                    for (const p of [
                        path.join(process.resourcesPath || '', 'build', 'icon.ico'),
                        path.join(process.resourcesPath || '', 'icon.ico'),
                        path.join(__dirname, '..', '..', 'build', 'icon.ico'),
                        path.join(__dirname, '..', '..', 'xilehudICO.ico'),
                        path.join(process.cwd(), 'packages', 'overlay', 'build', 'icon.ico'),
                        path.join(process.cwd(), 'packages', 'overlay', 'xilehudICO.ico')
                    ]) { try { if (fs.existsSync(p)) return p; } catch {} }
                    return undefined;
                })()
            });
            this.historyWindow = win;
            win.on('closed', () => { this.historyWindow = null; });
            win.loadURL('https://www.pathofexile.com/trade2/history');
            // Optional: uncomment to help debug
            // win.webContents.openDevTools({ mode: 'detach' });
            return true;
        });

        // Removed: poe-scrape-open-history (deprecated scraping approach)

        ipcMain.handle('history-get-league', async () => {
            const storedLeagueRaw = this.settingsService?.get('merchantHistoryLeague');
            const storedSource = this.settingsService?.get('merchantHistoryLeagueSource');
            const hasStoredPreference = storedSource === 'manual'
                && typeof storedLeagueRaw === 'string'
                && storedLeagueRaw.trim().length > 0;

            return {
                league: this.merchantHistoryLeague,
                source: this.merchantHistoryLeagueSource,
                hasStoredPreference
            };
        });

        ipcMain.handle('history-set-league', async (_event, payload: { league?: string; source?: 'auto' | 'manual' }) => {
            const nextLeagueRaw = typeof payload?.league === 'string' ? payload.league.trim() : '';
            const nextLeague = nextLeagueRaw || this.merchantHistoryLeague || 'Rise of the Abyssal';
            const nextSource: 'auto' | 'manual' = payload?.source === 'manual' ? 'manual' : 'auto';

            const leagueChanged = nextLeague !== this.merchantHistoryLeague;
            const sourceChanged = nextSource !== this.merchantHistoryLeagueSource;

            this.merchantHistoryLeague = nextLeague;
            this.merchantHistoryLeagueSource = nextSource;

            if ((leagueChanged || sourceChanged) && this.settingsService) {
                if (this.merchantHistoryLeagueSource === 'manual') {
                    try { this.settingsService.set('merchantHistoryLeague', this.merchantHistoryLeague); } catch {}
                    try { this.settingsService.set('merchantHistoryLeagueSource', this.merchantHistoryLeagueSource); } catch {}
                } else {
                    try { this.settingsService.clear('merchantHistoryLeague'); } catch {}
                    try { this.settingsService.clear('merchantHistoryLeagueSource'); } catch {}
                }
            }

            return {
                league: this.merchantHistoryLeague,
                source: this.merchantHistoryLeagueSource
            };
        });

        // Local merchant history persistence (per-league)
        try { ipcMain.removeHandler('history-load'); } catch {}
        try { ipcMain.removeHandler('history-save'); } catch {}
        ipcMain.handle('history-load', async (_e, league?: string) => {
            try {
                await this.migrateLegacyMerchantHistory();
            } catch {}
            try {
                const cfgDir = this.getUserConfigDir();
                const targetLeague = league || this.merchantHistoryLeague || 'Rise of the Abyssal';
                const safeLeagueName = targetLeague.replace(/[^a-zA-Z0-9_-]/g, '_');
                const file = path.join(cfgDir, `merchant-history-${safeLeagueName}.json`);
                
                if (fs.existsSync(file)) {
                    const raw = fs.readFileSync(file, 'utf8');
                    const json = JSON.parse(raw);
                    // Ensure shape
                    const entries = Array.isArray(json?.entries) ? json.entries : [];
                    const totals = json?.totals && typeof json.totals === 'object' ? json.totals : {};
                    const lastSync = Number(json?.lastSync || 0) || 0;
                    const lastFetchAt = Number(json?.lastFetchAt || 0) || 0;
                    return { entries, totals, lastSync, lastFetchAt, league: targetLeague };
                }
                // Initialize empty store if missing
                const empty = { entries: [], totals: {}, lastSync: 0, lastFetchAt: 0, league: targetLeague };
                try { if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true }); } catch {}
                fs.writeFileSync(file, JSON.stringify(empty, null, 2));
                return empty;
            } catch (e: any) {
                return { entries: [], totals: {}, lastSync: 0, lastFetchAt: 0 };
            }
        });
        ipcMain.handle('history-save', async (_e, store: any, league?: string) => {
            try {
                const cfgDir = this.getUserConfigDir();
                const targetLeague = league || this.merchantHistoryLeague || 'Rise of the Abyssal';
                const safeLeagueName = targetLeague.replace(/[^a-zA-Z0-9_-]/g, '_');
                const file = path.join(cfgDir, `merchant-history-${safeLeagueName}.json`);
                
                try { if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true }); } catch {}
                const dataToSave = {
                    entries: store?.entries || [],
                    totals: store?.totals || {},
                    lastSync: store?.lastSync || 0,
                    lastFetchAt: store?.lastFetchAt || 0,
                    league: targetLeague
                };
                fs.writeFileSync(file, JSON.stringify(dataToSave, null, 2));
                return { ok: true, league: targetLeague };
            } catch (e: any) {
                return { ok: false, error: e?.message || 'write_failed' };
            }
        });

        // Settings get/set for auto-cleanup flag
        try { ipcMain.removeHandler('get-setting'); } catch {}
        try { ipcMain.removeHandler('set-setting'); } catch {}
        ipcMain.handle('get-setting', async (_e, key: string) => {
            try {
                return this.settingsService?.get(key as keyof UserSettings);
            } catch (e) {
                console.error(`[IPC:get-setting] Error getting ${key}:`, e);
                return undefined;
            }
        });
        ipcMain.handle('set-setting', async (_e, key: string, value: any) => {
            try {
                this.settingsService?.set(key as keyof UserSettings, value);
                return { ok: true };
            } catch (e: any) {
                console.error(`[IPC:set-setting] Error setting ${key}:`, e);
                return { ok: false, error: e?.message };
            }
        });

        // Auto-cleanup merchant history (silent, no prompts)
        try { ipcMain.removeHandler('cleanup-merchant-history-auto'); } catch {}
        ipcMain.handle('cleanup-merchant-history-auto', async () => {
            try {
                const configDir = this.getUserConfigDir();
                const cleanupResult = await MerchantHistoryCleanupService.cleanupAllLeagues(configDir);
                
                if (cleanupResult.success && (cleanupResult.totalRemoved > 0 || cleanupResult.totalMerged > 0)) {
                    console.log(`[HistoryAutoCleanup] Cleaned: ${cleanupResult.totalMerged} merged, ${cleanupResult.totalRemoved} removed`);
                    
                    // Notify renderer to refresh history
                    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
                        this.overlayWindow.webContents.send('history-cleaned', cleanupResult);
                    }
                }
                
                return cleanupResult;
            } catch (e) {
                console.error('[HistoryAutoCleanup] Failed:', e);
                return {
                    success: false,
                    results: [],
                    totalRemoved: 0,
                    totalMerged: 0,
                    error: e instanceof Error ? e.message : String(e)
                };
            }
        });

        // Fallback scraping handlers removed
    }

    // ---- Legacy merchant-history migration ----
    private async migrateLegacyMerchantHistory(): Promise<void> {
        try {
            const cfgDir = this.getUserConfigDir();
            const oldFile = path.join(cfgDir, 'merchant-history.json');
            
            // If old single-league file exists, migrate it to the current league
            if (fs.existsSync(oldFile)) {
                const raw = fs.readFileSync(oldFile, 'utf8');
                const json = JSON.parse(raw);
                
                // Create a backup
                const backupFile = path.join(cfgDir, 'merchant-history-legacy-backup.json');
                fs.writeFileSync(backupFile, raw);
                
                // Determine which league this data belongs to (default to current)
                const targetLeague = this.merchantHistoryLeague || 'Rise of the Abyssal';
                const safeLeagueName = targetLeague.replace(/[^a-zA-Z0-9_-]/g, '_');
                const newFile = path.join(cfgDir, `merchant-history-${safeLeagueName}.json`);
                
                // Only migrate if the new file doesn't exist or is empty
                if (!fs.existsSync(newFile)) {
                    const entries = Array.isArray(json?.entries) ? json.entries : [];
                    const totals = json?.totals && typeof json.totals === 'object' ? json.totals : {};
                    const lastSync = Number(json?.lastSync || 0) || 0;
                    const lastFetchAt = Number(json?.lastFetchAt || 0) || 0;
                    
                    const migratedData = {
                        entries,
                        totals,
                        lastSync,
                        lastFetchAt,
                        league: targetLeague
                    };
                    
                    fs.writeFileSync(newFile, JSON.stringify(migratedData, null, 2));
                }
                
                // Rename old file to .migrated so we don't re-migrate
                const migratedFile = path.join(cfgDir, 'merchant-history.json.migrated');
                fs.renameSync(oldFile, migratedFile);
            }
        } catch (e) {
            console.error('[Migration] Failed to migrate legacy merchant history:', e);
        }
    }

    // (Removed legacy direct network helpers)
}

// Start the application
new OverlayApp();

// Helpers outside the class for path resolution might also be methods on the class.