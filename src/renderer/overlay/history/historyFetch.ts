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
import { nextAllowedRefreshAt, updateHistoryRefreshButton, setRateLimitInfo, parseRateLimitHeaders } from './historyRateLimit';
import { autoRefreshManager } from './autoRefresh';
import { updateSessionUI } from './sessionManager';
import { sendHistoryToPopout } from './historyPopout';
import { recomputeChartSeriesFromStore, drawHistoryChart, updateHistoryChartFromTotals } from './historyChart';
import { getLeaguePreference, setLeaguePreference, showLeaguePrompt, formatLeagueLabel } from './historyLeague';

function isPoe1Mode(): boolean {
  try {
    return ((window as any).__overlayVersionMode || 'poe2') === 'poe1';
  } catch {
    return false;
  }
}

function extractRowsFromResponse(res: any): any[] {
  if (!res) return [];
  const payload = (res as any).data ?? res;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.entries)) return payload.entries;
  if (Array.isArray(payload)) return payload;
  return [];
}

function showInfoBadge(message: string, duration = 4000): void {
  const info = document.getElementById('historyInfoBadge');
  if (!info) return;
  info.textContent = message;
  (info as HTMLElement).style.display = '';
  window.setTimeout(() => {
    if (info.textContent === message) {
      (info as HTMLElement).style.display = 'none';
    }
  }, duration);
}

// Auto-detection removed to prevent rate-limit loops when users have no history in their league

