// Shared utility functions for Items modules (PoE1 and PoE2)
// This module contains common functions used by both Uniques and Bases modules

/**
 * Highlight numbers in modifier text by wrapping them in <span class="mod-value">
 */
export function highlightNumbers(text: string): string {
  if (!text) return "";
  return text
    .replace(/(\d+\s*[–-]\s*\d+)/g, '<span class="mod-value">$1</span>')
    .replace(/(?<![A-Za-z0-9>])([+\-]?\d+)(?![A-Za-z0-9<])/g, '<span class="mod-value">$1</span>')
    .replace(/(\d+%)/g, '<span class="mod-value">$1</span>')
    .replace(/([\[\]\(\)%])/g, '<span class="mod-value">$1</span>');
}

/**
 * Get the image path for an item, preferring imageLocal over remote image URL
 * Handles both PoE1 (bundled-images/poe1/) and PoE2 (bundled-images/) paths
 */
export function getImagePath(item: any): string {
  // Use imageLocal field (clean local paths)
  if (item.imageLocal) {
    // Check if it's a PoE1 path (contains folders like weaponunique, armourunique, replica-uniques, uniques/, etc.)
  const isPoe1 = /^(weaponunique|armourunique|otherunique|replica-uniques|uniques\/|amulets|belts|bloodline-passives|body_armours|boots|bows|claws|currency|daggers|divination-cards|embers|essences|fishing_rods|fossils|foulborn-passives|foulborn-uniques|genesis-tree|grafts|gloves|helmets|hybrid_flasks|keepers-gems|keepers-items|keepers-uniques|life_flasks|mana_flasks|one_hand_axes|one_hand_maces|one_hand_swords|quivers|rings|sceptres|shields|skillgemsgem|supportgemsgem|staves|tattoos|thrusting_one_hand_swords|tinctures|two_hand_axes|two_hand_maces|two_hand_swords|utility_flasks|wands|warstaves|awakenedgem)\//i.test(item.imageLocal);
    
    if (isPoe1) {
      // PoE1 images are in bundled-images/poe1/
      // Path needs to be relative to dist/renderer/src/renderer/overlay.html
      return `../../../bundled-images/poe1/${item.imageLocal}`;
    } else {
      // PoE2 images are directly in bundled-images/
      return `../../../bundled-images/${item.imageLocal}`;
    }
  }
  // Fallback to legacy image URL
  return item.image || '';
}

/**
 * Ensure the craftingPanel element exists and return it
 */
export function ensurePanel(): HTMLElement {
  const existing = document.getElementById('craftingPanel') as HTMLElement | null;
  if (existing) return existing;
  
  const el = document.createElement('div');
  el.id = 'craftingPanel';
  el.className = 'content';
  el.style.padding = '8px';
  
  const footer = document.getElementById('footer');
  if (footer && footer.parentNode) {
    footer.parentNode.insertBefore(el, footer);
  }
  
  return el;
}

/**
 * Basic HTML sanitization to prevent XSS
 */
export function sanitizeHtml(html: string): string {
  const div = document.createElement('div');
  div.textContent = html;
  return div.innerHTML;
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Set up common UI state when showing an Items panel
 */
export function setupItemsPanelUI(activeTab: 'itemsTab' | 'characterTab' | 'craftingTab' = 'itemsTab'): void {
  const tabMod = document.getElementById('tabModifier') as HTMLElement;
  const tabHist = document.getElementById('tabHistory') as HTMLElement;
  const craftingTab = document.getElementById('craftingTab') as HTMLElement;
  const itemsTab = document.getElementById('itemsTab') as HTMLElement;
  const characterTab = document.getElementById('characterTab') as HTMLElement;
  const contentMod = document.getElementById('content') as HTMLElement;
  const contentHist = document.getElementById('historyContent') as HTMLElement;
  
  // Remove active class from tabs
  tabMod?.classList.remove('active');
  tabHist?.classList.remove('active');
  
  // Reset tab styles
  if (craftingTab) {
    craftingTab.style.background = 'var(--bg-tertiary)';
    craftingTab.style.color = 'var(--text-primary)';
  }
  if (characterTab) {
    characterTab.style.background = 'var(--bg-tertiary)';
    characterTab.style.color = 'var(--text-primary)';
  }
  if (itemsTab) {
    itemsTab.style.background = 'var(--bg-tertiary)';
    itemsTab.style.color = 'var(--text-primary)';
  }
  
  // Highlight active tab
  const activeTabEl = document.getElementById(activeTab) as HTMLElement;
  if (activeTabEl) {
    activeTabEl.style.background = 'var(--accent-blue)';
    activeTabEl.style.color = '#fff';
  }
  
  // Hide other content areas
  if (contentMod) contentMod.style.display = 'none';
  if (contentHist) contentHist.style.display = 'none';
  
  // Hide header info elements
  document.getElementById('modifierHeaderInfo')?.setAttribute('style', 'display:none');
  document.getElementById('whittlingInfo')?.setAttribute('style', 'display:none');
  document.getElementById('controlPanel')?.setAttribute('style', '');
  
  // Hide Annoints panel if visible
  const ann = document.getElementById('annointsPanel');
  if (ann) (ann as HTMLElement).style.display = 'none';
  
  // Add crafting-mode class to body
  document.body.classList.add('crafting-mode');
}
