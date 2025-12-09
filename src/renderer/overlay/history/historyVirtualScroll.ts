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
  const tempItem = historyState.displayItems?.[0];
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
  
  // Use display items (expanded groups)
  const items = historyState.displayItems || [];
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
  const rows = visibleItems.map((groupedEntry: any, localIdx: number) => {
    const globalIdx = start + localIdx;
    return renderHistoryRow(groupedEntry, globalIdx);
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
 * Render a single history row (supports grouped entries with expand/collapse)
 */
function renderHistoryRow(displayItem: any, idx: number): string {
  // Extract entry and count from display item
  const it = displayItem.entry || displayItem;
  const count = displayItem.count || 1;
  const isGrouped = displayItem.isGrouped || false;
  const isExpanded = displayItem.isExpanded || false;
  const isSubItem = displayItem.isSubItem || false;
  const totalPrice = displayItem.totalPrice || 0;
  const currency = displayItem.currency || "";
  
  const rel = toRelativeTime(it?.time || it?.listedAt || it?.date || 0);
  const time = rel || (it?.timeText || "");
  
  // For individual items, show individual price
  let amountDisplay: string;
  let hasPrice: boolean;
  
  if (isGrouped && !isSubItem) {
    // Grouped item - show total price
    hasPrice = Number.isFinite(totalPrice) && totalPrice > 0 && !!currency;
    amountDisplay = hasPrice ? String(Math.round(totalPrice * 100) / 100) : "?";
  } else {
    // Individual item - show individual price
    const amountRaw = it?.price?.amount ?? it?.amount;
    const numericAmount = typeof amountRaw === 'number' ? amountRaw : Number(amountRaw);
    hasPrice = Number.isFinite(numericAmount) && !!currency;
    amountDisplay = hasPrice ? String(numericAmount) : "?";
  }
  
  const curClass = hasPrice ? `currency-${currency}` : "";
  const currencyDisplay = currency ? currency.charAt(0).toUpperCase() + currency.slice(1) : "";
  const rawName = it?.item?.name || it?.item?.typeLine || it?.item?.baseType || "Item";
  
  // Add count prefix if grouped, indent if sub-item
  let name = rawName;
  let namePrefix = "";
  
  if (isSubItem) {
    namePrefix = `<span style="color:var(--text-muted); margin-right:4px;">└</span>`;
  } else if (isGrouped) {
    name = `${count}× ${rawName}`;
  }
  
  // Expand/collapse icon for grouped items
  let expandIcon = "";
  if (isGrouped && !isSubItem) {
    const icon = isExpanded ? "▼" : "▶";
    expandIcon = `<span class="group-expand-icon" data-toggle-group="${idx}" style="cursor:pointer; margin-right:4px; user-select:none; color:var(--text-muted);">${icon}</span>`;
  }
  
  const indexLabel = idx + 1;
  const isSelected = idx === historyState.selectedIndex;
  const rowClasses = `history-row${isSelected ? ' selected' : ''}${isGrouped && !isSubItem ? ' grouped' : ''}${isSubItem ? ' sub-item' : ''}`;
  
  return `<div data-idx="${idx}" class="${rowClasses}" style="padding:8px; ${isSubItem ? 'padding-left:24px;' : ''} border-bottom:1px solid var(--border-color); cursor:pointer;">
    <div style="display:flex; justify-content:space-between; gap:6px; align-items:center;">
      <div style="display:flex; align-items:center; gap:8px; min-width:0; overflow:hidden;">
        <span class="history-row-index" aria-hidden="true">${indexLabel}</span>
        ${expandIcon}
        ${namePrefix}<div class="history-row-title" title="${escapeHtml(rawName)}">${escapeHtml(name)}</div>
      </div>
      <div style="display:flex; align-items:center; gap:8px; flex-shrink:0; white-space:nowrap;">
        ${hasPrice ? `<span class="price-badge ${curClass}" style="white-space:nowrap;"><span class="amount">${amountDisplay}</span>${currencyDisplay}</span>` : ''}
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
    
    // Clear any pending snap - this is the debounce
    if (snapTimeout !== null) {
      window.clearTimeout(snapTimeout);
      snapTimeout = null;
    }
    
    // Schedule snap-to-item-top after user stops scrolling (debounced)
    // This gets cleared and rescheduled on every scroll event, so it only fires
    // after SCROLL_SNAP_DELAY ms of no scroll events
    snapTimeout = window.setTimeout(() => {
      snapToNearestItem(histList);
      snapTimeout = null;
    }, SCROLL_SNAP_DELAY);
    
    // Throttle re-render to every 16ms (~60fps)
    if (scrollTimeout === null) {
      scrollTimeout = window.setTimeout(() => {
        renderVirtualHistoryList(renderDetailCallback);
        scrollTimeout = null;
        isUserScrolling = false;
      }, 16);
    }
  });
  
  // Set up arrow key navigation
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    // Only handle arrow keys when history view is active and histList is focused
    if (!historyVisible()) return;
    if (document.activeElement !== histList) return;
    
    const items = historyState.displayItems || [];
    if (items.length === 0) return;
    
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      e.preventDefault(); // Prevent browser scrolling
      
      const currentIdx = historyState.selectedIndex ?? 0;
      const newIdx = e.code === 'ArrowDown'
        ? Math.min(items.length - 1, currentIdx + 1)
        : Math.max(0, currentIdx - 1);
      
      if (newIdx !== currentIdx) {
        // Scroll first to prevent flashing
        scrollToVirtualIndex(newIdx, histList);
        // Then select and render
        selectVirtualIndex(newIdx, histList, renderDetailCallback);
        // Force immediate re-render to show correct item
        renderVirtualHistoryList(renderDetailCallback);
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
  // Handle row clicks
  histList.querySelectorAll('.history-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      
      // Check if click was on expand icon
      if (target.classList.contains('group-expand-icon') || target.hasAttribute('data-toggle-group')) {
        const displayIdx = parseInt(target.getAttribute('data-toggle-group') || (row as HTMLElement).dataset.idx || '0', 10);
        e.stopPropagation();
        
        // Import the toggle function
        const module = (window as any).__historyModule;
        if (module && typeof module.toggleGroupExpand === 'function') {
          module.toggleGroupExpand(displayIdx);
        }
        return;
      }
      
      // Regular row click - select item
      // The idx is in displayItems, we need to get the original index for detail rendering
      const displayIdx = parseInt((row as HTMLElement).dataset.idx || '0', 10);
      selectVirtualIndex(displayIdx, histList, renderDetailCallback);
    });
  });
}

/**
 * Select an item by index in virtual scroll
 */
export function selectVirtualIndex(idx: number, histList: HTMLElement | null, renderDetailCallback: (idx: number) => void): void {
  if (!historyState.displayItems || !historyState.displayItems.length) return;
  
  // idx is in the displayItems array
  const max = historyState.displayItems.length - 1;
  const safeIdx = Math.max(0, Math.min(max, idx));
  historyState.selectedIndex = safeIdx;
  
  // Get the original index from the display item to show the right details
  const displayItem = historyState.displayItems[safeIdx];
  historyState.selectedOriginalIndex = displayItem?.originalIndices?.[0] ?? 0;
  
  // Update selection UI
  if (histList) {
    histList.querySelectorAll('.history-row.selected').forEach(el => el.classList.remove('selected'));
    const row = histList.querySelector(`.history-row[data-idx="${safeIdx}"]`) as HTMLElement | null;
    if (row) {
      row.classList.add('selected');
    }
  }
  
  // Render detail for the first item in the display item
  renderDetailCallback(historyState.selectedOriginalIndex);
}

/**
 * Update selection state in virtual list
 * Works with displayItems (which includes expanded group sub-items)
 */
function updateSelection(histList: HTMLElement, renderDetailCallback: (idx: number) => void): void {
  const currentIndex = historyState.selectedIndex ?? 0;
  const items = historyState.displayItems || [];
  if (items.length === 0) return;
  
  const safeIdx = Math.max(0, Math.min(items.length - 1, currentIndex));
  historyState.selectedIndex = safeIdx;
  
  // Get original index for detail rendering
  const displayItem = items[safeIdx];
  const originalIdx = displayItem?.originalIndices?.[0] ?? 0;
  historyState.selectedOriginalIndex = originalIdx;
  
  // Update UI
  histList.querySelectorAll('.history-row.selected').forEach(el => el.classList.remove('selected'));
  const row = histList.querySelector(`.history-row[data-idx="${safeIdx}"]`) as HTMLElement | null;
  if (row) {
    row.classList.add('selected');
  }
  
  renderDetailCallback(originalIdx);
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
 * Uses displayItems to properly handle expanded groups
 */
export function scrollToVirtualIndex(idx: number, histList: HTMLElement | null): void {
  if (!histList) return;
  
  const items = historyState.displayItems || [];
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
    // Use immediate scroll to prevent flashing
    histList.scrollTop = targetScrollTop;
  } else if (itemBottom > visibleBottom) {
    // Item is below visible area - scroll to show it at bottom
    // Use immediate scroll to prevent flashing
    histList.scrollTop = itemBottom - containerHeight;
  }
  
  // Update virtual state to trigger immediate re-render
  virtualState.scrollTop = histList.scrollTop;
}
