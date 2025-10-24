// Virtual scrolling for modifier lists to handle large aggregated categories

export interface ModSection {
  key: string;
  data?: any;
  element?: HTMLElement;
  measuredHeight?: number; // Store actual measured height per section
}

interface VirtualScrollState {
  container: HTMLElement | null;
  itemsWrapper: HTMLElement | null;
  topSpacer: HTMLElement | null;
  bottomSpacer: HTMLElement | null;
  scrollContainer: HTMLElement | null;
  items: ModSection[];
  itemHeight: number;
  bufferSize: number;
  visibleStart: number;
  visibleEnd: number;
  totalHeight: number;
  lastScrollTop: number;
  renderCallback: (section: ModSection) => HTMLElement;
  afterRender: ((sections: ModSection[]) => void) | null;
  isInitialized: boolean;
  cumulativeHeights: number[]; // Cache cumulative positions for fast lookup
  resizeObserver: ResizeObserver | null; // Observe dynamic height changes
  firstRenderDone?: boolean; // Apply an initial overscan on fresh mount to avoid first-scroll hitch
  hasPrimedScroll?: boolean; // Ensure we warm the scroll pipeline before user interacts
}

// Re-enable virtual scrolling with a safer, dynamic-height strategy
const ENABLE_VIRTUAL_SCROLL = true;

const virtualState: VirtualScrollState = {
  container: null,
  itemsWrapper: null,
  topSpacer: null,
  bottomSpacer: null,
  scrollContainer: null,
  items: [],
  itemHeight: 180, // more realistic initial estimate (domains are ~150-250px)
  bufferSize: 8, // Large buffer to preload more content and reduce first-scroll hitch
  visibleStart: 0,
  visibleEnd: 0,
  totalHeight: 0,
  lastScrollTop: 0,
  renderCallback: () => document.createElement('div'),
  afterRender: null,
  isInitialized: false,
  cumulativeHeights: [], // Cache for fast position lookup
  resizeObserver: null,
  firstRenderDone: false,
  hasPrimedScroll: false,
};

let scrollThrottleTimer: number | null = null;

export function initModifierVirtualScroll(scrollContainer: HTMLElement): void {
  if (virtualState.scrollContainer === scrollContainer) return;

  if (virtualState.scrollContainer) {
    virtualState.scrollContainer.removeEventListener('scroll', handleScroll);
  }

  virtualState.scrollContainer = scrollContainer;
  virtualState.isInitialized = true;
  scrollContainer.addEventListener('scroll', handleScroll, { passive: true });

  // Lazily create a single ResizeObserver for all rendered sections
  if (!virtualState.resizeObserver) {
    try {
      virtualState.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const idxAttr = el.getAttribute('data-vs-index');
          if (!idxAttr) continue;
          const index = parseInt(idxAttr, 10);
          if (Number.isNaN(index)) continue;
          const newHeight = Math.round(entry.contentRect.height);
          onSectionMeasured(index, newHeight);
        }
      });
    } catch {
      virtualState.resizeObserver = null;
    }
  }
}

function handleScroll(): void {
  if (scrollThrottleTimer !== null) return;

  scrollThrottleTimer = window.setTimeout(() => {
    scrollThrottleTimer = null;
    const changed = updateVisibleRange();
    if (changed) {
      renderVisibleSections();
    }
  }, 8); // Faster response (120fps) to reduce perceived lag on first scroll
}

