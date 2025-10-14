// Virtual scrolling for modifier lists to handle large aggregated categories
import { escapeHtml } from '../utils';

interface VirtualScrollState {
  container: HTMLElement | null;
  scrollContainer: HTMLElement | null;
  items: ModSection[];
  itemHeight: number;
  bufferSize: number;
  visibleStart: number;
  visibleEnd: number;
  totalHeight: number;
  lastScrollTop: number;
  renderCallback: (section: ModSection) => string;
  isInitialized: boolean;
}

interface ModSection {
  domain: string;
  side: string;
  mods: any[];
  html?: string; // pre-rendered HTML
}

const virtualState: VirtualScrollState = {
  container: null,
  scrollContainer: null,
  items: [],
  itemHeight: 120, // Estimated height per section
  bufferSize: 5, // Number of extra items to render above/below viewport
  visibleStart: 0,
  visibleEnd: 0,
  totalHeight: 0,
  lastScrollTop: 0,
  renderCallback: () => '',
  isInitialized: false,
};

let scrollThrottleTimer: number | null = null;

export function initModifierVirtualScroll(
  scrollContainer: HTMLElement,
  renderCallback: (section: ModSection) => string
): void {
  virtualState.scrollContainer = scrollContainer;
  virtualState.renderCallback = renderCallback;
  virtualState.isInitialized = true;

  // Attach scroll listener with throttling
  scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
}

function handleScroll(): void {
  if (scrollThrottleTimer !== null) return;

  scrollThrottleTimer = window.setTimeout(() => {
    scrollThrottleTimer = null;
    updateVisibleRange();
    renderVisibleSections();
  }, 16); // 60fps
}

function updateVisibleRange(): void {
  if (!virtualState.scrollContainer) return;

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

  virtualState.visibleStart = startIndex;
  virtualState.visibleEnd = endIndex;
  virtualState.lastScrollTop = scrollTop;
}

function renderVisibleSections(): void {
  if (!virtualState.container || !virtualState.isInitialized) return;

  const visibleSections = virtualState.items.slice(
    virtualState.visibleStart,
    virtualState.visibleEnd
  );

  // Calculate offset for the first visible item
  const offsetTop = virtualState.visibleStart * virtualState.itemHeight;

  // Render only visible sections
  const html = visibleSections
    .map((section) => section.html || virtualState.renderCallback(section))
    .join('');

  virtualState.container.innerHTML = `
    <div style="height: ${offsetTop}px;"></div>
    ${html}
    <div style="height: ${Math.max(0, virtualState.totalHeight - offsetTop - (visibleSections.length * virtualState.itemHeight))}px;"></div>
  `;
}

export function renderModifierVirtualList(
  sections: ModSection[],
  resultsWrapper: HTMLElement,
  renderCallback: (section: ModSection) => string
): void {
  // Pre-render all sections and cache them (this is still fast, it's the DOM insertion that's slow)
  const sectionsWithHtml = sections.map((section) => ({
    ...section,
    html: renderCallback(section),
  }));

  virtualState.items = sectionsWithHtml;
  virtualState.totalHeight = sections.length * virtualState.itemHeight;

  // Create or reuse container
  let container = resultsWrapper.querySelector('#mod-virtual-container') as HTMLElement | null;
  if (!container) {
    container = document.createElement('div');
    container.id = 'mod-virtual-container';
    container.style.position = 'relative';
    container.style.minHeight = `${virtualState.totalHeight}px`;
    resultsWrapper.innerHTML = '';
    resultsWrapper.appendChild(container);
  } else {
    container.style.minHeight = `${virtualState.totalHeight}px`;
  }

  virtualState.container = container;

  // Initialize scroll handling if not already done
  const contentDiv = document.getElementById('content');
  if (contentDiv && !virtualState.isInitialized) {
    initModifierVirtualScroll(contentDiv, renderCallback);
  }

  // Initial render
  updateVisibleRange();
  renderVisibleSections();
}

export function cleanupModifierVirtualScroll(): void {
  if (virtualState.scrollContainer) {
    virtualState.scrollContainer.removeEventListener('scroll', handleScroll);
  }
  virtualState.isInitialized = false;
  virtualState.container = null;
  virtualState.scrollContainer = null;
  virtualState.items = [];
}

// Helper to measure actual section height dynamically
export function measureSectionHeight(resultsWrapper: HTMLElement, sampleSection: ModSection, renderCallback: (section: ModSection) => string): void {
  if (!sampleSection || !resultsWrapper) return;

  try {
    // Temporarily render one section to measure its height
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.visibility = 'hidden';
    tempDiv.style.width = `${resultsWrapper.clientWidth}px`;
    tempDiv.innerHTML = renderCallback(sampleSection);

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
