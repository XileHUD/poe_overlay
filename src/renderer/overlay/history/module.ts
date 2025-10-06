/**
 * History Module - Main orchestrator
 * 
 * This module coordinates all history functionality by importing
 * and wiring together the modular components.
 */

// Import all extracted modules
import { 
  historyState, 
  initHistoryFromLocal, 
  type HistoryEntryRaw, 
  type HistoryStore, 
  type HistoryState, 
  type Price,
  keyForRow 
} from './historyData';
import { 
  historyVisible, 
  isActiveGeneration, 
  onEnterView as viewOnEnter, 
  onLeaveView as viewOnLeave 
} from './historyView';
import { 
  recomputeTotalsFromEntries, 
  renderHistoryTotals,
  addToTotals 
} from './historyTotals';
import { 
  renderHistoryActiveFilters, 
  applyFilters, 
  applySort 
} from './historyFilters';
import { 
  renderHistoryList 
} from './historyList';
import { 
  renderHistoryDetail 
} from './historyDetail';
import { 
  recomputeChartSeriesFromStore, 
  drawHistoryChart, 
  updateHistoryChartFromTotals,
  setChartCurrency 
} from './historyChart';
import { 
  refreshHistory, 
  refreshHistoryIfAllowed 
} from './historyFetch';
import { 
  nextAllowedRefreshAt, 
  updateHistoryRefreshButton, 
  parseRateLimitHeaders 
} from './historyRateLimit';
import { 
  openHistoryPopout, 
  handlePopoutRefreshRequest,
  sendHistoryToPopout
} from './historyPopout';
import { autoRefreshManager } from './autoRefresh';
import { updateSessionUI, attachLoginButtonLogic } from './sessionManager';
import { attachRefreshButtonLogic } from './refreshButton';

// Re-export types for external use
export type { HistoryEntryRaw, HistoryStore, HistoryState, Price };

// Re-export state
export { historyState };

// Re-export view lifecycle
export function onEnterView(): void {
  viewOnEnter(
    {
      renderTotals: () => {
        renderHistoryTotals(historyState.store, () => historyVisible(), (totals) => {
          try { updateHistoryChartFromTotals(totals); } catch {}
        });
      },
      renderFilters: () => {
        renderHistoryActiveFilters(historyState, () => historyVisible(), () => {
          renderHistoryList((idx) => renderHistoryDetail(idx));
        });
      },
      renderList: () => {
        renderHistoryList((idx) => renderHistoryDetail(idx));
      },
      renderDetail: (idx: number) => {
        renderHistoryDetail(idx);
      },
      drawChart: () => {
        drawHistoryChart();
      },
      updateRefreshButton: () => {
        updateHistoryRefreshButton();
      }
    },
    () => historyState.store.entries.length > 0
  );
}

export function onLeaveView(): void {
  viewOnLeave();
}

// Initialize on load
(async function init() {
  // Load from disk
  await initHistoryFromLocal(
    () => recomputeTotalsFromEntries(historyState.store),
    () => {
      const all = (historyState.store.entries || []).slice().reverse();
      historyState.items = applySort(applyFilters(all, historyState.filters), historyState.sort);
      historyState.selectedIndex = 0;
    },
    {
      renderList: () => renderHistoryList((idx) => renderHistoryDetail(idx)),
      renderDetail: (idx: number) => renderHistoryDetail(idx),
      renderTotals: () => {
        renderHistoryTotals(historyState.store, () => historyVisible(), (totals) => {
          try { updateHistoryChartFromTotals(totals); } catch {}
        });
      },
      renderFilters: () => {
        renderHistoryActiveFilters(historyState, () => historyVisible(), () => {
          renderHistoryList((idx) => renderHistoryDetail(idx));
        });
      },
      recomputeChartSeries: () => recomputeChartSeriesFromStore(),
      drawChart: () => drawHistoryChart()
    }
  );
  
  // Initialize session UI and login button
  setTimeout(() => { 
    try { 
      // Attach login button with auto-refresh on success
      attachLoginButtonLogic(() => {
        console.log('[Login] Starting auto-refresh system');
        autoRefreshManager.startAutoRefresh(async () => {
          await refreshHistory(
            (renderDetailCallback) => renderHistoryList(renderDetailCallback),
            (idx) => renderHistoryDetail(idx)
          );
        });
      });
      updateSessionUI(); 
    } catch {} 
  }, 300);
  
  // Attach refresh button
  setTimeout(() => {
    try {
      attachRefreshButtonLogic(async () => {
        await refreshHistory(
          (renderDetailCallback) => renderHistoryList(renderDetailCallback),
          (idx) => renderHistoryDetail(idx)
        );
      });
    } catch {}
  }, 300);
})();