function updateVisibleRange(): boolean {
  if (!virtualState.scrollContainer) return false;

  const scrollTop = virtualState.scrollContainer.scrollTop;
  const viewportHeight = virtualState.scrollContainer.clientHeight;

  // Use cached cumulative heights for fast binary search
  const cumHeights = virtualState.cumulativeHeights;
  if (!cumHeights.length) {
    virtualState.visibleStart = 0;
    virtualState.visibleEnd = 0;
    virtualState.lastScrollTop = scrollTop;
    return false;
  }
  
  // Binary search for start index
  let startIndex = 0;
  let left = 0;
  let right = cumHeights.length - 1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (cumHeights[mid] <= scrollTop) {
      startIndex = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  startIndex = Math.max(0, startIndex - virtualState.bufferSize);
  
  // Binary search for end index
  let endIndex = cumHeights.length;
  left = 0;
  right = cumHeights.length - 1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (cumHeights[mid] < scrollTop + viewportHeight) {
      endIndex = mid + 1;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  endIndex = Math.min(virtualState.items.length, Math.max(endIndex, startIndex + 1) + virtualState.bufferSize);

  if (startIndex === virtualState.visibleStart && endIndex === virtualState.visibleEnd) {
    virtualState.lastScrollTop = scrollTop;
    return false;
  }

  virtualState.visibleStart = startIndex;
  virtualState.visibleEnd = endIndex;
  virtualState.lastScrollTop = scrollTop;
  return true;
}

function renderVisibleSections(): void {
  if (!virtualState.container || !virtualState.itemsWrapper || !virtualState.topSpacer || !virtualState.bottomSpacer) return;

  // On the very first render of a category, overscan an extra window (≈2x viewport) to avoid first-scroll hitch
  if (!virtualState.firstRenderDone) {
    const viewportHeight = virtualState.scrollContainer?.clientHeight || window.innerHeight || 800;
    const estimatedPerViewport = Math.max(4, Math.ceil(viewportHeight / Math.max(virtualState.itemHeight, 1)));
    const initialExtra = estimatedPerViewport * 2; // preload two additional viewports worth of sections
    if (virtualState.visibleStart === 0) {
      const newEnd = Math.min(virtualState.items.length, Math.max(virtualState.visibleEnd, estimatedPerViewport + initialExtra));
      if (newEnd !== virtualState.visibleEnd) {
        virtualState.visibleEnd = newEnd;
      }
    }
  }

  const visibleSections = virtualState.items.slice(
    virtualState.visibleStart,
    virtualState.visibleEnd
  );

  // Use cached cumulative heights for exact spacer calculation
  const topSpacerHeight = virtualState.visibleStart > 0 
    ? virtualState.cumulativeHeights[virtualState.visibleStart - 1] 
    : 0;
  virtualState.topSpacer.style.height = `${Math.max(0, topSpacerHeight)}px`;

  // Incremental render: reuse existing nodes when possible to reduce flicker
  const wrapper = virtualState.itemsWrapper;
  const desiredCount = visibleSections.length;

  // Ensure wrapper has exactly desiredCount children
  while (wrapper.childNodes.length > desiredCount) {
    const node = wrapper.lastChild as HTMLElement | null;
    if (node && virtualState.resizeObserver) virtualState.resizeObserver.unobserve(node);
    wrapper.removeChild(wrapper.lastChild as ChildNode);
  }

  for (let i = 0; i < desiredCount; i++) {
    const section = visibleSections[i];
    let element = section.element;
    if (!element) {
      element = virtualState.renderCallback(section);
      section.element = element;
    }
    // Tag element with its global index so ResizeObserver can map it
    const globalIndex = virtualState.visibleStart + i;
    element.setAttribute('data-vs-index', String(globalIndex));

    if (i < wrapper.childNodes.length) {
      if (wrapper.childNodes[i] !== element) {
        wrapper.replaceChild(element, wrapper.childNodes[i]);
      }
    } else {
      wrapper.appendChild(element);
    }

    // Observe dynamic height changes
    if (virtualState.resizeObserver) {
      virtualState.resizeObserver.observe(element);
    }
  }

  // Calculate bottom spacer using total height - top - visible content
  let visibleHeight = 0;
  if (virtualState.visibleEnd > virtualState.visibleStart) {
    if (virtualState.visibleEnd - 1 < virtualState.cumulativeHeights.length) {
      const endHeight = virtualState.cumulativeHeights[virtualState.visibleEnd - 1];
      visibleHeight = endHeight - topSpacerHeight;
    } else {
      visibleHeight = virtualState.totalHeight - topSpacerHeight;
    }
  }
  const bottomSpacerHeight = virtualState.totalHeight - topSpacerHeight - visibleHeight;
  virtualState.bottomSpacer.style.height = `${Math.max(0, bottomSpacerHeight)}px`;

  if (virtualState.afterRender) {
    virtualState.afterRender(visibleSections);
  }

  // CRITICAL FIX: If this was the first render, use requestAnimationFrame to measure heights
  // in the NEXT frame AFTER the browser has committed the layout. This ensures measurements
  // happen before the user can scroll, avoiding the first-scroll hitch.
  if (!virtualState.firstRenderDone && virtualState.visibleStart === 0) {
    virtualState.firstRenderDone = true;
    
    // Double-rAF: ensures we measure AFTER browser has fully committed layout and paint
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!virtualState.itemsWrapper) return;
        const wrapperChildren = virtualState.itemsWrapper.children;
        for (let i = 0; i < wrapperChildren.length; i++) {
          const el = wrapperChildren[i] as HTMLElement;
          const idxAttr = el.getAttribute('data-vs-index');
          const index = idxAttr ? parseInt(idxAttr, 10) : (virtualState.visibleStart + i);
          if (Number.isFinite(index)) {
            const h = Math.round(el.getBoundingClientRect().height);
            if (h > 0) onSectionMeasured(index, h);
          }
        }
        // Update spacers after measuring
        updateSpacers();

        // Warm the scroll pipeline now that measurements are stable
        primeInitialScroll();
      });
    });
  }
}

