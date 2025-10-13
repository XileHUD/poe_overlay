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
      focusable: false,
      resizable: false,
      hasShadow: false,
      webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false },
    });

    // Set higher z-order to appear above overlay - use 'pop-up-menu' level which is above 'screen-saver'
    try {
      this.window.setAlwaysOnTop(true, 'pop-up-menu');
    } catch (e) {
      console.warn('[FloatingButton] Failed to set z-order:', e);
    }

  // Accept clicks, but do not take focus
  this.window.setIgnoreMouseEvents(false);
  try { this.window.setFocusable(false); } catch {}
    this.window.loadURL(this.buildHtml());

    this.window.on('moved', () => { 
      if (!this.isPinned) {
        this.savePosition();
      }
    });
    this.window.on('closed', () => { 
      this.window = null; 
    });
  }

  private getTargetSize() { 
    if (this.isPinned) return { w: 40, h: 40 };
    // Always show large preview when unpinned (dragging or not)
    return { w: 180, h: 180 };
  }

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
  
  /* State-based visibility */
  body.pinned .drag-container { display:none; }
  body.pinned .drag-surface { display:none; }
  body.pinned .main-button { display:flex; }
  body.pinned .drag-preview { display:none; }
  
  body.unpinned .drag-container { display:none; }
  body.unpinned .drag-surface { display:block; }
  body.unpinned .main-button { display:none; }
  body.unpinned .drag-preview { display:flex; }
  
  .container { position:relative; width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:transparent; padding:4px; }
  .drag-surface { position:absolute; inset:0 44px 0 0; -webkit-app-region:drag; cursor:move; z-index:0; }
  
  /* Unpinned state - compact instructions */
  .drag-container { 
    flex-direction:row; 
    align-items:center; 
    padding:12px 16px; 
    background:linear-gradient(135deg, rgba(15,17,24,0.97), rgba(20,22,30,0.97)); 
    border:2px solid rgba(94,129,244,0.5); 
    border-radius:12px; 
    box-shadow:0 4px 20px rgba(0,0,0,0.6), 0 0 0 1px rgba(94,129,244,0.2), inset 0 1px 0 rgba(255,255,255,0.05); 
    gap:10px; 
    z-index:1;
    backdrop-filter: blur(8px);
    max-width:100%;
    position:relative;
  }
  
  .instruction-text { 
    font-size:10.5px; 
    color:#7b9eff; 
    text-shadow:0 1px 3px rgba(0,0,0,0.8); 
    white-space:nowrap; 
    line-height:1.5; 
    font-weight:500;
    letter-spacing:0.3px;
  }
  
  .close-button {
    position:absolute;
    top:6px;
    right:6px;
    width:18px;
    height:18px;
    border-radius:50%;
    background:linear-gradient(135deg, rgba(30,32,40,0.95), rgba(35,37,45,0.95));
    border:1.5px solid rgba(244,67,54,0.4);
    display:flex;
    align-items:center;
    justify-content:center;
    cursor:pointer;
    transition:all .25s cubic-bezier(0.4, 0, 0.2, 1);
    font-size:10px;
    color:#ff6b6b;
    box-shadow:0 2px 8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05);
    z-index:12;
    -webkit-app-region:no-drag;
    backdrop-filter: blur(6px);
    font-weight:700;
  }
  
  .close-button:hover {
    background:linear-gradient(135deg, rgba(244,67,54,0.95), rgba(229,57,53,0.95));
    border-color:rgba(244,67,54,1);
    transform:scale(1.15);
    box-shadow:0 3px 12px rgba(244,67,54,0.6), 0 0 12px rgba(244,67,54,0.4);
    color:#fff;
  }
  
  /* Dragging state - large preview showing exact pin position */
  .drag-preview {
    flex-direction:column;
    align-items:center;
    justify-content:center;
    width:100%;
    height:100%;
    background:radial-gradient(circle at center, rgba(15,17,24,0.95), rgba(10,12,18,0.98));
    border:3px solid rgba(94,129,244,0.6);
    border-radius:20px;
    box-shadow:0 8px 32px rgba(0,0,0,0.8), 0 0 0 1px rgba(94,129,244,0.3), inset 0 2px 4px rgba(255,255,255,0.05);
    z-index:1;
    backdrop-filter: blur(12px);
  }
  
  .pin-indicator {
    width:48px;
    height:48px;
    border-radius:50%;
    background:linear-gradient(135deg, rgba(94,129,244,0.3), rgba(123,158,255,0.4));
    border:3px solid rgba(94,129,244,0.8);
    display:flex;
    align-items:center;
    justify-content:center;
    box-shadow:0 4px 16px rgba(94,129,244,0.4), inset 0 -2px 8px rgba(0,0,0,0.3);
    margin-bottom:12px;
    position:relative;
  }
  
  .pin-indicator::before {
    content:'';
    position:absolute;
    width:8px;
    height:8px;
    background:rgba(94,129,244,0.9);
    border-radius:50%;
    box-shadow:0 0 12px rgba(94,129,244,0.8), 0 0 4px rgba(94,129,244,1);
    animation:pulse 1.5s ease-in-out infinite;
  }
  
  @keyframes pulse {
    0%, 100% { transform:scale(1); opacity:1; }
    50% { transform:scale(1.3); opacity:0.7; }
  }
  
  .pin-indicator-text {
    font-size:28px;
    filter:drop-shadow(0 2px 8px rgba(94,129,244,0.6));
  }
  
  .drag-hint {
    font-size:11px;
    color:#7b9eff;
    text-align:center;
    line-height:1.4;
    text-shadow:0 1px 4px rgba(0,0,0,0.9);
    font-weight:500;
    letter-spacing:0.5px;
    margin-top:4px;
  }
  
  /* Pinned state - minimal button */
  .main-button { 
    width:34px; 
    height:34px; 
    border-radius:50%; 
    background:linear-gradient(135deg, rgba(15,17,24,0.97), rgba(20,22,30,0.97)); 
    border:2px solid rgba(94,129,244,0.6); 
    box-shadow:0 4px 16px rgba(0,0,0,0.7), 0 0 0 1px rgba(94,129,244,0.2), inset 0 1px 0 rgba(255,255,255,0.08); 
    align-items:center; 
    justify-content:center; 
    cursor:pointer; 
    transition:all .25s cubic-bezier(0.4, 0, 0.2, 1); 
    position:relative; 
    z-index:1; 
    -webkit-app-region:no-drag;
    backdrop-filter: blur(8px);
  }
  
  .main-button:hover { 
    transform:scale(1.15); 
    border-color:rgba(94,129,244,0.9); 
    box-shadow:0 6px 24px rgba(0,0,0,0.8), 0 0 16px rgba(94,129,244,0.4), inset 0 1px 0 rgba(255,255,255,0.12); 
    background:linear-gradient(135deg, rgba(20,22,30,0.97), rgba(25,27,35,0.97));
  }
  
  .icon { 
    font-size:13px; 
    color:#7b9eff; 
    font-weight:600; 
    text-shadow:0 0 8px rgba(123,158,255,0.6), 0 1px 2px rgba(0,0,0,0.8); 
    letter-spacing:.5px; 
    pointer-events:none; 
  }
  
  .pin-button { 
    position:absolute; 
    top:6px; 
    right:6px; 
    width:20px; 
    height:20px; 
    border-radius:50%; 
    background:linear-gradient(135deg, rgba(30,32,40,0.95), rgba(35,37,45,0.95)); 
    border:1.5px solid rgba(94,129,244,0.4); 
    display:flex; 
    align-items:center; 
    justify-content:center; 
    cursor:pointer; 
    transition:all .25s cubic-bezier(0.4, 0, 0.2, 1); 
    font-size:10px; 
    box-shadow:0 2px 8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05); 
    z-index:10; 
    -webkit-app-region:no-drag;
    backdrop-filter: blur(6px);
  }
  
  body.pinned .pin-button { 
    top:-8px; 
    right:-8px; 
    width:22px;
    height:22px;
    background:linear-gradient(135deg, rgba(94,129,244,0.95), rgba(123,158,255,0.95)); 
    border:2px solid rgba(94,129,244,1); 
    font-size:11px;
    box-shadow:0 3px 12px rgba(94,129,244,0.5), 0 0 8px rgba(94,129,244,0.3);
  }
  
  body.unpinned .pin-button {
    top:8px;
    right:8px;
    width:24px;
    height:24px;
    font-size:12px;
  }
  
  .pin-button:hover { 
    background:linear-gradient(135deg, rgba(94,129,244,0.95), rgba(123,158,255,0.95)); 
    border-color:rgba(123,158,255,1); 
    transform:scale(1.2) rotate(15deg); 
    box-shadow:0 3px 12px rgba(94,129,244,0.6), 0 0 12px rgba(94,129,244,0.4); 
  }
  
  body.unpinned .close-button { 
    display:flex;
    top:8px;
    right:36px;
    width:24px;
    height:24px;
    font-size:12px;
  }
  body.pinned .close-button { display:none; }
