import { bindImageFallback } from '../../utils/imageFallback';
import { TRANSPARENT_PLACEHOLDER } from '../../utils/imagePlaceholder';

export type HorticraftingCost = {
  name?: string;
  slug?: string;
  amount?: number;
  imageLocal?: string;
};

export type HorticraftingRecipe = {
  slug?: string;
  description?: string;
  action?: string;
  tags?: string[];
  costs?: HorticraftingCost[];
};

type State = {
  panelEl: HTMLElement | null;
  cache: HorticraftingRecipe[];
  filtered: HorticraftingRecipe[];
  search: HTMLInputElement | null;
  selectedTags: Set<string>;
  tagCounts: Record<string, number>;
};

const FALLBACK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#555" font-size="9" font-family="sans-serif">LF</text></svg>';

const state: State = {
  panelEl: null,
  cache: [],
  filtered: [],
  search: null,
  selectedTags: new Set<string>(),
  tagCounts: {}
};

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
  const contentMod = document.getElementById('content');
  const contentHist = document.getElementById('historyContent');
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

function chipCss(tag: string, active: boolean): string {
  const hue = tagHash(tag) % 360;
  const bg = active ? `hsl(${hue}, 62%, 44%)` : `hsl(${hue}, 32%, 24%)`;
  const border = `hsl(${hue}, 58%, 52%)`;
  const color = active ? '#fff' : 'var(--text-primary)';
  return `cursor:pointer; user-select:none; padding:2px 8px; font-size:11px; border-radius:4px; border:1px solid ${border}; background:${bg}; color:${color}; transition:opacity 0.15s ease;`;
}

function deriveFilterTags(recipe: HorticraftingRecipe): string[] {
  const tags = new Set<string>();
  (recipe.tags || []).forEach(tag => {
    if (tag) tags.add(`Tag: ${tag}`);
  });
  if (recipe.action) tags.add(`Action: ${recipe.action}`);
  (recipe.costs || []).forEach(cost => {
    const label = cost?.name;
    if (label) tags.add(`Lifeforce: ${label}`);
  });
  return Array.from(tags);
}

function highlight(text: string | undefined): string {
  if (!text) return '';
  return String(text)
    .replace(/(\d+%)/g, '<span class="mod-value">$1</span>')
    .replace(/(?<![\w>])([+\-]?\d+(?:\.\d+)?)(?![\w<])/g, '<span class="mod-value">$1</span>');
}

