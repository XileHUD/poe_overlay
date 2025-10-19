import { applyFilterChipChrome, type ChipChrome } from '../../../utils';
import { bindImageFallback } from '../../utils/imageFallback';
import { TRANSPARENT_PLACEHOLDER } from '../../utils/imagePlaceholder';

export type RunegraftItem = {
  name?: string;
  slug?: string;
  properties?: Record<string, string>;
  mods?: string[];
  imageLocal?: string;
};

type State = {
  panelEl: HTMLElement | null;
  cache: RunegraftItem[];
  filtered: RunegraftItem[];
  input: HTMLInputElement | null;
  selectedTags: Set<string>;
  tagCounts: Record<string, number>;
};

const TAG_RULES: Array<{ tag: string; pattern: RegExp }> = [
  { tag: 'Warcry', pattern: /warcry/i },
  { tag: 'Curse', pattern: /curse|hex/i },
  { tag: 'Aura', pattern: /aura|reservation/i },
  { tag: 'Totem', pattern: /totem/i },
  { tag: 'Trap', pattern: /trap/i },
  { tag: 'Mine', pattern: /mine/i },
  { tag: 'Brand', pattern: /brand/i },
  { tag: 'Minion', pattern: /minion|golem|sentinel/i },
  { tag: 'Projectile', pattern: /projectile|arrow|bolt/i },
  { tag: 'Attack', pattern: /attack|melee|strike|bow/i },
  { tag: 'Spell', pattern: /spell|cast|incant/i },
  { tag: 'Critical', pattern: /critical|crit/i },
  { tag: 'Charge', pattern: /frenzy|endurance|power charge/i },
  { tag: 'Flask', pattern: /flask/i },
  { tag: 'Defence', pattern: /block|guard|defen[cs]e|armour|evasion/i },
  { tag: 'Movement', pattern: /movement|travel|dash|blink/i },
  { tag: 'Elemental', pattern: /elemental|fire|cold|lightning/i },
  { tag: 'Chaos', pattern: /chaos|poison/i },
  { tag: 'Physical', pattern: /physical|bleed/i },
  { tag: 'Dot', pattern: /damage over time|ignite|burn/i },
  { tag: 'Support', pattern: /support gem/i }
];

const state: State = { panelEl: null, cache: [], filtered: [], input: null, selectedTags: new Set(), tagCounts: {} };

function ensurePanel(): HTMLElement {
  if (state.panelEl && document.body.contains(state.panelEl)) return state.panelEl;
  const existing = document.getElementById('craftingPanel') as HTMLElement | null;
  if (existing) {
    state.panelEl = existing;
    return existing;
  }
  const el = document.createElement('div');
  el.id = 'craftingPanel';
  el.className = 'content';
  el.style.padding = '8px';
  const footer = document.getElementById('footer');
  if (footer && footer.parentNode) footer.parentNode.insertBefore(el, footer);
  state.panelEl = el;
  return el;
}

function setCraftingTabActive(): void {
  const tabMod = document.getElementById('tabModifier') as HTMLElement | null;
  const tabHist = document.getElementById('tabHistory') as HTMLElement | null;
  const craftingTab = document.getElementById('craftingTab') as HTMLElement | null;
  const itemsTab = document.getElementById('itemsTab') as HTMLElement | null;
  const contentMod = document.getElementById('content') as HTMLElement | null;
  const contentHist = document.getElementById('historyContent') as HTMLElement | null;
  if (tabMod) {
    tabMod.classList.remove('active');
    tabMod.style.background = 'var(--bg-tertiary)';
    tabMod.style.color = 'var(--text-primary)';
  }
  if (tabHist) {
    tabHist.classList.remove('active');
    tabHist.style.background = 'var(--bg-tertiary)';
    tabHist.style.color = 'var(--text-primary)';
  }
  if (craftingTab) {
    craftingTab.style.background = 'var(--accent-blue)';
    craftingTab.style.color = '#fff';
  }
  if (itemsTab) {
    itemsTab.style.background = 'var(--bg-tertiary)';
    itemsTab.style.color = 'var(--text-primary)';
  }
  if (contentMod) contentMod.style.display = 'none';
  if (contentHist) contentHist.style.display = 'none';
  document.getElementById('modifierHeaderInfo')?.setAttribute('style', 'display:none');
  document.getElementById('whittlingInfo')?.setAttribute('style', 'display:none');
  document.getElementById('controlPanel')?.setAttribute('style', '');
  document.getElementById('annointsPanel')?.setAttribute('style', 'display:none');
  document.body.classList.add('crafting-mode');
}