// ========== Event Handlers ==========

// Filter change handlers
export function onFilterChange(): void {
  if (!historyVisible()) return;
  const all = (historyState.store.entries || []).slice().reverse();
  historyState.items = applySort(applyFilters(all, historyState.filters), historyState.sort);
  historyState.selectedIndex = 0;
  renderHistoryList((idx) => renderHistoryDetail(idx));
  renderHistoryDetail(0);
  renderHistoryActiveFilters(historyState, () => historyVisible(), () => {
    renderHistoryList((idx) => renderHistoryDetail(idx));
  });
}

// Sort change handlers
export function onSortChange(newSort: string): void {
  if (!historyVisible()) return;
  historyState.sort = newSort;
  historyState.items = applySort(historyState.items, historyState.sort);
  historyState.selectedIndex = 0;
  renderHistoryList((idx) => renderHistoryDetail(idx));
  renderHistoryDetail(0);
}

// Chart currency change
export function onChartCurrencyChange(cur: "divine" | "exalted" | "annul"): void {
  setChartCurrency(cur);
}

// Popout handlers
export function onOpenPopout(): void {
  openHistoryPopout(historyState);
}

export function onPopoutRefresh(): void {
  handlePopoutRefreshRequest(
    historyState,
    async () => {
      return await refreshHistory(
        (renderDetailCallback) => renderHistoryList(renderDetailCallback),
        (idx) => renderHistoryDetail(idx)
      );
    },
    () => sendHistoryToPopout(historyState)
  );
}

// Manual refresh
export async function onManualRefresh(): Promise<void> {
  await refreshHistory(
    (renderDetailCallback) => renderHistoryList(renderDetailCallback),
    (idx) => renderHistoryDetail(idx)
  );
}

// ========== HTML Compatibility Wrappers ==========
// These wrapper functions are called from overlay.html inline scripts

/**
 * Apply filters and re-render (called from HTML filter inputs)
 */
export function applyAndRender(): void {
  if (!historyVisible()) return;
  const all = (historyState.store.entries || []).slice().reverse();
  historyState.items = applySort(applyFilters(all, historyState.filters), historyState.sort);
  historyState.selectedIndex = 0;
  renderHistoryList((idx) => renderHistoryDetail(idx));
  renderHistoryDetail(0);
  renderHistoryActiveFilters(historyState, () => historyVisible(), () => {
    renderHistoryList((idx) => renderHistoryDetail(idx));
  });
}

/**
 * Render history list (called from HTML)
 */
export function renderHistoryListWrapper(): void {
  renderHistoryList((idx) => renderHistoryDetail(idx));
}

/**
 * Render history detail wrapper (called from HTML)
 */
export function renderHistoryDetailWrapper(idx: number): void {
  renderHistoryDetail(idx);
}

/**
 * Render history active filters wrapper (called from HTML)
 */
export function renderHistoryActiveFiltersWrapper(): void {
  renderHistoryActiveFilters(historyState, () => historyVisible(), () => {
    renderHistoryList((idx) => renderHistoryDetail(idx));
  });
}

/**
 * Render history totals wrapper (called from HTML)
 */
export function renderHistoryTotalsWrapper(): void {
  renderHistoryTotals(historyState.store, () => historyVisible(), (totals) => {
    try { updateHistoryChartFromTotals(totals); } catch {}
  });
}

/**
 * Add to totals wrapper (called from HTML)
 */
export function addToTotalsWrapper(price?: Price): void {
  addToTotals(historyState.store, price);
}

// Re-export utility functions that might be used externally
export {
  refreshHistory,
  refreshHistoryIfAllowed,
  updateHistoryRefreshButton,
  nextAllowedRefreshAt,
  parseRateLimitHeaders,
  recomputeTotalsFromEntries,
  applyFilters,
  applySort,
  setChartCurrency,
  openHistoryPopout,
  keyForRow,
  addToTotals,
  renderHistoryTotals,
  renderHistoryActiveFilters,
  renderHistoryList,
  renderHistoryDetail,
  recomputeChartSeriesFromStore,
  drawHistoryChart,
  updateHistoryChartFromTotals,
  updateSessionUI
};
