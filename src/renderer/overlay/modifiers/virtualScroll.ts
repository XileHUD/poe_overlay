// Virtual scrolling for modifier lists to handle large aggregated categories

export interface ModSection {
  key: string;
  data?: any;
  element?: HTMLElement;
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
}

const virtualState: VirtualScrollState = {
  container: null,
  itemsWrapper: null,
  topSpacer: null,
  bottomSpacer: null,
  scrollContainer: null,
  items: [],
  itemHeight: 140, // initial guess, refined after first render
  bufferSize: 6, // Number of extra items to render above/below viewport
  visibleStart: 0,
  visibleEnd: 0,
  totalHeight: 0,
  lastScrollTop: 0,
  renderCallback: () => document.createElement('div'),
  afterRender: null,
  isInitialized: false,
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

  // Calculate which sections should be visible
  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / virtualState.itemHeight) - virtualState.bufferSize
  );
  const endIndex = Math.min(
    virtualState.items.length,
    Math.ceil((scrollTop + viewportHeight) / virtualState.itemHeight) + virtualState.bufferSize
  );

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

  const estimatedTop = virtualState.visibleStart * virtualState.itemHeight;
  virtualState.topSpacer.style.height = `${Math.max(0, estimatedTop)}px`;

  // Clear current rendered nodes by detaching (preserving listeners)
  const wrapper = virtualState.itemsWrapper;
  while (wrapper.firstChild) {
    wrapper.removeChild(wrapper.firstChild);
  }

  visibleSections.forEach((section) => {
    let element = section.element;
    if (!element) {
      element = virtualState.renderCallback(section);
      section.element = element;
    }
    wrapper.appendChild(element);
  });

  const renderedNodes = Array.from(wrapper.children) as HTMLElement[];
  const renderedHeight = renderedNodes.reduce((sum, node) => sum + node.offsetHeight, 0);
  const averageHeight = renderedNodes.length > 0 ? renderedHeight / renderedNodes.length : virtualState.itemHeight;

  const tailSpace = Math.max(0, virtualState.totalHeight - estimatedTop - renderedHeight);
  virtualState.bottomSpacer.style.height = `${tailSpace}px`;

  if (renderedNodes.length > 0 && Math.abs(averageHeight - virtualState.itemHeight) > 4) {
    virtualState.itemHeight = averageHeight;
    virtualState.totalHeight = virtualState.itemHeight * virtualState.items.length;
    const recalculatedTop = virtualState.visibleStart * virtualState.itemHeight;
    virtualState.topSpacer.style.height = `${Math.max(0, recalculatedTop)}px`;
    const recalculatedTail = Math.max(0, virtualState.totalHeight - recalculatedTop - renderedHeight);
    virtualState.bottomSpacer.style.height = `${recalculatedTail}px`;
  }

  if (virtualState.afterRender) {
    virtualState.afterRender(visibleSections);
  }
}

export function renderModifierVirtualList(
  sections: ModSection[],
  resultsWrapper: HTMLElement,
  renderCallback: (section: ModSection) => HTMLElement,
  afterRender?: (sections: ModSection[]) => void
): void {
  if (!resultsWrapper) return;

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
