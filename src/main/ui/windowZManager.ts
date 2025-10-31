import { app, BrowserWindow, ipcMain } from 'electron';

// Improved overlay window manager
// Key: Use setFocusable(false) to prevent focus fighting while keeping windows interactive
// Windows stay always-on-top and clickable, but don't steal focus from the game

type WinEntry = { 
  name: string; 
  win: BrowserWindow; 
  pinned?: boolean;
  allowFocus?: boolean; // For windows that need text input (settings)
};

const windows = new Map<string, WinEntry>();
let ipcInstalled = false;
let appHooksInstalled = false;
let lastActiveName: string | null = null;
let windowBeingDragged: string | null = null;

function safe(fn: () => void) {
  try { fn(); } catch { /* noop */ }
}

export function configureOverlayWindow(win: BrowserWindow, pinned: boolean = true, allowFocus: boolean = false) {
  if (!win || win.isDestroyed()) return;

  safe(() => win.setSkipTaskbar(true));
  safe(() => win.setFullScreenable(false));
  // Keep visible even when game is fullscreen
  safe(() => (win as any).setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true }));
  
  // CRITICAL: Non-focusable windows to prevent focus fighting
  // Exception: Settings window needs focus for text inputs
  if (!allowFocus && typeof (win as any).setFocusable === 'function') {
    safe(() => (win as any).setFocusable(false));
  }
  
  // DO NOT set clickthrough - users need to interact with windows!
  // Only the main overlay uses clickthrough
  
  // Only set always-on-top if pinned
  if (pinned) {
    // Baseline on-top level for all overlay windows
    if (process.platform === 'win32') {
      // Windows: use screen-saver level to sit reliably above borderless games
      safe(() => win.setAlwaysOnTop(true, 'screen-saver', 1));
    } else {
      safe(() => win.setAlwaysOnTop(true, 'pop-up-menu', 1));
    }
  } else {
    safe(() => win.setAlwaysOnTop(false));
  }
}

export function registerOverlayWindow(name: string, win: BrowserWindow, pinned: boolean = true, allowFocus: boolean = false) {
  if (!win || win.isDestroyed()) return;
  windows.set(name, { name, win, pinned, allowFocus });
  configureOverlayWindow(win, pinned, allowFocus);

  // Track drag start to prevent z-order changes during drag
  win.on('will-move', () => {
    windowBeingDragged = name;
  });

  // Track drag end
  win.on('moved', () => {
    // Small delay to ensure drag is complete before re-enabling z-order changes
    setTimeout(() => {
      windowBeingDragged = null;
    }, 100);
  });

  win.on('closed', () => {
    windows.delete(name);
    if (windowBeingDragged === name) {
      windowBeingDragged = null;
    }
  });

  // Install IPC once to allow renderer to request focus changes
  if (!ipcInstalled) {
    ipcInstalled = true;
    try {
      // Bring window to front on mousedown (z-order only, no focus change)
      ipcMain.on('overlay-window-focus', (_event, winName: string) => {
        if (typeof winName === 'string' && !windowBeingDragged) {
          setActiveWindow(winName);
        }
      });
    } catch {}
  }

  // Install app-level hooks (Windows): when our app loses focus to the game, re-assert topmost
  if (process.platform === 'win32' && !appHooksInstalled) {
    appHooksInstalled = true;
    try {
      app.on('browser-window-blur', () => {
        // Don't interfere if a window is being dragged
        if (windowBeingDragged) return;
        
        // Defer a bit to let the game assert z-order, then move overlays above it.
        setTimeout(() => {
          // Re-assert topmost for all pinned overlays
          for (const entry of windows.values()) {
            if (!entry || !entry.pinned) continue; // Only re-bump if pinned
            const w = entry.win;
            if (!w || w.isDestroyed() || !w.isVisible()) continue;
            safe(() => w.setAlwaysOnTop(true, 'screen-saver', 1));
            safe(() => w.moveTop());
          }
          // Ensure last active overlay is on top among overlays
          if (lastActiveName) {
            const activeEntry = windows.get(lastActiveName);
            if (activeEntry && activeEntry.win && !activeEntry.win.isDestroyed()) {
              safe(() => activeEntry.win.moveTop());
            }
          }
        }, 100);
      });
    } catch {}
  }
}

export function unregisterOverlayWindow(name: string) {
  windows.delete(name);
}

export function updateOverlayWindowPinned(name: string, pinned: boolean, allowFocus: boolean = false) {
  const entry = windows.get(name);
  if (!entry) return;
  
  entry.pinned = pinned;
  configureOverlayWindow(entry.win, pinned, allowFocus);
}

export function setActiveWindow(name: string) {
  // Don't change z-order while a window is being dragged
  if (windowBeingDragged) return;
  
  const activeEntry = windows.get(name);
  if (!activeEntry) return;
  const active = activeEntry.win;
  if (!active || active.isDestroyed()) return;
  lastActiveName = name;

  // Simply move the active window to top without changing always-on-top level
  // This is cleaner and avoids focus fighting
  if (activeEntry.pinned) {
    safe(() => active.moveTop());
  }
}

// Convenience to bring any known window to front explicitly
export function bringToFront(name: string) {
  setActiveWindow(name);
}