async function handleRateLimitedResponse(
  res: any,
  histList: HTMLElement,
  renderListCallback: (renderDetailCallback: (idx: number) => void) => void,
  renderDetailCallback: (idx: number) => void
): Promise<void> {
  const retryAfter = Number((res as any)?.retryAfter || 0) || 0;
  if (retryAfter > 0) {
    const until = Date.now() + (retryAfter * 1000);
    historyState.rateLimitUntil = Math.max(historyState.rateLimitUntil || 0, until);
  }

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

  if (historyState.store.entries && historyState.store.entries.length > 0) {
    const all = (historyState.store.entries || []).slice().reverse();
    historyState.items = applySort(applyFilters(all, historyState.filters), historyState.sort);
    historyState.selectedIndex = 0;
    renderListCallback(renderDetailCallback);
    renderDetailCallback(0);
    renderHistoryTotals(historyState.store, () => historyVisible(), (totals) => {
      try { updateHistoryChartFromTotals(totals); } catch {}
    }, { entries: historyState.items });
    renderHistoryActiveFilters(historyState, () => historyVisible(), () => {
      renderListCallback(renderDetailCallback);
      renderHistoryTotals(historyState.store, () => historyVisible(), (totals) => {
        try { updateHistoryChartFromTotals(totals); } catch {}
      }, { entries: historyState.items });
    });
    try { recomputeChartSeriesFromStore(); drawHistoryChart(); } catch {}
  }
}

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
  if (isPoe1Mode()) {
    console.log('[History] Refresh blocked in PoE1 mode');
    return;
  }
  // Defensive: log the types we were passed (helps diagnose minified t() errors)
  try {
    const rlType = typeof renderListCallback;
    const rdType = typeof renderDetailCallback;
    if (rlType !== 'function' || rdType !== 'function') {
      console.warn('[History] refreshHistory called with non-function callbacks', { rlType, rdType, renderListCallback, renderDetailCallback });
      return; // Abort to avoid mysterious "t is not a function" crashes
    }
  } catch {}
  const histList = document.getElementById("historyList");
  const histDet = document.getElementById("historyDetail");
  if (!histList || !histDet) return;
  
  // Check if league has been explicitly set by user
  if (!historyState.leagueExplicitlySet) {
    (histList as HTMLElement).innerHTML = `
      <div class="no-mods" style="padding:16px;line-height:1.6;">
        <div style="font-size:14px;font-weight:500;margin-bottom:12px;">👋 Welcome to Merchant History!</div>
        <div style="font-size:13px;color:#bbb;margin-bottom:8px;">
          Before fetching your trade history, please select your league:
        </div>
        <div style="font-size:12px;color:#999;">
          1. Click the <strong>Settings</strong> icon (top-left gear)<br/>
          2. Select your league under <strong>"Merchant History League"</strong><br/>
          3. Come back here and click <strong>Refresh</strong>
        </div>
      </div>`;
    console.log('[History] League not explicitly set – showing welcome message');
    return;
  }
  
  // Show loading state only if we don't already have items displayed
  if (!historyState.items || historyState.items.length === 0) {
    (histList as HTMLElement).innerHTML = '<div class="no-mods" style="padding:8px;">Loading…</div>';
  }
  
  try {
    let rows: any[] = [];
    let res: any = await (window as any).electronAPI.poeFetchHistory(historyState.league);
    
    // Track last response status for debugging
    if (res?.status !== undefined) {
      historyState.lastResponseStatus = res.status;
    }
    
    // ========== Handle Rate Limiting ==========
    if ((res as any)?.rateLimited) {
      await handleRateLimitedResponse(res, histList, renderListCallback, renderDetailCallback);
      return;
    }
    
    // ========== Handle Fetch Failure ==========
    if (!(res as any)?.ok) {
      historyState.lastRefreshAt = Date.now();
      const loggedIn = await updateSessionUI();
      
      // If not logged in and no cached data, show login prompt
      if (!loggedIn && (!historyState.items || historyState.items.length === 0)) {
        (histList as HTMLElement).innerHTML = '<div class="no-mods" style="padding:8px;">Please log in to pathofexile.com to view history.</div>';
      } else if (historyState.store.entries && historyState.store.entries.length > 0) {
        // Re-render from cache
        const all = (historyState.store.entries || []).slice().reverse();
        historyState.items = applySort(applyFilters(all, historyState.filters), historyState.sort);
        historyState.selectedIndex = 0;
        renderListCallback(renderDetailCallback);
        renderDetailCallback(0);
        renderHistoryTotals(historyState.store, () => historyVisible(), (totals) => {
          try { updateHistoryChartFromTotals(totals); } catch {}
        }, { entries: historyState.items });
        renderHistoryActiveFilters(historyState, () => historyVisible(), () => {
          renderListCallback(renderDetailCallback);
          renderHistoryTotals(historyState.store, () => historyVisible(), (totals) => {
            try { updateHistoryChartFromTotals(totals); } catch {}
          }, { entries: historyState.items });
        });
        try { recomputeChartSeriesFromStore(); drawHistoryChart(); } catch {}
      }
      
      // Show error badge
      const info = document.getElementById("historyInfoBadge");
      if (info) {
        (info as HTMLElement).style.display = "";
        (info as HTMLElement).textContent = loggedIn ? "Fetch failed" : "Not logged in";
        setTimeout(() => {
          if (info) (info as HTMLElement).style.display = "none";
        }, 4000);
      }
      
      try { updateHistoryRefreshButton(); } catch {}
      return;
    }
    
    // Sync league with response if main defaulted to stored preference
    const responseLeagueRaw = typeof (res as any)?.league === 'string' ? String((res as any).league).trim() : '';
    if (responseLeagueRaw && responseLeagueRaw !== historyState.league) {
      await setLeaguePreference(responseLeagueRaw, historyState.leagueSource === 'manual' ? 'manual' : 'auto', { persist: false, reason: 'sync' });
    }

    // ========== Extract Rows from Response ==========
    rows = extractRowsFromResponse(res);

    // If no data found, show league selection prompt (no auto-detection to avoid rate-limit loops)
    if (!rows || rows.length === 0) {
      (histList as HTMLElement).innerHTML =
        `<div class="no-mods" style="padding:8px;">No history returned for ${formatLeagueLabel(historyState.league)}.<br/><br/>` +
        `This usually means the selected league doesn't match your character (Softcore vs Hardcore).` +
        `<br/><br/>Pick the correct league in <strong>Settings</strong> (top-left gear icon) to resume.</div>`;
      showInfoBadge(`No trades found for ${formatLeagueLabel(historyState.league)}. Double-check your league choice; auto-refresh is paused until you switch.`);
      try { autoRefreshManager.stopAutoRefresh(); } catch {}
      showLeaguePrompt('empty-data', { previousLeague: historyState.league });
      return;
    }
    
    // ========== Success: Process Metadata ==========
    const lf = Number((res as any)?.lastFetchAt || 0) || 0;
    if (lf) historyState.remoteLastFetchAt = lf;
    
    const mi = Number((res as any)?.minInterval || 0) || 0;
    if (mi > 0) historyState.globalMinInterval = mi;
    
    // Store rate limit info from headers for display
    if ((res as any)?.headers) {
      try { setRateLimitInfo((res as any).headers); } catch {}
      try {
        const until = parseRateLimitHeaders((res as any).headers, (res as any)?.status);
        if (typeof until === 'number') {
          historyState.rateLimitUntil = until > Date.now() ? until : 0;
        }
      } catch (e) {
        console.warn('[History] Failed to interpret rate limit headers', e);
      }
    }
    
    // ========== Normalize and Merge Data ==========
    const normalized = rows.map((r: any) => {
      // Extract item_id from various possible locations
      let itemId = r.item_id || r.itemId;
      
      // If not at root, check inside item.id (this is where GGG puts it)
      if (!itemId) {
        const item = r.item || (r.data && r.data.item);
        if (item && typeof item === 'object' && item.id) {
          itemId = item.id;
        }
      }
      
      return {
        time: r.time || r.listedAt || r.date,
        item_id: itemId,
        price: r.price || (r.amount ? { amount: r.amount, currency: r.currency } : undefined),
        item: r.item || (r.data && r.data.item) || r,
        note: r.note || (r.price && r.price.raw),
        ts: canonicalTs(r)
      };
    });
    
    // Helper: Check if an entry has complete item data
    const isCompleteEntry = (r: any): boolean => {
      const item = r.item;
      if (!item || item === null) return false;
      if (typeof item === 'object' && !item.name && !item.typeLine && !item.baseType) {
        return false;
      }
      return true;
    };
    
    // Helper: Generate unique key using item_id + time (most reliable)
    // For old entries without item_id at root level, try to extract from item.id
    const getEntryKey = (r: any): string => {
      let itemId = r.item_id || r.itemId || '';
      const time = r.time || r.ts || '';
      
      // For old entries, item_id might be inside item.id
      if (!itemId && r.item && typeof r.item === 'object') {
        itemId = r.item.id || '';
      }
      
      // item_id + time is the most reliable key (even incomplete entries have this)
      if (itemId && time) {
        return `${itemId}##${time}`;
      }
      
      // Fallback for very old data without item_id: use item name
      const item = r.item;
      let itemName = '';
      if (item && typeof item === 'object') {
        itemName = item.name || item.typeLine || item.baseType || '';
      }
      
      if (itemName && time) {
        return `${itemName}##${time}`;
      }
      
      // Last resort: just time (should never happen with GGG API data)
      return `##${time}`;
    };
    
    // Counters and flags
    let newCount = 0;
    let replacedCount = 0;
    let incompleteCount = 0;
    let backfilledCount = 0;
    let needsPersist = false;
    
    // Build map of existing entries by their unique key (item_id + time)
    // Also backfill item_id for old entries that have it in item.id but not at root
    const existingEntriesMap = new Map<string, any>();
    for (const entry of (historyState.store.entries || [])) {
      // Backfill item_id from item.id if missing at root level (for old data compatibility)
      const entryAny = entry as any;
      if (!entryAny.item_id && entryAny.item && typeof entryAny.item === 'object' && entryAny.item.id) {
        entryAny.item_id = entryAny.item.id;
        backfilledCount++;
        needsPersist = true;
      }
      
      const key = getEntryKey(entry);
      existingEntriesMap.set(key, entry);
    }
    
    if (backfilledCount > 0) {
      console.log(`[History] 🔧 Backfilled item_id for ${backfilledCount} old ${backfilledCount === 1 ? 'entry' : 'entries'}`);
    }

    // Process each normalized entry
    for (const entry of normalized) {
      const key = getEntryKey(entry);
      const existingEntry = existingEntriesMap.get(key);
      const isComplete = isCompleteEntry(entry);
      
      if (!isComplete) {
        incompleteCount++;
      }
      
      if (!existingEntry) {
        // New entry (complete or incomplete) - add it
        historyState.store.entries.push(entry);
        addToTotals(entry.price);
        newCount++;
        needsPersist = true;
      } else {
        // Entry already exists - check if we should replace it
        const existingIsComplete = isCompleteEntry(existingEntry);
        
        if (!existingIsComplete && isComplete) {
          // Replace incomplete entry with complete one
          console.log(`[History] Replacing incomplete entry with complete data for ${key}`);
          
          // Remove old totals
          const oldPrice = existingEntry.price || (existingEntry.amount ? { amount: existingEntry.amount, currency: existingEntry.currency } : undefined);
          if (oldPrice && oldPrice.currency && oldPrice.amount) {
            const cur = oldPrice.currency.toLowerCase();
            historyState.store.totals[cur] = Math.max(0, (historyState.store.totals[cur] || 0) - oldPrice.amount);
          }
          
          // Replace entry
          const index = historyState.store.entries.indexOf(existingEntry);
          if (index !== -1) {
            historyState.store.entries[index] = entry;
          }
          
          // Add new totals
          addToTotals(entry.price);
          
          replacedCount++;
          needsPersist = true;
        }
        // If both are complete or both are incomplete, keep existing (no change)
      }
    }
    
    // Log summary
    if (incompleteCount > 0) {
      console.warn(`[History] Received ${incompleteCount} incomplete ${incompleteCount === 1 ? 'entry' : 'entries'} (item: null). Keeping for price data - will be replaced when complete data arrives.`);
    }
    if (replacedCount > 0) {
      console.log(`[History] ✅ Replaced ${replacedCount} incomplete ${replacedCount === 1 ? 'entry' : 'entries'} with complete data!`);
      showInfoBadge(`✅ Updated ${replacedCount} ${replacedCount === 1 ? 'entry' : 'entries'} with complete data!`, 4000);
    }
    if (newCount > 0) {
      console.log(`[History] Added ${newCount} new ${newCount === 1 ? 'entry' : 'entries'}`);
    }

    if (needsPersist) {
      historyState.store.lastSync = Date.now();
      
      // Reconcile totals with entries to avoid drift
      try { recomputeTotalsFromEntries(historyState.store); } catch {}
    }
    
    const prevLastFetch = Number(historyState.store.lastFetchAt || 0);
    const fetchTimestamp = historyState.remoteLastFetchAt || Date.now();
    if (fetchTimestamp && fetchTimestamp !== prevLastFetch) {
      historyState.store.lastFetchAt = fetchTimestamp;
      needsPersist = true;
    }
    
    // ========== Update UI ==========
    historyState.items = (historyState.store.entries || []).slice().reverse();
    historyState.items = applySort(applyFilters(historyState.items, historyState.filters), historyState.sort);
    historyState.selectedIndex = 0;
    
    renderListCallback(renderDetailCallback);
    renderDetailCallback(0);
    renderHistoryTotals(historyState.store, () => historyVisible(), (totals) => {
      try { updateHistoryChartFromTotals(totals); } catch {}
    }, { entries: historyState.items });
    renderHistoryActiveFilters(historyState, () => historyVisible(), () => {
      renderListCallback(renderDetailCallback);
      renderHistoryTotals(historyState.store, () => historyVisible(), (totals) => {
        try { updateHistoryChartFromTotals(totals); } catch {}
      }, { entries: historyState.items });
    });
    
    try {
      recomputeChartSeriesFromStore();
      drawHistoryChart();
    } catch {}
    
    const refreshTs = historyState.store.lastFetchAt || historyState.remoteLastFetchAt || Date.now();
    historyState.lastRefreshAt = refreshTs;
    historyState.store.lastFetchAt = refreshTs;

    if (needsPersist) {
      try {
        await (window as any).electronAPI.historySave(historyState.store, historyState.league);
      } catch {}
    }
    
    try {
      updateHistoryRefreshButton();
    } catch {}
    
    // Send updated data to popout if it exists
    try {
      sendHistoryToPopout(historyState);
    } catch {}

    return true;
  } catch (e) {
    console.error('[History] Exception during refresh:', e);
    
    // Re-render from cache if we have it
    if (historyState.store.entries && historyState.store.entries.length > 0) {
      const all = (historyState.store.entries || []).slice().reverse();
      historyState.items = applySort(applyFilters(all, historyState.filters), historyState.sort);
      historyState.selectedIndex = 0;
      renderListCallback(renderDetailCallback);
      renderDetailCallback(0);
      renderHistoryTotals(historyState.store, () => historyVisible(), (totals) => {
        try { updateHistoryChartFromTotals(totals); } catch {}
      }, { entries: historyState.items });
      renderHistoryActiveFilters(historyState, () => historyVisible(), () => {
        renderListCallback(renderDetailCallback);
        renderHistoryTotals(historyState.store, () => historyVisible(), (totals) => {
          try { updateHistoryChartFromTotals(totals); } catch {}
        }, { entries: historyState.items });
      });
      try { recomputeChartSeriesFromStore(); drawHistoryChart(); } catch {}
    } else {
      // No cache - show error message
      (histList as HTMLElement).innerHTML =
        '<div class="no-mods" style="padding:8px;">Error loading history (timeout or network).<br/><br/>Tip: Click "View in browser", verify the page shows, then Refresh.</div>';
    }
    
    try { updateHistoryRefreshButton(); } catch {}
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
  if (isPoe1Mode()) {
    console.log('[History] refreshHistoryIfAllowed skipped in PoE1 mode', { origin });
    return false;
  }
  try {
    if (typeof renderListCallback !== 'function' || typeof renderDetailCallback !== 'function') {
      console.warn('[History] refreshHistoryIfAllowed invoked with bad callbacks', { origin, renderListCallbackType: typeof renderListCallback, renderDetailCallbackType: typeof renderDetailCallback });
      return; 
    }
  } catch {}
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
    renderHistoryTotals(historyState.store, () => historyVisible(), (totals) => {
      try { updateHistoryChartFromTotals(totals); } catch {}
    }, { entries: historyState.items });
    renderHistoryActiveFilters(historyState, () => historyVisible(), () => {
      renderListCallback(renderDetailCallback);
      renderHistoryTotals(historyState.store, () => historyVisible(), (totals) => {
        try { updateHistoryChartFromTotals(totals); } catch {}
      }, { entries: historyState.items });
    });
    updateHistoryRefreshButton();
    return false;
  }
  
  // Allowed - fetch from API
  return await refreshHistory(renderListCallback, renderDetailCallback);
}