// Update cumulative heights when a section's measured height changes
function onSectionMeasured(index: number, measuredHeight: number): void {
  if (!Number.isFinite(measuredHeight) || measuredHeight <= 0) return;
  const section = virtualState.items[index];
  if (!section) return;
  const prev = section.measuredHeight ?? virtualState.itemHeight;
  if (Math.abs(prev - measuredHeight) < 2) return; // ignore tiny diffs (2px tolerance)

  const delta = measuredHeight - prev;
  section.measuredHeight = measuredHeight;

  // Adjust cumulative heights from index to end
  for (let i = index; i < virtualState.cumulativeHeights.length; i++) {
    virtualState.cumulativeHeights[i] = (virtualState.cumulativeHeights[i] || 0) + delta;
  }
  virtualState.totalHeight += delta;

  // Update container height
  if (virtualState.container) {
    virtualState.container.style.minHeight = `${virtualState.totalHeight}px`;
  }

  // If the changed section is above current viewport, maintain visual position by shifting scrollTop
  if (virtualState.scrollContainer && index < virtualState.visibleStart) {
    virtualState.scrollContainer.scrollTop += delta;
  }

  // Update spacers immediately to reflect new heights
  updateSpacers();
}

function updateSpacers(): void {
  if (!virtualState.topSpacer || !virtualState.bottomSpacer) return;

  const topSpacerHeight = virtualState.visibleStart > 0
    ? virtualState.cumulativeHeights[virtualState.visibleStart - 1]
    : 0;
  virtualState.topSpacer.style.height = `${Math.max(0, topSpacerHeight)}px`;

  let visibleHeight = 0;
  if (virtualState.visibleEnd > virtualState.visibleStart) {
    const endIdx = virtualState.visibleEnd - 1;
    const endHeight = virtualState.cumulativeHeights[Math.min(endIdx, virtualState.cumulativeHeights.length - 1)] || 0;
    visibleHeight = Math.max(0, endHeight - topSpacerHeight);
  }
  const bottomSpacerHeight = virtualState.totalHeight - topSpacerHeight - visibleHeight;
  virtualState.bottomSpacer.style.height = `${Math.max(0, bottomSpacerHeight)}px`;
}

function primeInitialScroll(): void {
  if (virtualState.hasPrimedScroll || !virtualState.scrollContainer) return;
  const sc = virtualState.scrollContainer;
  const originalTop = sc.scrollTop;

  // If there isn't enough content to scroll, nothing to prime
  if (sc.scrollHeight <= sc.clientHeight + 1) {
    virtualState.hasPrimedScroll = true;
    return;
  }

  virtualState.hasPrimedScroll = true;

  // Programmatically nudge the scroll position to exercise the scroll pipeline ahead of user input
  const scrolledMax = sc.scrollHeight - sc.clientHeight;
  const target = Math.min(scrolledMax, originalTop + Math.max(1, Math.min(2, scrolledMax - originalTop)));
  if (target !== originalTop) {
    sc.scrollTop = target;
    updateVisibleRange();
    renderVisibleSections();
  }

  requestAnimationFrame(() => {
    if (!virtualState.scrollContainer) return;
    virtualState.scrollContainer.scrollTop = originalTop;
    updateVisibleRange();
    renderVisibleSections();
  });
}

