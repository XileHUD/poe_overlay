import { app, Tray, Menu, nativeImage, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export interface CreateTrayParams {
  onToggleOverlay: () => void;
  onOpenModifiers: () => void;
  onOpenHistory: () => void;
  getDataDir: () => string;
  reloadData: () => void;
  checkForUpdates: () => void; // wraps autoUpdater or external link
  onQuit?: () => void;
}

export function createTray(params: CreateTrayParams): Tray | null {
  const {
    onToggleOverlay,
    onOpenModifiers,
    onOpenHistory,
    getDataDir,
    reloadData,
    checkForUpdates,
    onQuit
  } = params;

  const DEBUG = process.env.XILEHUD_TRAY_DEBUG === '1';
  const log = (...a: any[]) => { if (DEBUG) console.log('[tray]', ...a); };

  // Resolve icon candidates
  let trayIcon: Electron.NativeImage | null = null;
  let iconPathUsed: string | null = null;
  try {
    const roots = [
      process.resourcesPath || '',
      path.join(process.resourcesPath || '', 'build'),
      path.join(__dirname, '..', '..'),          // dist/main sibling
      path.join(__dirname, '..', '..', '..'),     // one level further (packaging variance)
      path.join(process.cwd(), 'packages', 'overlay'),
      path.join(process.cwd(), 'packages', 'overlay', 'build')
    ];
    const names = ['xile512.ico','icon.ico','xilehudICO.ico'];
    const candidates: string[] = [];
    for (const r of roots) {
      for (const n of names) candidates.push(path.join(r, n));
    }
    const dedup = Array.from(new Set(candidates));
    for (const pth of dedup) {
      try {
        if (fs.existsSync(pth)) {
          iconPathUsed = pth;
          break;
        }
      } catch {}
    }
    if (iconPathUsed) {
      // For .ico let Electron load multi-resolution automatically by passing the path directly.
      if (/\.ico$/i.test(iconPathUsed)) {
        try { trayIcon = nativeImage.createFromPath(iconPathUsed); } catch {}
        log('Using ICO icon', iconPathUsed, trayIcon?.isEmpty() ? 'empty' : 'ok');
      } else {
        try { trayIcon = nativeImage.createFromPath(iconPathUsed); log('Using raster icon', iconPathUsed); } catch {}
      }
    } else {
      log('No icon file found in candidates, will use placeholder.');
    }
  } catch (e) { log('Icon resolution error', e); }
  if (!trayIcon || trayIcon.isEmpty()) {
    const placeholder = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABYUlEQVRYR+2WwQ3CMBBF/4oAUgAJIAGkAAmgABJAAkgAJIAG0qXQm5mQx2tW1vJvce7M9nHfT0S2JgIIYQQQgghhBBCL4A0yX8gJX6AE2A3wE5gDdA3kJmYDTJ17G0Q+u+J6AK6BrV3Q5T6I27wfWZ3vNJTQdD5WWgG1bYx1iZ8AsxQ6L5KbAEOuAvxwD0WwgrXcB2Pyc/B4nWkB8kXgJd3EItgFv6dL+y7JvBButlTB4QXhu7tyeII7wyb+K4HI1EawySGR4p+Hj6xV8Kf6bH0M7d2LZg55i1DYwFKwhbMHDfN9CH8HxtSV/T9OQpB2gXtCfgT6AKqgCqgCqoAqoAqsA5u2p90vUS6oMteYgz1xTsy7soE5FMX57N0w5re2kc4Tkm9Apu1y3bqk8J7Tb9DhK4aN6HuPgS1Bf6GvoM1Ay6R+QSs8g/An0CtMZoZhBBCCCGEEEIIIYT8QvwB6PCXh38XNbcAAAAASUVORK5CYII=', 'base64');
    trayIcon = nativeImage.createFromBuffer(placeholder);
  }

  // Crop transparent padding and resize to proper tray icon size
  const cropAndResize = (img: Electron.NativeImage): Electron.NativeImage => {
    try {
      const { width, height } = img.getSize(); if (!width || !height) return img;
      const buf = img.toBitmap(); const stride = width * 4;
      let minX = width, minY = height, maxX = -1, maxY = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const a = buf[y * stride + x * 4 + 3];
          if (a > 30) { // slightly stricter alpha to ignore faint glow
            if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < minX || maxY < minY) return img;
      // Add a 1px padding border
      minX = Math.max(0, minX - 1); minY = Math.max(0, minY - 1);
      maxX = Math.min(width - 1, maxX + 1); maxY = Math.min(height - 1, maxY + 1);
      const w = maxX - minX + 1; const h = maxY - minY + 1;
      if (w >= width - 2 && h >= height - 2) return img; // cropping negligible
      try {
        const cropped = img.crop({ x: minX, y: minY, width: w, height: h });
        if (!cropped.isEmpty()) {
          // Resize cropped icon to 32x32 for tray (works well on all DPI settings)
          const resized = cropped.resize({ width: 32, height: 32, quality: 'best' });
          if (!resized.isEmpty()) return resized;
          return cropped;
        }
      } catch {}
      return img;
    } catch { return img; }
  };

  // Apply crop and resize to all icons (including ICO) to remove padding
  if (trayIcon) {
    try { trayIcon = cropAndResize(trayIcon); } catch {}
  }

  // No additional scaling applied; let OS scale appropriately.

  let tray: Tray | null = null;
  try {
    // Always pass processed NativeImage to avoid Windows picking a smaller internal sub-icon.
    if (trayIcon) tray = new Tray(trayIcon); else tray = new Tray(nativeImage.createEmpty());
  } catch (e) { console.warn('Failed creating tray', e); return null; }
  log('Tray created using', iconPathUsed || 'placeholder');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'XileHUD (Ctrl+Q)', enabled: false },
    { type: 'separator' },
    { label: 'Modifiers', click: () => onOpenModifiers() },
    { label: 'Merchant History', click: () => onOpenHistory() },
    { type: 'separator' },
    { label: 'Reload data (JSON)', click: () => reloadData() },
    { label: 'Open data folder', click: () => shell.openPath(getDataDir()) },
    { label: 'Check for app updates', click: () => checkForUpdates() },
    { type: 'separator' },
    { label: 'Show/Hide (Ctrl+Q)', click: () => onToggleOverlay() },
    { type: 'separator' },
    { label: 'Quit', click: () => (onQuit ? onQuit() : app.quit()) }
  ]);

  try { tray.setToolTip('XileHUD'); } catch {}
  try { tray.setContextMenu(contextMenu); } catch {}
  try { tray.on('double-click', () => onToggleOverlay()); } catch {}

  return tray;
}
