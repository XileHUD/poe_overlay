import { ipcMain, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { ModifierDatabase } from '../modifier-database';
import type { OverlayVersion } from '../../types/overlayVersion.js';

// Centralized registration for data-related IPC handlers (JSON catalogs, modifiers, etc.)
// OverlayApp will provide getDataDir function and modifierDatabase instance.
export interface DataIpcDeps {
  getDataDir(): string;
  modifierDatabase: ModifierDatabase;
  getUserConfigDir(): string; // for persistence of data dir selection
  getOverlayVersion(): OverlayVersion;
}

export function registerDataIpc(deps: DataIpcDeps) {
  const { modifierDatabase } = deps;

  const cacheInvalidators = new Map<string, () => void>();
  const preloadTasks: Array<() => Promise<void>> = [];
  const overlayVersion = deps.getOverlayVersion();

  const queuePreload = (name: string, loader: () => Promise<void>) => {
    preloadTasks.push(async () => {
      try {
        await loader();
      } catch (err) {
        console.warn(`[DataIPC] preload ${name} failed`, err);
      }
    });
  };

  const runPreloadTasks = async () => {
    for (const task of preloadTasks) {
      await task();
    }
  };

  const invalidateCaches = () => {
    for (const [key, clear] of cacheInvalidators.entries()) {
      try {
        clear();
      } catch (err) {
        console.warn(`[DataIPC] cache invalidate failed for ${key}`, err);
      }
    }
  };

  ipcMain.handle('get-modifier-data', async (_event, category: string) => {
    return await modifierDatabase.getModifiersForCategory(category);
  });

  ipcMain.handle('search-modifiers', async (_event, query: string, category?: string) => {
    return await modifierDatabase.searchModifiers(query, category);
  });

  ipcMain.handle('get-all-categories', async () => {
    try {
      const maybePromise = (modifierDatabase as any).__loadingPromise;
      if (maybePromise && typeof maybePromise.then === 'function') {
        // Wait (with timeout safeguard) so first open gets full list
        const timeout = new Promise(res => setTimeout(res, 4000));
        await Promise.race([maybePromise.catch(()=>{}), timeout]);
      }
    } catch {}
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
        let existing: any = {};
        try {
          if (fs.existsSync(cfgPath)) {
            existing = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) || {};
          }
        } catch {
          existing = {};
        }

        const overlayVersion = deps.getOverlayVersion();
        const versionKey = overlayVersion === 'poe1' ? 'poe1DataDir' : 'poe2DataDir';
        const nextConfig = {
          ...existing,
          [versionKey]: dirPath,
          dataDir: dirPath // legacy compatibility
        };
        fs.writeFileSync(cfgPath, JSON.stringify(nextConfig, null, 2));
      } catch {}
      invalidateCaches();
      await runPreloadTasks();
      return { ok: true, dataDir: dirPath };
    }
    return { ok: false, error: 'invalid_path' };
  });

  ipcMain.handle('reload-data', async () => {
    try {
      (modifierDatabase as any).reload?.();
      invalidateCaches();
      await runPreloadTasks();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'reload_failed' };
    }
  });

  ipcMain.handle('open-data-dir', async () => {
    try { await shell.openPath(deps.getDataDir()); return { ok: true }; } catch (e: any) { return { ok: false, error: e?.message||'open_failed' }; }
  });

  // Generic helper to reduce repetition for static JSON catalogs
  function simpleJsonHandler(channel: string, fileName: string, options?: { cache?: boolean; preload?: boolean; cacheKey?: string }) {
    try { ipcMain.removeHandler(channel); } catch {}

    const useCache = Boolean(options?.cache);
    const cacheKey = options?.cacheKey || channel;
    let cachedValue: any;
    let hasCache = false;

    const loadFromDisk = () => {
      const filePath = path.join(deps.getDataDir(), fileName);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        cachedValue = JSON.parse(raw);
      } else {
        cachedValue = { error: 'not_found', filePath };
      }
      hasCache = true;
      return cachedValue;
    };

    const clearCache = () => {
      cachedValue = undefined;
      hasCache = false;
    };

    if (useCache) {
      cacheInvalidators.set(cacheKey, clearCache);
    }

    if (options?.preload) {
      queuePreload(cacheKey, async () => {
        clearCache();
        loadFromDisk();
      });
    }

    ipcMain.handle(channel, async () => {
      try {
        if (useCache) {
          if (!hasCache) {
            loadFromDisk();
          }
          return cachedValue;
        }
        return loadFromDisk();
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
  simpleJsonHandler('get-uniques', 'Uniques.json', {
    cache: true,
    preload: overlayVersion === 'poe2',
    cacheKey: `${overlayVersion}:globalUniques`
  });
  simpleJsonHandler('get-omens', 'Omens.json');
  simpleJsonHandler('get-currency', 'Currency.json');
  simpleJsonHandler('get-keystones', 'Keystones.json');
  simpleJsonHandler('get-ascendancy-passives', 'Ascendancy_Passives.json');
  simpleJsonHandler('get-atlas-nodes', 'Atlas_Nodes.json');
  simpleJsonHandler('get-gems', 'Gems.json');
  simpleJsonHandler('get-bases', 'Bases.json', {
    cache: true,
    preload: overlayVersion === 'poe2',
    cacheKey: `${overlayVersion}:globalBases`
  });

  // PoE1-specific handlers
  let poe1UniquesCache: any | undefined;
  let poe1BasesCache: any | undefined;

  const classifyReplicaCategory = (baseType: string): 'WeaponUnique' | 'ArmourUnique' | 'OtherUnique' => {
    const lower = (baseType || '').toLowerCase();
    const weaponKeywords = ['sword', 'axe', 'mace', 'bow', 'wand', 'dagger', 'claw', 'staff', 'sceptre', 'scepter', 'quiver', 'hammer', 'flail', 'spear', 'crossbow'];
    const armourKeywords = ['helmet', 'helm', 'hood', 'circlet', 'hat', 'body', 'armour', 'armor', 'robe', 'plate', 'mail', 'glove', 'gauntlet', 'mitten', 'boot', 'sandal', 'greave', 'shield', 'buckler', 'tower', 'belt'];

    if (weaponKeywords.some(keyword => lower.includes(keyword))) return 'WeaponUnique';
    if (armourKeywords.some(keyword => lower.includes(keyword))) return 'ArmourUnique';
    return 'OtherUnique';
  };

  const ensureUniqueBuckets = (container: any) => {
    if (!container.uniques || typeof container.uniques !== 'object') {
      container.uniques = {};
    }
    if (!Array.isArray(container.uniques.WeaponUnique)) container.uniques.WeaponUnique = [];
    if (!Array.isArray(container.uniques.ArmourUnique)) container.uniques.ArmourUnique = [];
    if (!Array.isArray(container.uniques.OtherUnique)) container.uniques.OtherUnique = [];
    return container;
  };

  const loadPoe1Uniques = () => {
    try {
      const dataDir = deps.getDataDir();
      const uniquesPath = path.join(dataDir, 'items', 'uniques', 'Uniques.json');
      let uniques: any = { uniques: { WeaponUnique: [], ArmourUnique: [], OtherUnique: [] } };

      if (fs.existsSync(uniquesPath)) {
        const raw = fs.readFileSync(uniquesPath, 'utf-8');
        uniques = JSON.parse(raw);
      }

      ensureUniqueBuckets(uniques);

      const replicaPath = path.join(dataDir, 'items', 'uniques', 'ReplicaUniques.json');
      if (fs.existsSync(replicaPath)) {
        const raw = fs.readFileSync(replicaPath, 'utf-8');
        const replicaData = JSON.parse(raw);
        const replicaUniques = replicaData?.uniques?.ReplicaUnique || [];

        for (const replica of replicaUniques) {
          const bucket = classifyReplicaCategory(replica.baseType || '');
          uniques.uniques[bucket].push(replica);
        }
      }

      poe1UniquesCache = uniques;
    } catch (e: any) {
      poe1UniquesCache = { error: e?.message || 'unknown_error' };
    }
    return poe1UniquesCache;
  };

  const loadPoe1Bases = () => {
    try {
      const dataDir = deps.getDataDir();
      const basesPath = path.join(dataDir, 'items', 'bases', 'Bases.json');
      if (fs.existsSync(basesPath)) {
        const raw = fs.readFileSync(basesPath, 'utf-8');
        const data = JSON.parse(raw);

        const cleanItem = (item: any) => {
          if (item && typeof item === 'object') {
            if (item.icon) delete item.icon;
            if (item.image && typeof item.image === 'string' && item.image.includes('poedb')) delete item.image;
          }
          return item;
        };

        if (data.bases) {
          Object.keys(data.bases).forEach(category => {
            if (Array.isArray(data.bases[category])) {
              data.bases[category] = data.bases[category].map(cleanItem);
            }
          });
        }

        poe1BasesCache = data;
      } else {
        poe1BasesCache = { error: 'not_found', filePath: basesPath };
      }
    } catch (e: any) {
      poe1BasesCache = { error: e?.message || 'unknown_error' };
    }
    return poe1BasesCache;
  };

  cacheInvalidators.set('poe1:uniques', () => { poe1UniquesCache = undefined; });
  cacheInvalidators.set('poe1:bases', () => { poe1BasesCache = undefined; });

  if (overlayVersion === 'poe1') {
    queuePreload('poe1:uniques', async () => { poe1UniquesCache = undefined; loadPoe1Uniques(); });
    queuePreload('poe1:bases', async () => { poe1BasesCache = undefined; loadPoe1Bases(); });
  }

  try { ipcMain.removeHandler('get-poe1-uniques'); } catch {}
  ipcMain.handle('get-poe1-uniques', async () => {
    try {
      if (typeof poe1UniquesCache === 'undefined') {
        loadPoe1Uniques();
      }
      return poe1UniquesCache;
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-bases'); } catch {}
  ipcMain.handle('get-poe1-bases', async () => {
    try {
      if (typeof poe1BasesCache === 'undefined') {
        loadPoe1Bases();
      }
      return poe1BasesCache;
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  void runPreloadTasks();
}
