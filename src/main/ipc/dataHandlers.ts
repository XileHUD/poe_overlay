import { ipcMain, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { promises as fsp } from 'fs';
import { ModifierDatabase } from '../modifier-database';
import type { OverlayVersion } from '../../types/overlayVersion.js';
import { JsonCache } from '../utils/jsonCache.js';

// Centralized registration for data-related IPC handlers (JSON catalogs, modifiers, etc.)
// OverlayApp will provide getDataDir function and modifierDatabase instance.
export interface DataIpcDeps {
  getDataDir(): string;
  modifierDatabase: ModifierDatabase | null; // Can be null in leveling-only mode
  getUserConfigDir(): string; // for persistence of data dir selection
  getOverlayVersion(): OverlayVersion;
  validateDataDir?(dirPath: string): { valid: boolean; reason?: string };
}

export function registerDataIpc(deps: DataIpcDeps) {
  const { modifierDatabase } = deps;

  const jsonCache = new JsonCache();
  
  // Only set file cache if modifierDatabase exists (in leveling-only mode, it may be null)
  if (modifierDatabase) {
    modifierDatabase.setFileCache(jsonCache);
  }

  const cacheInvalidators = new Map<string, () => void>();
  const preloadTasks: Array<() => Promise<void>> = [];
  const overlayVersion = deps.getOverlayVersion();

  const toDataPath = (...segments: string[]) => path.join(deps.getDataDir(), ...segments);

  const cloneJson = <T>(value: T): T => {
    if (value === null || typeof value !== 'object') {
      return value;
    }
    try {
      return structuredClone(value);
    } catch {
      return JSON.parse(JSON.stringify(value));
    }
  };

  const loadJsonSafe = async <T>(...segments: string[]) => {
    const filePath = toDataPath(...segments);
    try {
      const data = await jsonCache.get<T>(filePath);
      return { ok: true as const, data };
    } catch (err: any) {
      const code = err?.code === 'ENOENT' ? 'not_found' : err?.message || 'unknown_error';
      return { ok: false as const, error: code, filePath };
    }
  };

  const createCachedLoader = <T>(cacheKey: string, factory: () => Promise<T | { error: string; filePath?: string }>) => {
    let cache: (T | { error: string; filePath?: string }) | undefined;
    let inflight: Promise<T | { error: string; filePath?: string }> | null = null;

    const load = async () => {
      if (typeof cache !== 'undefined') {
        return cache;
      }
      if (inflight) {
        return inflight;
      }

      inflight = (async () => {
        try {
          const result = await factory();
          cache = result;
          return result;
        } catch (err: any) {
          const error = err?.message || 'unknown_error';
          cache = { error };
          return cache;
        } finally {
          inflight = null;
        }
      })();

      return inflight;
    };

    cacheInvalidators.set(cacheKey, () => {
      cache = undefined;
    });

    return load;
  };

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
    jsonCache.clear();
    for (const [key, clear] of cacheInvalidators.entries()) {
      try {
        clear();
      } catch (err) {
        console.warn(`[DataIPC] cache invalidate failed for ${key}`, err);
      }
    }
  };

  ipcMain.handle('get-modifier-data', async (_event, category: string) => {
    if (!modifierDatabase) {
      return []; // Return empty array in leveling-only mode
    }
    return await modifierDatabase.getModifiersForCategory(category);
  });

  ipcMain.handle('search-modifiers', async (_event, query: string, category?: string) => {
    if (!modifierDatabase) {
      return []; // Return empty array in leveling-only mode
    }
    return await modifierDatabase.searchModifiers(query, category);
  });

  ipcMain.handle('get-all-categories', async () => {
    if (!modifierDatabase) {
      return []; // Return empty array in leveling-only mode
    }
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

    const filePath = toDataPath(fileName);

    const loadFromDisk = async (force = false) => {
      try {
        cachedValue = await jsonCache.get(filePath, { force });
      } catch (err: any) {
        const errorCode = err?.code === 'ENOENT' ? 'not_found' : err?.message || 'unknown_error';
        cachedValue = { error: errorCode, filePath };
      }
      hasCache = true;
      return cachedValue;
    };

    const clearCache = () => {
      cachedValue = undefined;
      hasCache = false;
      jsonCache.clear(filePath);
    };

    if (useCache) {
      cacheInvalidators.set(cacheKey, clearCache);
    }

    if (options?.preload) {
      queuePreload(cacheKey, async () => {
        clearCache();
        await loadFromDisk(true);
      });
    }

    ipcMain.handle(channel, async () => {
      try {
        if (useCache) {
          if (!hasCache) {
            await loadFromDisk();
          }
          return cachedValue;
        }
        return await loadFromDisk(true);
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

  type Poe1UniqueCategoryGroup = 'weapon' | 'armour' | 'accessory' | 'jewel' | 'flask' | 'misc';

  interface Poe1UniqueRequirement {
    text: string;
    level?: number;
    str?: number;
    dex?: number;
    int?: number;
  }

  interface Poe1UniqueItem {
    id: string;
    name: string;
    baseType: string;
    group: Poe1UniqueCategoryGroup;
    imageLocal?: string;
    properties?: string[];
    requirements?: Poe1UniqueRequirement[];
    implicitMods?: string[];
    explicitMods?: string[];
    enchantMods?: string[];
    craftedMods?: string[];
    veiledMods?: string[];
    fracturedMods?: string[];
    utilityMods?: string[];
    grantedEffects?: string[];
    secondaryMods?: string[];
    mods?: string[];
    textBlocks?: string[];
    notes?: string[];
    flavourText?: string;
    isReplica?: boolean;
    isCorrupted?: boolean;
    isRelic?: boolean;
  }

  interface Poe1UniqueCategory {
    id: string;
    name: string;
    group: Poe1UniqueCategoryGroup;
    total?: number;
    items: Poe1UniqueItem[];
  }

  interface Poe1UniqueDataset {
    slug: string;
    generatedAt?: string;
    totalCategories: number;
    totalItems: number;
    categories: Poe1UniqueCategory[];
  }

  const slugifyIdentifier = (value: string): string => {
    return (value || '')
      .toLowerCase()
      .trim()
      .replace(/['`’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '');
  };

  const ensureStringArray = (value: any): string[] | undefined => {
    if (!value) return undefined;
    const arr = Array.isArray(value) ? value : [value];
    const cleaned = arr
      .map(entry => (typeof entry === 'string' ? entry : String(entry ?? '')).trim())
      .filter(Boolean);
    return cleaned.length ? cleaned : undefined;
  };

  const normalizeNumber = (value: any): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseInt(value.trim(), 10);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  };

  const normalizeRequirement = (value: any): Poe1UniqueRequirement | null => {
    if (!value || typeof value !== 'object') return null;
    const text = typeof value.text === 'string' ? value.text.trim() : '';
    if (!text) return null;
    return {
      text,
      level: normalizeNumber((value as any).level),
      str: normalizeNumber((value as any).str),
      dex: normalizeNumber((value as any).dex),
      int: normalizeNumber((value as any).int)
    };
  };

  const normalizeUniquesDataset = (raw: any): Poe1UniqueDataset => {
    const dataset: Poe1UniqueDataset = {
      slug: typeof raw?.slug === 'string' && raw.slug.trim() ? raw.slug.trim() : 'poe1-uniques',
      generatedAt: typeof raw?.generatedAt === 'string' ? raw.generatedAt : undefined,
      totalCategories: 0,
      totalItems: 0,
      categories: []
    };

    const allowedGroups: Poe1UniqueCategoryGroup[] = ['weapon', 'armour', 'accessory', 'jewel', 'flask', 'misc'];
    const categories = Array.isArray(raw?.categories) ? raw.categories : [];

    dataset.categories = categories.map((category: any, categoryIndex: number) => {
      const name = typeof category?.name === 'string' && category.name.trim() ? category.name.trim() : `Category ${categoryIndex + 1}`;
      const group = allowedGroups.includes(category?.group) ? category.group : 'misc';
      const id = typeof category?.id === 'string' && category.id.trim() ? category.id.trim() : slugifyIdentifier(name) || `category-${categoryIndex + 1}`;

      const itemsRaw = Array.isArray(category?.items) ? category.items : [];
      const items: Poe1UniqueItem[] = itemsRaw.map((item: any, itemIndex: number) => {
        const itemName = typeof item?.name === 'string' ? item.name.trim() : '';
        const baseType = typeof item?.baseType === 'string' ? item.baseType.trim() : '';
        const fallbackId = `${id}-item-${itemIndex + 1}`;
        const normalizedId = typeof item?.id === 'string' && item.id.trim()
          ? item.id.trim()
          : slugifyIdentifier(`${itemName}-${baseType}`) || slugifyIdentifier(itemName) || fallbackId;

        const requirementList = Array.isArray(item?.requirements)
          ? (item.requirements as any[])
              .map(normalizeRequirement)
              .filter((req): req is Poe1UniqueRequirement => Boolean(req))
          : undefined;

        return {
          id: normalizedId,
          name: itemName,
          baseType,
          group,
          imageLocal: typeof item?.imageLocal === 'string' ? item.imageLocal : undefined,
          properties: ensureStringArray(item?.properties),
          requirements: requirementList,
          implicitMods: ensureStringArray(item?.implicitMods),
          explicitMods: ensureStringArray(item?.explicitMods),
          enchantMods: ensureStringArray(item?.enchantMods),
          craftedMods: ensureStringArray(item?.craftedMods),
          veiledMods: ensureStringArray(item?.veiledMods),
          fracturedMods: ensureStringArray(item?.fracturedMods),
          utilityMods: ensureStringArray(item?.utilityMods),
          grantedEffects: ensureStringArray(item?.grantedEffects),
          secondaryMods: ensureStringArray(item?.secondaryMods),
          mods: ensureStringArray(item?.mods),
          textBlocks: ensureStringArray(item?.textBlocks),
          notes: ensureStringArray(item?.notes),
          flavourText: typeof item?.flavourText === 'string' ? item.flavourText.trim() || undefined : undefined,
          isReplica: item?.isReplica ? true : undefined,
          isCorrupted: item?.isCorrupted ? true : undefined,
          isRelic: item?.isRelic ? true : undefined
        };
      });

      items.sort((a, b) => a.name.localeCompare(b.name));

      return {
        id,
        name,
        group,
        total: items.length,
        items
      };
    });

    dataset.totalCategories = dataset.categories.length;
    dataset.totalItems = dataset.categories.reduce((sum, category) => sum + (category.total ?? 0), 0);
    return dataset;
  };

  const classifyReplicaGroup = (baseType: string): Poe1UniqueCategoryGroup => {
    const lower = (baseType || '').toLowerCase();
    if (!lower) return 'misc';
    if (/(sword|axe|mace|bow|wand|dagger|claw|staff|sceptre|scepter|quiver|hammer|flail|spear|crossbow|rod)/.test(lower)) return 'weapon';
    if (/(helmet|helm|hood|circlet|hat|mask|body|armour|armor|robe|plate|mail|glove|gauntlet|mitt|boot|sandal|greave|shield|buckler|tower|crown|grip|gauntlets|sabatons|bracers)/.test(lower)) return 'armour';
    if (/(ring|amulet|belt|talisman|trinket|locket|brooch)/.test(lower)) return 'accessory';
    if (/(flask|tincture|vial)/.test(lower)) return 'flask';
    if (/(jewel)/.test(lower)) return 'jewel';
    if (/(idol|charm)/.test(lower)) return 'misc';
    return 'misc';
  };

  const findCategoryByBaseType = (categories: Poe1UniqueCategory[], baseType: string): Poe1UniqueCategory | undefined => {
    if (!baseType) return undefined;
    const lower = baseType.toLowerCase();
    for (const category of categories) {
      if (category.items.some(item => (item.baseType || '').toLowerCase() === lower)) {
        return category;
      }
    }
    return undefined;
  };

  const findCategoryByGroup = (categories: Poe1UniqueCategory[], group: Poe1UniqueCategoryGroup): Poe1UniqueCategory | undefined => {
    return categories.find(category => category.group === group);
  };

  const loadPoe1Uniques = createCachedLoader('poe1:uniques', async () => {
    const uniquesResult = await loadJsonSafe<any>('items', 'uniques', 'Uniques.json');
    if (!uniquesResult.ok) {
      return { error: uniquesResult.error, filePath: uniquesResult.filePath };
    }

    const dataset = normalizeUniquesDataset(cloneJson(uniquesResult.data ?? {}));
    return dataset;
  });

  const loadPoe1Essences = createCachedLoader('poe1:essences', async () => {
    const result = await loadJsonSafe<any>('items', 'essences', 'Essences.json');
    if (!result.ok) {
      return { error: result.error, filePath: result.filePath };
    }
    return result.data;
  });

  const loadPoe1Embers = createCachedLoader('poe1:embers', async () => {
    const result = await loadJsonSafe<any>('items', 'embers', 'Embers.json');
    if (!result.ok) {
      return { error: result.error, filePath: result.filePath };
    }
    return result.data;
  });

  const loadPoe1Fossils = createCachedLoader('poe1:fossils', async () => {
    const result = await loadJsonSafe<any>('items', 'fossils', 'Fossils.json');
    if (!result.ok) {
      return { error: result.error, filePath: result.filePath };
    }
    return result.data;
  });

  const loadPoe1Currency = createCachedLoader('poe1:currency', async () => {
    const result = await loadJsonSafe<any>('items', 'currency', 'Currency.json');
    if (!result.ok) {
      return { error: result.error, filePath: result.filePath };
    }
    return result.data;
  });

  const loadPoe1Scarabs = createCachedLoader('poe1:scarabs', async () => {
    const result = await loadJsonSafe<any>('items', 'scarabs', 'Scarabs.json');
    if (!result.ok) {
      return { error: result.error, filePath: result.filePath };
    }
    return result.data;
  });

  const loadPoe1Horticrafting = createCachedLoader('poe1:horticrafting', async () => {
    const result = await loadJsonSafe<any>('crafting', 'horticrafting', 'Horticrafting.json');
    if (!result.ok) {
      return { error: result.error, filePath: result.filePath };
    }
    return result.data;
  });

  const loadPoe1Bestiary = createCachedLoader('poe1:bestiary', async () => {
    const result = await loadJsonSafe<any>('crafting', 'bestiary', 'Bestiary.json');
    if (!result.ok) {
      return { error: result.error, filePath: result.filePath };
    }
    return result.data;
  });

  const loadPoe1Runegrafts = createCachedLoader('poe1:runegrafts', async () => {
    const result = await loadJsonSafe<any>('items', 'runegrafts', 'Runegrafts.json');
    if (!result.ok) {
      return { error: result.error, filePath: result.filePath };
    }
    return result.data;
  });

  const loadPoe1DivinationCards = createCachedLoader('poe1:divinationCards', async () => {
    const result = await loadJsonSafe<any>('items', 'divination-cards', 'DivinationCards.json');
    if (!result.ok) {
      return { error: result.error, filePath: result.filePath };
    }
    return result.data;
  });

  const loadPoe1Tattoos = createCachedLoader('poe1:tattoos', async () => {
    const result = await loadJsonSafe<any>('items', 'tattoos', 'Tattoos.json');
    if (!result.ok) {
      return { error: result.error, filePath: result.filePath };
    }
    return result.data;
  });

  const loadPoe1Gems = createCachedLoader('poe1:gems', async () => {
    const result = await loadJsonSafe<any>('items', 'gems', 'Gems.json');
    if (!result.ok) {
      return { error: result.error, filePath: result.filePath };
    }
    const gemsPayload = Array.isArray(result.data?.gems) ? result.data.gems : [];
    return { gems: cloneJson(gemsPayload) };
  });

  const loadPoe1AscendancyNotables = createCachedLoader('poe1:ascendancyNotables', async () => {
    const notablesDir = toDataPath('ascendancy-notables');
    if (!fs.existsSync(notablesDir)) {
      return { error: 'not_found', filePath: notablesDir };
    }

    const bundle = {
      slug: 'Ascendancy_Notables',
      notables: [] as any[],
      classes: [] as string[],
      ascendancies: [] as string[],
    };

    const classSet = new Set<string>();
    const ascendancySet = new Set<string>();

    const files = (await fsp.readdir(notablesDir)).filter(file => file.toLowerCase().endsWith('.json'));
    for (const file of files) {
      try {
        const fileResult = await loadJsonSafe<any>('ascendancy-notables', file);
        if (!fileResult.ok) {
          if (fileResult.error !== 'not_found') {
            console.warn('[DataHandlers] Failed to load PoE1 Ascendancy Notables file:', file, fileResult.error);
          }
          continue;
        }
        const parsed = fileResult.data;
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
      } catch (innerError) {
        console.warn('[DataHandlers] Failed to parse PoE1 Ascendancy Notables file:', file, innerError);
      }
    }

    bundle.classes = Array.from(classSet).filter(Boolean).sort((a, b) => a.localeCompare(b));
    bundle.ascendancies = Array.from(ascendancySet).filter(Boolean).sort((a, b) => a.localeCompare(b));
    return bundle;
  });

  const loadPoe1Anointments = createCachedLoader('poe1:anointments', async () => {
    const dataDir = deps.getDataDir();

    const tryResolveBaseDir = (): string => {
      const direct = path.join(dataDir, 'crafting', 'anointments');
      if (fs.existsSync(direct)) return direct;
      const nested = path.join(dataDir, 'PoE1Modules', 'crafting', 'anointments');
      if (fs.existsSync(nested)) return nested;
      return direct;
    };

    const baseDir = tryResolveBaseDir();

    const loadFile = async (fileName: string) => {
      const filePath = path.join(baseDir, fileName);
      try {
        return await jsonCache.get(filePath);
      } catch (err: any) {
        const error = err?.code === 'ENOENT' ? 'not_found' : err?.message || 'unknown_error';
        return { error, filePath };
      }
    };

    return {
      amulets: await loadFile('AnointUniqueAmulets.json'),
      rings: await loadFile('AnointRings.json')
    };
  });

  const loadPoe1Bases = createCachedLoader('poe1:bases', async () => {
    const result = await loadJsonSafe<any>('items', 'bases', 'Bases.json');
    if (!result.ok) {
      return { error: result.error, filePath: result.filePath };
    }

    const data = cloneJson(result.data ?? {});

    const cleanItem = (item: any) => {
      if (item && typeof item === 'object') {
        if (item.icon) delete item.icon;
        if (item.image && typeof item.image === 'string' && item.image.includes('poedb')) delete item.image;
      }
      return item;
    };

    if (data.bases && typeof data.bases === 'object') {
      Object.keys(data.bases).forEach(category => {
        if (Array.isArray((data.bases as any)[category])) {
          (data.bases as any)[category] = (data.bases as any)[category].map(cleanItem);
        }
      });
    }

    return data;
  });

  const loadKeepersDataset = async (...segments: string[]) => {
    const result = await loadJsonSafe<any>(...segments);
    if (!result.ok) {
      return { error: result.error, filePath: result.filePath };
    }
    return cloneJson(result.data ?? {});
  };

  const loadPoe1Keepers = createCachedLoader('poe1:keepers', async () => {
    const [items, uniques, gems, grafts, foulbornUniques, bloodlineAscendancy, foulbornPassives, genesisTree] = await Promise.all([
      loadKeepersDataset('keepers', 'items', 'KeepersItems.json'),
      loadKeepersDataset('keepers', 'items', 'KeepersUniques.json'),
      loadKeepersDataset('keepers', 'items', 'gems', 'KeepersGems.json'),
      loadKeepersDataset('keepers', 'items', 'Grafts.json'),
      loadKeepersDataset('keepers', 'items', 'FoulbornUniques.json'),
      loadKeepersDataset('keepers', 'passives', 'BloodlineAscendancy.json'),
      loadKeepersDataset('keepers', 'passives', 'FoulbornPassives.json'),
      loadKeepersDataset('keepers', 'passives', 'GenesisTree.json')
    ]);

    return {
      items,
      uniques,
      gems,
      grafts,
      foulbornUniques,
      bloodlineAscendancy,
      foulbornPassives,
      genesisTree
    };
  });

  if (overlayVersion === 'poe1') {
    queuePreload('poe1:uniques', async () => { await loadPoe1Uniques(); });
    queuePreload('poe1:bases', async () => { await loadPoe1Bases(); });
    queuePreload('poe1:essences', async () => { await loadPoe1Essences(); });
    queuePreload('poe1:embers', async () => { await loadPoe1Embers(); });
    queuePreload('poe1:fossils', async () => { await loadPoe1Fossils(); });
    queuePreload('poe1:currency', async () => { await loadPoe1Currency(); });
    queuePreload('poe1:scarabs', async () => { await loadPoe1Scarabs(); });
    queuePreload('poe1:horticrafting', async () => { await loadPoe1Horticrafting(); });
    queuePreload('poe1:bestiary', async () => { await loadPoe1Bestiary(); });
    queuePreload('poe1:runegrafts', async () => { await loadPoe1Runegrafts(); });
    queuePreload('poe1:divinationCards', async () => { await loadPoe1DivinationCards(); });
    queuePreload('poe1:tattoos', async () => { await loadPoe1Tattoos(); });
    queuePreload('poe1:anointments', async () => { await loadPoe1Anointments(); });
    queuePreload('poe1:gems', async () => { await loadPoe1Gems(); });
    queuePreload('poe1:ascendancyNotables', async () => { await loadPoe1AscendancyNotables(); });
    queuePreload('poe1:keepers', async () => { await loadPoe1Keepers(); });
  }

  try { ipcMain.removeHandler('get-poe1-uniques'); } catch {}
  ipcMain.handle('get-poe1-uniques', async () => {
    try {
      return await loadPoe1Uniques();
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-bases'); } catch {}
  ipcMain.handle('get-poe1-bases', async () => {
    try {
      return await loadPoe1Bases();
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-keepers'); } catch {}
  ipcMain.handle('get-poe1-keepers', async () => {
    try {
      return await loadPoe1Keepers();
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-essences'); } catch {}
  ipcMain.handle('get-poe1-essences', async () => {
    try {
      return await loadPoe1Essences();
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-embers'); } catch {}
  ipcMain.handle('get-poe1-embers', async () => {
    try {
      return await loadPoe1Embers();
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-fossils'); } catch {}
  ipcMain.handle('get-poe1-fossils', async () => {
    try {
      return await loadPoe1Fossils();
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-currency'); } catch {}
  ipcMain.handle('get-poe1-currency', async () => {
    try {
      return await loadPoe1Currency();
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-scarabs'); } catch {}
  ipcMain.handle('get-poe1-scarabs', async () => {
    try {
      return await loadPoe1Scarabs();
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-horticrafting'); } catch {}
  ipcMain.handle('get-poe1-horticrafting', async () => {
    try {
      return await loadPoe1Horticrafting();
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-bestiary'); } catch {}
  ipcMain.handle('get-poe1-bestiary', async () => {
    try {
      return await loadPoe1Bestiary();
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-runegrafts'); } catch {}
  ipcMain.handle('get-poe1-runegrafts', async () => {
    try {
      return await loadPoe1Runegrafts();
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-divination-cards'); } catch {}
  ipcMain.handle('get-poe1-divination-cards', async () => {
    try {
      return await loadPoe1DivinationCards();
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-tattoos'); } catch {}
  ipcMain.handle('get-poe1-tattoos', async () => {
    try {
      return await loadPoe1Tattoos();
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-anointments'); } catch {}
  ipcMain.handle('get-poe1-anointments', async () => {
    try {
      return await loadPoe1Anointments();
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-gems'); } catch {}
  ipcMain.handle('get-poe1-gems', async () => {
    try {
      return await loadPoe1Gems();
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-ascendancy-notables'); } catch {}
  ipcMain.handle('get-poe1-ascendancy-notables', async () => {
    try {
      return await loadPoe1AscendancyNotables();
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  try { ipcMain.removeHandler('get-poe1-gem-detail'); } catch {}
  ipcMain.handle('get-poe1-gem-detail', async (_event, gemSlug: string) => {
    try {
      const detailPath = toDataPath('items', 'gems', 'details', `${gemSlug}.json`);
      try {
        return await jsonCache.get(detailPath);
      } catch (err: any) {
        const error = err?.code === 'ENOENT' ? 'not_found' : err?.message || 'unknown_error';
        return { error, filePath: detailPath };
      }
    } catch (e: any) {
      return { error: e?.message || 'unknown_error' };
    }
  });

  void runPreloadTasks();
}