</style></head>
<body class="${pinned ? 'pinned' : 'unpinned'}">
  <div class="container">
    <div class="drag-surface"></div>
    <div class="drag-container">
      <div class="instruction-text">Drag to position • Click 📌 to lock</div>
      <div class="close-button" id="closeBtn">✕</div>
    </div>
    <div class="drag-preview">
      <div class="pin-indicator">
        <div class="pin-indicator-text">📌</div>
      </div>
      <div class="drag-hint">Pin will be placed<br/>at this location</div>
    </div>
    <div class="main-button" id="mainBtn"><div class="icon">✕</div></div>
    <div class="pin-button" id="pinBtn">📌</div>
  </div>
  <script>
    const { ipcRenderer } = require('electron');
    const body = document.body;
    const mainBtn = document.getElementById('mainBtn');
    const pinBtn = document.getElementById('pinBtn');
    const closeBtn = document.getElementById('closeBtn');
    
    function setPinned(p){
      body.classList.remove('pinned','unpinned');
      body.classList.add(p ? 'pinned' : 'unpinned');
    }
    
    ipcRenderer.on('floating-button-set-pin', (_,p)=>{ setPinned(p); });
    
    if(mainBtn){ mainBtn.addEventListener('click', e=>{ e.preventDefault(); e.stopPropagation(); ipcRenderer.send('floating-button-clicked'); }); }
    if(pinBtn){ pinBtn.addEventListener('click', e=>{ e.preventDefault(); e.stopPropagation(); ipcRenderer.send('floating-button-pin-toggled'); }); }
    if(closeBtn){ closeBtn.addEventListener('click', e=>{ e.preventDefault(); e.stopPropagation(); ipcRenderer.send('floating-button-close'); }); }
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
      const bounds = this.window.getBounds();
      // Keep center when transitioning to pinned
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      this.window.setBounds({ 
        x: Math.round(centerX - w / 2), 
        y: Math.round(centerY - h / 2), 
        width: w, 
        height: h 
      });
      // Also enforce content size explicitly (some platforms keep old content metrics)
      try { this.window.setContentSize(w, h); } catch {}
      this.updateRendererPin();
    }
  }
}
