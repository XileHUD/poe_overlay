/**
 * historyVirtualScroll.ts
 * 
 * Virtual scrolling implementation for trade history list.
 * Only renders visible items + buffer for smooth scrolling.
 * Drastically improves performance for large datasets (10k+ entries).
 */

import { historyState } from './historyData';
import { toRelativeTime } from './historyList';
import { normalizeCurrency, escapeHtml } from '../utils';
import { historyVisible } from './historyView';

interface VirtualScrollState {
  scrollTop: number;
  containerHeight: number;
  itemHeight: number;
  visibleStart: number;
  visibleEnd: number;
  bufferSize: number;
}

const DEFAULT_ITEM_HEIGHT = 48; // Default height estimate (will be measured dynamically)
const BUFFER_SIZE = 5; // Number of items to render above/below visible area
const SCROLL_SNAP_DELAY = 150; // ms to wait after manual scroll before snapping

let virtualState: VirtualScrollState = {
  scrollTop: 0,
  containerHeight: 0,
  itemHeight: DEFAULT_ITEM_HEIGHT,
  visibleStart: 0,
  visibleEnd: 20,
  bufferSize: BUFFER_SIZE
};

let lastManualScrollTime = 0;
let snapTimeout: number | null = null;

/**
 * Measure the actual height of a history row by rendering one temporarily
 */
function measureItemHeight(histList: HTMLElement): void {
  // Temporarily render a single item to measure height
  const tempItem = historyState.items?.[0];
  if (!tempItem) return;
  
  const tempRow = document.createElement('div');
  tempRow.style.position = 'absolute';
  tempRow.style.visibility = 'hidden';
  tempRow.innerHTML = renderHistoryRow(tempItem, 0);
  histList.appendChild(tempRow);
  
  const measuredHeight = tempRow.firstElementChild?.getBoundingClientRect().height || DEFAULT_ITEM_HEIGHT;
  histList.removeChild(tempRow);
  
  virtualState.itemHeight = measuredHeight;
  console.log(`[VirtualScroll] Measured item height: ${measuredHeight}px`);
}

/**
 * Calculate which items should be visible based on scroll position
 */
function calculateVisibleRange(scrollTop: number, containerHeight: number, totalItems: number): { start: number; end: number } {
  const { itemHeight, bufferSize } = virtualState;
  
  const visibleStart = Math.floor(scrollTop / itemHeight);
  const visibleEnd = Math.ceil((scrollTop + containerHeight) / itemHeight);
  
  // Add buffer above and below
  const start = Math.max(0, visibleStart - bufferSize);
  const end = Math.min(totalItems, visibleEnd + bufferSize);
  
  return { start, end };
}

/**
 * Render only the visible items in the list
 */
export function renderVirtualHistoryList(renderDetailCallback: (idx: number) => void): void {
  const histList = document.getElementById("historyList");
  if (!histList) return;
  
  const items = historyState.items || [];
  const totalItems = items.length;
  
  if (totalItems === 0) {
    (histList as HTMLElement).innerHTML = '<div class="no-mods" style="padding:8px;">No history found.</div>';
    return;
  }
  
  // Initialize virtual scrolling if not done yet
  if (!histList.dataset.virtualScrollInit) {
    initializeVirtualScroll(histList, renderDetailCallback);
  }
  
  // Update container height (it may change due to responsive breakpoints)
  const currentHeight = histList.clientHeight;
  if (currentHeight !== virtualState.containerHeight) {
    console.log(`[VirtualScroll] Container height changed: ${virtualState.containerHeight}px -> ${currentHeight}px`);
    virtualState.containerHeight = currentHeight;
  }
  
  // Calculate visible range
  const { start, end } = calculateVisibleRange(
    virtualState.scrollTop,
    virtualState.containerHeight,
    totalItems
  );
  
  console.log(`[VirtualScroll] Rendering items ${start}-${end} of ${totalItems}, containerHeight=${virtualState.containerHeight}px`);
  
  virtualState.visibleStart = start;
  virtualState.visibleEnd = end;
  
  // Measure actual item height if not yet measured
  if (virtualState.itemHeight === DEFAULT_ITEM_HEIGHT && items.length > 0) {
    measureItemHeight(histList);
  }
  
  // Create container with total height
  const totalHeight = totalItems * virtualState.itemHeight;
  const offsetTop = start * virtualState.itemHeight;
  
  // Render only visible items
  const visibleItems = items.slice(start, end);
  const rows = visibleItems.map((it: any, localIdx: number) => {
    const globalIdx = start + localIdx;
    return renderHistoryRow(it, globalIdx);
  }).join('');
  
  // Update DOM
  const content = `
    <div style="height: ${totalHeight}px; position: relative;">
      <div style="position: absolute; top: ${offsetTop}px; left: 0; right: 0;">
        ${rows}
      </div>
    </div>
  `;
  
  (histList as HTMLElement).innerHTML = content;
  
  // Attach click handlers to visible rows
  attachRowClickHandlers(histList, renderDetailCallback);
  
  // Update selection
  updateSelection(histList, renderDetailCallback);
}

/**
 * Render a single history row
 */
function renderHistoryRow(it: any, idx: number): string {
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
}

/**
 * Initialize virtual scrolling on the history list
 */
