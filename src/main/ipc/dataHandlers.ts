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
  validateDataDir?(dirPath: string): { valid: boolean; reason?: string };
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

  const validateDataDir = deps.validateDataDir ?? (() => ({ valid: true as const }));

  ipcMain.handle('set-data-dir', async (_e, dirPath: string) => {
    if (typeof dirPath === 'string' && dirPath.trim()) {
      const validation = validateDataDir(dirPath);
      if (!validation.valid) {
        return { ok: false, error: validation.reason || 'invalid_path' };
      }
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
  let poe1EssencesCache: any | undefined;
  let poe1EmbersCache: any | undefined;
  let poe1FossilsCache: any | undefined;
  let poe1CurrencyCache: any | undefined;
  let poe1ScarabsCache: any | undefined;
  let poe1RunegraftsCache: any | undefined;
  let poe1DivinationCardsCache: any | undefined;
  let poe1TattoosCache: any | undefined;
  let poe1GemsCache: any | undefined;
  let poe1AscendancyNotablesCache: any | undefined;

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

  const loadPoe1Essences = () => {
    try {
      const dataDir = deps.getDataDir();
      const essencesPath = path.join(dataDir, 'items', 'essences', 'Essences.json');
      if (fs.existsSync(essencesPath)) {
        const raw = fs.readFileSync(essencesPath, 'utf-8');
        poe1EssencesCache = JSON.parse(raw);
      } else {
        poe1EssencesCache = { error: 'not_found', filePath: essencesPath };
      }
    } catch (e: any) {
      poe1EssencesCache = { error: e?.message || 'unknown_error' };
    }
    return poe1EssencesCache;
  };

  const loadPoe1Embers = () => {
    try {
      const dataDir = deps.getDataDir();
      const embersPath = path.join(dataDir, 'items', 'embers', 'Embers.json');
      if (fs.existsSync(embersPath)) {
        const raw = fs.readFileSync(embersPath, 'utf-8');
        poe1EmbersCache = JSON.parse(raw);
      } else {
        poe1EmbersCache = { error: 'not_found', filePath: embersPath };
      }
    } catch (e: any) {
      poe1EmbersCache = { error: e?.message || 'unknown_error' };
    }
    return poe1EmbersCache;
  };

  const loadPoe1Fossils = () => {
    try {
      const dataDir = deps.getDataDir();
      const fossilsPath = path.join(dataDir, 'items', 'fossils', 'Fossils.json');
      if (fs.existsSync(fossilsPath)) {
        const raw = fs.readFileSync(fossilsPath, 'utf-8');
        poe1FossilsCache = JSON.parse(raw);
      } else {
        poe1FossilsCache = { error: 'not_found', filePath: fossilsPath };
      }
    } catch (e: any) {
      poe1FossilsCache = { error: e?.message || 'unknown_error' };
    }
    return poe1FossilsCache;
  };

  const loadPoe1Currency = () => {
    try {
      const dataDir = deps.getDataDir();
      const currencyPath = path.join(dataDir, 'items', 'currency', 'Currency.json');
      if (fs.existsSync(currencyPath)) {
        const raw = fs.readFileSync(currencyPath, 'utf-8');
        poe1CurrencyCache = JSON.parse(raw);
      } else {
        poe1CurrencyCache = { error: 'not_found', filePath: currencyPath };
      }
    } catch (e: any) {
      poe1CurrencyCache = { error: e?.message || 'unknown_error' };
    }
    return poe1CurrencyCache;
  };

  const loadPoe1Scarabs = () => {
    try {
      const dataDir = deps.getDataDir();
      const scarabsPath = path.join(dataDir, 'items', 'scarabs', 'Scarabs.json');
      if (fs.existsSync(scarabsPath)) {
        const raw = fs.readFileSync(scarabsPath, 'utf-8');
        poe1ScarabsCache = JSON.parse(raw);
      } else {
        poe1ScarabsCache = { error: 'not_found', filePath: scarabsPath };
      }
    } catch (e: any) {
      poe1ScarabsCache = { error: e?.message || 'unknown_error' };
    }
    return poe1ScarabsCache;
  };

  const loadPoe1Runegrafts = () => {
    try {
      const dataDir = deps.getDataDir();
      const runegraftsPath = path.join(dataDir, 'items', 'runegrafts', 'Runegrafts.json');
      if (fs.existsSync(runegraftsPath)) {
        const raw = fs.readFileSync(runegraftsPath, 'utf-8');
        poe1RunegraftsCache = JSON.parse(raw);
      } else {
        poe1RunegraftsCache = { error: 'not_found', filePath: runegraftsPath };
      }
    } catch (e: any) {
      poe1RunegraftsCache = { error: e?.message || 'unknown_error' };
    }
    return poe1RunegraftsCache;
  };

  const loadPoe1DivinationCards = () => {
    try {
      const dataDir = deps.getDataDir();
      const cardsPath = path.join(dataDir, 'items', 'divination-cards', 'DivinationCards.json');
      if (fs.existsSync(cardsPath)) {
        const raw = fs.readFileSync(cardsPath, 'utf-8');
        poe1DivinationCardsCache = JSON.parse(raw);
      } else {
        poe1DivinationCardsCache = { error: 'not_found', filePath: cardsPath };
      }
    } catch (e: any) {
      poe1DivinationCardsCache = { error: e?.message || 'unknown_error' };
    }
    return poe1DivinationCardsCache;
  };

  const loadPoe1Tattoos = () => {
    try {
      const dataDir = deps.getDataDir();
      const tattoosPath = path.join(dataDir, 'items', 'tattoos', 'Tattoos.json');
      if (fs.existsSync(tattoosPath)) {
        const raw = fs.readFileSync(tattoosPath, 'utf-8');
        poe1TattoosCache = JSON.parse(raw);
      } else {
        poe1TattoosCache = { error: 'not_found', filePath: tattoosPath };
      }
    } catch (e: any) {
      poe1TattoosCache = { error: e?.message || 'unknown_error' };
    }
    return poe1TattoosCache;
  };

  const loadPoe1Gems = () => {
    try {
      const dataDir = deps.getDataDir();
      const gemsPath = path.join(dataDir, 'items', 'gems', 'Gems.json');
      if (fs.existsSync(gemsPath)) {
        const raw = fs.readFileSync(gemsPath, 'utf-8');
        const data = JSON.parse(raw);
        // Extract the gems array from the new structure {slug: "Gems", gems: [...]}
        poe1GemsCache = { gems: data.gems || [] };
      } else {
        poe1GemsCache = { error: 'not_found', filePath: gemsPath };
      }
    } catch (e: any) {
      poe1GemsCache = { error: e?.message || 'unknown_error' };
    }
    return poe1GemsCache;
  };

  const loadPoe1AscendancyNotables = () => {
    try {
      const dataDir = deps.getDataDir();
      const notablesDir = path.join(dataDir, 'ascendancy-notables');
      const bundle = {
        slug: 'Ascendancy_Notables',
        notables: [] as any[],
        classes: [] as string[],
        ascendancies: [] as string[]
      };

      if (fs.existsSync(notablesDir)) {
        const files = fs.readdirSync(notablesDir).filter((file) => file.toLowerCase().endsWith('.json'));
        const classSet = new Set<string>();
        const ascendancySet = new Set<string>();

        for (const file of files) {
          try {
            const raw = fs.readFileSync(path.join(notablesDir, file), 'utf-8');
            const parsed = JSON.parse(raw);
            const character = typeof parsed?.character === 'string' ? parsed.character : '';
            if (Array.isArray(parsed?.notables)) {
              for (const notable of parsed.notables) {
                const clone = { ...notable };
                if (character && !clone.character) clone.character = character;
                if (clone.character) classSet.add(String(clone.character));
                if (clone.ascendancy) ascendancySet.add(String(clone.ascendancy));
                bundle.notables.push(clone);
              }
            }
          } catch (innerError: any) {
            console.warn('[DataHandlers] Failed to parse PoE1 Ascendancy Notables file:', file, innerError);
          }
        }

        bundle.classes = Array.from(classSet).filter(Boolean).sort((a, b) => a.localeCompare(b));
        bundle.ascendancies = Array.from(ascendancySet).filter(Boolean).sort((a, b) => a.localeCompare(b));
        poe1AscendancyNotablesCache = bundle;
      } else {
        poe1AscendancyNotablesCache = { error: 'not_found', filePath: notablesDir };
      }
    } catch (e: any) {
      poe1AscendancyNotablesCache = { error: e?.message || 'unknown_error' };
    }
    return poe1AscendancyNotablesCache;
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
  cacheInvalidators.set('poe1:essences', () => { poe1EssencesCache = undefined; });
  cacheInvalidators.set('poe1:embers', () => { poe1EmbersCache = undefined; });
  cacheInvalidators.set('poe1:fossils', () => { poe1FossilsCache = undefined; });
  cacheInvalidators.set('poe1:currency', () => { poe1CurrencyCache = undefined; });
  cacheInvalidators.set('poe1:scarabs', () => { poe1ScarabsCache = undefined; });
  cacheInvalidators.set('poe1:runegrafts', () => { poe1RunegraftsCache = undefined; });
  cacheInvalidators.set('poe1:divinationCards', () => { poe1DivinationCardsCache = undefined; });
  cacheInvalidators.set('poe1:tattoos', () => { poe1TattoosCache = undefined; });
  cacheInvalidators.set('poe1:gems', () => { poe1GemsCache = undefined; });
  cacheInvalidators.set('poe1:ascendancyNotables', () => { poe1AscendancyNotablesCache = undefined; });

  if (overlayVersion === 'poe1') {
    queuePreload('poe1:uniques', async () => { poe1UniquesCache = undefined; loadPoe1Uniques(); });
    queuePreload('poe1:bases', async () => { poe1BasesCache = undefined; loadPoe1Bases(); });
    queuePreload('poe1:essences', async () => { poe1EssencesCache = undefined; loadPoe1Essences(); });
    queuePreload('poe1:embers', async () => { poe1EmbersCache = undefined; loadPoe1Embers(); });
    queuePreload('poe1:fossils', async () => { poe1FossilsCache = undefined; loadPoe1Fossils(); });
    queuePreload('poe1:currency', async () => { poe1CurrencyCache = undefined; loadPoe1Currency(); });
    queuePreload('poe1:scarabs', async () => { poe1ScarabsCache = undefined; loadPoe1Scarabs(); });
    queuePreload('poe1:runegrafts', async () => { poe1RunegraftsCache = undefined; loadPoe1Runegrafts(); });
    queuePreload('poe1:divinationCards', async () => { poe1DivinationCardsCache = undefined; loadPoe1DivinationCards(); });
    queuePreload('poe1:tattoos', async () => { poe1TattoosCache = undefined; loadPoe1Tattoos(); });
    queuePreload('poe1:gems', async () => { poe1GemsCache = undefined; loadPoe1Gems(); });
    queuePreload('poe1:ascendancyNotables', async () => { poe1AscendancyNotablesCache = undefined; loadPoe1AscendancyNotables(); });
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

  try { ipcMain.removeHandler('get-poe1-essences'); } catch {}
  ipcMain.handle('get-poe1-essences', async () => {
    try {
      if (typeof poe1EssencesCache === 'undefined') {
        loadPoe1Essences();
      }
      return poe1EssencesCache;
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-embers'); } catch {}
  ipcMain.handle('get-poe1-embers', async () => {
    try {
      if (typeof poe1EmbersCache === 'undefined') {
        loadPoe1Embers();
      }
      return poe1EmbersCache;
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-fossils'); } catch {}
  ipcMain.handle('get-poe1-fossils', async () => {
    try {
      if (typeof poe1FossilsCache === 'undefined') {
        loadPoe1Fossils();
      }
      return poe1FossilsCache;
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-currency'); } catch {}
  ipcMain.handle('get-poe1-currency', async () => {
    try {
      if (typeof poe1CurrencyCache === 'undefined') {
        loadPoe1Currency();
      }
      return poe1CurrencyCache;
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-scarabs'); } catch {}
  ipcMain.handle('get-poe1-scarabs', async () => {
    try {
      if (typeof poe1ScarabsCache === 'undefined') {
        loadPoe1Scarabs();
      }
      return poe1ScarabsCache;
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-runegrafts'); } catch {}
  ipcMain.handle('get-poe1-runegrafts', async () => {
    try {
      if (typeof poe1RunegraftsCache === 'undefined') {
        loadPoe1Runegrafts();
      }
      return poe1RunegraftsCache;
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-divination-cards'); } catch {}
  ipcMain.handle('get-poe1-divination-cards', async () => {
    try {
      if (typeof poe1DivinationCardsCache === 'undefined') {
        loadPoe1DivinationCards();
      }
      return poe1DivinationCardsCache;
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-tattoos'); } catch {}
  ipcMain.handle('get-poe1-tattoos', async () => {
    try {
      if (typeof poe1TattoosCache === 'undefined') {
        loadPoe1Tattoos();
      }
      return poe1TattoosCache;
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-gems'); } catch {}
  ipcMain.handle('get-poe1-gems', async () => {
    try {
      if (typeof poe1GemsCache === 'undefined') {
        loadPoe1Gems();
      }
      return poe1GemsCache;
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-ascendancy-notables'); } catch {}
  ipcMain.handle('get-poe1-ascendancy-notables', async () => {
    try {
      if (typeof poe1AscendancyNotablesCache === 'undefined') {
        loadPoe1AscendancyNotables();
      }
      return poe1AscendancyNotablesCache;
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-gem-detail'); } catch {}
  ipcMain.handle('get-poe1-gem-detail', async (_event, gemSlug: string) => {
    try {
      const dataDir = deps.getDataDir();
      const detailPath = path.join(dataDir, 'items', 'gems', 'details', `${gemSlug}.json`);
      if (fs.existsSync(detailPath)) {
        const raw = fs.readFileSync(detailPath, 'utf-8');
        return JSON.parse(raw);
      } else {
        return { error: 'not_found', filePath: detailPath };
      }
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  void runPreloadTasks();
}