function tagHash(tag: string): number {
  let hash = 0;
  for (let i = 0; i < tag.length; i += 1) {
    hash = ((hash << 5) - hash) + tag.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function chipChrome(tag: string, active: boolean): ChipChrome {
  const hue = tagHash(tag) % 360;
  const background = active ? `hsl(${hue}, 58%, 42%)` : `hsl(${hue}, 34%, 24%)`;
  const border = `1px solid hsl(${hue}, 58%, 48%)`;
  const color = active ? '#fff' : 'var(--text-primary)';
  return { border, background, color };
}

function deriveTags(item: RunegraftItem): string[] {
  const blob = [item.name, ...(item.mods || []), ...(Object.values(item.properties || {}))].join(' ').toLowerCase();
  const tags = new Set<string>();
  for (const rule of TAG_RULES) {
    if (rule.pattern.test(blob)) tags.add(rule.tag);
  }
  if (!tags.size) tags.add('General');
  return Array.from(tags);
}

function highlight(text: string): string {
  return String(text)
    .replace(/(\d+%)/g, '<span class="mod-value">$1</span>')
    .replace(/(?<![\w>])([+\-]?\d+(?:\.\d+)?)(?![\w<])/g, '<span class="mod-value">$1</span>');
}

export async function show(): Promise<void> {
  setCraftingTabActive();
  const panel = ensurePanel();
  (window as any).__lastPanel = 'poe1_runegrafts';
  panel.style.display = '';
  panel.innerHTML = `<div class='no-mods'>Loading PoE1 Runegrafts...</div>`;
  setTimeout(() => { panel.scrollTop = 0; }, 10);
  try {
    const data = await (window as any).electronAPI?.getPoe1Runegrafts?.();
    if (!data || data.error) {
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load PoE1 Runegrafts (${data?.error || 'unknown'})<br><span style='color:var(--text-muted); font-size:11px;'>Run: npm --workspace packages/collector run poe1:runegrafts</span></div>`;
      return;
    }
    render(Array.isArray(data.items) ? data.items : []);
  } catch (error) {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Exception loading PoE1 Runegrafts: ${error}</div>`;
  }
}

export function render(list: RunegraftItem[]): void {
  const panel = ensurePanel();
  state.cache = [...(list || [])];
  state.filtered = [...state.cache];
  state.selectedTags.clear();
  state.tagCounts = {};

  const tagUniverse = new Set<string>();
  state.cache.forEach((item) => {
    const tags = deriveTags(item);
    (item as any)._tags = tags;
    tags.forEach((tag) => {
      tagUniverse.add(tag);
      state.tagCounts[tag] = (state.tagCounts[tag] || 0) + 1;
    });
  });
  const allTags = [...tagUniverse].sort((a, b) => a.localeCompare(b));

  panel.innerHTML = `
    <div style='display:flex; gap:6px; align-items:center; margin-bottom:6px;'>
      <input id='runegraftSearch' type='text' placeholder='Search runegrafts...' style='flex:1; padding:4px 8px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary); font-size:12px;'>
      <button id='runegraftClear' class='pin-btn' style='padding:4px 8px;'>Clear</button>
    </div>
    <div style='background:var(--bg-secondary); padding:8px; border-radius:6px; margin-bottom:8px;'>
      <div id='runegraftTagFilters' style='display:flex; flex-wrap:wrap; gap:4px; justify-content:center; width:100%;'></div>
    </div>
    <div id='runegraftWrap' style='display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:10px;'></div>`;

  state.input = panel.querySelector('#runegraftSearch') as HTMLInputElement | null;
  const wrap = panel.querySelector('#runegraftWrap') as HTMLElement | null;
  const tagWrap = panel.querySelector('#runegraftTagFilters') as HTMLElement | null;

  function renderTagFilters(): void {
    if (!tagWrap) return;
    tagWrap.innerHTML = '';
    allTags.forEach((tag) => {
      const active = state.selectedTags.has(tag);
      const el = document.createElement('div');
      el.textContent = state.tagCounts[tag] ? `${tag} (${state.tagCounts[tag]})` : tag;
      applyFilterChipChrome(el, chipChrome(tag, active), { padding: '3px 10px', fontWeight: active ? '600' : '500' });
      el.style.margin = '0 4px 4px 0';
      el.addEventListener('click', () => {
        if (active) {
          state.selectedTags.delete(tag);
        } else {
          state.selectedTags.add(tag);
        }
        apply(state.input?.value || '');
        renderTagFilters();
      });
      tagWrap.appendChild(el);
    });
    if (state.selectedTags.size) {
      const reset = document.createElement('div');
      reset.textContent = 'Reset';
      applyFilterChipChrome(reset, { border: '1px solid var(--accent-red)', background: 'var(--accent-red)', color: '#fff' }, { padding: '3px 10px', fontWeight: '600' });
      reset.style.margin = '0 4px 4px 0';
      reset.addEventListener('click', () => {
        state.selectedTags.clear();
        apply(state.input?.value || '');
        renderTagFilters();
      });
      tagWrap.appendChild(reset);
    }
  }

  function matchesTags(item: RunegraftItem): boolean {
    if (!state.selectedTags.size) return true;
    const tags: string[] = (item as any)._tags || [];
    return [...state.selectedTags].every((tag) => tags.includes(tag));
  }

  function matchesSearch(item: RunegraftItem, query: string): boolean {
    if (!query) return true;
    const f = query.toLowerCase();
    if ((item.name || '').toLowerCase().includes(f)) return true;
    if ((item.slug || '').toLowerCase().includes(f)) return true;
    if ((item.mods || []).some((mod) => mod.toLowerCase().includes(f))) return true;
    return Object.values(item.properties || {}).some((value) => (value || '').toLowerCase().includes(f));
  }

  function apply(filter: string): void {
    if (!wrap) return;
    wrap.innerHTML = '';
    state.filtered = state.cache.filter((item) => matchesTags(item) && matchesSearch(item, filter));

    if (!state.filtered.length) {
      wrap.innerHTML = `<div style='grid-column:1 / -1; text-align:center; color:var(--text-muted); padding:12px;'>No Runegrafts matched your filters.</div>`;
      return;
    }

    state.filtered.forEach((item) => {
      const card = document.createElement('div');
      card.style.background = 'var(--bg-card)';
      card.style.border = '1px solid var(--border-color)';
      card.style.borderRadius = '6px';
      card.style.padding = '8px';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '6px';

      const orig = item.imageLocal ? `poe1/${item.imageLocal}` : '';
      const imgHtml = orig ? `<img class='runegraft-img' src='${TRANSPARENT_PLACEHOLDER}' data-orig-src='${orig}' decoding='async' style='width:32px; height:32px; object-fit:contain;'>` : '';

      const properties = Object.entries(item.properties || {})
        .filter(([key, value]) => (key || value))
        .map(([key, value]) => `<div style='font-size:11px; color:var(--text-muted);'>${key ? `<span style='color:var(--text-primary);'>${key}:</span> ` : ''}${value || ''}</div>`)
        .join('');

      const notes: string[] = [];
      const mods = (item.mods || []).filter((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
          notes.push(trimmed.slice(1, -1));
          return false;
        }
        return true;
      });

      const tags = ((item as any)._tags as string[] || []).join(', ');

      card.innerHTML = `
        <div style='display:flex; align-items:center; gap:8px;'>
          ${imgHtml}
          <div>
            <div style='font-weight:600;'>${item.name || 'Unknown Runegraft'}</div>
            <div style='font-size:11px; color:var(--text-muted);'>${tags || 'General'}</div>
          </div>
        </div>
        ${properties ? `<div>${properties}</div>` : ''}
        <div style='display:flex; flex-direction:column; gap:3px;'>
          ${mods.map((mod) => `<div style='font-size:11px;'>${highlight(mod)}</div>`).join('')}
        </div>
        ${notes.length ? `<div style='font-size:10px; color:var(--text-muted); border-top:1px solid var(--border-color); padding-top:4px;'>${notes.map((note) => `<div>${highlight(note)}</div>`).join('')}</div>` : ''}`;

      wrap.appendChild(card);
    });

    bindImageFallback(panel, '.runegraft-img', '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#555" font-size="8" font-family="sans-serif">?</text></svg>', 0.5);
  }

  state.input?.addEventListener('input', () => apply(state.input?.value || ''));
  panel.querySelector('#runegraftClear')?.addEventListener('click', () => {
    if (state.input) {
      state.input.value = '';
      state.selectedTags.clear();
      apply('');
      renderTagFilters();
      state.input.focus();
    }
  });

  renderTagFilters();
  apply(state.input?.value || '');
  setTimeout(() => { panel.scrollTop = 0; }, 20);
}

export async function reload(): Promise<void> {
  const panel = ensurePanel();
  panel.querySelector('.no-mods')?.remove();
  const loader = document.createElement('div');
  loader.className = 'no-mods';
  loader.textContent = 'Reloading PoE1 Runegrafts...';
  panel.appendChild(loader);
  try {
    const data = await (window as any).electronAPI?.getPoe1Runegrafts?.();
    if (!data || data.error) {
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to reload PoE1 Runegrafts (${data?.error || 'unknown'})</div>`;
      return;
    }
    render(Array.isArray(data.items) ? data.items : []);
  } catch (error) {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Reload failed: ${error}</div>`;
  }
}
