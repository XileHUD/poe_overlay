import { app, BrowserWindow, globalShortcut, ipcMain, screen, Tray, Menu, nativeImage, clipboard, shell, session } from 'electron';
import * as os from 'os';
// Optional updater (will be active in packaged builds)
let autoUpdater: any = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch {}
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
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
// NodeNext sometimes fails transiently on newly added files with explicit .js; use extensionless for TS while runtime still resolves .js after build
import { FloatingButton } from './ui/floatingButton';
import { SettingsService } from './services/settingsService.js';
import { registerDataIpc } from './ipc/dataHandlers.js';
import { registerHistoryPopoutIpc } from './ipc/historyPopoutHandlers.js';
import { PoeSessionHelper } from './network/poeSession.js';
import { ImageCacheService } from './services/imageCache.js';
import { resolveLocalImage, resolveByNameOrSlug, getImageIndexMeta } from './services/imageResolver.js';
import { rateLimiter } from './services/rateLimiter.js';

// History popout debug log path (moved logging helpers into historyPopoutHandlers)
const historyPopoutDebugLogPath = path.join(app.getPath('userData'), 'history-popout-debug.log');

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
    private pinned = false;
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
    private lastHistoryFetchAt: number = 0; // global merchant history fetch timestamp (ms)
    private readonly HISTORY_FETCH_MIN_INTERVAL = 5 * 60 * 1000; // 5 minutes
    private floatingButton: FloatingButton | null = null;
    private settingsService: SettingsService | null = null;

    constructor() {
        app.whenReady().then(async () => {
            this.showSplash('Initializing application...');
            // Lazy load heavy modules after splash is visible
            const [ { ModifierDatabase }, { ItemParser }, { ClipboardMonitor }, { KeyboardMonitor } ] = await Promise.all([
                import('./modifier-database.js'),
                import('./item-parser.js'),
                import('./clipboard-monitor.js'),
                import('./keyboard-monitor.js')
            ]);

            this.updateSplash('Resolving data path');
            const initialDataPath = this.resolveInitialDataPath();
            this.modifierDatabase = new ModifierDatabase(initialDataPath, false);
            (async () => { // start async background load
                const p = this.modifierDatabase.loadAsync(msg => this.updateSplash(msg));
                ;(this.modifierDatabase as any).__loadingPromise = p;
                await p;
                this.updateSplash('Modifiers loaded');
                // Notify any renderers that categories may now be complete
                try {
                    const cats = await this.modifierDatabase.getAllCategories();
                    this.overlayWindow?.webContents.send('modifiers-loaded', cats);
                } catch {}
            })();

            this.updateSplash('Starting parsers');
            this.itemParser = new ItemParser();
            this.clipboardMonitor = new ClipboardMonitor();
            this.keyboardMonitor = new KeyboardMonitor();
            try { this.keyboardMonitor!.start(); } catch {}

            this.updateSplash('Creating overlay window');
            this.createOverlayWindow();
            this.updateSplash('Initializing settings');
            this.settingsService = new SettingsService(this.getUserConfigDir());
            this.floatingButton = new FloatingButton({
                settingsService: this.settingsService
            });
            this.updateSplash('Creating tray');
            this.tray = createTray({
                onToggleOverlay: () => this.toggleOverlayWithAllCategory(),
                onOpenModifiers: () => { this.toggleOverlayWithAllCategory(); setTimeout(()=> { this.safeSendToOverlay('set-active-tab','modifiers'); },140); },
                onOpenHistory: () => { this.toggleOverlayWithAllCategory(); setTimeout(()=> { this.safeSendToOverlay('set-active-tab','history'); this.safeSendToOverlay('invoke-action','merchant-history'); },180); },
                getDataDir: () => this.getDataDir(),
                reloadData: () => (this.modifierDatabase as any).reload?.(),
                checkForUpdates: () => { try { if (autoUpdater) autoUpdater.checkForUpdatesAndNotify(); else shell.openExternal('https://github.com/XileHUD/poe_overlay/releases'); } catch { shell.openExternal('https://github.com/XileHUD/poe_overlay/releases'); } },
                onQuit: () => app.quit(),
                onToggleFloatingButton: () => this.toggleFloatingButton()
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
                    
                    // Check for updates on startup
                    autoUpdater.checkForUpdatesAndNotify();
                }
            } catch (e) {
                console.error('[AutoUpdater] Setup failed:', e);
            }

            // Auto clean on quit
            app.on('will-quit', () => {
                try { globalShortcut.unregisterAll(); } catch {}
                try { (this.clipboardMonitor as any).stop?.(); } catch {}
                try { this.keyboardMonitor?.stop(); } catch {}
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

    private resolveInitialDataPath(): string {
        try {
            // 1) Environment override
            const env = process.env.XILEHUD_DATA_DIR;
            if (env && fs.existsSync(env)) return env;
        } catch {}
        try {
            // 2) Config file under userData
            const cfgDir = this.getUserConfigDir();
            const cfgPath = path.join(cfgDir, 'overlay-config.json');
            if (fs.existsSync(cfgPath)) {
                const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
                const p = cfg?.dataDir;
                if (p && typeof p === 'string' && fs.existsSync(p)) return p;
            }
        } catch {}
        try {
            // 3) Repo relative default (dev)
            const internalDev = path.join(__dirname, '../../data/poe2/Rise of the Abyssal');
            if (fs.existsSync(internalDev)) return internalDev;
        } catch {}
        try {
            // 4) Packaged resources (electron-builder extraFiles)
            // For packaged builds, data is placed under resources/data/poe2 by electron-builder configuration
            const candidates = [
                path.join(process.resourcesPath || '', 'data', 'poe2')
            ];
            
            for (const packaged of candidates) {
                if (fs.existsSync(packaged)) {
                    // If there's only one league folder, pick it; else use root
                    const entries = fs.readdirSync(packaged).map(f => path.join(packaged, f)).filter(p => fs.statSync(p).isDirectory());
                    const abyssal = entries.find(p => /Rise of the Abyssal/i.test(p));
                    if (abyssal) return abyssal;
                    if (entries.length > 0) return entries[0];
                    return packaged; // fall back to root even if empty
                }
            }
        } catch {}
        // 4) Fallback to userData/poe2 (user can place JSONs there)
        const fallback = path.join(this.getUserConfigDir(), 'poe2');
        try { if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true }); } catch {}
        return fallback;
    }

    // (Legacy image cache methods removed; handled by ImageCacheService)

    private getDataDir(): string {
        try { return (this.modifierDatabase as any).getDataPath?.() || this.dataDirCache || this.resolveInitialDataPath(); } catch {}
        return this.dataDirCache || this.resolveInitialDataPath();
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
            focusable: true,  // Changed to true to allow mouse interactions
            icon: windowIcon
        });

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
                    const res = (process as any).resourcesPath || process.cwd();
                    const bundledDir = path.join(res, 'bundled-images');
                    const fullPath = path.join(bundledDir, localPath);
                    const exists = fs.existsSync(fullPath);
                    if(!exists){
                        console.debug('[get-bundled-image-path] MISS', { localPath, fullPath });
                        return null;
                    }
                    console.debug('[get-bundled-image-path] HIT', { localPath, fullPath });
                    
                    // Return as file:// URL for renderer
                    return 'file:///' + fullPath.replace(/\\/g, '/');
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
            if (this.pendingTab) { try { this.overlayWindow?.webContents.send('set-active-tab', this.pendingTab); } catch {} }
            if (this.pendingCategory) { try { this.overlayWindow?.webContents.send('set-active-category', this.pendingCategory); } catch {} }
            if (this.pendingItemData) {
                try { this.overlayWindow?.webContents.send('clear-filters'); } catch {}
                try { this.overlayWindow?.webContents.send('item-data', this.pendingItemData); } catch {}
            }
            this.pendingItemData = null;
            this.pendingCategory = null;
            this.pendingTab = null;
        });

        // Click-outside detection (consider popout focus)
        this.overlayWindow.on('blur', () => {
            setTimeout(() => {
                try {
                    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;
                    if (this.pinned || !this.isOverlayVisible) return;
                    const focused = BrowserWindow.getFocusedWindow();
                    if (!focused) { this.hideOverlay(); return; }
                    // If a popout is focused, keep overlay
                    const popFocused = Array.from(this.modPopoutWindows).some(w => !w.isDestroyed() && w.id === focused.id);
                    if (!popFocused && focused.id !== this.overlayWindow.id) {
                        this.hideOverlay();
                    }
                } catch {}
            }, 55);
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
    private async captureItemFromGame() {
        // Arm clipboard acceptance for a brief window
        const now = Date.now();
        this.armedCaptureUntil = now + 2000;
        this.lastCopyTimestamp = now;
        try { this.clipboardMonitor.resetLastSeen(); } catch {}
        try { clipboard.clear(); } catch {}

        // Best-effort: try to simulate Ctrl+C using optional robotjs if present
        this.trySimulateCtrlC();

        // Poll clipboard directly for fast response while the interval monitor also runs
        const deadline = Date.now() + 1600;
        let handled = false;
        while (Date.now() < deadline) {
            try {
                const text = (clipboard.readText() || '').trim();
                if (text && text.length > 20) {
                    try {
                        const parsed = await this.itemParser.parse(text);
                        if (parsed && parsed.category && parsed.category !== 'unknown') {
                            // Unique shortcut handling
                            if ((parsed.rarity || '').toLowerCase() === 'unique') {
                                this.showUniqueItem(parsed);
                                handled = true;
                                break;
                            }
                            let modifiers: any[] = [];
                            try { modifiers = await this.modifierDatabase.getModifiersForCategory(parsed.category); } catch {}
                            this.safeSendToOverlay('set-active-category', parsed.category);
                            this.showOverlay({ item: parsed, modifiers });
                            handled = true;
                            break;
                        }
                    } catch {}
                }
            } catch {}
            await new Promise(r => setTimeout(r, 30));
        }
        // Only open overlay if we actually captured an item
        // Disarm
        this.armedCaptureUntil = 0;
    }

    // === Session / network (delegated to PoeSessionHelper) ===
    private async hasPoeSession(): Promise<boolean> { return this.poeSession.hasSession(); }
    private async openPoeLoginWindow(): Promise<{ loggedIn: boolean; accountName?: string | null }> { return this.poeSession.openLoginWindow(); }
    private async fetchPoeHistory(league: string) { return this.poeSession.fetchHistory(league); }
    private async isAuthenticated() { return this.poeSession.isAuthenticatedProbe('Rise of the Abyssal'); }


    // Optional best-effort Ctrl+C keystroke using robotjs if available
    private trySimulateCtrlC() {
        // Try robotjs if available
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const robot = require('robotjs');
            if (robot && typeof robot.keyTap === 'function') {
                const modifier = process.platform === 'darwin' ? 'command' : 'control';
                robot.keyTap('c', modifier);
                return;
            }
        } catch {}
        // Windows fallback: use SendKeys via PowerShell to send Ctrl+C to the active window
        if (process.platform === 'win32') {
            try {
                const ps = cp.spawn('powershell.exe', [
                    '-NoProfile',
                    '-WindowStyle', 'Hidden',
                    '-Command',
                    "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^c')"
                ], { windowsHide: true, stdio: 'ignore' });
                // Do not await; it's near-instant and we concurrently poll the clipboard
                ps.unref?.();
            } catch {}
        }
    }

    private showOverlay(data?: any, opts?: { silent?: boolean }) {
        if (!this.overlayWindow) return;
        
        if (data) {
            if (this.overlayLoaded) {
                this.safeSendToOverlay('clear-filters');
                this.safeSendToOverlay('item-data', data);
            } else {
                this.pendingItemData = data;
            }
        }
        if (opts?.silent && this.isOverlayVisible && this.pinned) {
            // Passive update only (no focus steal)
            console.log('Overlay passive update (pinned)');
            return;
        }

        // Show overlay and ensure it gets focus for blur events to work (active open)
        this.overlayWindow.show();
        this.overlayWindow.focus();
        this.isOverlayVisible = true;
        
        console.log('Overlay shown');
    }

    private hideOverlay() {
        if (!this.overlayWindow) return;
        
        // Hide overlay normally
        this.overlayWindow.hide();
        this.isOverlayVisible = false;
        // Do not clear clipboard if a capture is in progress
        if (!this.shortcutAwaitingCapture && Date.now() > this.armedCaptureUntil) {
            try { clipboard.clear(); } catch {}
            try { this.clipboardMonitor.resetLastSeen(); } catch {}
        }
        console.log('Overlay hidden');
    }

    private showUniqueItem(parsed: any, silent = false) {
        this.showOverlay({ item: parsed, isUnique: true }, { silent });
        if (!silent) {
            this.safeSendToOverlay('show-unique-item', { name: parsed.name, baseType: parsed.baseType });
        }
    }

    private toggleOverlayWithAllCategory() {
        if (this.isOverlayVisible) {
            this.hideOverlay();
        } else {
            this.showOverlay();
        }
    }

    // Toggle overlay from floating button - enables pinned mode
    private toggleOverlayFromButton() {
        if (this.isOverlayVisible) {
            this.hideOverlay();
        } else {
            // When opening from button, automatically enable pinned mode
            this.pinned = true;
            this.showOverlay();
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
    }

    // Global keyboard shortcuts and simulation logic
    private registerShortcuts() {
        try { globalShortcut.unregisterAll(); } catch {}
        // Primary toggle / capture: Ctrl+Q behavior
        try {
            globalShortcut.register('CommandOrControl+Q', async () => {
                const now = Date.now();
                // If overlay visible and NOT pinned, act as a hide toggle.
                // If pinned, treat Ctrl+Q as a capture attempt (previous behavior).
                if (this.isOverlayVisible && !this.pinned && !this.shortcutAwaitingCapture) {
                    this.hideOverlay();
                    return;
                }
                // If recently armed and awaiting capture, ignore extra presses
                if (this.shortcutAwaitingCapture && now < this.armedCaptureUntil) return;
                this.shortcutAwaitingCapture = true;
                await this.captureItemFromGame();
                this.shortcutAwaitingCapture = false;
            });
        } catch (e) { console.warn('register shortcut failed', e); }
        
        // Floating button toggle: Ctrl+Alt+Q
        try {
            globalShortcut.register('CommandOrControl+Alt+Q', () => {
                this.toggleFloatingButton();
            });
        } catch (e) { console.warn('register floating button shortcut failed', e); }
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
                if (trimmed === this.lastProcessedItemText) return;
                this.lastProcessedItemText = trimmed;
                try {
                    const parsed = await this.itemParser.parse(trimmed);
                    if (parsed && parsed.category && parsed.category !== 'unknown') {
                        if ((parsed.rarity || '').toLowerCase() === 'unique') {
                            this.showUniqueItem(parsed, true);
                        } else {
                            let modifiers: any[] = [];
                            try { modifiers = await this.modifierDatabase.getModifiersForCategory(parsed.category); } catch {}
                            this.safeSendToOverlay('set-active-category', parsed.category);
                            this.showOverlay({ item: parsed, modifiers }, { silent: true });
                        }
                    }
                } catch {}
            });
        } catch {}
    }

    // IPC handlers
    private setupIPC() {
        // Register bulk data handlers
        registerDataIpc({
            modifierDatabase: this.modifierDatabase,
            getDataDir: () => this.getDataDir(),
            getUserConfigDir: () => this.getUserConfigDir()
        });

        ipcMain.handle('check-updates', async () => {
            try {
                if (autoUpdater) {
                    await autoUpdater.checkForUpdatesAndNotify();
                    return { ok: true };
                }
                return { ok: false, error: 'updater_unavailable' };
            } catch (e: any) {
                return { ok: false, error: e?.message || 'update_failed' };
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

        ipcMain.on('hide-overlay', () => {
            this.hideOverlay();
        });

        ipcMain.on('overlay-ready', () => {
            console.log('Overlay renderer ready');
            this.overlayLoaded = true;
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
            const { ok, status, data, headers, error, rateLimited, retryAfter } = await this.fetchPoeHistory(league);
            
            // Only update lastFetchAt on successful requests
            if (ok) {
                this.lastHistoryFetchAt = Date.now();
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
                lastFetchAt: this.lastHistoryFetchAt
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

        // Local merchant history persistence
        try { ipcMain.removeHandler('history-load'); } catch {}
        try { ipcMain.removeHandler('history-save'); } catch {}
        ipcMain.handle('history-load', async () => {
            try {
                await this.migrateLegacyMerchantHistory();
            } catch {}
            try {
                const cfgDir = this.getUserConfigDir();
                const file = path.join(cfgDir, 'merchant-history.json');
                if (fs.existsSync(file)) {
                    const raw = fs.readFileSync(file, 'utf8');
                    const json = JSON.parse(raw);
                    // Ensure shape
                    const entries = Array.isArray(json?.entries) ? json.entries : [];
                    const totals = json?.totals && typeof json.totals === 'object' ? json.totals : {};
                    const lastSync = Number(json?.lastSync || 0) || 0;
                    return { entries, totals, lastSync };
                }
                // Initialize empty store if missing
                const empty = { entries: [], totals: {}, lastSync: 0 };
                try { if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true }); } catch {}
                fs.writeFileSync(file, JSON.stringify(empty, null, 2));
                return empty;
            } catch (e: any) {
                return { entries: [], totals: {}, lastSync: 0 };
            }
        });
        ipcMain.handle('history-save', async (_e, store: any) => {
            try {
                const cfgDir = this.getUserConfigDir();
                const file = path.join(cfgDir, 'merchant-history.json');
                try { if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true }); } catch {}
                fs.writeFileSync(file, JSON.stringify(store || { entries: [], totals: {}, lastSync: 0 }, null, 2));
                return { ok: true };
            } catch (e: any) {
                return { ok: false, error: e?.message || 'write_failed' };
            }
        });
        // Fallback scraping handlers removed
    }

    // ---- Legacy merchant-history migration ----
    private async migrateLegacyMerchantHistory(): Promise<void> {
        // (Legacy direct session/network helpers removed - delegated to PoeSessionHelper)
    }

    // (Removed legacy direct network helpers)
}

// Start the application
new OverlayApp();

// Helpers outside the class for path resolution might also be methods on the class.