/**
 * History Data Management
 * Core state, types, and data utilities
 */

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
}

export interface HistoryState {
  items: HistoryEntryRaw[];
  selectedIndex: number;
  league: string;
  leagueSource: 'auto' | 'manual';
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
}

/**
 * Global history state
 */
export const historyState: HistoryState = {
  items: [],
  selectedIndex: 0,
  league: "Rise of the Abyssal",
  leagueSource: 'auto',
  store: { entries: [], totals: {}, lastSync: 0, lastFetchAt: 0 },
  filters: { min: 0, max: 0, cur: "", category: "", search: "", rarity: "", timeframe: "all" },
  sort: "newest",
  lastRefreshAt: 0,
  rateLimitUntil: 0,
  // Minimum interval between remote fetches (default 15 minutes unless server enforces higher/lower)
  globalMinInterval: 900_000,
  remoteLastFetchAt: 0,
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
  try {
    const saved = await (window as any).electronAPI?.historyLoad?.();
    if (saved && typeof saved === 'object') {
  const entries = Array.isArray((saved as any).entries) ? (saved as any).entries : [];
  const totals = (saved as any).totals && typeof (saved as any).totals === 'object' ? (saved as any).totals : {};
  const lastSync = Number((saved as any).lastSync || 0) || 0;
  const lastFetchAt = Number((saved as any).lastFetchAt || lastSync || 0) || 0;
  historyState.store = { entries, totals, lastSync, lastFetchAt } as any;
      
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
