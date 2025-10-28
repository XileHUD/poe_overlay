import { app, BrowserWindow, ipcMain } from 'electron';

// Simple manager to keep all leveling overlay windows always visible and 
// ensure the actively interacted window stays on top of other overlay windows.
// Baseline: all windows are always-on-top at 'pop-up-menu' level and visible on fullscreen.
// Active: elevated to 'screen-saver' level to reliably sit above siblings and borderless games.

type WinEntry = { name: string; win: BrowserWindow };

const windows = new Map<string, BrowserWindow>();
let ipcInstalled = false;
let appHooksInstalled = false;
let lastActiveName: string | null = null;

function safe(fn: () => void) {
  try { fn(); } catch { /* noop */ }
}

export function configureOverlayWindow(win: BrowserWindow) {
  if (!win || win.isDestroyed()) return;

  safe(() => win.setSkipTaskbar(true));
  safe(() => win.setFullScreenable(false));
  // Keep visible even when game is fullscreen
  safe(() => (win as any).setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true }));
  // Baseline on-top level for all overlay windows
  if (process.platform === 'win32') {
    // Windows: use a higher topmost level to sit reliably above borderless games
    safe(() => win.setAlwaysOnTop(true, 'screen-saver', 1));
  } else {
    safe(() => win.setAlwaysOnTop(true, 'pop-up-menu', 1));
  }
}

export function registerOverlayWindow(name: string, win: BrowserWindow) {
  if (!win || win.isDestroyed()) return;
  windows.set(name, win);
  configureOverlayWindow(win);

  // Maintain top-most order on focus/show
  win.on('focus', () => setActiveWindow(name));
  win.on('show', () => setActiveWindow(name));
  // If user clicks into the game (external app), our overlay window blurs. On Windows, the
  // game often reasserts top-of-topmost; re-bump the leveling overlay shortly after.
  if (process.platform === 'win32') {
    win.on('blur', () => {
      // If focus is not on another overlay window, assume it went to the game/another app.
      const focused = BrowserWindow.getFocusedWindow();
      const focusedIsOverlay = focused ? Array.from(windows.values()).some(w => w === focused) : false;
      if (!focusedIsOverlay) {
        setTimeout(() => {
          const leveling = windows.get('leveling');
          if (!leveling || leveling.isDestroyed() || !leveling.isVisible()) return;
          safe(() => leveling.setAlwaysOnTop(true, 'screen-saver', 1));
          safe(() => leveling.moveTop());
        }, 25);
      }
    });
  }
  win.on('closed', () => {
    windows.delete(name);
  });

  // Install IPC once to allow renderer to request fronting on pointer down
  if (!ipcInstalled) {
    ipcInstalled = true;
    try {
      ipcMain.on('overlay-window-focus', (_event, winName: string) => {
        if (typeof winName === 'string') setActiveWindow(winName);
      });
    } catch {}
  }

  // Install app-level hooks (Windows): when our app loses focus to the game, re-bump overlays
  if (process.platform === 'win32' && !appHooksInstalled) {
    appHooksInstalled = true;
    try {
      app.on('browser-window-blur', () => {
        // Defer a bit to let the game assert z-order, then move overlays above it.
        setTimeout(() => {
          const focused = BrowserWindow.getFocusedWindow();
          const focusedIsOverlay = focused ? Array.from(windows.values()).some(w => w === focused) : false;
          if (focusedIsOverlay) return; // Focus just moved to another overlay; no action needed

          // Re-assert topmost for all overlays
          for (const w of windows.values()) {
            if (!w || w.isDestroyed() || !w.isVisible()) continue;
            safe(() => w.setAlwaysOnTop(true, 'screen-saver', 1));
            safe(() => w.moveTop());
          }
          // Ensure last active overlay is on top among overlays
          if (lastActiveName) {
            setActiveWindow(lastActiveName);
          }
        }, 100);
      });
    } catch {}
  }
}

export function unregisterOverlayWindow(name: string) {
  windows.delete(name);
}

export function setActiveWindow(name: string) {
  const active = windows.get(name);
  if (!active || active.isDestroyed()) return;
  lastActiveName = name;

  // Demote others to baseline level; elevate active one
  for (const [n, w] of windows.entries()) {
    if (!w || w.isDestroyed()) continue;
    if (n === name) {
      if (process.platform === 'win32') {
        // Windows: reassert topmost level and bump to top without toggling off,
        // which can race with games grabbing topmost.
        safe(() => w.setAlwaysOnTop(true, 'screen-saver', 1));
        safe(() => w.moveTop());
      } else {
        // macOS/Linux: use higher level for the active overlay and bump in z-order
        safe(() => w.setAlwaysOnTop(true, 'screen-saver', 1));
        safe(() => w.moveTop());
      }
    } else {
      if (process.platform !== 'win32') {
        // Keep others on baseline level (no effect on Windows, reduces flicker elsewhere)
        safe(() => w.setAlwaysOnTop(true, 'pop-up-menu', 1));
      }
    }
  }
}

// Convenience to bring any known window to front explicitly
export function bringToFront(name: string) {
  setActiveWindow(name);
}
