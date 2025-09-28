import { app, BrowserWindow, globalShortcut, ipcMain, screen, Tray, Menu, nativeImage, clipboard, session, net, shell } from 'electron';
import * as os from 'os';
// Optional updater (will be active in packaged builds)
let autoUpdater: any = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch {}
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { ClipboardMonitor } from './clipboard-monitor';
import { ItemParser } from './item-parser';
import { ModifierDatabase } from './modifier-database';
import { KeyboardMonitor } from './keyboard-monitor';

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

class OverlayApp {
    private mainWindow: BrowserWindow | null = null;
    private overlayWindow: BrowserWindow | null = null;
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
    private imageCacheMap: Record<string, string> = {};
    private imageCachePath: string | null = null;

    constructor() {
        app.whenReady().then(async () => {
            // Load core services
            // Resolve initial data path (JSON-only). Prefer env or config; fallback to repo data folder.
            const initialDataPath = this.resolveInitialDataPath();
            this.modifierDatabase = new ModifierDatabase(initialDataPath);
            try { await (this.modifierDatabase as any).load?.(); } catch (e) { console.warn('Failed loading modifier DB', e); }
            this.itemParser = new ItemParser();
            this.clipboardMonitor = new ClipboardMonitor();
            this.keyboardMonitor = new KeyboardMonitor();
            try { this.keyboardMonitor.start(); } catch {}

            this.createOverlayWindow();
            this.createTray();
            this.registerShortcuts();
            this.setupIPC();
            this.setupClipboardMonitoring();
            this.initImageCache();
            try { (this.clipboardMonitor as any).start?.(); } catch {}

            // Auto-update (best-effort)
            try {
                if (autoUpdater) {
                    autoUpdater.autoDownload = true;
                    autoUpdater.autoInstallOnAppQuit = true;
                    autoUpdater.checkForUpdatesAndNotify();
                    autoUpdater.on('update-downloaded', () => {
                        try { this.tray?.displayBalloon?.({ title: 'Update ready', content: 'A new version will install on exit.' }); } catch {}
                    });
                }
            } catch {}

            // Auto clean on quit
            app.on('will-quit', () => {
                try { globalShortcut.unregisterAll(); } catch {}
                try { (this.clipboardMonitor as any).stop?.(); } catch {}
                try { this.keyboardMonitor?.stop(); } catch {}
            });
        });
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
            const devPath = path.join(__dirname, '../../../../data/poe2/Rise of the Abyssal');
            if (fs.existsSync(devPath)) return devPath;
        } catch {}
        try {
            // 4) Packaged resources (electron-builder extraFiles) under process.resourcesPath
            const packaged = path.join(process.resourcesPath || '', 'data/poe2');
            if (fs.existsSync(packaged)) {
                // If there's only one league folder, pick it; else use root
                const entries = fs.readdirSync(packaged).map(f => path.join(packaged, f)).filter(p => fs.statSync(p).isDirectory());
                const abyssal = entries.find(p => /Rise of the Abyssal/i.test(p));
                if (abyssal) return abyssal;
                if (entries.length > 0) return entries[0];
                return packaged; // fall back to root even if empty
            }
        } catch {}
        // 4) Fallback to userData/poe2 (user can place JSONs there)
        const fallback = path.join(this.getUserConfigDir(), 'poe2');
        try { if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true }); } catch {}
        return fallback;
    }

    private initImageCache() {
        try {
            const dir = path.join(app.getPath('userData'), 'image-cache');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            this.imageCachePath = path.join(app.getPath('userData'), 'image-cache-index.json');
            if (fs.existsSync(this.imageCachePath)) {
                try {
                    const raw = JSON.parse(fs.readFileSync(this.imageCachePath, 'utf8'));
                    if (raw && typeof raw === 'object') this.imageCacheMap = raw;
                } catch {}
            }
        } catch {}
    }

    private persistImageCacheMap() {
        try {
            if (!this.imageCachePath) return;
            fs.writeFileSync(this.imageCachePath, JSON.stringify(this.imageCacheMap, null, 0));
        } catch {}
    }

    private async downloadImageToCache(url: string): Promise<string | null> {
        return new Promise(resolve => {
            try {
                if (!this.imageCachePath) this.initImageCache();
                const cacheDir = path.join(app.getPath('userData'), 'image-cache');
                const fname = Buffer.from(url).toString('base64').replace(/[/+=]/g,'').slice(0,48) + path.extname(new URL(url).pathname || '.img');
                const target = path.join(cacheDir, fname || 'img.bin');
                if (fs.existsSync(target) && fs.statSync(target).size > 0) { resolve(target); return; }
                const mod = url.startsWith('https:') ? require('https') : require('http');
                const req = mod.get(url, (res: any) => {
                    if (res.statusCode !== 200) { try { res.resume(); } catch {}; resolve(null); return; }
                    const out = fs.createWriteStream(target);
                    res.pipe(out);
                    out.on('finish', () => { out.close(()=> resolve(target)); });
                    out.on('error', () => { try { fs.unlinkSync(target); } catch {}; resolve(null); });
                });
                req.on('error', () => resolve(null));
            } catch { resolve(null); }
        });
    }

    private getDataDir(): string {
        // Prefer current DB setting
        try { return (this.modifierDatabase as any).getDataPath?.() || this.dataDirCache || this.resolveInitialDataPath(); } catch {}
        return this.dataDirCache || this.resolveInitialDataPath();
    }

    private getUserConfigDir(): string {
        const base = app.getPath('userData');
        const dir = path.join(base, 'overlay');
        try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch {}
        return dir;
    }
    
    // Safely send an event to the overlay renderer, retrying briefly until it's loaded
    private safeSendToOverlay(channel: string, ...args: any[]) {
        this.sendToOverlayWithRetry(channel, args, 10);
    }

    private sendToOverlayWithRetry(channel: string, args: any[], tries: number) {
        try {
            if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;
            if (this.overlayLoaded) {
                this.overlayWindow.webContents.send(channel, ...args);
                return;
            }
            if (tries > 0) {
                setTimeout(() => this.sendToOverlayWithRetry(channel, args, tries - 1), 150);
            }
        } catch {}
    }

    // Persist and restore overlay window bounds
    private loadWindowBounds(): { x?: number; y?: number; width?: number; height?: number } | null {
        try {
            const configDir = this.getUserConfigDir();
            const configPath = path.join(configDir, 'window-bounds.json');
            if (fs.existsSync(configPath)) {
                const raw = fs.readFileSync(configPath, 'utf8');
                const obj = JSON.parse(raw);
                if (obj && typeof obj === 'object') return obj;
            }
        } catch {}
        return null;
    }

    private saveWindowBounds(): void {
        try {
            if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;
            const bounds = this.overlayWindow.getBounds();
            const configDir = this.getUserConfigDir();
            if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
            const configPath = path.join(configDir, 'window-bounds.json');
            fs.writeFileSync(configPath, JSON.stringify(bounds, null, 2));
        } catch (error) {
            console.error('Error saving window bounds:', error);
        }
    }
    private createTray() {
        // Try to use packaged icon; fallback to placeholder if missing
        let trayIcon: Electron.NativeImage | null = null;
        try {
            // In prod, process.resourcesPath points to resources folder; the ico is copied beside app as per config
            // We look relative to __dirname (dist/main) first, then fallback to process.resourcesPath, then project root.
            const candidatePaths = [
                path.join(process.resourcesPath || '', 'xile512.ico'),
                path.join(__dirname, '..', '..', 'xile512.ico'),
                path.join(process.cwd(), 'packages', 'overlay', 'xile512.ico')
            ].filter(p => !!p);
            for (const pth of candidatePaths) {
                try { if (fs.existsSync(pth)) { trayIcon = nativeImage.createFromPath(pth); break; } } catch {}
            }
        } catch {}
        if (!trayIcon || trayIcon.isEmpty()) {
            const placeholder = Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABYUlEQVRYR+2WwQ3CMBBF/4oAUgAJIAGkAAmgABJAAkgAJIAG0qXQm5mQx2tW1vJvce7M9nHfT0S2JgIIYQQQgghhBBCL4A0yX8gJX6AE2A3wE5gDdA3kJmYDTJ17G0Q+u+J6AK6BrV3Q5T6I27wfWZ3vNJTQdD5WWgG1bYx1iZ8AsxQ6L5KbAEOuAvxwD0WwgrXcB2Pyc/B4nWkB8kXgJd3EItgFv6dL+y7JvBButlTB4QXhu7tyeII7wyb+K4HI1EawySGR4p+Hj6xV8Kf6bH0M7d2LZg55i1DYwFKwhbMHDfN9CH8HxtSV/T9OQpB2gXtCfgT6AKqgCqgCqoAqoAqsA5u2p90vUS6oMteYgz1xTsy7soE5FMX57N0w5re2kc4Tkm9Apu1y3bqk8J7Tb9DhK4aN6HuPgS1Bf6GvoM1Ay6R+QSs8g/An0CtMZoZhBBCCCGEEEIIIYT8QvwB6PCXh38XNbcAAAAASUVORK5CYII=', 'base64');
            trayIcon = nativeImage.createFromBuffer(placeholder);
        }
        // Resize for tray use (Windows often expects 16x16 / 24x24); we keep original if square and <=32.
        if (trayIcon.getSize().width > 32) trayIcon = trayIcon.resize({ width: 24, height: 24 });
        this.tray = new Tray(trayIcon);

        const openAndFocus = (panel: string) => {
            // panel values: 'modifier','crafting','character','items'
            this.toggleOverlayWithAllCategory();
            setTimeout(()=>{
                if(!this.overlayWindow) return;
                switch(panel){
                    case 'modifier':
                        this.safeSendToOverlay('set-active-tab','modifiers');
                        break;
                    case 'crafting':
                        this.safeSendToOverlay('set-active-category','Uniques');
                        break;
                    case 'character':
                        this.safeSendToOverlay('set-active-category','Keystones');
                        break;
                    case 'items':
                        this.safeSendToOverlay('set-active-category','Bases');
                        break;
                }
            },120); // slight delay to ensure renderer ready
        };

        const contextMenu = Menu.buildFromTemplate([
            { label: 'XileHUD (F12)', enabled: false },
            { type: 'separator' },
            { label: 'Modifier', click: () => openAndFocus('modifier') },
            { label: 'Crafting', click: () => openAndFocus('crafting') },
            { label: 'Character', click: () => openAndFocus('character') },
            { label: 'Items', click: () => openAndFocus('items') },
            { type: 'separator' },
            { label: 'Reload data (JSON)', click: () => (this.modifierDatabase as any).reload?.() },
            { label: 'Open data folder', click: () => shell.openPath(this.getDataDir()) },
            { label: 'Check for app updates', click: () => {
                try {
                    if (autoUpdater) autoUpdater.checkForUpdatesAndNotify();
                    else shell.openExternal('https://github.com/your-org/your-repo/releases');
                } catch { shell.openExternal('https://github.com/your-org/your-repo/releases'); }
            } },
            { type: 'separator' },
            { label: 'Show/Hide (F12)', click: () => this.toggleOverlayWithAllCategory() },
            { type: 'separator' },
            { label: 'Quit', click: () => app.quit() }
        ]);

    this.tray.setToolTip('XileHUD');
        this.tray.setContextMenu(contextMenu);
        this.tray.on('double-click', () => this.toggleOverlayWithAllCategory());
    }

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
            // Ensure Referer/User-Agent for CDN (some assets may enforce hotlink policy)
            ses.webRequest.onBeforeSendHeaders((details, cb) => {
                if (/cdn\.poe2db\.tw\/image\//i.test(details.url)) {
                    const headers = { ...details.requestHeaders };
                    // Only add if missing to avoid duplication
                    if (!headers['Referer'] && !headers['referer']) headers['Referer'] = 'https://poe2db.tw/us';
                    // Provide a stable UA (some 403s can be UA related when empty)
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
                    if (this.imageCacheMap[url]) return { ok: true, cached: this.imageCacheMap[url] };
                    const dest = await this.downloadImageToCache(url);
                    if (dest) { this.imageCacheMap[url] = dest; this.persistImageCacheMap(); return { ok: true, cached: dest }; }
                    return { ok: false };
                } catch (e) { return { ok: false, error: (e as Error).message }; }
            });
            ipcMain.handle('get-cached-image', (_e, url: string) => {
                if (url && this.imageCacheMap[url] && fs.existsSync(this.imageCacheMap[url])) {
                    return { path: this.imageCacheMap[url] };
                }
                return { path: null };
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

        // Track load state to queue events safely
        this.overlayWindow.webContents.on('did-finish-load', () => {
            this.overlayLoaded = true;
            if (this.pendingItemData) {
                this.safeSendToOverlay('clear-filters');
                this.safeSendToOverlay('item-data', this.pendingItemData);
                this.pendingItemData = null;
            }
        });

        // Add robust click-outside detection using window blur event
        this.overlayWindow.on('blur', () => {
            setTimeout(() => {
                if (this.overlayWindow && !this.overlayWindow.isFocused() && !this.overlayWindow.isDestroyed()) {
                    if (!this.pinned && this.isOverlayVisible) {
                        console.log('Hiding overlay due to blur event (click outside)');
                        this.hideOverlay();
                    }
                }
            }, 100);
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


    private registerShortcuts() {
        // Toggle overlay visibility with F12
        globalShortcut.register('F12', () => {
            this.toggleOverlayWithAllCategory();
        });

        // NOTE: We intentionally do NOT register Escape globally anymore, because that prevented PoE from seeing it.
        // Overlay can still be hidden by: F12, clicking outside (blur) or future in-window ESC handling via IPC.

        // Do NOT register Ctrl+C globally to avoid breaking copy in-game/OS.

        // New: Capture hovered item and open overlay with Ctrl+Q
        // This arms a short clipboard window and (optionally) simulates Ctrl+C
        globalShortcut.register('CommandOrControl+Q', () => {
            this.captureItemFromGame();
        });
    }

    private setupClipboardMonitoring() {
        if (!this.clipboardMonitor) return;
        this.clipboardMonitor.on('poe2-item-copied', async (itemText: string) => {
            // Only react while we are armed by our own shortcut (Ctrl+Q)
            const now = Date.now();
            const allowPinnedPassive = this.pinned && this.isOverlayVisible;
            if (!allowPinnedPassive) {
                if (!this.armedCaptureUntil || now > this.armedCaptureUntil) {
                    return; // ignore unsolicited clipboard changes (other overlays, apps)
                }
            }
            // Honor recent Ctrl+C if keyboard monitor active
            if (this.keyboardMonitor?.available) {
                const now = Date.now();
                if (!this.lastCopyTimestamp || now - this.lastCopyTimestamp > 1600) {
                    if (!allowPinnedPassive) return; // stale copy event
                }
            }
            try {
                const parsed = await this.itemParser.parse(itemText);
                if (parsed && parsed.category && parsed.category !== 'unknown') {
                    // Unique items: open Uniques panel and attempt to focus the item
                        if ((parsed.rarity || '').toLowerCase() === 'unique') {
                            this.showUniqueItem(parsed, allowPinnedPassive);
                            this.armedCaptureUntil = 0;
                            return;
                        }
                    let modifiers: any[] = [];
                    try { modifiers = await this.modifierDatabase.getModifiersForCategory(parsed.category); } catch {}
                    this.safeSendToOverlay('set-active-category', parsed.category);
                    this.showOverlay({ item: parsed, modifiers }, { silent: allowPinnedPassive });
                    this.armedCaptureUntil = 0;
                } else {
                    if (!allowPinnedPassive) this.showOverlay();
                    this.armedCaptureUntil = 0;
                }
            } catch (e) {
                console.warn('Parse failed, showing overlay generic', e);
                if (!allowPinnedPassive) this.showOverlay();
                this.armedCaptureUntil = 0;
            }
        });
    }

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
        try { clipboard.clear(); } catch {}
        try { this.clipboardMonitor.resetLastSeen(); } catch {}
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

    // IPC handlers
    private setupIPC() {
        ipcMain.handle('get-modifier-data', async (event, category: string) => {
            return await this.modifierDatabase.getModifiersForCategory(category);
        });

        ipcMain.handle('search-modifiers', async (event, query: string, category?: string) => {
            return await this.modifierDatabase.searchModifiers(query, category);
        });

        ipcMain.handle('get-all-categories', async (event) => {
            return await this.modifierDatabase.getAllCategories();
        });

        // Data directory helpers (for updating JSONs without rebuilding)
        ipcMain.handle('get-data-dir', async () => {
            return this.getDataDir();
        });
        ipcMain.handle('set-data-dir', async (_e, dirPath: string) => {
            if (typeof dirPath === 'string' && dirPath.trim()) {
                (this.modifierDatabase as any).setDataPath?.(dirPath);
                (this.modifierDatabase as any).reload?.();
                // persist
                try {
                    const cfgDir = this.getUserConfigDir();
                    const cfgPath = path.join(cfgDir, 'overlay-config.json');
                    fs.writeFileSync(cfgPath, JSON.stringify({ dataDir: dirPath }, null, 2));
                } catch {}
                return { ok: true, dataDir: dirPath };
            }
            return { ok: false, error: 'invalid_path' };
        });
        ipcMain.handle('reload-data', async () => {
            try { (this.modifierDatabase as any).reload?.(); return { ok: true }; } catch (e: any) { return { ok: false, error: e?.message||'reload_failed' }; }
        });
        ipcMain.handle('open-data-dir', async () => {
            try { await shell.openPath(this.getDataDir()); return { ok: true }; } catch (e: any) { return { ok: false, error: e?.message||'open_failed' }; }
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

        // Crafting data (Liquid Emotions)
        ipcMain.handle('get-liquid-emotions', async () => {
            try {
                const filePath = path.join(this.getDataDir(), 'Liquid_Emotions.json');
                if (fs.existsSync(filePath)) {
                    const raw = fs.readFileSync(filePath, 'utf-8');
                    return JSON.parse(raw);
                }
                return { error: 'not_found', filePath };
            } catch (e: any) {
                return { error: e?.message || 'unknown_error' };
            }
        });

        // Annoints data
        ipcMain.handle('get-annoints', async () => {
            try {
                const filePath = path.join(this.getDataDir(), 'Annoints.json');
                if (fs.existsSync(filePath)) {
                    const raw = fs.readFileSync(filePath, 'utf-8');
                    return JSON.parse(raw);
                }
                return { error: 'not_found', filePath };
            } catch (e: any) {
                return { error: e?.message || 'unknown_error' };
            }
        });

        // Essences data
        ipcMain.handle('get-essences', async () => {
            try {
                const filePath = path.join(this.getDataDir(), 'Essences.json');
                if (fs.existsSync(filePath)) {
                    const raw = fs.readFileSync(filePath, 'utf-8');
                    return JSON.parse(raw);
                }
                return { error: 'not_found', filePath };
            } catch (e: any) {
                return { error: e?.message || 'unknown_error' };
            }
        });

        // Catalysts data
        ipcMain.handle('get-catalysts', async () => {
            try {
                const filePath = path.join(this.getDataDir(), 'Catalysts.json');
                if (fs.existsSync(filePath)) {
                    const raw = fs.readFileSync(filePath, 'utf-8');
                    return JSON.parse(raw);
                }
                return { error: 'not_found', filePath };
            } catch (e: any) {
                return { error: e?.message || 'unknown_error' };
            }
        });

        // Socketables data
        ipcMain.handle('get-socketables', async () => {
            try {
                const filePath = path.join(this.getDataDir(), 'Socketables.json');
                if (fs.existsSync(filePath)) {
                    const raw = fs.readFileSync(filePath, 'utf-8');
                    return JSON.parse(raw);
                }
                return { error: 'not_found', filePath };
            } catch (e: any) {
                return { error: e?.message || 'unknown_error' };
            }
        });

        // Keywords (Glossar) data
        ipcMain.handle('get-keywords', async () => {
            try {
                const filePath = path.join(this.getDataDir(), 'Keywords.json');
                if (fs.existsSync(filePath)) {
                    const raw = fs.readFileSync(filePath, 'utf-8');
                    return JSON.parse(raw);
                }
                return { error: 'not_found', filePath };
            } catch (e: any) {
                return { error: e?.message || 'unknown_error' };
            }
        });

        // Uniques data
        ipcMain.handle('get-uniques', async () => {
            try {
                const filePath = path.join(this.getDataDir(), 'Uniques.json');
                if (fs.existsSync(filePath)) {
                    const raw = fs.readFileSync(filePath, 'utf-8');
                    return JSON.parse(raw);
                }
                return { error: 'not_found', filePath };
            } catch (e: any) {
                return { error: e?.message || 'unknown_error' };
            }
        });

        // Omens data
        ipcMain.handle('get-omens', async () => {
            try {
                const filePath = path.join(this.getDataDir(), 'Omens.json');
                if (fs.existsSync(filePath)) {
                    const raw = fs.readFileSync(filePath, 'utf-8');
                    return JSON.parse(raw);
                }
                return { error: 'not_found', filePath };
            } catch (e: any) {
                return { error: e?.message || 'unknown_error' };
            }
        });

        // Currency data
        ipcMain.handle('get-currency', async () => {
            try {
                const filePath = path.join(this.getDataDir(), 'Currency.json');
                if (fs.existsSync(filePath)) {
                    const raw = fs.readFileSync(filePath, 'utf-8');
                    return JSON.parse(raw);
                }
                return { error: 'not_found', filePath };
            } catch (e: any) {
                return { error: e?.message || 'unknown_error' };
            }
        });

        // Keystones data
        ipcMain.handle('get-keystones', async () => {
            try {
                const filePath = path.join(this.getDataDir(), 'Keystones.json');
                if (fs.existsSync(filePath)) {
                    const raw = fs.readFileSync(filePath, 'utf-8');
                    return JSON.parse(raw);
                }
                return { error: 'not_found', filePath };
            } catch (e: any) {
                return { error: e?.message || 'unknown_error' };
            }
        });

        // Atlas Nodes data
        ipcMain.handle('get-atlas-nodes', async () => {
            try {
                const filePath = path.join(this.getDataDir(), 'Atlas_Nodes.json');
                if (fs.existsSync(filePath)) {
                    const raw = fs.readFileSync(filePath, 'utf-8');
                    return JSON.parse(raw);
                }
                return { error: 'not_found', filePath };
            } catch (e: any) {
                return { error: e?.message || 'unknown_error' };
            }
        });

        // Gems data (combined)
        ipcMain.handle('get-gems', async () => {
            try {
                const filePath = path.join(this.getDataDir(), 'Gems.json');
                if (fs.existsSync(filePath)) {
                    const raw = fs.readFileSync(filePath, 'utf-8');
                    return JSON.parse(raw);
                }
                return { error: 'not_found', filePath };
            } catch (e: any) {
                return { error: e?.message || 'unknown_error' };
            }
        });

        // Bases data
        try { ipcMain.removeHandler('get-bases'); } catch {}
        ipcMain.handle('get-bases', async () => {
            try {
                const filePath = path.join(this.getDataDir(), 'Bases.json');
                if (fs.existsSync(filePath)) {
                    const raw = fs.readFileSync(filePath, 'utf-8');
                    return JSON.parse(raw);
                }
                return { error: 'not_found', filePath };
            } catch (e: any) {
                return { error: e?.message || 'unknown_error' };
            }
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
            const loggedIn = await this.hasPoeSession();
            if (loggedIn && !this.poeAccountName) {
                this.poeAccountName = await this.tryFetchAccountName();
            }
            return { loggedIn, accountName: this.poeAccountName };
        });

        ipcMain.handle('poe-login', async () => {
            const result = await this.openPoeLoginWindow();
            return result;
        });

        ipcMain.handle('poe-fetch-history', async (_e, league: string) => {
            const { ok, status, data, headers, error } = await this.fetchPoeHistory(league);
            if (ok && !this.poeAccountName) {
                // Opportunistically resolve account name from config/trade page
                this.poeAccountName = await this.tryFetchAccountName();
            }
            return { ok, status, data, headers, error, accountName: this.poeAccountName };
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
        try {
            const newDir = this.getUserConfigDir();
            const newPath = path.join(newDir, 'merchant-history.json');
            // Candidate legacy locations (dev and prod builds)
            const legacyCandidates: string[] = [];
            // Previously: path.join(__dirname, '../../config/merchant-history.json')
            try { legacyCandidates.push(path.join(__dirname, '../../config/merchant-history.json')); } catch {}
            // Also check cwd/config for dev runs
            try { legacyCandidates.push(path.join(process.cwd(), 'config/merchant-history.json')); } catch {}

            // Read new (target) store if exists
            let target: any = { entries: [], totals: {}, lastSync: 0 };
            if (fs.existsSync(newPath)) {
                try { target = JSON.parse(fs.readFileSync(newPath, 'utf8')); } catch {}
            }

            // Merge each legacy file if present
            for (const cand of legacyCandidates) {
                if (!cand) continue;
                if (!fs.existsSync(cand)) continue;
                try {
                    const legacy = JSON.parse(fs.readFileSync(cand, 'utf8'));
                    const merged = this.mergeHistoryStores(target, legacy);
                    target = merged;
                } catch {}
            }

            // If we updated target or if new file didn’t exist, write it
            try { if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true }); } catch {}
            fs.writeFileSync(newPath, JSON.stringify(target || { entries: [], totals: {}, lastSync: 0 }, null, 2));
        } catch {}
    }

    private historyRowKey(r: any): string {
        try {
            const t = r?.time ?? r?.listedAt ?? r?.date ?? '';
            const item = r?.item ?? (r?.data && r.data.item) ?? r;
            const name = item?.name ?? item?.typeLine ?? item?.baseType ?? '';
            return `${String(name)}##${String(t)}`;
        } catch { return JSON.stringify(r); }
    }

    private mergeHistoryStores(a: any, b: any): any {
        const out = { entries: [], totals: {}, lastSync: 0 } as any;
        const entriesA: any[] = Array.isArray(a?.entries) ? a.entries : [];
        const entriesB: any[] = Array.isArray(b?.entries) ? b.entries : [];
        const map = new Map<string, any>();
        for (const e of entriesA) { map.set(this.historyRowKey(e), e); }
        for (const e of entriesB) { map.set(this.historyRowKey(e), e); }
        out.entries = Array.from(map.values());
        // Totals: sum by normalized currency
        const totals: Record<string, number> = {};
        const addTotals = (src: any) => {
            const t = (src?.totals && typeof src.totals === 'object') ? src.totals : {};
            for (const [k, v] of Object.entries(t)) {
                const key = String(k).toLowerCase();
                const num = Number(v || 0);
                totals[key] = (totals[key] || 0) + (isFinite(num) ? num : 0);
            }
        };
        addTotals(a); addTotals(b);
        out.totals = totals;
        out.lastSync = Math.max(Number(a?.lastSync || 0) || 0, Number(b?.lastSync || 0) || 0, Date.now());
        return out;
    }

    // ===== PoE session & network helpers =====
    private async hasPoeSession(): Promise<boolean> {
        try {
            const cookies = await session.defaultSession.cookies.get({ domain: 'pathofexile.com', name: 'POESESSID' });
            return cookies && cookies.length > 0 && !!cookies[0].value;
        } catch (e) {
            return false;
        }
    }

    private async openPoeLoginWindow(): Promise<{ loggedIn: boolean; accountName?: string | null }>{
        // If already logged in, short-circuit
        const already = await this.hasPoeSession();
        if (already) {
            if (!this.poeAccountName) {
                this.poeAccountName = await this.tryFetchAccountName();
            }
            return { loggedIn: true, accountName: this.poeAccountName };
        }

        return new Promise((resolve) => {
            const loginWin = new BrowserWindow({
                width: 900,
                height: 900,
                title: 'Log in to pathofexile.com',
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            });

            const finishIfLoggedIn = async () => {
                const authed = await this.isAuthenticated();
                if (authed) {
                    if (!this.poeAccountName) this.poeAccountName = await this.tryFetchAccountName();
                    try { loginWin.close(); } catch {}
                    resolve({ loggedIn: true, accountName: this.poeAccountName });
                    return true;
                }
                return false;
            };

            loginWin.on('closed', async () => {
                const authed = await this.isAuthenticated();
                if (authed) {
                    if (!this.poeAccountName) this.poeAccountName = await this.tryFetchAccountName();
                    resolve({ loggedIn: true, accountName: this.poeAccountName });
                } else {
                    resolve({ loggedIn: false, accountName: null });
                }
            });

            loginWin.webContents.on('did-navigate', async () => {
                await finishIfLoggedIn();
            });
            loginWin.webContents.on('did-finish-load', async () => {
                await finishIfLoggedIn();
            });

            // Start at trade site to keep context consistent
            loginWin.loadURL('https://www.pathofexile.com/login');
        });
    }

    private async tryFetchAccountName(): Promise<string | null> {
        // Try trade2 page first; look for accountName in bootstrap/config
        try {
            const html = await this.httpGetText('https://www.pathofexile.com/trade2');
            if (html) {
                const m = html.match(/accountName"\s*:\s*"([^"]+)"/i);
                if (m && m[1]) return m[1];
                const m2 = html.match(/\/account\/view-profile\/([^"'\s]+)/i);
                if (m2 && m2[1]) return decodeURIComponent(m2[1]);
            }
        } catch {}
        // Fallback: homepage header
        try {
            const html = await this.httpGetText('https://www.pathofexile.com/');
            const m = html && html.match(/\/account\/view-profile\/([^"'\s]+)/i);
            if (m && m[1]) return decodeURIComponent(m[1]);
        } catch {}
        return null;
    }

    private async fetchPoeHistory(league: string): Promise<{ ok: boolean; status: number; data?: any; headers?: Record<string,string>; error?: string }>{
        const url = `https://www.pathofexile.com/api/trade2/history/${encodeURIComponent(league)}`;
        try {
            const { statusCode, body, headers } = await this.httpGetRaw(url, {
                Accept: 'application/json',
                Referer: 'https://www.pathofexile.com/trade2',
                'X-Requested-With': 'XMLHttpRequest'
            }, 12000);
            if (statusCode === 200) {
                let json: any = null;
                try { json = JSON.parse(body); } catch {}
                return { ok: true, status: statusCode, data: json ?? body, headers };
            }
            if (statusCode === 401 || statusCode === 403) {
                return { ok: false, status: statusCode, error: 'Unauthorized' };
            }
            return { ok: false, status: statusCode, error: `HTTP ${statusCode}` };
        } catch (e: any) {
            return { ok: false, status: 0, error: e?.message || 'Network error' };
        }
    }

    private async fetchPoeHistoryFromPage(): Promise<{ ok: boolean; status: number; entries?: any[]; error?: string }>{
        const url = 'https://www.pathofexile.com/trade2/history';
        try {
            const { statusCode, body } = await this.httpGetRaw(url, {
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                Referer: 'https://www.pathofexile.com/trade2'
            }, 12000);
            if (statusCode !== 200) return { ok: false, status: statusCode, error: `HTTP ${statusCode}` };
            const entries = this.extractEntriesFromHistoryHtml(body) || [];
            return { ok: true, status: statusCode, entries };
        } catch (e: any) {
            return { ok: false, status: 0, error: e?.message || 'Network error' };
        }
    }

    private extractEntriesFromHistoryHtml(html: string): any[] | null {
        // Heuristic extraction: try to find a JSON blob with "entries": [ ... ]
        try {
            // 1) Try application/json script blocks
            const scriptJsonRegex = /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
            let m: RegExpExecArray | null;
            while ((m = scriptJsonRegex.exec(html)) !== null) {
                const txt = (m[1] || '').trim();
                if (txt.includes('"entries"')) {
                    try {
                        const obj = JSON.parse(txt);
                        if (obj && Array.isArray(obj.entries)) return obj.entries;
                        // Some pages embed state like { page: { entries: [...] } }
                        const deep = this.deepFindEntries(obj);
                        if (deep) return deep;
                    } catch {}
                }
            }
            // 2) Fallback: regex find entries array and parse
            const entriesMatch = html.match(/"entries"\s*:\s*\[(.*?)\]/s);
            if (entriesMatch) {
                const arrayStr = '[' + entriesMatch[1] + ']';
                try {
                    const arr = JSON.parse(arrayStr);
                    if (Array.isArray(arr)) return arr;
                } catch {}
            }
        } catch {}
        return null;
    }

    private deepFindEntries(obj: any): any[] | null {
        try {
            if (!obj || typeof obj !== 'object') return null;
            if (Array.isArray((obj as any).entries)) return (obj as any).entries;
            for (const key of Object.keys(obj)) {
                const val = (obj as any)[key];
                const found = this.deepFindEntries(val);
                if (found) return found;
            }
        } catch {}
        return null;
    }

    private async fetchPoeHistoryViaDom(): Promise<{ ok: boolean; status: number; entries?: any[]; error?: string }>{
        let win: BrowserWindow | null = null;
        try {
            win = new BrowserWindow({
                show: false,
                webPreferences: { contextIsolation: true, nodeIntegration: false }
            });
            await win.loadURL('https://www.pathofexile.com/trade2/history');
            const entries = await win.webContents.executeJavaScript(`
                (async function() {
                    function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
                    function norm(s){ return (s||'').replace(/\s+/g,' ').trim(); }
                    function parseFromFilterTitle(span){
                        const txt = norm(span.textContent||'');
                        const soldIdx = txt.toUpperCase().indexOf('SOLD:');
                        const forIdx = txt.toUpperCase().indexOf('FOR:');
                        const name = soldIdx>=0 && forIdx>soldIdx ? txt.substring(soldIdx+5, forIdx).trim() : txt.replace(/^SOLD:\s*/i,'');
                        const tail = forIdx>=0 ? txt.substring(forIdx+4).trim() : '';
                        const timeMatch = tail.match(/(less than a minute ago|an?\s+\w+\s+ago|\d+\s+\w+\s+ago)$/i);
                        const timeText = timeMatch ? timeMatch[0] : '';
                        const pricePart = timeText ? tail.slice(0, tail.length - timeText.length).trim() : tail;
                        const priceMatch = pricePart.match(/([0-9]+(?:[.,][0-9]+)?)\s*x?\s*(.+)$/i);
                        const amount = priceMatch ? priceMatch[1] : '';
                        const currency = priceMatch ? priceMatch[2].trim() : '';
                        let url = '';
                        const parent = span.closest('a[href]') || span.parentElement?.querySelector('a[href]');
                        if (parent && parent.href) url = parent.href;
                        return { item:{name}, price:(amount||currency)?{amount:Number(amount||'0'), currency}:undefined, timeText, url };
                    }
                    // Wait up to ~6s for rows; prioritize list items inside UL/OL
                    let results = [];
                    for (let i=0;i<24;i++){
                        const spans = Array.from(document.querySelectorAll('span.filter-title.filter-title-clickable'));
                        if (spans.length){ results = spans.map(parseFromFilterTitle).filter(x=>x && x.item && x.item.name); }
                        if (results.length===0){
                            // fallback: SOLD/ FOR text
                            const liRows = Array.from(document.querySelectorAll('li')).filter(el => /^\s*SOLD:/i.test((el.textContent||'')) && /FOR:/i.test((el.textContent||'')));
                            results = liRows.map(el=>{
                                const span = el.querySelector('span.filter-title.filter-title-clickable');
                                return span ? parseFromFilterTitle(span) : null;
                            }).filter(Boolean);
                        }
                        if (results.length>0) break;
                        await sleep(300);
                    }
                    return results;
                })();
            `);
            return { ok: true, status: 200, entries: Array.isArray(entries) ? entries : [] };
        } catch (e: any) {
            return { ok: false, status: 0, error: e?.message || 'DOM scrape failed' };
        } finally {
            try { win?.close(); } catch {}
        }
    }

    private async isAuthenticated(): Promise<boolean> {
        // Prefer parsing account name from trade2; else try calling a protected API
        try {
            const name = await this.tryFetchAccountName();
            if (name) return true;
        } catch {}
        try {
            const probe = await this.fetchPoeHistory('Rise of the Abyssal');
            return !!probe.ok && probe.status === 200;
        } catch {
            return false;
        }
    }

    private async httpGetText(url: string, headers?: Record<string,string>): Promise<string> {
        const { body } = await this.httpGetRaw(url, headers, 12000);
        return body;
    }

    private httpGetRaw(url: string, headers?: Record<string,string>, timeoutMs: number = 10000): Promise<{ statusCode: number; headers: Record<string,string>; body: string }>{
        return new Promise((resolve, reject) => {
            const request = net.request({ method: 'GET', url, useSessionCookies: true });
            if (headers) {
                for (const [k, v] of Object.entries(headers)) request.setHeader(k, v);
            }
            const resHeaders: Record<string,string> = {};
            let chunks: Buffer[] = [];
            const timer = setTimeout(() => {
                try { request.abort(); } catch {}
                reject(new Error(`Request timeout after ${timeoutMs}ms`));
            }, timeoutMs);
            request.on('response', (response) => {
                const statusCode = response.statusCode || 0;
                for (const [k, v] of Object.entries(response.headers)) {
                    const val = Array.isArray(v) ? v.join(', ') : (v ?? '').toString();
                    resHeaders[k.toLowerCase()] = val;
                }
                response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
                response.on('end', () => {
                    clearTimeout(timer);
                    resolve({ statusCode, headers: resHeaders, body: Buffer.concat(chunks).toString('utf8') });
                });
            });
            request.on('error', (err) => reject(err));
            request.end();
        });
    }
}

// Start the application
new OverlayApp();

// Helpers outside the class for path resolution might also be methods on the class.