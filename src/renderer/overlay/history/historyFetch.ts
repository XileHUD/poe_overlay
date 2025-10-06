/**
 * historyFetch.ts
 * 
 * Trade history API fetching:
 * - Fetch history from GGG API via main process
 * - Handle rate limiting
 * - Process and normalize API responses
 * - Update local store
 * - Trigger UI updates
 */

import { historyState, keyForRow, canonicalTs } from './historyData';
import { historyVisible } from './historyView';
import { addToTotals, recomputeTotalsFromEntries, renderHistoryTotals } from './historyTotals';
import { applyFilters, renderHistoryActiveFilters } from './historyFilters';
import { applySort } from './historyFilters';
import { nextAllowedRefreshAt, updateHistoryRefreshButton } from './historyRateLimit';
import { updateSessionUI } from './sessionManager';
import { sendHistoryToPopout } from './historyPopout';
import { recomputeChartSeriesFromStore, drawHistoryChart, updateHistoryChartFromTotals } from './historyChart';

/**
 * Refresh trade history from GGG API.
 * 
 * Workflow:
 * 1. Call main process to fetch history
 * 2. Handle rate limiting (show countdown)
 * 3. Handle auth failures (prompt login)
 * 4. Process successful response:
 *    - Normalize API data
 *    - Merge with existing store
 *    - Recalculate totals
 *    - Save to disk
 *    - Update UI
 * 5. Send to popout window if open
 * 
 * @returns true if successful, undefined/void on failure
 */