export function renderModifierVirtualList(
  sections: ModSection[],
  resultsWrapper: HTMLElement,
  renderCallback: (section: ModSection) => HTMLElement,
  afterRender?: (sections: ModSection[]) => void
): void {
  if (!resultsWrapper) return;

  if (!ENABLE_VIRTUAL_SCROLL) {
    cleanupModifierVirtualScroll();
    resultsWrapper.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'mod-virtual-disabled';
    const fragment = document.createDocumentFragment();
    sections.forEach((section) => {
      const element = renderCallback(section);
      section.element = element;
      fragment.appendChild(element);
    });
    container.appendChild(fragment);
    resultsWrapper.appendChild(container);
    if (afterRender) afterRender(sections);
    return;
  }

  virtualState.items = sections;
  virtualState.renderCallback = renderCallback;
  virtualState.afterRender = afterRender ?? null;
  virtualState.firstRenderDone = false;
  virtualState.hasPrimedScroll = false;
  // Initialize cumulative heights with estimates; they will refine via ResizeObserver
  virtualState.cumulativeHeights = new Array(sections.length);
  let cum = 0;
  for (let i = 0; i < sections.length; i++) {
    const est = sections[i].measuredHeight ?? virtualState.itemHeight;
    cum += est;
    virtualState.cumulativeHeights[i] = cum;
  }
  virtualState.totalHeight = cum;
  virtualState.visibleStart = 0;
  virtualState.visibleEnd = 0;

  let container = resultsWrapper.querySelector('#mod-virtual-container') as HTMLElement | null;
  if (!container) {
    container = document.createElement('div');
    container.id = 'mod-virtual-container';
    container.style.position = 'relative';
    container.style.width = '100%';
    container.style.minHeight = `${virtualState.totalHeight}px`;
    resultsWrapper.innerHTML = '';
    resultsWrapper.appendChild(container);

    const topSpacer = document.createElement('div');
    topSpacer.className = 'mod-virtual-spacer top';
    const itemsWrapper = document.createElement('div');
    itemsWrapper.className = 'mod-virtual-items';
    const bottomSpacer = document.createElement('div');
    bottomSpacer.className = 'mod-virtual-spacer bottom';

    container.appendChild(topSpacer);
    container.appendChild(itemsWrapper);
    container.appendChild(bottomSpacer);

    virtualState.topSpacer = topSpacer;
    virtualState.itemsWrapper = itemsWrapper;
    virtualState.bottomSpacer = bottomSpacer;
  } else {
    container.style.minHeight = `${virtualState.totalHeight}px`;
    virtualState.topSpacer = container.querySelector('.mod-virtual-spacer.top') as HTMLElement | null;
    virtualState.itemsWrapper = container.querySelector('.mod-virtual-items') as HTMLElement | null;
    virtualState.bottomSpacer = container.querySelector('.mod-virtual-spacer.bottom') as HTMLElement | null;
    if (virtualState.itemsWrapper) {
      // We'll incrementally update the children; clear any stale observer bindings
      if (virtualState.resizeObserver) {
        Array.from(virtualState.itemsWrapper.children).forEach((el) => virtualState.resizeObserver!.unobserve(el as Element));
      }
      while (virtualState.itemsWrapper.firstChild) {
        virtualState.itemsWrapper.removeChild(virtualState.itemsWrapper.firstChild);
      }
    }
  }

  virtualState.container = container;

  // Attach scroll listener immediately (before rendering) so it's ready
  const contentDiv = document.getElementById('content');
  if (contentDiv) {
    initModifierVirtualScroll(contentDiv);
  }

  // Set initial container height based on estimates; will refine dynamically
  if (container) {
    container.style.minHeight = `${virtualState.totalHeight}px`;
  }

  updateVisibleRange();
  renderVisibleSections();

  // REMOVED: Force reflow is redundant; double-rAF in renderVisibleSections handles timing better
}

export function cleanupModifierVirtualScroll(): void {
  if (virtualState.scrollContainer) {
    virtualState.scrollContainer.removeEventListener('scroll', handleScroll);
  }
  virtualState.isInitialized = false;
  virtualState.container = null;
  virtualState.itemsWrapper = null;
  virtualState.topSpacer = null;
  virtualState.bottomSpacer = null;
  virtualState.scrollContainer = null;
  virtualState.items = [];
  virtualState.afterRender = null;
  virtualState.cumulativeHeights = [];
  if (virtualState.resizeObserver) {
    try {
      virtualState.resizeObserver.disconnect();
    } catch {}
  }
  virtualState.resizeObserver = null;
}

// Helper to measure actual section height dynamically
export function measureSectionHeight(
  resultsWrapper: HTMLElement,
  sampleSection: ModSection,
  renderCallback: (section: ModSection) => HTMLElement
): void {
  if (!sampleSection || !resultsWrapper) return;

  try {
    // Temporarily render one section to measure its height
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.visibility = 'hidden';
    tempDiv.style.width = `${resultsWrapper.clientWidth}px`;
    const element = renderCallback(sampleSection);
    tempDiv.appendChild(element);

    resultsWrapper.appendChild(tempDiv);
    const measuredHeight = tempDiv.getBoundingClientRect().height;
    resultsWrapper.removeChild(tempDiv);

    if (measuredHeight > 0) {
      virtualState.itemHeight = measuredHeight;
    }
  } catch (err) {
    console.warn('Failed to measure section height:', err);
  }
}
