import { applyFilterChipChrome, type ChipChrome } from '../../../utils';
import { bindImageFallback } from '../../../crafting/utils/imageFallback';
import { TRANSPARENT_PLACEHOLDER } from '../../../crafting/utils/imagePlaceholder';

export type AscendancyNotable = {
  name?: string;
  slug?: string;
  ascendancy?: string;
  character?: string;
  properties?: Record<string, string>;
  mods?: string[];
  imageLocal?: string;
};

export type AscendancyDataset = {
  slug?: string;
  notables: AscendancyNotable[];
  classes?: string[];
  ascendancies?: string[];
};

type State = {
  panelEl: HTMLElement | null;
  cache: AscendancyNotable[];
  filtered: AscendancyNotable[];
  searchInput: HTMLInputElement | null;
  selectedClasses: Set<string>;
  selectedAscendancies: Set<string>;
};

const state: State = {
  panelEl: null,
  cache: [],
  filtered: [],
  searchInput: null,
  selectedClasses: new Set(),
  selectedAscendancies: new Set()
};

function prepareCharacterPanel(): HTMLElement {
  const tabMod = document.getElementById('tabModifier') as HTMLElement | null;
  const craftingTab = document.getElementById('craftingTab') as HTMLElement | null;
  const itemsTab = document.getElementById('itemsTab') as HTMLElement | null;
  const charTab = document.getElementById('characterTab') as HTMLElement | null;
  tabMod?.classList.remove('active');
  if (craftingTab) {
    craftingTab.style.background = 'var(--bg-tertiary)';
    craftingTab.style.color = 'var(--text-primary)';
  }
  if (itemsTab) {
    itemsTab.style.background = 'var(--bg-tertiary)';
    itemsTab.style.color = 'var(--text-primary)';
  }
  if (charTab) {
    charTab.style.background = 'var(--accent-blue)';
    charTab.style.color = '#fff';
  }
  const content = document.getElementById('content');
  if (content) content.style.display = 'none';
  const hist = document.getElementById('historyContainer');
  if (hist) hist.style.display = 'none';
  document.getElementById('modifierHeaderInfo')?.setAttribute('style', 'display:none');
  document.getElementById('whittlingInfo')?.setAttribute('style', 'display:none');
  (window as any).OverlayAnnoints?.hide?.();
  document.body.classList.add('crafting-mode');
  let panel = document.getElementById('craftingPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'craftingPanel';
    panel.className = 'content';
    panel.style.padding = '8px';
    const footer = document.getElementById('footer');
    footer?.parentNode?.insertBefore(panel, footer);
  }
  panel.style.display = '';
  return panel;
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
  const background = active ? `hsl(${hue}, 60%, 45%)` : `hsl(${hue}, 32%, 24%)`;
  const border = `1px solid hsl(${hue}, 65%, 52%)`;
  const color = active ? '#fff' : 'var(--text-primary)';
  return { border, background, color };
}

function highlight(text: string): string {
  return String(text)
    .replace(/(\d+%)/g, '<span class="mod-value">$1</span>')
    .replace(/(?<![\w>])([+\-]?\d+(?:\.\d+)?)(?![\w<])/g, '<span class="mod-value">$1</span>');
}

function normalizeList(values?: string[]): string[] {
  if (!Array.isArray(values)) return [];
  return values.filter(Boolean).map((value) => String(value)).sort((a, b) => a.localeCompare(b));
}

