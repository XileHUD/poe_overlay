import { BrowserWindow, ipcMain, screen } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { buildHistoryPopoutHtml } from '../popouts/historyPopoutTemplate';

export interface HistoryPopoutDeps {
  getUserConfigDir(): string;
  overlayWindow: () => BrowserWindow | null;
  historyPopoutWindowRef: { current: BrowserWindow | null };
  logPath: string;
}

function appendDebug(logPath: string, msg: string) {
  try {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(logPath, line);
    console.log('[HISTORY-POPOUT]', msg);
  } catch {}
}

export function registerHistoryPopoutIpc(deps: HistoryPopoutDeps) {
  const { historyPopoutWindowRef, overlayWindow, logPath } = deps;

  try { ipcMain.removeHandler('open-history-popout'); } catch {}
  ipcMain.handle('open-history-popout', async (_e, payload: any) => {
    try {
      if (historyPopoutWindowRef.current && !historyPopoutWindowRef.current.isDestroyed()) {
        appendDebug(logPath, 'Reusing existing history popout – sending update payload');
        historyPopoutWindowRef.current.focus();
        historyPopoutWindowRef.current.webContents.send('update-history-popout', payload);
        return { ok: true, exists: true };
      }
      const json = JSON.stringify(payload || {});
      appendDebug(logPath, `Opening new history popout. Payload bytes=${json.length}`);

      // Anchor relative to overlay
      let baseX = 120, baseY = 120;
      try {
        const ov = overlayWindow();
        if (ov && !ov.isDestroyed()) {
          const b = ov.getBounds();
          baseX = b.x + b.width + 8;
          baseY = b.y;
          const disp = screen.getPrimaryDisplay();
          const sw = disp.workArea.width || disp.workAreaSize.width;
          const sh = disp.workArea.height || disp.workAreaSize.height;
          if (baseX + 380 > sw) baseX = Math.max(12, b.x - 380 - 8);
          if (baseY + 600 > sh) baseY = Math.max(20, sh - 620);
          appendDebug(logPath, `Computed window position x=${baseX} y=${baseY}`);
        }
      } catch (e: any) { appendDebug(logPath, 'Position computation error: ' + e?.message); }

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
        backgroundColor: '#00000000',
        show: true,
        webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, '../preload.js') }
      });
      appendDebug(logPath, 'BrowserWindow constructed');
      win.webContents.on('did-start-loading', () => appendDebug(logPath, 'did-start-loading'));
      win.webContents.on('did-finish-load', () => appendDebug(logPath, 'did-finish-load'));
      win.webContents.on('dom-ready', () => appendDebug(logPath, 'dom-ready'));
      win.webContents.on('did-fail-load', (_e2, code, desc) => appendDebug(logPath, `did-fail-load code=${code} desc=${desc}`));
      win.on('unresponsive', () => appendDebug(logPath, 'window unresponsive'));
      win.on('closed', () => { appendDebug(logPath, 'window closed'); historyPopoutWindowRef.current = null; });
      historyPopoutWindowRef.current = win;

      const html = buildHistoryPopoutHtml();
      win.loadURL('data:text/html;base64,' + Buffer.from(html, 'utf8').toString('base64'));
      appendDebug(logPath, 'Called loadURL with skeleton HTML (length=' + html.length + ')');

      const payloadClone = payload ? JSON.parse(JSON.stringify(payload)) : {};
      win.webContents.once('did-finish-load', () => {
        try {
          appendDebug(logPath, 'Sending payload via IPC. items=' + (payloadClone?.items?.length || 0));
          win.webContents.send('update-history-popout', payloadClone);
        } catch (err: any) {
          appendDebug(logPath, 'Error sending payload IPC: ' + err?.message);
        }
      });
      return { ok: true, exists: false };
    } catch (e: any) {
      appendDebug(logPath, 'Exception in open-history-popout: ' + (e?.message || e));
      return { ok: false, error: e?.message || 'failed' };
    }
  });

  try { ipcMain.removeHandler('history-popout-debug-log'); } catch {}
  ipcMain.handle('history-popout-debug-log', (_e, msg?: string) => {
    if (msg) appendDebug(logPath, 'RENDERER: ' + msg);
    return { ok: true };
  });

  try { ipcMain.removeHandler('get-history-popout-debug-log'); } catch {}
  ipcMain.handle('get-history-popout-debug-log', async () => {
    try { return { ok: true, log: fs.readFileSync(logPath, 'utf8') }; } catch (e: any) { return { ok: false, error: e?.message }; }
  });

  try { ipcMain.removeHandler('refresh-history-popout'); } catch {}
  ipcMain.handle('refresh-history-popout', async () => {
    const ov = overlayWindow();
    if (ov && !ov.isDestroyed()) {
      ov.webContents.send('request-history-popout-refresh');
    }
    return { ok: true };
  });

  try { ipcMain.removeHandler('send-history-to-popout'); } catch {}
  ipcMain.handle('send-history-to-popout', async (_e, payload: any) => {
    const win = historyPopoutWindowRef.current;
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-history-popout', payload);
    }
    return { ok: true };
  });
}
