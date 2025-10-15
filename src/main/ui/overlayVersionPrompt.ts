import { BrowserWindow, ipcMain, screen, app } from 'electron';
import { isOverlayVersion, type OverlayVersion } from '../../types/overlayVersion.js';

const SELECT_CHANNEL = 'overlay-version-select';
const QUIT_CHANNEL = 'overlay-version-quit';

export async function showOverlayVersionPrompt(): Promise<OverlayVersion> {
  return new Promise((resolve) => {
    let settled = false;
    let allowClose = false;

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const promptWidth = 480;
  const promptHeight = 380;
    const window = new BrowserWindow({
      width: promptWidth,
      height: promptHeight,
      x: Math.round(width / 2 - promptWidth / 2),
      y: Math.round(height / 2 - promptHeight / 2),
      resizable: false,
      movable: true,
      frame: false,
      transparent: true,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    const cleanup = () => {
      try { ipcMain.removeAllListeners(SELECT_CHANNEL); } catch {}
      try { ipcMain.removeAllListeners(QUIT_CHANNEL); } catch {}
    };

    const finalize = (version: OverlayVersion) => {
      if (settled) return;
      settled = true;
      cleanup();
      allowClose = true;
      try {
        if (!window.isDestroyed()) {
          window.close();
        }
      } catch {}
      resolve(version);
    };

    window.on('close', (event) => {
      if (!allowClose) {
        event.preventDefault();
        try { window.focus(); } catch {}
      }
    });

    window.on('closed', () => {
      cleanup();
      if (!settled) {
        settled = true;
        resolve('poe2');
      }
    });

    ipcMain.once(SELECT_CHANNEL, (_event, rawChoice: unknown) => {
      const choice = isOverlayVersion(rawChoice) ? rawChoice : 'poe2';
      finalize(choice);
    });

    ipcMain.once(QUIT_CHANNEL, () => {
      cleanup();
      allowClose = true;
      try {
        if (!window.isDestroyed()) {
          window.close();
        }
      } catch {}
      app.quit();
    });

    window.once('ready-to-show', () => {
      try {
        window.show();
        window.focus();
      } catch {}
    });

    try { window.setMenu(null); } catch {}

    const html = buildOverlayVersionPromptHtml();
    window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  });
}

function buildOverlayVersionPromptHtml(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      --bg-primary: rgba(18, 20, 27, 0.94);
      --bg-card: rgba(32, 35, 45, 0.95);
      --border-color: rgba(255, 200, 125, 0.35);
      --text-primary: #ffffff;
      --text-secondary: #cfd4ff;
      --accent-orange: #ffbd6b;
      --accent-blue: #4a9eff;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      padding: 24px;
      font-family: 'Segoe UI', Roboto, Arial, sans-serif;
      background: transparent;
      color: var(--text-primary);
      user-select: none;
      overflow: hidden;
      height: 100%;
    }

    .container {
      position: relative;
      padding: 28px 26px 24px;
      border-radius: 16px;
      background: var(--bg-primary);
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
    }

    h1 {
      margin: 0 0 8px;
      font-size: 20px;
      font-weight: 600;
      color: var(--accent-orange);
    }

    p.subtitle {
      margin: 0 0 18px;
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    .choices {
      display: flex;
      gap: 16px;
      margin-bottom: 20px;
    }

    .choice {
      flex: 1;
      padding: 20px 18px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: var(--bg-card);
      color: var(--text-primary);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 14px;
      transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
    }

    .choice:hover {
      transform: translateY(-2px);
      border-color: var(--accent-blue);
      box-shadow: 0 12px 32px rgba(74, 158, 255, 0.2);
    }

    .choice-title {
      font-size: 17px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .choice-title span.badge {
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(74, 158, 255, 0.22);
      color: var(--accent-blue);
      font-size: 12px;
      font-weight: 600;
    }

    .note {
      font-size: 12px;
      color: rgba(255, 232, 195, 0.92);
      margin: 12px 0 18px;
      line-height: 1.5;
    }

    .note strong {
      color: var(--accent-orange);
    }

    .quit-btn {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: rgba(255, 255, 255, 0.65);
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 12px;
      cursor: pointer;
      transition: border-color 0.18s ease, color 0.18s ease;
    }

    .quit-btn:hover {
      border-color: rgba(255, 120, 120, 0.6);
      color: rgba(255, 150, 150, 0.95);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Choose Your Overlay</h1>
    <p class="subtitle">Pick the Path of Exile version you want this overlay to support. The other game's data stays unloaded.</p>

    <div class="choices">
      <button class="choice" data-version="poe1" type="button">
        <div class="choice-title"><span class="badge">1</span>Path of Exile 1</div>
      </button>
      <button class="choice" data-version="poe2" type="button">
        <div class="choice-title"><span class="badge">2</span>Path of Exile 2</div>
      </button>
    </div>

    <p class="note"><strong>You can change this later</strong> from Settings → Splash. Each version keeps its own features and data; the other game's files stay completely unloaded. Switching games asks for a quick overlay restart.</p>

    <button class="quit-btn" id="quitBtn" type="button">Quit overlay</button>
  </div>

  <script>
    (function() {
      const { ipcRenderer } = require('electron');
      const choices = document.querySelectorAll('.choice');
      choices.forEach((choice) => {
        choice.addEventListener('click', () => {
          const version = choice.getAttribute('data-version');
          if (!version) return;
          ipcRenderer.send('${SELECT_CHANNEL}', version);
        });
      });

      const quitBtn = document.getElementById('quitBtn');
      quitBtn.addEventListener('click', () => {
        ipcRenderer.send('${QUIT_CHANNEL}');
      });
    })();
  </script>
</body>
</html>
  `;
}
