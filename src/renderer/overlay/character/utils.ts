function setTabStyle(tab: HTMLElement | null, active: boolean): void {
  if (!tab) return;
  tab.classList.toggle('active', active);
  tab.style.background = active ? 'var(--accent-blue)' : 'var(--bg-tertiary)';
  tab.style.color = active ? '#fff' : 'var(--text-primary)';
}

function ensurePanel(): HTMLElement {
  const existing = document.getElementById('craftingPanel');
  if (existing) return existing as HTMLElement;
  const panel = document.createElement('div');
  panel.id = 'craftingPanel';
  panel.className = 'content';
  panel.style.padding = '8px';
  panel.style.position = 'relative';
  panel.style.flex = '1 1 auto';
  panel.style.overflow = 'auto';
  const footer = document.getElementById('footer');
  if (footer?.parentNode) footer.parentNode.insertBefore(panel, footer);
  return panel;
}

export function prepareCharacterPanel(label: string): HTMLElement {
  const tabModifier = document.getElementById('tabModifier') as HTMLElement | null;
  const tabHistory = document.getElementById('tabHistory') as HTMLElement | null;
  const tabCrafting = document.getElementById('craftingTab') as HTMLElement | null;
  const tabItems = document.getElementById('itemsTab') as HTMLElement | null;
  const tabCharacter = document.getElementById('characterTab') as HTMLElement | null;
  const modifiersContent = document.getElementById('content') as HTMLElement | null;
  const historyContent = document.getElementById('historyContent') as HTMLElement | null;
  const historyContainer = document.getElementById('historyContainer') as HTMLElement | null;

  setTabStyle(tabModifier, false);
  setTabStyle(tabHistory, false);
  setTabStyle(tabCrafting, false);
  setTabStyle(tabItems, false);
  setTabStyle(tabCharacter, true);

  if (modifiersContent) modifiersContent.style.display = 'none';
  if (historyContent) historyContent.style.display = 'none';
  if (historyContainer) historyContainer.style.display = 'none';

  document.getElementById('modifierHeaderInfo')?.setAttribute('style', 'display:none');
  document.getElementById('whittlingInfo')?.setAttribute('style', 'display:none');

  document.getElementById('controlPanel')?.setAttribute('style', '');

  // Hide legacy annoints panel if present
  try { (window as any).OverlayAnnoints?.hide?.(); } catch {}
  document.body.classList.add('crafting-mode');

  const panel = ensurePanel();
  panel.style.display = '';
  panel.setAttribute('data-character-panel', label || '');
  return panel;
}
