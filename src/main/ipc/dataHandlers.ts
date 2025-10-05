import { ipcMain, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { ModifierDatabase } from '../modifier-database';

// Centralized registration for data-related IPC handlers (JSON catalogs, modifiers, etc.)
// OverlayApp will provide getDataDir function and modifierDatabase instance.
export interface DataIpcDeps {
  getDataDir(): string;
  modifierDatabase: ModifierDatabase;
  getUserConfigDir(): string; // for persistence of data dir selection
}

export function registerDataIpc(deps: DataIpcDeps) {
  const { modifierDatabase } = deps;

  ipcMain.handle('get-modifier-data', async (_event, category: string) => {
    return await modifierDatabase.getModifiersForCategory(category);
  });

  ipcMain.handle('search-modifiers', async (_event, query: string, category?: string) => {
    return await modifierDatabase.searchModifiers(query, category);
  });

  ipcMain.handle('get-all-categories', async () => {
    return await modifierDatabase.getAllCategories();
  });

  // Data directory helpers (for updating JSONs without rebuilding)
  ipcMain.handle('get-data-dir', async () => {
    return deps.getDataDir();
  });

  ipcMain.handle('set-data-dir', async (_e, dirPath: string) => {
    if (typeof dirPath === 'string' && dirPath.trim()) {
      (modifierDatabase as any).setDataPath?.(dirPath);
      (modifierDatabase as any).reload?.();
      // persist
      try {
        const cfgDir = deps.getUserConfigDir();
        const cfgPath = path.join(cfgDir, 'overlay-config.json');
        fs.writeFileSync(cfgPath, JSON.stringify({ dataDir: dirPath }, null, 2));
      } catch {}
      return { ok: true, dataDir: dirPath };
    }
    return { ok: false, error: 'invalid_path' };
  });

  ipcMain.handle('reload-data', async () => {
    try { (modifierDatabase as any).reload?.(); return { ok: true }; } catch (e: any) { return { ok: false, error: e?.message||'reload_failed' }; }
  });

  ipcMain.handle('open-data-dir', async () => {
    try { await shell.openPath(deps.getDataDir()); return { ok: true }; } catch (e: any) { return { ok: false, error: e?.message||'open_failed' }; }
  });

  // Generic helper to reduce repetition for static JSON catalogs
  function simpleJsonHandler(channel: string, fileName: string) {
    try { ipcMain.removeHandler(channel); } catch {}
    ipcMain.handle(channel, async () => {
      try {
        const filePath = path.join(deps.getDataDir(), fileName);
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(raw);
        }
        return { error: 'not_found', filePath };
      } catch (e: any) {
        return { error: e?.message || 'unknown_error' };
      }
    });
  }

  // Register individual dataset handlers
  simpleJsonHandler('get-liquid-emotions', 'Liquid_Emotions.json');
  simpleJsonHandler('get-annoints', 'Annoints.json');
  simpleJsonHandler('get-essences', 'Essences.json');
  simpleJsonHandler('get-catalysts', 'Catalysts.json');
  simpleJsonHandler('get-socketables', 'Socketables.json');
  simpleJsonHandler('get-keywords', 'Keywords.json');
  simpleJsonHandler('get-uniques', 'Uniques.json');
  simpleJsonHandler('get-omens', 'Omens.json');
  simpleJsonHandler('get-currency', 'Currency.json');
  simpleJsonHandler('get-keystones', 'Keystones.json');
  simpleJsonHandler('get-ascendancy-passives', 'Ascendancy_Passives.json');
  simpleJsonHandler('get-atlas-nodes', 'Atlas_Nodes.json');
  simpleJsonHandler('get-gems', 'Gems.json');
  simpleJsonHandler('get-bases', 'Bases.json');
}