function initializeVirtualScroll(histList: HTMLElement, renderDetailCallback: (idx: number) => void): void {
  histList.dataset.virtualScrollInit = 'true';
  
  // Set up scroll handler with throttling
  let scrollTimeout: number | null = null;
  let isUserScrolling = false;
  
  histList.addEventListener('scroll', (e: Event) => {
    virtualState.scrollTop = histList.scrollTop;
    virtualState.containerHeight = histList.clientHeight;
    
    // Track manual scroll to prevent snap-to-top interference
    lastManualScrollTime = Date.now();
    isUserScrolling = true;
    
    // Clear any pending snap
    if (snapTimeout !== null) {
      window.clearTimeout(snapTimeout);
      snapTimeout = null;
    }
    
    // Throttle re-render to every 16ms (~60fps)
    if (scrollTimeout === null) {
      scrollTimeout = window.setTimeout(() => {
        renderVirtualHistoryList(renderDetailCallback);
        scrollTimeout = null;
        isUserScrolling = false;
        
        // Schedule snap-to-item-top after user stops scrolling
        snapTimeout = window.setTimeout(() => {
          const timeSinceLastScroll = Date.now() - lastManualScrollTime;
          if (timeSinceLastScroll >= SCROLL_SNAP_DELAY) {
            snapToNearestItem(histList);
          }
        }, SCROLL_SNAP_DELAY);
      }, 16);
    }
  });
  
  // Set up arrow key navigation
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    // Only handle arrow keys when history view is active and histList is focused
    if (!historyVisible()) return;
    if (document.activeElement !== histList) return;
    
    const items = historyState.items || [];
    if (items.length === 0) return;
    
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      e.preventDefault(); // Prevent browser scrolling
      
      const currentIdx = historyState.selectedIndex ?? 0;
      const newIdx = e.code === 'ArrowDown'
        ? Math.min(items.length - 1, currentIdx + 1)
        : Math.max(0, currentIdx - 1);
      
      if (newIdx !== currentIdx) {
        selectVirtualIndex(newIdx, histList, renderDetailCallback);
        scrollToVirtualIndex(newIdx, histList);
      }
    }
  });
  
  // Initial measurements
  virtualState.containerHeight = histList.clientHeight;
  virtualState.scrollTop = histList.scrollTop;
}

/**
 * Attach click handlers to visible rows
 */
function attachRowClickHandlers(histList: HTMLElement, renderDetailCallback: (idx: number) => void): void {
  histList.querySelectorAll('.history-row').forEach((row) => {
    row.addEventListener('click', () => {
      const idx = parseInt((row as HTMLElement).dataset.idx || '0', 10);
      selectVirtualIndex(idx, histList, renderDetailCallback);
    });
  });
}

/**
 * Select an item by index in virtual scroll
 */
export function selectVirtualIndex(idx: number, histList: HTMLElement | null, renderDetailCallback: (idx: number) => void): void {
  if (!historyState.items || !historyState.items.length) return;
  
  const max = historyState.items.length - 1;
  const safeIdx = Math.max(0, Math.min(max, idx));
  historyState.selectedIndex = safeIdx;
  
  // Update selection UI
  if (histList) {
    histList.querySelectorAll('.history-row.selected').forEach(el => el.classList.remove('selected'));
    const row = histList.querySelector(`.history-row[data-idx="${safeIdx}"]`) as HTMLElement | null;
    if (row) {
      row.classList.add('selected');
    }
  }
  
  renderDetailCallback(safeIdx);
}

/**
 * Update selection state in virtual list
 */
function updateSelection(histList: HTMLElement, renderDetailCallback: (idx: number) => void): void {
  const currentIndex = historyState.selectedIndex ?? 0;
  const items = historyState.items || [];
  if (items.length === 0) return;
  
  const safeIdx = Math.max(0, Math.min(items.length - 1, currentIndex));
  historyState.selectedIndex = safeIdx;
  
  // Update UI
  histList.querySelectorAll('.history-row.selected').forEach(el => el.classList.remove('selected'));
  const row = histList.querySelector(`.history-row[data-idx="${safeIdx}"]`) as HTMLElement | null;
  if (row) {
    row.classList.add('selected');
  }
  
  renderDetailCallback(safeIdx);
}

/**
 * Snap scroll position to nearest item top (only called after user stops scrolling)
 */
function snapToNearestItem(histList: HTMLElement): void {
  const currentScrollTop = histList.scrollTop;
  const itemHeight = virtualState.itemHeight;
  
  // Find the nearest item top
  const nearestItemIndex = Math.round(currentScrollTop / itemHeight);
  const targetScrollTop = nearestItemIndex * itemHeight;
  
  // Only snap if we're not already close enough (within 2px)
  if (Math.abs(currentScrollTop - targetScrollTop) > 2) {
    histList.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth'
    });
  }
}

/**
 * Scroll to a specific index (useful for keyboard navigation)
 */
export function scrollToVirtualIndex(idx: number, histList: HTMLElement | null): void {
  if (!histList) return;
  
  const items = historyState.items || [];
  const safeIdx = Math.max(0, Math.min(items.length - 1, idx));
  
  const targetScrollTop = safeIdx * virtualState.itemHeight;
  const containerHeight = histList.clientHeight;
  const currentScrollTop = histList.scrollTop;
  
  // Only scroll if item is not fully visible
  const itemBottom = targetScrollTop + virtualState.itemHeight;
  const visibleTop = currentScrollTop;
  const visibleBottom = currentScrollTop + containerHeight;
  
  if (targetScrollTop < visibleTop) {
    // Item is above visible area - scroll to show it at top
    histList.scrollTop = targetScrollTop;
  } else if (itemBottom > visibleBottom) {
    // Item is below visible area - scroll to show it at bottom
    histList.scrollTop = itemBottom - containerHeight;
  }
}
