import { applyFilterChipChrome, type ChipChrome } from '../../../utils';
import { bindImageFallback } from '../../utils/imageFallback';
import { TRANSPARENT_PLACEHOLDER } from '../../utils/imagePlaceholder';

export type BestiaryBeast = {
  name?: string;
  slug?: string;
  count?: number;
  imageLocal?: string;
};

export type BestiarySlot = {
  requirement: string;
  count: number;
};

export type BestiaryRecipe = {
  slug?: string;
  title?: string;
  result?: string;
  category?: string;
  beasts?: BestiaryBeast[];
  genericSlots?: BestiarySlot[];
  notes?: string[];
};

type State = {
  panelEl: HTMLElement | null;
  cache: BestiaryRecipe[];
  filtered: BestiaryRecipe[];
  search: HTMLInputElement | null;
  selectedTags: Set<string>;
  tagCounts: Record<string, number>;
  tagsExpanded: boolean;
};

const FALLBACK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="8" fill="#1f1f1f"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="#555" font-size="12" font-family="sans-serif">BST</text></svg>';

const state: State = {
  panelEl: null,
  cache: [],
  filtered: [],
  search: null,
  selectedTags: new Set<string>(),
  tagCounts: {},
  tagsExpanded: false
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

function chipChrome(tag: string, active: boolean): ChipChrome {
  const hue = tagHash(tag) % 360;
  const background = active ? `hsl(${hue}, 64%, 42%)` : `hsl(${hue}, 32%, 24%)`;
  const border = `1px solid hsl(${hue}, 60%, 52%)`;
  const color = active ? '#fff' : 'var(--text-primary)';
  return { border, background, color };
}

function deriveFilterTags(recipe: BestiaryRecipe): string[] {
  const tags = new Set<string>();
  if (recipe.category) tags.add(`Category: ${recipe.category}`);
  if (recipe.notes && recipe.notes.length) tags.add('Has Notes');
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
  (window as any).__lastPanel = 'poe1_bestiary';
  panel.style.display = '';
  panel.innerHTML = `<div class='no-mods'>Loading PoE1 Bestiary...</div>`;
  setTimeout(() => { panel.scrollTop = 0; }, 10);
  try {
    const data = await (window as any).electronAPI?.getPoe1Bestiary?.();
    if (!data || data.error) {
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load PoE1 Bestiary (${data?.error || 'unknown'})<br><span style='color:var(--text-muted); font-size:11px;'>Run: npm --workspace packages/collector run poe1:bestiary</span></div>`;
      return;
    }
    render(Array.isArray(data.recipes) ? data.recipes : []);
  } catch (error) {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Exception loading PoE1 Bestiary: ${error}</div>`;
  }
}

export function render(list: BestiaryRecipe[]): void {
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
      <input id='bestiarySearch' type='text' placeholder='Search bestiary recipes...' style='flex:1; padding:4px 8px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary); font-size:12px;'>
      <button id='bestiaryReset' class='pin-btn' style='padding:4px 8px;'>Reset</button>
    </div>
    <div style='background:var(--bg-secondary); padding:8px; border-radius:6px; margin-bottom:8px;'>
      <div id='bestiaryTagFilters' style='display:flex; flex-wrap:wrap; gap:4px; justify-content:center; width:100%;'></div>
    </div>
    <div id='bestiaryList' style='display:flex; flex-direction:column; gap:8px;'></div>`;

  state.search = panel.querySelector('#bestiarySearch') as HTMLInputElement | null;
  const tagWrap = panel.querySelector('#bestiaryTagFilters') as HTMLElement | null;
  const listWrap = panel.querySelector('#bestiaryList') as HTMLElement | null;

  function formatTagLabel(tag: string): string {
    return tag.replace(/^Category:\s*/i, '');
  }

  function renderTagFilters(): void {
    if (!tagWrap) return;
    tagWrap.innerHTML = '';
    const MAX_TAGS_COLLAPSED = 21;
    const tagsToShow = state.tagsExpanded ? allTags : allTags.slice(0, MAX_TAGS_COLLAPSED);
    tagsToShow.forEach((tag) => {
      const active = state.selectedTags.has(tag);
      const el = document.createElement('div');
      const count = state.tagCounts[tag] || 0;
      el.textContent = count ? `${formatTagLabel(tag)} (${count})` : formatTagLabel(tag);
      applyFilterChipChrome(el, chipChrome(tag, active), { padding: '3px 10px', fontWeight: active ? '600' : '500' });
      el.style.margin = '0 4px 4px 0';
      el.addEventListener('click', () => {
        if (active) state.selectedTags.delete(tag);
        else state.selectedTags.add(tag);
        apply(state.search?.value || '');
        renderTagFilters();
      });
      tagWrap.appendChild(el);
    });
    if (allTags.length > MAX_TAGS_COLLAPSED) {
      const showMore = document.createElement('div');
      showMore.textContent = state.tagsExpanded ? 'Show Less' : 'Show More';
      showMore.style.padding = '3px 10px';
      showMore.style.margin = '0 4px 4px 0';
      showMore.style.border = '1px solid var(--border-color)';
      showMore.style.borderRadius = '4px';
      showMore.style.background = 'var(--bg-secondary)';
      showMore.style.color = 'var(--text-primary)';
      showMore.style.cursor = 'pointer';
      showMore.style.fontSize = '11px';
      showMore.style.fontWeight = '500';
      showMore.addEventListener('click', () => {
        state.tagsExpanded = !state.tagsExpanded;
        renderTagFilters();
      });
      tagWrap.appendChild(showMore);
    }
    if (state.selectedTags.size) {
      const reset = document.createElement('div');
      reset.textContent = 'Clear filters';
      applyFilterChipChrome(reset, { border: '1px solid var(--accent-red)', background: 'var(--accent-red)', color: '#fff' }, { padding: '3px 10px', fontWeight: '600' });
      reset.style.margin = '0 4px 4px 0';
      reset.addEventListener('click', () => {
        state.selectedTags.clear();
        apply(state.search?.value || '');
        renderTagFilters();
      });
      tagWrap.appendChild(reset);
    }
  }

  function matchesTags(recipe: BestiaryRecipe): boolean {
    if (!state.selectedTags.size) return true;
    const tags: string[] = (recipe as any)._filterTags || [];
    return [...state.selectedTags].every(tag => tags.includes(tag));
  }

  function matchesSearch(recipe: BestiaryRecipe, query: string): boolean {
    if (!query) return true;
    const f = query.toLowerCase();
    if ((recipe.title || '').toLowerCase().includes(f)) return true;
    if ((recipe.result || '').toLowerCase().includes(f)) return true;
    if ((recipe.category || '').toLowerCase().includes(f)) return true;
    if ((recipe.notes || []).some(note => note.toLowerCase().includes(f))) return true;
    if ((recipe.beasts || []).some(beast => (beast?.name || '').toLowerCase().includes(f))) return true;
    if ((recipe.genericSlots || []).some(slot => (slot?.requirement || '').toLowerCase().includes(f))) return true;
    return false;
  }

  function apply(filter: string): void {
    if (!listWrap) return;
    listWrap.innerHTML = '';
    state.filtered = state.cache.filter(recipe => matchesTags(recipe) && matchesSearch(recipe, filter));

    if (!state.filtered.length) {
      listWrap.innerHTML = `<div style='text-align:center; color:var(--text-muted); padding:12px;'>No bestiary recipes matched your filters.</div>`;
      return;
    }

    state.filtered.forEach((recipe) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:grid; grid-template-columns:minmax(280px,2.1fr) minmax(200px,1.5fr) minmax(200px,1.2fr); gap:12px; background:var(--bg-card); border:1px solid var(--border-color); border-radius:6px; padding:10px;';

  const categoryBadge = recipe.category ? `<span style="display:inline-flex; align-items:center; padding:2px 8px; font-size:11px; border-radius:4px; background:var(--accent-purple); color:#fff;">${recipe.category}</span>` : '';
  const primaryLine = highlight(recipe.result || recipe.title || 'Unknown Bestiary Recipe');
      const notesHtml = (recipe.notes || []).map(note => `<div style='font-size:11px; color:var(--text-muted);'>• ${highlight(note)}</div>`).join('');

      const beastsHtml = (recipe.beasts || []).map((beast) => {
        if (!beast) return '';
        const name = beast.name || 'Unknown Beast';
        const count = beast.count && beast.count > 1 ? `<span style='color:var(--accent-gold); font-weight:600; margin-left:4px;'>×${beast.count}</span>` : '';
        const src = beast.imageLocal ? `poe1/${beast.imageLocal}` : '';
        const icon = src ? `<img class='bestiary-beast-img' src='${TRANSPARENT_PLACEHOLDER}' data-orig-src='${src}' decoding='async' style='width:48px; height:48px; object-fit:contain;'>` : '';
        return `<div style='display:flex; align-items:center; gap:8px; padding:4px 6px; background:var(--bg-secondary); border-radius:4px; border:1px solid var(--border-color);'>${icon}<div style='font-size:11px; color:var(--text-primary); font-weight:600;'>${name}${count}${beast.slug ? `<div style='font-size:10px; color:var(--text-muted); font-weight:400;'>${beast.slug.replace(/_/g, ' ')}</div>` : ''}</div></div>`;
      }).filter(Boolean).join('<div style="height:4px;"></div>');

      const requirementsHtml = (recipe.genericSlots || []).map((slot) => {
        const req = slot?.requirement || 'Any Rare Creature';
        const count = slot?.count ?? 0;
        return `<div style='display:flex; align-items:center; justify-content:space-between; gap:8px; padding:4px 6px; background:var(--bg-secondary); border-radius:4px; border:1px solid var(--border-color); font-size:11px;'>
          <span>${req}</span>
          <span style='background:var(--accent-blue); color:#fff; border-radius:12px; padding:2px 8px; font-weight:600;'>×${count}</span>
        </div>`;
      }).filter(Boolean).join('<div style="height:4px;"></div>');

      row.innerHTML = `
        <div style='display:flex; flex-direction:column; gap:6px;'>
          ${categoryBadge}
          <div style='font-weight:600; font-size:13px;'>${primaryLine}</div>
          ${notesHtml ? `<div style='margin-top:4px; display:flex; flex-direction:column; gap:2px;'>${notesHtml}</div>` : ''}
        </div>
        <div style='display:flex; flex-direction:column; gap:6px;'>${beastsHtml || `<div style='color:var(--text-muted); font-size:11px;'>No beasts listed.</div>`}</div>
        <div style='display:flex; flex-direction:column; gap:6px;'>${requirementsHtml || `<div style='color:var(--text-muted); font-size:11px;'>No generic slots.</div>`}</div>`;

      listWrap.appendChild(row);
    });

    bindImageFallback(panel, '.bestiary-beast-img', FALLBACK_ICON, 0.5);
  }

  state.search?.addEventListener('input', () => apply(state.search?.value || ''));
  panel.querySelector('#bestiaryReset')?.addEventListener('click', () => {
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
  loader.textContent = 'Reloading PoE1 Bestiary...';
  panel.appendChild(loader);
  try {
    const data = await (window as any).electronAPI?.getPoe1Bestiary?.();
    if (!data || data.error) {
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to reload PoE1 Bestiary (${data?.error || 'unknown'})</div>`;
      return;
    }
    render(Array.isArray(data.recipes) ? data.recipes : []);
  } catch (error) {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Reload failed: ${error}</div>`;
  }
}
