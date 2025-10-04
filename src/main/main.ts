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
    private imageCacheMap: Record<string, string> = {};
    private imageCachePath: string | null = null;
    private shortcutAwaitingCapture = false; // tracks if current Ctrl+Q press is still waiting for an item
    private pendingCategory: string | null = null; // category queued before overlay loads
    private pendingTab: string | null = null; // tab to activate after load (e.g. 'modifiers')
    private modPopoutWindows: Set<BrowserWindow> = new Set();
    private lastPopoutSpawnAt: number = 0;
    private historyPopoutWindow: BrowserWindow | null = null;

    constructor() {
        app.whenReady().then(async () => {
            this.showSplash('Initializing...');
            // Resolve data path early
            const initialDataPath = this.resolveInitialDataPath();
            this.modifierDatabase = new ModifierDatabase(initialDataPath, false); // defer load
            // Kick off async loading without blocking rest of startup
            (async () => {
                await this.modifierDatabase.loadAsync(msg => this.updateSplash(msg));
                this.updateSplash('Modifiers loaded');
            })();
            this.updateSplash('Starting parsers');
            this.itemParser = new ItemParser();
            this.clipboardMonitor = new ClipboardMonitor();
            this.keyboardMonitor = new KeyboardMonitor();
            try { this.keyboardMonitor.start(); } catch {}

            this.updateSplash('Creating overlay window');
            this.createOverlayWindow();
            this.updateSplash('Creating tray');
            this.createTray();
            this.updateSplash('Registering shortcuts');
            this.registerShortcuts();
            this.updateSplash('Setting up services');
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

            // Finalize splash
            this.updateSplash('Loaded and ready (running in background)');
            // Keep the final ready message visible a bit longer so users notice
            setTimeout(()=> this.closeSplash(), 3000);
        });
    }

    private showSplash(initial: string) {
        try {
            if (this.splashWindow) return;
            const { width, height } = screen.getPrimaryDisplay().workAreaSize;
            this.splashWindow = new BrowserWindow({
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
            // Minimal splash (no logo) – emphasize product name with subtle gradient
                                    const html = `<!DOCTYPE html><html><head><meta charset='utf-8'/><title>XileHUD</title>
                                    <style>
                                    :root { color-scheme: dark; }
                                    body { margin:0; font-family: system-ui, Arial, sans-serif; background: rgba(0,0,0,0); color:#d6d6dc; width:100%; height:100%; }
                                    .wrap { position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:100%; max-width:340px; padding:16px 22px 20px; box-sizing:border-box; display:flex; flex-direction:column; align-items:center; gap:11px; background:rgba(18,18,22,0.94); border:1px solid #2e2e35; border-radius:16px; box-shadow:0 6px 22px -8px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.02); backdrop-filter:blur(6px); }
                                    .title { font-size:22px; font-weight:650; letter-spacing:1px; background:linear-gradient(90deg,#cdb8ff,#a98eff 55%,#7b5fff); -webkit-background-clip:text; color:transparent; filter:drop-shadow(0 1px 2px rgba(0,0,0,0.55)); text-align:center; }
                                    .subtitle { font-size:11px; opacity:0.60; letter-spacing:0.6px; margin-top:-6px; text-transform:uppercase; text-align:center; }
                                    .status { font-size:12px; opacity:0.90; min-height:18px; text-align:center; max-width:300px; line-height:1.35; padding-top:2px; }
                                    .spinner { width:22px; height:22px; border:3px solid #3f3f47; border-top-color:#b190ff; border-radius:50%; animation:spin 0.85s linear infinite; filter:drop-shadow(0 0 3px rgba(111,84,255,0.35)); }
                                    @keyframes spin { to { transform:rotate(360deg);} }
                                    .ready { color:#92ff9d; font-weight:520; }
                                    .fade-in { animation:fadeIn .35s ease-out; }
                                    @keyframes fadeIn { from { opacity:0; transform:translateY(4px);} to { opacity:1; transform:translateY(0);} }
                                    </style></head><body>
                                    <div class='wrap fade-in'>
                                        <div class='title'>XILEHUD</div>
                                        <div class='subtitle'>Overlay is starting…</div>
                                        <div class='spinner' id='sp'></div>
                                        <div class='status' id='st'></div>
                                    </div>
                                    <script>document.getElementById('st').textContent=${JSON.stringify(initial)};</script>
                                    </body></html>`;
            this.splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
        } catch (e) { console.warn('splash create failed', e); }
    }

    private updateSplash(msg: string) {
        try {
            if (!this.splashWindow || this.splashWindow.isDestroyed()) return;
            this.splashWindow.webContents.executeJavaScript(`(function(){ const st=document.getElementById('st'); if(st) st.textContent=${JSON.stringify(msg)}; })();`).catch(()=>{});
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
        // Attempt to crop transparent padding so the visible glyph appears larger in the tray.
        try {
            if (trayIcon) {
                const size = trayIcon.getSize();
                if (size.width <= 0 || size.height <= 0) throw new Error('invalid icon size');
                // Only crop if icon is large (e.g. 64+); .ico may include padding that makes it look tiny.
                if (size.width >= 48 && size.height >= 48) {
                    const buf = trayIcon.toBitmap(); // BGRA
                    const stride = size.width * 4;
                    let minX = size.width, minY = size.height, maxX = 0, maxY = 0;
                    for (let y = 0; y < size.height; y++) {
                        for (let x = 0; x < size.width; x++) {
                            const idx = y * stride + x * 4;
                            const a = buf[idx + 3];
                            if (a > 16) { // treat > ~6% alpha as visible
                                if (x < minX) minX = x;
                                if (y < minY) minY = y;
                                if (x > maxX) maxX = x;
                                if (y > maxY) maxY = y;
                            }
                        }
                    }
                    const hasContent = maxX >= minX && maxY >= minY;
                    if (hasContent) {
                        // Add a tiny padding (2px) to avoid clipping glow
                        minX = Math.max(0, minX - 2); minY = Math.max(0, minY - 2);
                        maxX = Math.min(size.width - 1, maxX + 2); maxY = Math.min(size.height - 1, maxY + 2);
                        const cropWidth = maxX - minX + 1;
                        const cropHeight = maxY - minY + 1;
                        if (cropWidth > 8 && cropHeight > 8 && (cropWidth < size.width || cropHeight < size.height)) {
                            trayIcon = trayIcon.crop({ x: minX, y: minY, width: cropWidth, height: cropHeight });
                        }
                    }
                }
                // Prefer a target around 32 logical px for clarity; let Windows downscale internally.
                const finalSize = trayIcon.getSize();
                if (finalSize.width > 64) {
                    trayIcon = trayIcon.resize({ width: 64, height: 64, quality: 'best' });
                }
            }
        } catch (e) { console.warn('Tray icon crop/resize failed', e); }
        this.tray = new Tray(trayIcon);

        const contextMenu = Menu.buildFromTemplate([
            { label: 'XileHUD (Ctrl+Q)', enabled: false },
            { type: 'separator' },
            { label: 'Modifiers', click: () => { this.toggleOverlayWithAllCategory(); setTimeout(()=> { this.safeSendToOverlay('set-active-tab','modifiers'); }, 140); } },
            { label: 'Merchant History', click: () => { this.toggleOverlayWithAllCategory(); setTimeout(()=> { this.safeSendToOverlay('set-active-tab','history'); this.safeSendToOverlay('invoke-action','merchant-history'); },180); } },
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
            { label: 'Show/Hide (Ctrl+Q)', click: () => this.toggleOverlayWithAllCategory() },
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


    private registerShortcuts() {
        try { globalShortcut.unregister('F12'); } catch {}
        try { globalShortcut.unregister('CommandOrControl+Shift+Q'); } catch {}
        globalShortcut.register('CommandOrControl+Q', () => this.startShortcutCapture());
        // New shortcut: Ctrl+Shift+Q opens overlay focused on Merchant History
        globalShortcut.register('CommandOrControl+Shift+Q', () => {
            // If already visible just refocus & switch tab; else toggle open
            if (!this.isOverlayVisible) {
                this.showOverlay();
                // Small delay to allow renderer to finish initial show before tab switch
                setTimeout(() => {
                    this.safeSendToOverlay('set-active-tab','history');
                    this.safeSendToOverlay('invoke-action','merchant-history');
                }, 180);
            } else {
                try { this.overlayWindow?.focus(); } catch {}
                this.safeSendToOverlay('set-active-tab','history');
                this.safeSendToOverlay('invoke-action','merchant-history');
            }
        });
    }

    private startShortcutCapture() {
        const wasVisible = this.isOverlayVisible;
        const now = Date.now();
        this.pendingCategory = null;
        this.pendingItemData = null;
        this.pendingTab = null;
        this.shortcutAwaitingCapture = true;
        this.lastCopyTimestamp = now;        
        // Extend armed window to allow re-copy attempts and slower clipboard population
        this.armedCaptureUntil = now + 1600; 
        try { this.clipboardMonitor.resetLastSeen(); } catch {}

        // Capture baseline (old) clipboard text so we can ignore stale content
        let baseline = '';
        try { baseline = (clipboard.readText()||'').trim(); } catch {}
        // Clear clipboard so any new copy is definitely detected
        try { clipboard.clear(); } catch {}

        // First simulated copy BEFORE any decision / focus changes
        this.trySimulateCtrlC();

        // Perform a focused capture attempt (poll up to ~550ms, ignoring baseline)
        this.performImmediateCapture(baseline).then(async result => {
            // If we failed to parse AND clipboard still equals baseline (or empty), try a second copy
            const stillBaseline = (() => {
                try {
                    const curr = (clipboard.readText()||'').trim();
                    return !result.parsed && (!curr || curr === baseline);
                } catch { return !result.parsed; }
            })();
            if (stillBaseline) {
                // Retry copy once after a short delay
                await new Promise(r=>setTimeout(r,90));
                this.trySimulateCtrlC();
                // Second window (~400ms)
                const retry = await this.performImmediateCapture(baseline);
                if (retry.parsed) {
                    result = retry; // adopt successful retry
                }
            }
            this.shortcutAwaitingCapture = false;
            const parsed = result?.parsed;
            if (parsed && parsed.category && parsed.category !== 'unknown') {
                // SUCCESS PATH
                if (!wasVisible) this.showOverlay();
                const isSocketable = parsed.category === 'Socketables';
                if (isSocketable) {
                    // Directly open crafting -> socketables, skip modifiers flash
                    this.safeSendToOverlay('set-active-tab','crafting');
                    this.safeSendToOverlay('invoke-action','socketables');
                } else {
                    this.safeSendToOverlay('set-active-tab','modifiers');
                    if ((parsed.rarity||'').toLowerCase()==='unique') {
                        this.showUniqueItem(parsed, false);
                    } else {
                        this.safeSendToOverlay('set-active-category', parsed.category);
                        (async () => {
                            let modifiers: any[] = [];
                            try { modifiers = await this.modifierDatabase.getModifiersForCategory(parsed.category); } catch {}
                            this.safeSendToOverlay('item-data', { item: parsed, modifiers });
                        })();
                    }
                }
                // Disarm further clipboard-driven fallback once we succeeded
                this.armedCaptureUntil = 0;
                return; // Prevent fallback override
            } else {
                // FALLBACK PATH
                if (!wasVisible) this.showOverlay();
                this.safeSendToOverlay('set-active-tab','modifiers');
                this.safeSendToOverlay('set-active-category','Gloves_int');
                // Disarm after fallback as well
                this.armedCaptureUntil = 0;
            }
        });
        // If overlay already visible we don't hide/show yet; capture function will update it when done.
    }

    // Poll clipboard briefly and attempt to parse; returns parsed item or null
    private async performImmediateCapture(baseline?: string): Promise<{ raw: string|null; parsed: any|null }> {
        let lastRaw = '';
        const deadline = Date.now() + 550; // extended budget for slower clipboard population
        while (Date.now() < deadline) {
            let raw: string = '';
            try { raw = (clipboard.readText()||'').trim(); } catch {}
            // Ignore if unchanged, too short, or matches baseline (old) content
            if (raw && raw.length > 25 && raw !== lastRaw && (!baseline || raw !== baseline)) {
                lastRaw = raw;
                try {
                    const parsed = await this.itemParser.parse(raw);
                    if (parsed && parsed.category && parsed.category !== 'unknown') {
                        return { raw, parsed };
                    }
                } catch {}
            }
            await new Promise(r=>setTimeout(r,22));
        }
        return { raw: lastRaw || null, parsed: null };
    }

    // Fast capture logic used by Ctrl+Q; returns true if an item opened a specific category
    // Legacy fast loop removed (replaced by performImmediateCapture in simplified flow)

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
                            this.shortcutAwaitingCapture = false;
                            return;
                        }
                    const isSocketable = parsed.category === 'Socketables';
                    if (isSocketable) {
                        // Direct crafting view for socketables
                        this.safeSendToOverlay('set-active-tab','crafting');
                        this.safeSendToOverlay('invoke-action','socketables');
                        this.showOverlay(undefined, { silent: allowPinnedPassive });
                    } else {
                        let modifiers: any[] = [];
                        try { modifiers = await this.modifierDatabase.getModifiersForCategory(parsed.category); } catch {}
                        this.safeSendToOverlay('set-active-category', parsed.category);
                        if (!this.overlayLoaded) this.pendingCategory = parsed.category;
                        this.showOverlay({ item: parsed, modifiers }, { silent: allowPinnedPassive });
                        if (!this.overlayLoaded) this.pendingItemData = { item: parsed, modifiers };
                    }
                    this.armedCaptureUntil = 0;
                    this.shortcutAwaitingCapture = false;
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

        // Ascendancy Passives data
        ipcMain.handle('get-ascendancy-passives', async () => {
            try {
                const filePath = path.join(this.getDataDir(), 'Ascendancy_Passives.json');
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
                const html = `<!DOCTYPE html><html><head><meta charset='utf-8'/><title>Mods</title>
<style>
html,body{margin:0;padding:0;font-family:Segoe UI,Arial,sans-serif;font-size:12px;color:#ddd;background:rgba(20,22,26,0.92);-webkit-user-select:none;}
.window{display:flex;flex-direction:column;height:100%;}
.header{font-weight:600;padding:4px 8px;background:rgba(40,44,52,0.9);cursor:default;-webkit-app-region:drag;display:flex;align-items:center;gap:6px;}
.title{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px;}
.close{width:18px;height:18px;line-height:16px;text-align:center;border:1px solid #555;border-radius:4px;background:rgba(60,64,72,0.75);cursor:pointer;-webkit-app-region:no-drag;}
.close:hover{background:#c0392b;border-color:#e74c3c;color:#fff;}
.content{padding:6px 8px;overflow:auto;flex:1;}
.mod{margin-bottom:6px;border:1px solid #333;border-radius:4px;padding:4px 6px;background:rgba(30,34,40,0.6);} 
.mod:last-child{margin-bottom:0;}
.mod-text{font-size:11px;line-height:1.25;margin-bottom:4px;color:#fafafa;}
.tiers{display:flex;flex-direction:column;gap:3px;}
.tier{display:flex;align-items:center;gap:6px;font-size:10px;background:rgba(55,60,70,0.55);padding:2px 4px;border-radius:3px;}
.badge{background:#444;padding:1px 6px;border-radius:4px;font-size:10px;color:#eee;line-height:1.2;}
.badge-tier{background:#b71c1c;font-weight:600;}
.badge-ilvl{background:#455a64;}
.badge-weight{background:#3949ab;}
::-webkit-scrollbar{width:8px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:#444;border-radius:4px;}::-webkit-scrollbar-thumb:hover{background:#555;}
</style>
</head><body><div class='window'><div class='header'><div class='title'></div><div class='close' onclick='window.close()'>×</div></div><div class='content'></div></div>
<script>
// Safe UTF-8 base64 decode to avoid mojibake like â€“ characters
function decodeUtf8(b64){const bin=atob(b64);const len=bin.length;const bytes=new Uint8Array(len);for(let i=0;i<len;i++)bytes[i]=bin.charCodeAt(i);try{return new TextDecoder('utf-8').decode(bytes);}catch{return bin;}}
try{const raw=decodeUtf8('${b64}');const data=JSON.parse(raw);document.querySelector('.title').textContent=data.title||'Mods';const cont=document.querySelector('.content');
const normalize=(s)=>String(s||'').replace(/[\uFFFD]/g,'').replace(/\s+/g,' ').trim();
if(Array.isArray(data.mods)&&data.mods.length){data.mods.forEach(m=>{const wrap=document.createElement('div');wrap.className='mod';const mt=document.createElement('div');mt.className='mod-text';mt.textContent=m.text||'';wrap.appendChild(mt);if(Array.isArray(m.tiers)&&m.tiers.length){const tl=document.createElement('div');tl.className='tiers';m.tiers.forEach(tr=>{const line=document.createElement('div');line.className='tier';// Order: Tier (red) - text - iLvl - Weight
const tierSpan=document.createElement('span');tierSpan.className='badge badge-tier';tierSpan.textContent='T'+(tr.tier||'');line.appendChild(tierSpan);
const textSpan=document.createElement('span');textSpan.style.flex='1';textSpan.textContent=normalize(tr.text||'');line.appendChild(textSpan);
if(tr.ilvl){const il=document.createElement('span');il.className='badge badge-ilvl';il.textContent='iLvl '+tr.ilvl;line.appendChild(il);} if(tr.weight){const w=document.createElement('span');w.className='badge badge-weight';w.textContent=String(tr.weight);line.appendChild(w);} tl.appendChild(line);});wrap.appendChild(tl);}cont.appendChild(wrap);});} else { cont.textContent='No mods'; }}
catch(err){console.error(err);document.querySelector('.content').textContent='Failed to load';}
</script></body></html>`;
                win.loadURL('data:text/html;base64,' + Buffer.from(html, 'utf8').toString('base64'));
                return { ok: true };
            } catch (e: any) {
                return { ok: false, error: e?.message || 'failed' };
            }
        });

        // Open history popout window
        try { ipcMain.removeHandler('open-history-popout'); } catch {}
        ipcMain.handle('open-history-popout', async (_e, payload: any) => {
            try {
                // If popout already exists, focus it and update data
                if (this.historyPopoutWindow && !this.historyPopoutWindow.isDestroyed()) {
                    this.historyPopoutWindow.focus();
                    this.historyPopoutWindow.webContents.send('update-history-popout', payload);
                    return { ok: true, exists: true };
                }

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
                        if (baseX + 380 > sw) baseX = Math.max(12, b.x - 380 - 8);
                        if (baseY + 600 > sh) baseY = Math.max(20, sh - 620);
                    }
                } catch {}

                const win = new BrowserWindow({
                    width: 380,
                    height: 600,
                    x: baseX,
                    y: baseY,
                    frame: false,
                    alwaysOnTop: true,
                    skipTaskbar: false,
                    resizable: true,
                    transparent: true,
                    show: true,
                    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.js') }
                });
                
                this.historyPopoutWindow = win;
                win.on('closed', () => { this.historyPopoutWindow = null; });
                
                const html = `<!DOCTYPE html><html><head><meta charset='utf-8'/><title>Merchant History</title>
<style>
html,body{margin:0;padding:0;font-family:Segoe UI,Arial,sans-serif;font-size:12px;color:#ddd;background:rgba(20,22,26,0.95);-webkit-user-select:none;overflow:hidden;}
.window{display:flex;flex-direction:column;height:100vh;}
.header{font-weight:600;padding:6px 10px;background:rgba(40,44,52,0.95);cursor:default;-webkit-app-region:drag;display:flex;align-items:center;gap:8px;border-bottom:1px solid #404040;}
.title{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:#fff;}
.refresh-btn{width:20px;height:20px;line-height:18px;text-align:center;border:1px solid #555;border-radius:4px;background:rgba(60,64,72,0.75);cursor:pointer;-webkit-app-region:no-drag;font-size:14px;padding:0;display:flex;align-items:center;justify-content:center;}
.refresh-btn:hover:not(.disabled){background:#4a9eff;border-color:#4a9eff;color:#fff;}
.refresh-btn.disabled{opacity:0.4;cursor:not-allowed;}
.close{width:20px;height:20px;line-height:18px;text-align:center;border:1px solid #555;border-radius:4px;background:rgba(60,64,72,0.75);cursor:pointer;-webkit-app-region:no-drag;}
.close:hover{background:#c0392b;border-color:#e74c3c;color:#fff;}
.info-bar{padding:4px 10px;background:rgba(30,34,40,0.8);font-size:10px;color:#999;display:flex;gap:8px;align-items:center;border-bottom:1px solid #333;}
.list{flex:1;overflow-y:auto;overflow-x:hidden;}
.history-row{padding:8px 10px;border-bottom:1px solid #2d2d2d;cursor:pointer;transition:background 0.15s;}
.history-row:hover{background:rgba(74,158,255,0.15);}
.history-row.selected{background:rgba(74,158,255,0.25);}
.row-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;}
.item-name{font-weight:600;font-size:11px;color:#fafafa;}
.price{font-size:11px;color:#f0ad4e;}
.row-meta{display:flex;gap:8px;font-size:10px;color:#888;}
.detail{padding:10px;border-top:1px solid #404040;max-height:40%;overflow-y:auto;background:rgba(25,28,32,0.9);}
.detail-item{font-size:11px;line-height:1.4;color:#ddd;}
.no-selection{text-align:center;padding:20px;color:#666;font-size:11px;}
::-webkit-scrollbar{width:6px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:#444;border-radius:3px;}::-webkit-scrollbar-thumb:hover{background:#555;}
.currency-divine{color:#d4af37;}
.currency-exalted{color:#d4af37;}
.currency-annul{color:#b8860b;}
.rarity-unique{color:#af6025;}
.rarity-rare{color:#ffff77;}
.rarity-magic{color:#8888ff;}
.rarity-normal{color:#c8c8c8;}
</style>
</head><body><div class='window'>
<div class='header'><div class='title'>Merchant History</div><button class='refresh-btn' id='refreshBtn' title='Refresh (min 1 min cooldown)'>↻</button><div class='close' onclick='window.close()'>×</div></div>
<div class='info-bar'><span id='infoText'>Loading...</span></div>
<div class='list' id='historyList'></div>
<div class='detail' id='detailPanel' style='display:none;'><div class='detail-item' id='detailContent'></div></div>
</div>
<script>
// Safe UTF-8 base64 decode
function decodeUtf8(b64){const bin=atob(b64);const len=bin.length;const bytes=new Uint8Array(len);for(let i=0;i<len;i++)bytes[i]=bin.charCodeAt(i);try{return new TextDecoder('utf-8').decode(bytes);}catch{return bin;}}

let state = { items: [], selectedIndex: -1, lastRefreshAt: 0, nextRefreshAt: 0 };

function escapeHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function normalizeCurrency(c){const s=String(c||'').toLowerCase();if(s.includes('divine'))return'divine';if(s.includes('exalt'))return'exalted';if(s.includes('annul'))return'annul';return c;}
function toRelativeTime(ts){const now=Date.now();const diff=now-Number(ts);if(diff<60000)return'<1m';if(diff<3600000)return Math.floor(diff/60000)+'m';if(diff<86400000)return Math.floor(diff/3600000)+'h';return Math.floor(diff/86400000)+'d';}

function render(){
  const list=document.getElementById('historyList');
  const info=document.getElementById('infoText');
  if(!state.items||state.items.length===0){list.innerHTML='<div style="padding:20px;text-align:center;color:#666;">No history</div>';info.textContent='0 trades';return;}
  info.textContent=state.items.length+' trades';
  list.innerHTML=state.items.map((it,idx)=>{
    const name=it?.item?.name||it?.item?.typeLine||it?.item?.baseType||'Item';
    const amount=it?.price?.amount??it?.amount??'?';
    const currency=normalizeCurrency(it?.price?.currency??it?.currency??'');
    const curClass=currency?'currency-'+currency:'';
    const time=toRelativeTime(it?.time||it?.listedAt||it?.date||0);
    const rarity=(it?.item?.rarity||'').toLowerCase();
    const rarityClass=rarity?'rarity-'+rarity:'';
    return \`<div class='history-row \${idx===state.selectedIndex?'selected':''}' data-idx='\${idx}'>
      <div class='row-header'>
        <div class='item-name \${rarityClass}'>\${escapeHtml(name)}</div>
        <div class='price \${curClass}'>\${amount} \${currency}</div>
      </div>
      <div class='row-meta'><span>\${time} ago</span></div>
    </div>\`;
  }).join('');
  // Attach click handlers
  document.querySelectorAll('.history-row').forEach(row=>{
    row.addEventListener('click',()=>{
      const idx=parseInt(row.getAttribute('data-idx')||'0',10);
      state.selectedIndex=idx;
      render();
      showDetail(idx);
    });
  });
}

function showDetail(idx){
  const detail=document.getElementById('detailPanel');
  const content=document.getElementById('detailContent');
  if(idx<0||idx>=state.items.length){detail.style.display='none';return;}
  const it=state.items[idx];
  const item=it?.item||{};
  const name=item.name||item.typeLine||item.baseType||'Item';
  const rarity=(item.rarity||'normal').toLowerCase();
  const rarityClass='rarity-'+rarity;
  let html=\`<div style='font-weight:600;font-size:12px;margin-bottom:6px;' class='\${rarityClass}'>\${escapeHtml(name)}</div>\`;
  if(item.baseType&&item.baseType!==name)html+=\`<div style='color:#999;font-size:10px;margin-bottom:4px;'>\${escapeHtml(item.baseType)}</div>\`;
  if(item.ilvl)html+=\`<div style='font-size:10px;color:#888;'>Item Level: \${item.ilvl}</div>\`;
  // Show implicit/explicit mods minimally
  if(Array.isArray(item.implicitMods)&&item.implicitMods.length){
    html+=\`<div style='margin-top:6px;font-size:10px;color:#88f;'>\${item.implicitMods.map(m=>escapeHtml(m)).join('<br>')}</div>\`;
  }
  if(Array.isArray(item.explicitMods)&&item.explicitMods.length){
    html+=\`<div style='margin-top:6px;font-size:10px;color:#8af;'>\${item.explicitMods.map(m=>escapeHtml(m)).join('<br>')}</div>\`;
  }
  content.innerHTML=html;
  detail.style.display='block';
}

function updateRefreshButton(){
  const btn=document.getElementById('refreshBtn');
  const now=Date.now();
  if(now<state.nextRefreshAt){
    btn.classList.add('disabled');
    const sec=Math.ceil((state.nextRefreshAt-now)/1000);
    btn.title='Refresh available in '+sec+'s';
    setTimeout(updateRefreshButton,1000);
  }else{
    btn.classList.remove('disabled');
    btn.title='Refresh (min 1 min cooldown)';
  }
}

// Auto-refresh every 5 minutes
let autoRefreshTimer=null;
function scheduleAutoRefresh(){
  if(autoRefreshTimer)clearTimeout(autoRefreshTimer);
  autoRefreshTimer=setTimeout(()=>{
    const now=Date.now();
    if(now>=state.nextRefreshAt){
      window.electronAPI?.refreshHistoryPopout?.();
    }
    scheduleAutoRefresh();
  },300000); // 5 min
}

// Manual refresh button
document.getElementById('refreshBtn')?.addEventListener('click',()=>{
  const now=Date.now();
  if(now<state.nextRefreshAt)return;
  window.electronAPI?.refreshHistoryPopout?.();
});

// Listen for updates from main process
if(window.electronAPI?.onUpdateHistoryPopout){
  window.electronAPI.onUpdateHistoryPopout((data)=>{
    state.items=data.items||[];
    state.lastRefreshAt=data.lastRefreshAt||Date.now();
    state.nextRefreshAt=data.nextRefreshAt||0;
    render();
    updateRefreshButton();
  });
}

// Initial load
try{
  const raw=decodeUtf8('${b64}');
  const data=JSON.parse(raw);
  state.items=data.items||[];
  state.lastRefreshAt=data.lastRefreshAt||0;
  state.nextRefreshAt=data.nextRefreshAt||0;
  render();
  updateRefreshButton();
  scheduleAutoRefresh();
}catch(err){
  console.error(err);
  document.getElementById('historyList').innerHTML='<div style="padding:20px;text-align:center;color:#d9534f;">Failed to load</div>';
}
</script></body></html>`;
                win.loadURL('data:text/html;base64,' + Buffer.from(html, 'utf8').toString('base64'));
                return { ok: true, exists: false };
            } catch (e: any) {
                return { ok: false, error: e?.message || 'failed' };
            }
        });

        // Refresh history popout
        try { ipcMain.removeHandler('refresh-history-popout'); } catch {}
        ipcMain.handle('refresh-history-popout', async () => {
            // Delegate to overlay to refresh and send back updated data
            if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
                this.overlayWindow.webContents.send('request-history-popout-refresh');
            }
            return { ok: true };
        });

        // Send updated data to popout from overlay
        try { ipcMain.removeHandler('send-history-to-popout'); } catch {}
        ipcMain.handle('send-history-to-popout', async (_e, payload: any) => {
            if (this.historyPopoutWindow && !this.historyPopoutWindow.isDestroyed()) {
                this.historyPopoutWindow.webContents.send('update-history-popout', payload);
            }
            return { ok: true };
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
            // Account name auto-detection removed (HTML scraping disallowed). May be populated by future official API only.
            return { loggedIn, accountName: this.poeAccountName };
        });

        ipcMain.handle('poe-login', async () => {
            const result = await this.openPoeLoginWindow();
            return result;
        });

        ipcMain.handle('poe-fetch-history', async (_e, league: string) => {
            const { ok, status, data, headers, error } = await this.fetchPoeHistory(league);
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
        if (already) return { loggedIn: true, accountName: this.poeAccountName };

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
                    try { loginWin.close(); } catch {}
                    resolve({ loggedIn: true, accountName: this.poeAccountName });
                    return true;
                }
                return false;
            };

            loginWin.on('closed', async () => {
                const authed = await this.isAuthenticated();
                if (authed) {
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
    private async isAuthenticated(): Promise<boolean> {
        // Simplified: rely on protected API call only (HTML parsing removed)
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