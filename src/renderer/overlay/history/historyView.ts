/**
 * History View Lifecycle
 * Manages view visibility tracking and prevents memory leaks
 */

// View generation tracking prevents async operations from updating DOM after view switch
let _viewGeneration = 0;
let _activeGeneration = 0;

/**
 * Check if history view is currently visible
 */
export function historyVisible(): boolean {
  try {
    if (!document.body.classList.contains('view-history')) return false;
    const wrap = document.getElementById('historyContainer');
    if (!wrap) return false;
    if ((wrap as HTMLElement).style.display === 'none') return false;
  } catch { 
    return false; 
  }
  return true;
}

/**
 * Check if current async operation is still valid
 */
export function isActiveGeneration(): boolean {
  return _activeGeneration === _viewGeneration;
}

/**
 * Called when entering history view
 */
export function onEnterView(renderCallbacks: {
  renderTotals: () => void;
  renderFilters: () => void;
  renderList: () => void;
  renderDetail: (idx: number) => void;
  drawChart: () => void;
  updateRefreshButton: () => void;
}, hasData: () => boolean): void {
  _viewGeneration += 1;
  _activeGeneration = _viewGeneration;
  
  // Defensive: ensure ALL headers are visible (some crafting panels aggressively hide them)
  try {
    const hh = document.getElementById('historyHeader');
    if (hh) (hh as HTMLElement).style.display = 'flex';
    const hhMain = document.getElementById('historyHeaderMain');
    if (hhMain) (hhMain as HTMLElement).style.display = 'flex';
  } catch {}
  
  // When (re)entering, re-render if we already have data
  try {
    if (hasData()) {
      renderCallbacks.renderTotals();
      renderCallbacks.renderFilters();
      renderCallbacks.renderList();
      renderCallbacks.renderDetail(0);
      renderCallbacks.drawChart();
      renderCallbacks.updateRefreshButton();
    }
  } catch {}
}

/**
 * Called when leaving history view
 */
export function onLeaveView(): void {
  // Invalidate future async callbacks
  _activeGeneration = -1;
}
