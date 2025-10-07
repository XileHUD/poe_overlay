import { BrowserWindow, screen } from 'electron';
import { SettingsService } from '../services/settingsService.js';

export interface FloatingButtonParams { settingsService: SettingsService; }

export class FloatingButton {
  private window: BrowserWindow | null = null;
  private isPinned = false;
  private settingsService: SettingsService;

  constructor(params: FloatingButtonParams) {
    this.settingsService = params.settingsService;
    const saved = this.settingsService.get('floatingButton');
    this.isPinned = saved?.pinned ?? false;
  }

  show(): void {
    if (this.window && !this.window.isDestroyed()) { this.window.show(); return; }
    this.createWindow();
    this.settingsService.update('floatingButton', c => ({ ...c, enabled: true }));
  }

  hide(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.savePosition();
      this.window.close();
      this.window = null;
    }
    this.settingsService.update('floatingButton', c => ({ ...c, enabled: false }));
  }

  toggle(): void { this.isVisible() ? this.hide() : this.show(); }
  isVisible(): boolean { return !!this.window && !this.window.isDestroyed() && this.window.isVisible(); }

  private createWindow(): void {
    const saved = this.settingsService.get('floatingButton');
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const x = saved?.position?.x ?? Math.round(width / 2 - 60);
    const y = saved?.position?.y ?? Math.round(height / 2 - 30);

    // Start with current pinned size
    const { w, h } = this.getTargetSize();

    this.window = new BrowserWindow({
      width: w,
      height: h,
      x,
      y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      hasShadow: false,
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    });

    this.window.setIgnoreMouseEvents(false);
    this.window.loadURL(this.buildHtml());

    this.window.on('moved', () => { if (!this.isPinned) this.savePosition(); });
    this.window.on('closed', () => { this.window = null; });
  }

  private getTargetSize() { return this.isPinned ? { w: 34, h: 34 } : { w: 120, h: 60 }; }

  private savePosition(): void {
    if (!this.window || this.window.isDestroyed()) return;
    const b = this.window.getBounds();
    this.settingsService.update('floatingButton', c => ({
      enabled: c?.enabled ?? true,
      position: { x: b.x, y: b.y },
      pinned: this.isPinned,
    }));
  }

  private buildHtml(): string {
    const pinned = this.isPinned;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8" />
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:100%; height:100%; overflow:hidden; background:transparent; user-select:none; -webkit-user-select:none; }
  body { font-family:'Segoe UI', Roboto, Arial, sans-serif; }
  body.pinned .drag-container { display:none; }
  body.pinned .drag-surface { display:none; }
  body.pinned .main-button { display:flex; }
  body.unpinned .drag-container { display:flex; }
  body.unpinned .drag-surface { display:block; }
  body.unpinned .main-button { display:none; }
  .container { position:relative; width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:transparent; }
  .drag-surface { position:absolute; inset:0 28px 0 0; -webkit-app-region:drag; cursor:move; z-index:0; }
  .drag-container { flex-direction:row; align-items:center; padding:8px 10px; background:rgba(10,12,18,0.95); border:1.5px solid rgba(156,100,250,0.7); border-radius:8px; box-shadow:0 0 12px rgba(0,0,0,0.8),0 0 4px rgba(156,100,250,0.5); gap:8px; z-index:1; }
  .instruction-text { font-size:9px; color:#9c64fa; text-shadow:0 0 4px rgba(156,100,250,0.6); white-space:nowrap; line-height:1.3; }
  .main-button { width:28px; height:28px; border-radius:50%; background:rgba(10,12,18,0.95); border:1.5px solid rgba(156,100,250,0.7); box-shadow:0 0 12px rgba(0,0,0,0.8),0 0 4px rgba(156,100,250,0.5); align-items:center; justify-content:center; cursor:pointer; transition:all .2s; position:relative; z-index:1; -webkit-app-region:no-drag; }
  .main-button:hover { transform:scale(1.1); border-color:rgba(156,100,250,0.95); box-shadow:0 0 16px rgba(0,0,0,0.9),0 0 8px rgba(156,100,250,0.7); }
  .icon { font-size:12px; color:#9c64fa; font-weight:bold; text-shadow:0 0 6px rgba(156,100,250,0.8); letter-spacing:.3px; pointer-events:none; }
  .pin-button { position:absolute; top:4px; right:4px; width:16px; height:16px; border-radius:50%; background:rgba(60,60,80,0.9); border:1px solid rgba(100,100,120,0.6); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all .2s; font-size:9px; box-shadow:0 2px 4px rgba(0,0,0,0.6); z-index:10; -webkit-app-region:no-drag; }
  body.pinned .pin-button { top:-6px; right:-6px; background:rgba(156,100,250,0.95); border:1px solid rgba(156,100,250,1); font-size:7px; }
  .pin-button:hover { background:rgba(156,100,250,0.95); border-color:rgba(156,100,250,1); transform:scale(1.15); box-shadow:0 2px 6px rgba(156,100,250,0.5); }
</style></head>
<body class="${pinned ? 'pinned' : 'unpinned'}">
  <div class="container">
    <div class="drag-surface"></div>
    <div class="drag-container"><div class="instruction-text">Drag to position<br/>Click 📌 to lock</div></div>
    <div class="main-button" id="mainBtn"><div class="icon">X</div></div>
    <div class="pin-button" id="pinBtn">📌</div>
  </div>
  <script>
    const { ipcRenderer } = require('electron');
    const body = document.body;
    const mainBtn = document.getElementById('mainBtn');
    const pinBtn = document.getElementById('pinBtn');
    // Resize awareness: renderer just stretches to window bounds.
    function setPinned(p){
      body.classList.toggle('pinned', p); body.classList.toggle('unpinned', !p);
    }
    ipcRenderer.on('floating-button-set-pin', (_,p)=>{ setPinned(p); });
    if(mainBtn){ mainBtn.addEventListener('click', e=>{ e.preventDefault(); e.stopPropagation(); ipcRenderer.send('floating-button-clicked'); }); }
    if(pinBtn){ pinBtn.addEventListener('click', e=>{ e.preventDefault(); e.stopPropagation(); ipcRenderer.send('floating-button-pin-toggled'); }); }
  </script>
</body></html>`;
    return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
  }

  private updateRendererPin(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('floating-button-set-pin', this.isPinned);
    }
  }

  togglePin(): void {
    this.isPinned = !this.isPinned;
    // Persist state
    this.settingsService.update('floatingButton', c => ({
      enabled: c?.enabled ?? true,
      position: c?.position,
      pinned: this.isPinned,
    }));
    // Adjust size without recreating window
    if (this.window && !this.window.isDestroyed()) {
      const { w, h } = this.getTargetSize();
      const { x, y } = this.window.getBounds();
      // Apply new outer window size
      this.window.setBounds({ x, y, width: w, height: h });
      // Also enforce content size explicitly (some platforms keep old content metrics)
      try { this.window.setContentSize(w, h); } catch {}
      this.updateRendererPin();
    }
  }
}
