/**
 * historyList.ts
 * 
 * Trade history list rendering:
 * - Render list of trade entries
 * - Handle row selection
 * - Show relative timestamps
 * - Display trade count
 */

import { historyState } from './historyData';
import { historyVisible } from './historyView';
import { normalizeCurrency, escapeHtml } from '../utils';
import { renderVirtualHistoryList } from './historyVirtualScroll';

declare global {
  interface Window {
    __historyListSelectIndex?: (idx: number, opts?: { scroll?: boolean }) => void;
    __historyListKeyNavAttached?: boolean;
  }
}

/**
 * Convert timestamp to relative time string (e.g., "5m ago", "2h ago", "3d ago").
 * 
 * @param ts - Timestamp in seconds or milliseconds, or ISO date string
 * @returns Human-readable relative time string
 */
export function toRelativeTime(ts: number | string): string {
  try {
    const t = typeof ts === "number" ? (ts > 1e12 ? ts : (ts as number) * 1000) : Date.parse(ts as string);
    const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  } catch {
    return "";
  }
}

/**
 * Render the trade history list.
 * Shows filtered/sorted items with price badges and relative timestamps.
 * Clicking a row updates the selection and renders detail panel.
 * 
 * Uses virtual scrolling for optimal performance with any dataset size.
 * 
 * Renders callback from historyView.ts when view is active.
 */
export function renderHistoryList(renderDetailCallback: (idx: number) => void): void {
  if (!historyVisible()) return;
  
  const histList = document.getElementById("historyList");
  if (!histList) return;
  if (!histList.hasAttribute('tabindex')) {
    histList.setAttribute('tabindex', '0');
  }
  
  // Update trade count
  const cntEl = document.getElementById("historyTradeCount");
  if (cntEl) {
    const totalCount = (historyState.store?.entries || []).length;
    (cntEl as HTMLElement).textContent = totalCount ? `${totalCount} trades` : "";
  }
  
  // Show empty state if no items
  if (!historyState.items || historyState.items.length === 0) {
    (histList as HTMLElement).innerHTML = '<div class="no-mods" style="padding:8px;">No history found.</div>';
    return;
  }
  
  // Always use virtual scrolling for optimal performance
  renderVirtualHistoryList(renderDetailCallback);
}