export async function show(): Promise<void> {
  const panel = prepareCharacterPanel();
  (window as any).__lastPanel = 'poe1_ascendancy_notables';
  panel.innerHTML = `<div class='no-mods'>Loading PoE1 Ascendancy Notables...</div>`;
  setTimeout(() => { panel.scrollTop = 0; }, 10);
  try {
    const data = await (window as any).electronAPI?.getPoe1AscendancyNotables?.();
    if (!data || data.error) {
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load PoE1 Ascendancy Notables (${data?.error || 'unknown'})</div>`;
      return;
    }
    const dataset: AscendancyDataset = {
      slug: data.slug,
      notables: Array.isArray(data.notables) ? data.notables : [],
      classes: normalizeList(data.classes),
      ascendancies: normalizeList(data.ascendancies)
    };
    render(dataset);
  } catch (error) {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Exception loading PoE1 Ascendancy Notables: ${error}</div>`;
  }
}

export function render(dataset: AscendancyDataset): void {
  const panel = prepareCharacterPanel();
  state.cache = [...(dataset.notables || [])];
  state.filtered = [...state.cache];
  state.selectedClasses.clear();
  state.selectedAscendancies.clear();

  const classSet = dataset.classes?.length ? new Set(dataset.classes) : new Set<string>();
  const ascendancySet = dataset.ascendancies?.length ? new Set(dataset.ascendancies) : new Set<string>();

  state.cache.forEach((notable) => {
    if (notable.character) classSet.add(String(notable.character));
    if (notable.ascendancy) ascendancySet.add(String(notable.ascendancy));
  });

  const classes = [...classSet].sort((a, b) => a.localeCompare(b));
  const ascendancies = [...ascendancySet].sort((a, b) => a.localeCompare(b));

  panel.innerHTML = `
    <div style='display:flex; flex-direction:column; gap:10px;'>
      <div style='display:flex; gap:6px; align-items:center;'>
        <input id='ascNotableSearch' type='text' placeholder='Search ascendancy notables...' style='flex:1; padding:4px 8px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary); font-size:12px;'>
        <button id='ascNotableReset' class='pin-btn' style='padding:4px 8px;'>Reset</button>
      </div>
      <div style='background:var(--bg-secondary); padding:8px; border-radius:6px;'>
        <div style='font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted); margin-bottom:4px;'>Classes</div>
        <div id='ascClassFilters' style='display:flex; flex-wrap:wrap; gap:4px;'></div>
      </div>
      <div style='background:var(--bg-secondary); padding:8px; border-radius:6px;'>
        <div style='font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted); margin-bottom:4px;'>Ascendancies</div>
        <div id='ascAscendancyFilters' style='display:flex; flex-wrap:wrap; gap:4px;'></div>
      </div>
      <div id='ascNotablesWrap' style='display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:10px;'></div>
    </div>`;

  state.searchInput = panel.querySelector('#ascNotableSearch') as HTMLInputElement | null;
  const resetBtn = panel.querySelector('#ascNotableReset') as HTMLButtonElement | null;
  const classWrap = panel.querySelector('#ascClassFilters') as HTMLElement | null;
  const ascendWrap = panel.querySelector('#ascAscendancyFilters') as HTMLElement | null;
  const wrap = panel.querySelector('#ascNotablesWrap') as HTMLElement | null;

  const renderTagGroup = (elements: string[], hook: HTMLElement | null, selected: Set<string>) => {
    if (!hook) return;
    hook.innerHTML = '';
    elements.forEach((value) => {
      const active = selected.has(value);
      const chip = document.createElement('div');
      chip.textContent = value;
      applyFilterChipChrome(chip, chipChrome(value, active), { padding: '3px 10px', fontWeight: active ? '600' : '500' });
      chip.style.margin = '0 4px 4px 0';
      chip.addEventListener('click', () => {
        if (active) {
          selected.delete(value);
        } else {
          selected.add(value);
        }
        apply(state.searchInput?.value || '');
        renderTagGroup(classes, classWrap, state.selectedClasses);
        renderTagGroup(ascendancies, ascendWrap, state.selectedAscendancies);
      });
      hook.appendChild(chip);
    });
    if (selected.size) {
      const reset = document.createElement('div');
      reset.textContent = 'Clear';
      applyFilterChipChrome(reset, { border: '1px solid var(--accent-red)', background: 'var(--accent-red)', color: '#fff' }, { padding: '3px 10px', fontWeight: '600' });
      reset.style.margin = '0 4px 4px 0';
      reset.addEventListener('click', () => {
        selected.clear();
        apply(state.searchInput?.value || '');
        renderTagGroup(classes, classWrap, state.selectedClasses);
        renderTagGroup(ascendancies, ascendWrap, state.selectedAscendancies);
      });
      hook.appendChild(reset);
    }
  };

  function matchesFilters(notable: AscendancyNotable, query: string): boolean {
    const text = query.toLowerCase();
    const matchesText = !text
      || (notable.name || '').toLowerCase().includes(text)
      || (notable.ascendancy || '').toLowerCase().includes(text)
      || (notable.character || '').toLowerCase().includes(text)
      || (notable.mods || []).some((mod) => mod.toLowerCase().includes(text))
      || Object.values(notable.properties || {}).some((value) => (value || '').toLowerCase().includes(text));

    if (!matchesText) return false;
    if (state.selectedClasses.size && !state.selectedClasses.has(notable.character || '')) return false;
    if (state.selectedAscendancies.size && !state.selectedAscendancies.has(notable.ascendancy || '')) return false;
    return true;
  }

  function apply(filter: string): void {
    if (!wrap) return;
    wrap.innerHTML = '';
    state.filtered = state.cache.filter((notable) => matchesFilters(notable, filter));

    if (!state.filtered.length) {
      wrap.innerHTML = `<div style='grid-column:1 / -1; text-align:center; color:var(--text-muted); padding:12px;'>No Ascendancy Notables matched your filters.</div>`;
      return;
    }

    state.filtered.forEach((notable) => {
      const card = document.createElement('div');
      card.style.background = 'var(--bg-card)';
      card.style.border = '1px solid var(--border-color)';
      card.style.borderRadius = '6px';
      card.style.padding = '8px';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '6px';
      card.style.position = 'relative';

      const orig = notable.imageLocal ? `poe1/${notable.imageLocal}` : '';
      const imgHtml = orig ? `<img class='asc-notable-img' src='${TRANSPARENT_PLACEHOLDER}' data-orig-src='${orig}' decoding='async' style='width:36px; height:36px; object-fit:contain;'>` : '';

      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      header.style.gap = '8px';
      header.innerHTML = `
        ${imgHtml}
        <div style='display:flex; flex-direction:column; gap:2px;'>
          <div style='font-weight:600;'>${notable.name || 'Unknown Notable'}</div>
          <div style='display:flex; flex-wrap:wrap; gap:4px;'>
            ${notable.character ? `<span style='font-size:11px; padding:2px 6px; border-radius:4px; background:rgba(90,160,255,0.18); border:1px solid rgba(90,160,255,0.35); color:var(--text-primary);'>${notable.character}</span>` : ''}
            ${notable.ascendancy ? `<span style='font-size:11px; padding:2px 6px; border-radius:4px; background:rgba(255,180,90,0.18); border:1px solid rgba(255,180,90,0.35); color:var(--text-primary);'>${notable.ascendancy}</span>` : ''}
          </div>
        </div>`;
      card.appendChild(header);

      const properties = Object.entries(notable.properties || {})
        .filter(([key, value]) => (key || value))
        .map(([key, value]) => `<div style='font-size:11px; color:var(--text-muted);'>${key ? `<span style='color:var(--text-primary);'>${key}:</span> ` : ''}${value || ''}</div>`)
        .join('');
      if (properties) {
        const propBlock = document.createElement('div');
        propBlock.innerHTML = properties;
        card.appendChild(propBlock);
      }

      const extras: string[] = [];
      const mods = (notable.mods || []).filter((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
          extras.push(trimmed.slice(1, -1));
          return false;
        }
        return true;
      });

      const modsWrap = document.createElement('div');
      modsWrap.style.display = 'flex';
      modsWrap.style.flexDirection = 'column';
      modsWrap.style.gap = '3px';
      modsWrap.innerHTML = mods.map((mod) => `<div style='font-size:11px;'>${highlight(mod)}</div>`).join('');
      card.appendChild(modsWrap);

      if (extras.length) {
        const hint = document.createElement('span');
        hint.textContent = 'ⓘ';
        hint.style.position = 'absolute';
        hint.style.top = '8px';
        hint.style.right = '8px';
        hint.style.fontSize = '12px';
        hint.style.color = 'var(--accent-blue)';
        hint.style.cursor = 'help';
        card.appendChild(hint);

        const tooltip = document.createElement('div');
        tooltip.style.position = 'absolute';
        tooltip.style.left = '12px';
        tooltip.style.right = '12px';
        tooltip.style.bottom = '12px';
        tooltip.style.padding = '6px 8px';
        tooltip.style.borderRadius = '4px';
        tooltip.style.background = 'rgba(10, 12, 18, 0.92)';
        tooltip.style.border = '1px solid var(--border-color)';
        tooltip.style.fontSize = '11px';
        tooltip.style.lineHeight = '1.35';
        tooltip.style.color = 'var(--text-primary)';
        tooltip.style.boxShadow = '0 4px 10px rgba(0,0,0,0.45)';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.visibility = 'hidden';
        tooltip.style.opacity = '0';
        tooltip.style.transition = 'opacity 0.12s ease';
        tooltip.innerHTML = extras.map((note) => `<div>${highlight(note)}</div>`).join('');
        card.appendChild(tooltip);

        const showTooltip = () => {
          tooltip.style.visibility = 'visible';
          tooltip.style.opacity = '1';
        };
        const hideTooltip = () => {
          tooltip.style.opacity = '0';
          tooltip.style.visibility = 'hidden';
        };
        card.addEventListener('mouseenter', showTooltip);
        card.addEventListener('mouseleave', hideTooltip);
      }

      wrap?.appendChild(card);
    });

    bindImageFallback(panel, '.asc-notable-img', '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><rect width="36" height="36" rx="6" fill="#222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#555" font-size="10" font-family="sans-serif">?</text></svg>', 0.5);
  }

  renderTagGroup(classes, classWrap, state.selectedClasses);
  renderTagGroup(ascendancies, ascendWrap, state.selectedAscendancies);
  apply('');

  state.searchInput?.addEventListener('input', () => apply(state.searchInput?.value || ''));
  resetBtn?.addEventListener('click', () => {
    if (state.searchInput) state.searchInput.value = '';
    state.selectedClasses.clear();
    state.selectedAscendancies.clear();
    apply('');
    renderTagGroup(classes, classWrap, state.selectedClasses);
    renderTagGroup(ascendancies, ascendWrap, state.selectedAscendancies);
    state.searchInput?.focus();
  });

  setTimeout(() => { panel.scrollTop = 0; }, 20);
}

export async function reload(): Promise<void> {
  const panel = prepareCharacterPanel();
  panel.querySelector('.no-mods')?.remove();
  const loader = document.createElement('div');
  loader.className = 'no-mods';
  loader.textContent = 'Reloading PoE1 Ascendancy Notables...';
  panel.appendChild(loader);
  try {
    const data = await (window as any).electronAPI?.getPoe1AscendancyNotables?.();
    if (!data || data.error) {
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to reload PoE1 Ascendancy Notables (${data?.error || 'unknown'})</div>`;
      return;
    }
    const dataset: AscendancyDataset = {
      slug: data.slug,
      notables: Array.isArray(data.notables) ? data.notables : [],
      classes: normalizeList(data.classes),
      ascendancies: normalizeList(data.ascendancies)
    };
    render(dataset);
  } catch (error) {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Reload failed: ${error}</div>`;
  }
}