export async function refreshHistory(
  renderListCallback: (renderDetailCallback: (idx: number) => void) => void,
  renderDetailCallback: (idx: number) => void
): Promise<boolean | void> {
  const histList = document.getElementById("historyList");
  const histDet = document.getElementById("historyDetail");
  if (!histList || !histDet) return;
  
  // Show loading state
  if (!historyState.items || historyState.items.length === 0) {
    (histList as HTMLElement).innerHTML = '<div class="no-mods" style="padding:8px;">Loading…</div>';
  }
  
  try {
    let rows: any[] = [];
    const res = await (window as any).electronAPI.poeFetchHistory(historyState.league);
    
    // ========== Handle Rate Limiting ==========
    if ((res as any)?.rateLimited) {
      const retryAfter = Number((res as any)?.retryAfter || 0) || 0;
      if (retryAfter > 0) {
        const until = Date.now() + (retryAfter * 1000);
        historyState.rateLimitUntil = Math.max(historyState.rateLimitUntil || 0, until);
      }
      
      // Show rate limit countdown
      const info = document.getElementById("historyInfoBadge");
      if (info) {
        (info as HTMLElement).style.display = "";
        const until = nextAllowedRefreshAt();
        const tick = () => {
          const ms = Math.max(0, until - Date.now());
          const s = Math.ceil(ms / 1000);
          const mins = Math.floor(s / 60);
          const secs = s % 60;
          if (mins > 0) {
            (info as HTMLElement).textContent = `Rate limited • ${mins}m ${secs}s`;
          } else {
            (info as HTMLElement).textContent = `Rate limited • ${s}s`;
          }
          if (ms > 0) setTimeout(tick, 1000);
          else (info as HTMLElement).style.display = "none";
        };
        tick();
      }
      
      try { updateHistoryRefreshButton(); } catch {}
      return;
    }
    
    // ========== Handle Fetch Failure ==========
    if (!(res as any)?.ok) {
      historyState.lastRefreshAt = Date.now();
      const loggedIn = await updateSessionUI();
      
      // If not logged in and no cached data, show login prompt
      if (!loggedIn && (!historyState.items || historyState.items.length === 0)) {
        (histList as HTMLElement).innerHTML = '<div class="no-mods" style="padding:8px;">Please log in to pathofexile.com to view history.</div>';
      }
      
      // Show error badge
      const info = document.getElementById("historyInfoBadge");
      if (info) {
        (info as HTMLElement).style.display = "";
        (info as HTMLElement).textContent = "Fetch failed";
        setTimeout(() => {
          if (info) (info as HTMLElement).style.display = "none";
        }, 4000);
      }
      
      try { updateHistoryRefreshButton(); } catch {}
      return;
    }
    
    // ========== Success: Process Metadata ==========
    const lf = Number((res as any)?.lastFetchAt || 0) || 0;
    if (lf) historyState.remoteLastFetchAt = lf;
    
    const mi = Number((res as any)?.minInterval || 0) || 0;
    if (mi > 0) historyState.globalMinInterval = mi;
    
    // ========== Extract Rows from Response ==========
    const json = (res as any).data || {};
    if (Array.isArray((json as any)?.result)) rows = (json as any).result;
    else if (Array.isArray((json as any)?.entries)) rows = (json as any).entries;
    else if (Array.isArray(json)) rows = json as any[];
    else rows = [];
    
    if (!rows || rows.length === 0) {
      (histList as HTMLElement).innerHTML =
        '<div class="no-mods" style="padding:8px;">No history returned by API. Open the page in browser and try again.</div>';
      return;
    }
    
    // ========== Normalize and Merge Data ==========
    const normalized = rows.map((r: any) => ({
      time: r.time || r.listedAt || r.date,
      price: r.price || (r.amount ? { amount: r.amount, currency: r.currency } : undefined),
      item: r.item || (r.data && r.data.item) || r,
      note: r.note || (r.price && r.price.raw),
      ts: canonicalTs(r)
    }));
    
    const existingKeys = new Set((historyState.store.entries || []).map(keyForRow));
    const newOnes = normalized.filter((r: any) => !existingKeys.has(keyForRow(r)));
    
    if (newOnes.length) {
      // Add to totals
      newOnes.forEach((r: any) => addToTotals((r as any).price));
      
      // Merge with store
      historyState.store.entries = (historyState.store.entries || []).concat(newOnes);
      historyState.store.lastSync = Date.now();
      
      // Reconcile totals with entries to avoid drift
      try { recomputeTotalsFromEntries(historyState.store); } catch {}
      
      // Save to disk
      try {
        await (window as any).electronAPI.historySave(historyState.store);
      } catch {}
    }
    
    // ========== Update UI ==========
    historyState.items = (historyState.store.entries || []).slice().reverse();
    historyState.items = applySort(applyFilters(historyState.items, historyState.filters), historyState.sort);
    historyState.selectedIndex = 0;
    
    renderListCallback(renderDetailCallback);
    renderDetailCallback(0);
    renderHistoryTotals(historyState.store, () => historyVisible(), (totals) => {
      try { updateHistoryChartFromTotals(totals); } catch {}
    });
    renderHistoryActiveFilters(historyState, () => historyVisible(), () => renderListCallback(renderDetailCallback));
    
    try {
      recomputeChartSeriesFromStore();
      drawHistoryChart();
    } catch {}
    
    historyState.lastRefreshAt = historyState.remoteLastFetchAt || Date.now();
    
    try {
      updateHistoryRefreshButton();
    } catch {}
    
    // Send updated data to popout if it exists
    try {
      sendHistoryToPopout(historyState);
    } catch {}
    
    return true;
  } catch (e) {
    (histList as HTMLElement).innerHTML =
      '<div class="no-mods" style="padding:8px;">Error loading history (timeout or network).<br/><br/>Tip: Click "View in browser", verify the page shows, then Refresh.</div>';
    try {
      updateHistoryRefreshButton();
    } catch {}
  }
}

/**
 * Refresh history if rate limit allows, otherwise just re-render from cache.
 * 
 * @param origin - Optional string describing where the refresh was triggered from
 * @returns true if fetch was allowed, false if rate limited
 */
export async function refreshHistoryIfAllowed(
  origin: string | undefined,
  renderListCallback: (renderDetailCallback: (idx: number) => void) => void,
  renderDetailCallback: (idx: number) => void
): Promise<boolean | void> {
  if (!historyVisible()) return;
  
  const now = Date.now();
  const nextAt = nextAllowedRefreshAt();
  
  if (now < nextAt) {
    // Rate limited - just re-render from cache
    const all = (historyState.store.entries || []).slice().reverse();
    historyState.items = applySort(applyFilters(all, historyState.filters), historyState.sort);
    historyState.selectedIndex = 0;
    renderListCallback(renderDetailCallback);
    renderDetailCallback(0);
    updateHistoryRefreshButton();
    return false;
  }
  
  // Allowed - fetch from API
  return await refreshHistory(renderListCallback, renderDetailCallback);
}
