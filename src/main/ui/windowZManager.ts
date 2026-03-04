import { app, BrowserWindow, ipcMain } from 'electron';

// ═══════════════════════════════════════════════════════════════════════════════
// Overlay Window Z-Order Manager
// ═══════════════════════════════════════════════════════════════════════════════
//
// STRATEGY:  Use setAlwaysOnTop relativeLevel to control stacking.
//   - All pinned overlays sit at 'screen-saver' level (above borderless games).
//   - The ACTIVE (last-clicked) overlay gets relativeLevel = 2.
//   - All other overlays get relativeLevel = 1.
//   - This guarantees the active window is always on top of other overlays.
//   - NO blur(), NO moveTop() between overlays → no focus jitter → search works.
//
// The browser-window-blur handler ONLY fires when focus leaves the Electron app
// entirely (e.g. user clicks the game).  It re-asserts the always-on-top levels
// so the game can't permanently steal the topmost band.
// ═══════════════════════════════════════════════════════════════════════════════

type WinEntry = {
  name: string;
  win: BrowserWindow;
  pinned?: boolean;
  allowFocus?: boolean;
};

const windows = new Map<string, WinEntry>();
let ipcInstalled = false;
let appHooksInstalled = false;
let lastActiveName: string | null = null;
let windowBeingDragged: string | null = null;

function safe(fn: () => void) {
  try { fn(); } catch { /* noop */ }
}

/** Level used by the OS to keep windows above the game. */
const TOP_LEVEL = process.platform === 'win32' ? 'screen-saver' as const : 'pop-up-menu' as const;

/** Apply base overlay settings (skip-taskbar, focusable, initial always-on-top). */
export function configureOverlayWindow(win: BrowserWindow, pinned: boolean = true, allowFocus: boolean = false) {
  if (!win || win.isDestroyed()) return;

  safe(() => win.setSkipTaskbar(true));
  safe(() => win.setFullScreenable(false));
  safe(() => (win as any).setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true }));

  // Non-focusable prevents the window from stealing OS focus from the game.
  // Exception: windows that need keyboard input (settings, tree search, notes).
  if (!allowFocus && typeof (win as any).setFocusable === 'function') {
    safe(() => (win as any).setFocusable(false));
  }

  if (pinned) {
    safe(() => win.setAlwaysOnTop(true, TOP_LEVEL, 1));
  } else {
    safe(() => win.setAlwaysOnTop(false));
  }
}

export function registerOverlayWindow(name: string, win: BrowserWindow, pinned: boolean = true, allowFocus: boolean = false) {
  if (!win || win.isDestroyed()) return;
  windows.set(name, { name, win, pinned, allowFocus });
  configureOverlayWindow(win, pinned, allowFocus);

  // ── drag tracking (prevent z-order changes while dragging) ─────────────
  win.on('will-move', () => { windowBeingDragged = name; });
  win.on('moved', () => { setTimeout(() => { windowBeingDragged = null; }, 100); });
  win.on('closed', () => { windows.delete(name); if (windowBeingDragged === name) windowBeingDragged = null; });

  // ── IPC: renderer asks to bring a window to front ──────────────────────
  if (!ipcInstalled) {
    ipcInstalled = true;
    try {
      ipcMain.on('overlay-window-focus', (_event, winName: string) => {
        if (typeof winName === 'string' && !windowBeingDragged) {
          setActiveWindow(winName);
        }
      });
    } catch {}
  }

  // ── App-level hook: re-assert topmost when the GAME steals focus ───────
  if (process.platform === 'win32' && !appHooksInstalled) {
    appHooksInstalled = true;
    try {
      app.on('browser-window-blur', () => {
        if (windowBeingDragged) return;

        // Wait a tick, then check whether focus is still inside our app.
        // If it is (user clicked a different overlay), do nothing.
        // If it left (game got focus), re-assert the always-on-top levels.
        setTimeout(() => {
          const focused = BrowserWindow.getFocusedWindow();
          if (focused && !focused.isDestroyed()) {
            // Focus is still on one of our windows — nothing to do.
            for (const entry of windows.values()) {
              if (entry.win === focused) return;
            }
          }

          // Focus left the app → re-assert always-on-top for all pinned overlays.
          reassertLevels();
        }, 150);
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

/**
 * Mark a window as the active (topmost) overlay.
 * Uses relativeLevel to guarantee z-order — no blur/focus manipulation.
 */
export function setActiveWindow(name: string) {
  if (windowBeingDragged) return;
  const activeEntry = windows.get(name);
  if (!activeEntry?.win || activeEntry.win.isDestroyed()) return;
  lastActiveName = name;
  reassertLevels();
}

/** Convenience alias. */
export function bringToFront(name: string) {
  setActiveWindow(name);
}

/**
 * Set relativeLevel = 2 on the active window, 1 on all others.
 * Only touches pinned, visible, non-destroyed windows.
 */
function reassertLevels() {
  for (const entry of windows.values()) {
    if (!entry.pinned) continue;
    const w = entry.win;
    if (!w || w.isDestroyed() || !w.isVisible()) continue;
    const level = (entry.name === lastActiveName) ? 2 : 1;
    safe(() => w.setAlwaysOnTop(true, TOP_LEVEL, level));
  }
}

