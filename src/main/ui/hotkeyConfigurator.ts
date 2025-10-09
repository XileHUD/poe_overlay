import { BrowserWindow, screen } from 'electron';

export interface HotkeyConfiguratorParams {
  currentKey: string;
  onSave: (newKey: string) => void;
}

export class HotkeyConfigurator {
  private window: BrowserWindow | null = null;
  private capturedKey: string | null = null;

  constructor(private params: HotkeyConfiguratorParams) {}

  show(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.focus();
      return;
    }
    this.createWindow();
  }

  private createWindow(): void {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    this.window = new BrowserWindow({
      width: 400,
      height: 280,
      x: Math.floor((width - 400) / 2),
      y: Math.floor((height - 280) / 2),
      frame: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      title: 'Configure Hotkey',
      backgroundColor: '#1a1a1a',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    this.window.setMenu(null);
    this.window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.buildHtml())}`);

    // Handle keydown events - don't prevent default, just capture
    this.window.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      
      // Ignore modifier-only keys
      if (['Control', 'Meta', 'Command', 'Alt', 'Shift'].includes(input.key)) return;
      
      // Don't prevent default for Enter/Escape as they're handled by buttons
      if (!['Enter', 'Escape'].includes(input.key)) {
        event.preventDefault();
      }
      
      // Map the key
      let key = input.key;
      
      // Handle special keys
      if (key.startsWith('F') && /^F\d+$/.test(key)) {
        // F1-F24 keys
        key = key.toUpperCase();
      } else if (key.length === 1) {
        // Single character - uppercase it
        key = key.toUpperCase();
      } else if (/^[0-9]$/.test(key)) {
        // Number keys
        key = key;
      } else if (key === ' ') {
        key = 'Space';
      } else {
        // For other special keys, capitalize first letter
        key = key.charAt(0).toUpperCase() + key.slice(1);
      }

      // Update the UI to show captured key
      this.capturedKey = key;
      this.window?.webContents.executeJavaScript(`
        document.getElementById('status').textContent = 'Hotkey: ' + '${key}';
        document.getElementById('status').style.color = '#4CAF50';
        document.getElementById('saveBtn').disabled = false;
        document.getElementById('saveBtn').dataset.key = '${key}';
      `);
    });

    this.window.on('closed', () => {
      // If a key was captured and saved, trigger the callback
      if (this.capturedKey) {
        this.params.onSave(this.capturedKey);
        this.capturedKey = null;
      }
      this.window = null;
    });
  }

  private buildHtml(): string {
    const { currentKey } = this.params;
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #1a1a1a;
      color: #e0e0e0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      user-select: none;
    }
    .container {
      text-align: center;
      max-width: 360px;
    }
    h2 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 20px;
      color: #fff;
    }
    .info {
      font-size: 13px;
      color: #999;
      margin-bottom: 8px;
      line-height: 1.5;
    }
    .current {
      font-size: 14px;
      color: #666;
      margin-bottom: 24px;
      font-style: italic;
    }
    #status {
      font-size: 20px;
      font-weight: bold;
      color: #ff9800;
      margin: 20px 0;
      padding: 12px;
      background: #2a2a2a;
      border-radius: 8px;
      border: 2px dashed #444;
      min-height: 50px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .buttons {
      display: flex;
      gap: 12px;
      margin-top: 24px;
      justify-content: center;
    }
    button {
      padding: 10px 24px;
      font-size: 14px;
      font-weight: 600;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }
    #saveBtn {
      background: #4CAF50;
      color: white;
    }
    #saveBtn:hover:not(:disabled) {
      background: #45a049;
    }
    #saveBtn:disabled {
      background: #333;
      color: #666;
      cursor: not-allowed;
    }
    #cancelBtn {
      background: #444;
      color: #e0e0e0;
    }
    #cancelBtn:hover {
      background: #555;
    }
  </style>
</head>
<body>
  <div class="container">
    <h2>Configure Hotkey</h2>
    <div class="info">Press any key to set your new hotkey</div>
  <div class="info" style="font-weight: 600; color: #ff9800;">Tip: You can use a single key or add Ctrl/Cmd in settings.</div>
  <div class="current">Current: ${currentKey}</div>
    
    <div id="status">Waiting for key press...</div>
    
    <div class="buttons">
      <button id="cancelBtn">Cancel</button>
      <button id="saveBtn" disabled data-key="">Save</button>
    </div>
  </div>

  <script>
    const { ipcRenderer } = require('electron');
    
    // Focus window to ensure key capture
    window.focus();
    
    document.getElementById('saveBtn').addEventListener('click', () => {
      const key = document.getElementById('saveBtn').dataset.key;
      if (key) {
        // Close window and trigger save callback
        window.close();
      }
    });
    
    document.getElementById('cancelBtn').addEventListener('click', () => {
      window.close();
    });
    
    // Also allow Enter to save when button is enabled
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const saveBtn = document.getElementById('saveBtn');
        if (!saveBtn.disabled) {
          saveBtn.click();
        }
      } else if (e.key === 'Escape') {
        window.close();
      }
    });
  </script>
</body>
</html>
    `;
  }
}
