/**
 * History Data Management
 * Core state, types, and data utilities
 */

import type { GroupedHistoryEntry } from './historyGrouping';

export type Price = { amount?: number; currency?: string } | undefined;

export interface HistoryEntryRaw {
  time?: number | string;
  listedAt?: number | string;
  date?: number | string;
  price?: Price;
  amount?: number;
  currency?: string;
  item?: any;
  data?: { item?: any };
  note?: string;
}

export interface HistoryStore {
  entries: HistoryEntryRaw[];
  totals: Record<string, number>;
  lastSync: number;
  lastFetchAt?: number;
  endedLeague?: string; // Name of the league that ended (from 410 response)
}

export interface HistoryState {
  items: HistoryEntryRaw[];
  groupedItems: GroupedHistoryEntry[]; // Grouped version (collapsed)
  displayItems: any[]; // Expanded version for rendering (includes expanded groups)
  selectedIndex: number; // Index in displayItems array
  selectedOriginalIndex: number; // Corresponding index in original items array
  league: string;
  leagueSource: 'auto' | 'manual';
  leagueExplicitlySet: boolean; // true if user has explicitly selected a league (prevents auto-fetch on first load)
  store: HistoryStore;
  filters: { 
    min: number; 
    max: number; 
    cur: string; 
    category: string; 
    search: string; 
    rarity: string; 
    timeframe: string 
  };
  sort: string;
  lastRefreshAt: number;
  rateLimitUntil: number;
  globalMinInterval?: number;
  remoteLastFetchAt?: number;
  lastResponseStatus?: number; // HTTP status code from last fetch attempt (200, 429, 401, etc.)
}

/**
 * Get default league based on game version
 * NOTE: This is called lazily to ensure overlay version mode is set before reading it
 */
function getVersionDefaultLeague(): string {
  const mode = (window as any).__overlayVersionMode;
  return mode === 'poe1' ? 'Keepers of the Flame' : 'Fate of the Vaal';
}

/**
 * Global history state
 * NOTE: league field is initialized to empty string and will be set by initializeHistoryLeagueState()
 * This prevents using the wrong default if overlay version mode hasn't been set yet.
 */
export const historyState: HistoryState = {
  items: [],
  groupedItems: [], // Will be populated when items are filtered/sorted
  displayItems: [], // Expanded version for display
  selectedIndex: 0,
  selectedOriginalIndex: 0, // Will track the actual index in items array
  league: '', // Will be set by initializeHistoryLeagueState() based on stored preference or overlay version
  leagueSource: 'auto',
  leagueExplicitlySet: false, // Will be set to true when user selects league in Settings or after first successful fetch
  store: { entries: [], totals: {}, lastSync: 0, lastFetchAt: 0 },
  filters: { min: 0, max: 0, cur: "", category: "", search: "", rarity: "", timeframe: "all" },
  sort: "newest",
  lastRefreshAt: 0,
  rateLimitUntil: 0,
  // Minimum interval between remote fetches (default 15 minutes unless server enforces higher/lower)
  globalMinInterval: 900_000,
  remoteLastFetchAt: 0,
  lastResponseStatus: undefined, // Will be set after first fetch attempt
};

/**
 * Normalize timestamp to milliseconds
 */
export function canonicalTs(r: any): number {
  try {
    const raw = r?.time ?? r?.listedAt ?? r?.date ?? 0;
    if (!raw) return 0;
    if (typeof raw === 'number') {
      if (!isFinite(raw) || raw <= 0) return 0;
      return raw < 2_000_000_000 ? raw * 1000 : raw; // treat plausible seconds epoch
    }
    if (typeof raw === 'string' && raw.trim()) {
      const p = Date.parse(raw.trim());
      return isFinite(p) ? p : 0;
    }
  } catch {}
  return 0;
}

/**
 * Generate unique key for a history entry
 */
export function keyForRow(r: HistoryEntryRaw): string {
  const t = (r as any).time || (r as any).listedAt || (r as any).date || "";
  const item = (r as any).item || ((r as any).data && (r as any).data.item) || r;
  const name = item?.name || item?.typeLine || item?.baseType || "";
  return `${name}##${t}`;
}

/**
 * Delete a single entry from history by index
 * Updates totals, saves to disk, and returns true if successful
 */
export async function deleteHistoryEntry(idx: number): Promise<boolean> {
  try {
    const entry = historyState.items[idx];
    if (!entry) return false;
    
    // Find the entry in the store (store is in chronological order, items is filtered/sorted)
    const entryKey = keyForRow(entry);
    const storeIdx = historyState.store.entries.findIndex(e => keyForRow(e) === entryKey);
    
    if (storeIdx === -1) {
      console.error('[HistoryData] Could not find entry in store to delete');
      return false;
    }
    
    // Remove from totals
    const price = entry.price || (entry.amount ? { amount: entry.amount, currency: entry.currency } : undefined);
    if (price && price.currency && price.amount) {
      const cur = price.currency.toLowerCase();
      historyState.store.totals[cur] = Math.max(0, (historyState.store.totals[cur] || 0) - price.amount);
    }
    
    // Remove from store
    historyState.store.entries.splice(storeIdx, 1);
    historyState.store.lastSync = Date.now();
    
    // Save to disk
    await (window as any).electronAPI?.historySave?.(historyState.store, historyState.league);
    
    console.log(`[HistoryData] Deleted entry at index ${idx} (store index ${storeIdx})`);
    return true;
  } catch (e) {
    console.error('[HistoryData] Error deleting entry:', e);
    return false;
  }
}

/**
 * Initialize history from local storage
 */
export async function initHistoryFromLocal(
  recomputeTotals: () => void,
  applyFiltersAndSort: () => void,
  renderCallbacks: {
    renderList: () => void;
    renderDetail: (idx: number) => void;
    renderTotals: () => void;
    renderFilters: () => void;
    recomputeChartSeries: () => void;
    drawChart: () => void;
  }
): Promise<void> {
  console.log('[HistoryData] initHistoryFromLocal - loading history for league:', historyState.league);
  try {
    const saved = await (window as any).electronAPI?.historyLoad?.(historyState.league);
    console.log('[HistoryData] historyLoad returned:', saved ? 'data' : 'null', 'for league:', historyState.league);
    if (saved && typeof saved === 'object') {
  const entries = Array.isArray((saved as any).entries) ? (saved as any).entries : [];
  const totals = (saved as any).totals && typeof (saved as any).totals === 'object' ? (saved as any).totals : {};
  const lastSync = Number((saved as any).lastSync || 0) || 0;
  const lastFetchAt = Number((saved as any).lastFetchAt || lastSync || 0) || 0;
  const endedLeague = typeof (saved as any).endedLeague === 'string' ? (saved as any).endedLeague : undefined;
  historyState.store = { entries, totals, lastSync, lastFetchAt, endedLeague } as any;
      
      // Ensure totals are consistent with entries on load
      try { recomputeTotals(); } catch {}
      
      // Pre-populate UI lists and chart from local store
      applyFiltersAndSort();
      historyState.selectedIndex = 0;
      
      try { 
        renderCallbacks.renderList();
        renderCallbacks.renderDetail(0);
        renderCallbacks.renderTotals();
        renderCallbacks.renderFilters();
      } catch {}
      
      try { 
        renderCallbacks.recomputeChartSeries();
        renderCallbacks.drawChart();
      } catch {}

      historyState.lastRefreshAt = lastFetchAt;
      historyState.remoteLastFetchAt = lastFetchAt;
    }
  } catch {}
}
