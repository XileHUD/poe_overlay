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
  
  // Render rows
  const rows = historyState.items
    .map((it: any, idx: number) => {
      const rel = toRelativeTime(it?.time || it?.listedAt || it?.date || 0);
      const time = rel || (it?.timeText || "");
    const amountRaw = it?.price?.amount ?? it?.amount;
        const currency = normalizeCurrency(it?.price?.currency ?? it?.currency ?? "");
    const numericAmount = typeof amountRaw === 'number' ? amountRaw : Number(amountRaw);
    const hasPrice = Number.isFinite(numericAmount) && !!currency;
    const amount = hasPrice ? numericAmount : "?";
        const curClass = hasPrice ? `currency-${currency}` : "";
  const name = it?.item?.name || it?.item?.typeLine || it?.item?.baseType || "Item";
  const indexLabel = idx + 1;
  const isSelected = idx === historyState.selectedIndex;
  const rowClasses = `history-row${isSelected ? ' selected' : ''}`;
      
      return `<div data-idx="${idx}" class="${rowClasses}" style="padding:8px; border-bottom:1px solid var(--border-color); cursor:pointer;">
        <div style="display:flex; justify-content:space-between; gap:6px; align-items:center;">
          <div style="display:flex; align-items:center; gap:8px; min-width:0; overflow:hidden;">
            <span class="history-row-index" aria-hidden="true">${indexLabel}</span>
            <div class="history-row-title" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
          </div>
            <div style="display:flex; align-items:center; gap:8px; flex-shrink:0; white-space:nowrap;">
              ${hasPrice ? `<span class="price-badge ${curClass}" style="white-space:nowrap;"><span class="amount">${amount}</span> ${currency}</span>` : ''}
              <div style="color:var(--text-muted); font-size:11px; white-space:nowrap;">${time}</div>
          </div>
        </div>
        <div style="color:var(--text-secondary);"></div>
      </div>`;
    })
    .join("");
  
  (histList as HTMLElement).innerHTML = rows;

  const clampIndex = (idx: number): number => {
    const max = (historyState.items?.length ?? 0) - 1;
    if (max < 0) return 0;
    if (!Number.isFinite(idx)) return Math.max(0, Math.min(0, max));
    return Math.max(0, Math.min(max, idx));
  };

  const selectIndex = (idx: number, opts: { scroll?: boolean } = {}): void => {
    if (!historyState.items || !historyState.items.length) return;
    const safeIdx = clampIndex(idx);
    historyState.selectedIndex = safeIdx;

    histList.querySelectorAll('.history-row.selected').forEach(el => el.classList.remove('selected'));
    const row = histList.querySelector(`.history-row[data-idx="${safeIdx}"]`) as HTMLElement | null;
    if (row) {
      row.classList.add('selected');
      if (opts.scroll) {
        row.scrollIntoView({ block: 'nearest' });
      }
    }

    renderDetailCallback(safeIdx);
  };

  const currentIndex = clampIndex(historyState.selectedIndex ?? 0);
  selectIndex(currentIndex, { scroll: false });
  (histList as HTMLElement).dataset.selectedIdx = String(currentIndex);
  window.__historyListSelectIndex = selectIndex;

  if (!window.__historyListKeyNavAttached) {
    window.__historyListKeyNavAttached = true;
    document.addEventListener('keydown', (event: KeyboardEvent) => {
      if (!historyVisible()) return;
      const selectFn = window.__historyListSelectIndex;
      if (!selectFn) return;
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const activeTag = (document.activeElement && document.activeElement.tagName) || '';
      if (["INPUT", "TEXTAREA", "SELECT"].includes(activeTag)) return;
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const nextIdx = clampIndex((historyState.selectedIndex ?? 0) + delta);
      if (nextIdx === (historyState.selectedIndex ?? 0)) return;
      selectFn(nextIdx, { scroll: true });
    });
  }
  
  // Attach click handlers
  histList.querySelectorAll(".history-row").forEach((el) => {
    el.addEventListener("click", (ev: any) => {
      const target: any = ev.currentTarget || ev.target;
      const idxAttr = target && target.dataset ? target.dataset.idx : undefined;
      const idx = Number(idxAttr || 0);
      selectIndex(idx, { scroll: false });
    });
  });
}