export async function show(): Promise<void> {
  setCraftingTabActive();
  const panel = ensurePanel();
  (window as any).__lastPanel = 'poe1_horticrafting';
  panel.style.display = '';
  panel.innerHTML = `<div class='no-mods'>Loading PoE1 Horticrafting...</div>`;
  setTimeout(() => { panel.scrollTop = 0; }, 10);

  try {
    const data = await (window as any).electronAPI?.getPoe1Horticrafting?.();
    if (!data || data.error) {
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load PoE1 Horticrafting (${data?.error || 'unknown'})<br><span style='color:var(--text-muted); font-size:11px;'>Run: npm --workspace packages/collector run poe1:horticrafting</span></div>`;
      return;
    }
    render(Array.isArray(data.items) ? data.items : []);
  } catch (error) {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Exception loading PoE1 Horticrafting: ${error}</div>`;
  }
}

export function render(list: HorticraftingRecipe[]): void {
  const panel = ensurePanel();
  state.cache = [...(list || [])];
  state.filtered = [...state.cache];
  state.selectedTags.clear();
  state.tagCounts = {};

  const tagUniverse = new Set<string>();
  state.cache.forEach((recipe) => {
    const tags = deriveFilterTags(recipe);
    (recipe as any)._filterTags = tags;
    tags.forEach((tag) => {
      tagUniverse.add(tag);
      state.tagCounts[tag] = (state.tagCounts[tag] || 0) + 1;
    });
  });

  const allTags = Array.from(tagUniverse).sort((a, b) => a.localeCompare(b));

  panel.innerHTML = `
    <div style='display:flex; gap:6px; align-items:center; margin-bottom:6px;'>
      <input id='horticraftingSearch' type='text' placeholder='Search horticrafting crafts...' style='flex:1; padding:4px 8px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary); font-size:12px;'>
      <button id='horticraftingReset' class='pin-btn' style='padding:4px 8px;'>Reset</button>
    </div>
    <div style='background:var(--bg-secondary); padding:8px; border-radius:6px; margin-bottom:8px;'>
      <div id='horticraftingTagFilters' style='display:flex; flex-wrap:wrap; gap:4px; justify-content:center; width:100%;'></div>
    </div>
    <div id='horticraftingList' style='display:flex; flex-direction:column; gap:8px;'></div>`;

  state.search = panel.querySelector('#horticraftingSearch') as HTMLInputElement | null;
  const tagWrap = panel.querySelector('#horticraftingTagFilters') as HTMLElement | null;
  const listWrap = panel.querySelector('#horticraftingList') as HTMLElement | null;

  function formatTagLabel(tag: string): string {
    if (tag.startsWith('Tag: ')) return tag.replace('Tag: ', 'Tag · ');
    if (tag.startsWith('Action: ')) return tag.replace('Action: ', 'Action · ');
    if (tag.startsWith('Lifeforce: ')) return tag.replace('Lifeforce: ', 'Lifeforce · ');
    return tag;
  }

  function renderTagFilters(): void {
    if (!tagWrap) return;
    tagWrap.innerHTML = '';
    allTags.forEach((tag) => {
      const active = state.selectedTags.has(tag);
      const el = document.createElement('div');
      const count = state.tagCounts[tag] || 0;
      el.textContent = count ? `${formatTagLabel(tag)} (${count})` : formatTagLabel(tag);
      el.style.cssText = chipCss(tag, active);
      el.addEventListener('click', () => {
        if (active) {
          state.selectedTags.delete(tag);
        } else {
          state.selectedTags.add(tag);
        }
        apply(state.search?.value || '');
        renderTagFilters();
      });
      tagWrap.appendChild(el);
    });
    if (state.selectedTags.size) {
      const reset = document.createElement('div');
      reset.textContent = 'Clear filters';
      reset.style.cssText = 'cursor:pointer; user-select:none; padding:2px 8px; font-size:11px; border-radius:4px; border:1px solid var(--accent-red); background:var(--accent-red); color:#fff;';
      reset.addEventListener('click', () => {
        state.selectedTags.clear();
        apply(state.search?.value || '');
        renderTagFilters();
      });
      tagWrap.appendChild(reset);
    }
  }

  function matchesTags(recipe: HorticraftingRecipe): boolean {
    if (!state.selectedTags.size) return true;
    const tags: string[] = (recipe as any)._filterTags || [];
    return [...state.selectedTags].every(tag => tags.includes(tag));
  }

  function matchesSearch(recipe: HorticraftingRecipe, query: string): boolean {
    if (!query) return true;
    const f = query.toLowerCase();
    if ((recipe.description || '').toLowerCase().includes(f)) return true;
    if ((recipe.action || '').toLowerCase().includes(f)) return true;
    if ((recipe.tags || []).some(tag => (tag || '').toLowerCase().includes(f))) return true;
    if ((recipe.costs || []).some(cost => (cost?.name || '').toLowerCase().includes(f))) return true;
    return false;
  }

  function apply(filter: string): void {
    if (!listWrap) return;
    listWrap.innerHTML = '';
    state.filtered = state.cache.filter(recipe => matchesTags(recipe) && matchesSearch(recipe, filter));

    if (!state.filtered.length) {
      listWrap.innerHTML = `<div style='text-align:center; color:var(--text-muted); padding:12px;'>No horticrafting crafts matched your filters.</div>`;
      return;
    }

    state.filtered.forEach((recipe) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:grid; grid-template-columns:minmax(260px,2fr) minmax(120px,0.8fr) minmax(220px,1.2fr); gap:12px; align-items:flex-start; background:var(--bg-card); border:1px solid var(--border-color); border-radius:6px; padding:10px;';

      const tagBadges = (recipe.tags || []).filter(Boolean).map(tag => `<span style="display:inline-flex; align-items:center; padding:2px 6px; font-size:11px; border-radius:4px; background:var(--bg-tertiary); border:1px solid var(--border-color); color:var(--text-secondary);">${tag}</span>`).join(' ');

      const costsHtml = (recipe.costs || []).map((cost) => {
        if (!cost) return '';
        const amount = typeof cost.amount === 'number' && !Number.isNaN(cost.amount) ? `${cost.amount}×` : '';
        const name = cost.name || 'Unknown Lifeforce';
        const src = cost.imageLocal ? `poe1/${cost.imageLocal}` : '';
        const icon = src ? `<img class='horti-cost-img' src='${TRANSPARENT_PLACEHOLDER}' data-orig-src='${src}' decoding='async' style='width:32px; height:32px; object-fit:contain;'>` : '';
        return `<div style='display:flex; align-items:center; gap:6px; padding:4px 6px; background:var(--bg-secondary); border-radius:4px; border:1px solid var(--border-color);'>${icon}<div><div style='font-weight:600; font-size:11px;'>${amount ? `<span style="color:var(--accent-gold);">${amount}</span> ` : ''}${name}</div>${cost.slug ? `<div style='font-size:10px; color:var(--text-muted);'>${cost.slug.replace(/_/g, ' ')}</div>` : ''}</div></div>`;
      }).filter(Boolean).join('<div style="height:4px;"></div>');

      const actionHtml = recipe.action ? `<div style='display:inline-flex; align-items:center; padding:2px 8px; font-size:11px; border-radius:4px; background:var(--accent-blue); color:#fff;'>${recipe.action}</div>` : `<div style='color:var(--text-muted); font-size:11px;'>—</div>`;

      row.innerHTML = `
        <div style='display:flex; flex-direction:column; gap:6px;'>
          <div style='font-weight:600; font-size:13px;'>${highlight(recipe.description || 'Unknown horticrafting craft')}</div>
          ${tagBadges ? `<div style='display:flex; flex-wrap:wrap; gap:4px;'>${tagBadges}</div>` : ''}
        </div>
        <div>${actionHtml}</div>
        <div style='display:flex; flex-direction:column; gap:4px;'>${costsHtml || `<div style='color:var(--text-muted); font-size:11px;'>No costs listed.</div>`}</div>`;

      listWrap.appendChild(row);
    });

    bindImageFallback(panel, '.horti-cost-img', FALLBACK_ICON, 0.5);
  }

  state.search?.addEventListener('input', () => apply(state.search?.value || ''));
  panel.querySelector('#horticraftingReset')?.addEventListener('click', () => {
    state.selectedTags.clear();
    if (state.search) {
      state.search.value = '';
      state.search.focus();
    }
    apply('');
    renderTagFilters();
  });

  renderTagFilters();
  apply(state.search?.value || '');
  setTimeout(() => { panel.scrollTop = 0; }, 20);
}

export async function reload(): Promise<void> {
  const panel = ensurePanel();
  panel.querySelector('.no-mods')?.remove();
  const loader = document.createElement('div');
  loader.className = 'no-mods';
  loader.textContent = 'Reloading PoE1 Horticrafting...';
  panel.appendChild(loader);
  try {
    const data = await (window as any).electronAPI?.getPoe1Horticrafting?.();
    if (!data || data.error) {
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to reload PoE1 Horticrafting (${data?.error || 'unknown'})</div>`;
      return;
    }
    render(Array.isArray(data.items) ? data.items : []);
  } catch (error) {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Reload failed: ${error}</div>`;
  }
}
