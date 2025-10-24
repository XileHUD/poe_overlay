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
  itemHeight: 240, // conservative initial estimate for a domain section
  bufferSize: 3, // Reduced buffer to minimize jumping
  visibleStart: 0,
  visibleEnd: 0,
  totalHeight: 0,
  lastScrollTop: 0,
  renderCallback: () => document.createElement('div'),
  afterRender: null,
  isInitialized: false,
  cumulativeHeights: [], // Cache for fast position lookup
  resizeObserver: null,
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
  }, 16); // 60fps
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
}

// Update cumulative heights when a section's measured height changes
function onSectionMeasured(index: number, measuredHeight: number): void {
  if (!Number.isFinite(measuredHeight) || measuredHeight <= 0) return;
  const section = virtualState.items[index];
  if (!section) return;
  const prev = section.measuredHeight ?? virtualState.itemHeight;
  if (Math.abs(prev - measuredHeight) < 1) return; // ignore tiny diffs

  const delta = measuredHeight - prev;
  section.measuredHeight = measuredHeight;

  // Adjust cumulative heights from index to end
  for (let i = index; i < virtualState.cumulativeHeights.length; i++) {
    virtualState.cumulativeHeights[i] = (virtualState.cumulativeHeights[i] || 0) + delta;
  }
  virtualState.totalHeight += delta;

  // If the changed section is above current viewport, maintain visual position by shifting scrollTop
  if (virtualState.scrollContainer && index < virtualState.visibleStart) {
    virtualState.scrollContainer.scrollTop += delta;
  }

  // Update spacers to reflect new total/top heights without forcing re-render churn
  if (virtualState.topSpacer && virtualState.bottomSpacer) {
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
