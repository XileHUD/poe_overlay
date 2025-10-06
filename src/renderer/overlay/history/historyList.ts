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
 * Renders callback from historyView.ts when view is active.
 */
export function renderHistoryList(renderDetailCallback: (idx: number) => void): void {
  if (!historyVisible()) return;
  
  const histList = document.getElementById("historyList");
  if (!histList) return;
  
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
  
  // Render rows
  const rows = historyState.items
    .map((it: any, idx: number) => {
      const rel = toRelativeTime(it?.time || it?.listedAt || it?.date || 0);
      const time = rel || (it?.timeText || "");
      const amount = it?.price?.amount ?? it?.amount ?? "?";
      const currency = normalizeCurrency(it?.price?.currency ?? it?.currency ?? "");
      const curClass = currency ? `currency-${currency}` : "";
      const name = it?.item?.name || it?.item?.typeLine || it?.item?.baseType || "Item";
      
      return `<div data-idx="${idx}" class="history-row" style="padding:8px; border-bottom:1px solid var(--border-color); cursor:pointer; ${
        idx === historyState.selectedIndex ? "background: var(--bg-secondary);" : ""
      }">
        <div style="display:flex; justify-content:space-between; gap:6px; align-items:center;">
          <div style="font-weight:600; color:var(--text-primary);">Sold: ${escapeHtml(name)}</div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="price-badge ${curClass}"><span class="amount">${amount}</span> ${currency}</span>
            <div style="color:var(--text-muted); font-size:11px;">${time}</div>
          </div>
        </div>
        <div style="color:var(--text-secondary);"></div>
      </div>`;
    })
    .join("");
  
  (histList as HTMLElement).innerHTML = rows;
  
  // Attach click handlers
  histList.querySelectorAll(".history-row").forEach((el) => {
    el.addEventListener("click", (ev: any) => {
      const target: any = ev.currentTarget || ev.target;
      const idxAttr = target && target.dataset ? target.dataset.idx : undefined;
      const idx = Number(idxAttr || 0);
      
      historyState.selectedIndex = idx;
      renderHistoryList(renderDetailCallback);
      renderDetailCallback(idx);
    });
  });
}
