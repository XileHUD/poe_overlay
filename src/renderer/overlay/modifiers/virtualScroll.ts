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
}

const ENABLE_VIRTUAL_SCROLL = false; // Temporary safety switch until new virtual scroll implementation lands

const virtualState: VirtualScrollState = {
  container: null,
  itemsWrapper: null,
  topSpacer: null,
  bottomSpacer: null,
  scrollContainer: null,
  items: [],
  itemHeight: 200, // initial estimate for domains (larger than before)
  bufferSize: 3, // Reduced buffer to minimize jumping
  visibleStart: 0,
  visibleEnd: 0,
  totalHeight: 0,
  lastScrollTop: 0,
  renderCallback: () => document.createElement('div'),
  afterRender: null,
  isInitialized: false,
  cumulativeHeights: [], // Cache for fast position lookup
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

  // Clear current rendered nodes
  const wrapper = virtualState.itemsWrapper;
  while (wrapper.firstChild) {
    wrapper.removeChild(wrapper.firstChild);
  }

  // Render visible sections (heights are pre-measured, just render)
  visibleSections.forEach((section) => {
    let element = section.element;
    if (!element) {
      element = virtualState.renderCallback(section);
      section.element = element;
    }
    wrapper.appendChild(element);
  });

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

// Pre-measure all section heights once to avoid recalculations during scrolling
function preMeasureAllHeights(resultsWrapper: HTMLElement): void {
  if (!virtualState.itemsWrapper) return;
  
  const wrapper = virtualState.itemsWrapper;
  const measurementWidth = virtualState.container?.clientWidth
    || resultsWrapper.clientWidth
    || wrapper.clientWidth
    || window.innerWidth;
  
  const tempContainer = document.createElement('div');
  tempContainer.style.position = 'absolute';
  tempContainer.style.visibility = 'hidden';
  tempContainer.style.width = `${measurementWidth}px`;
  tempContainer.style.left = '0';
  tempContainer.style.top = '0';
  
  // Render and measure all sections
  virtualState.items.forEach((section) => {
    const element = virtualState.renderCallback(section);
    section.element = element;
    tempContainer.appendChild(element);
  });
  
  wrapper.parentElement?.appendChild(tempContainer);
  
  // Measure all heights and build cumulative height cache
  let cumulativeHeight = 0;
  virtualState.cumulativeHeights = [];
  
  virtualState.items.forEach((section, idx) => {
    if (section.element) {
      const height = section.element.offsetHeight;
      if (height > 0) {
        section.measuredHeight = height;
      } else {
        section.measuredHeight = virtualState.itemHeight;
      }
    } else {
      section.measuredHeight = virtualState.itemHeight;
    }
    
    cumulativeHeight += section.measuredHeight;
    virtualState.cumulativeHeights.push(cumulativeHeight);
  });
  
  // Clean up temp container
  wrapper.parentElement?.removeChild(tempContainer);
  
  // Set total height
  virtualState.totalHeight = cumulativeHeight;
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
  virtualState.totalHeight = sections.length * virtualState.itemHeight;
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

  // Pre-measure all heights once before any scrolling
  preMeasureAllHeights(resultsWrapper);
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
