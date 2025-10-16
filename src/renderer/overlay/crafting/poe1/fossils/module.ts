// PoE1 Fossils module
import { bindImageFallback } from "../../utils/imageFallback";
import { TRANSPARENT_PLACEHOLDER } from "../../utils/imagePlaceholder";

export type FossilItem = {
  slug?: string;
  name?: string;
  imageLocal?: string;
  properties?: Record<string, string>;
  mods?: string[];
};

type State = {
  panelEl: HTMLElement | null;
  cache: FossilItem[];
  filtered: FossilItem[];
  input: HTMLInputElement | null;
  selectedTags: Set<string>;
  tagCounts: Record<string, number>;
};

const state: State = { panelEl: null, cache: [], filtered: [], input: null, selectedTags: new Set(), tagCounts: {} };

function ensurePanel(): HTMLElement {
  if (state.panelEl && document.body.contains(state.panelEl)) return state.panelEl;
  const existing = document.getElementById('craftingPanel') as HTMLElement | null;
  if (existing) { state.panelEl = existing; return existing; }
  const el = document.createElement('div');
  el.id = 'craftingPanel';
  el.className = 'content';
  el.style.padding = '8px';
  const footer = document.getElementById('footer');
  if (footer && footer.parentNode) footer.parentNode.insertBefore(el, footer);
  state.panelEl = el; return el;
}

function setCraftingTabActive(): void {
  const tabMod = document.getElementById("tabModifier") as HTMLElement | null;
  const tabHist = document.getElementById("tabHistory") as HTMLElement | null;
  const craftingTab = document.getElementById("craftingTab") as HTMLElement | null;
  const itemsTab = document.getElementById("itemsTab") as HTMLElement | null;
  const contentMod = document.getElementById("content") as HTMLElement | null;
  const contentHist = document.getElementById("historyContent") as HTMLElement | null;
  if (tabMod) { tabMod.classList.remove("active"); tabMod.style.background = "var(--bg-tertiary)"; tabMod.style.color = "var(--text-primary)"; }
  if (tabHist) { tabHist.classList.remove("active"); tabHist.style.background = "var(--bg-tertiary)"; tabHist.style.color = "var(--text-primary)"; }
  if (craftingTab) { craftingTab.style.background = "var(--accent-blue)"; craftingTab.style.color = "#fff"; }
  if (itemsTab) { itemsTab.style.background='var(--bg-tertiary)'; itemsTab.style.color='var(--text-primary)'; }
  if (contentMod) contentMod.style.display = "none";
  if (contentHist) contentHist.style.display = "none";
  document.getElementById("modifierHeaderInfo")?.setAttribute("style", "display:none");
  document.getElementById("whittlingInfo")?.setAttribute("style", "display:none");
  document.getElementById("controlPanel")?.setAttribute("style", "");
  const ann = document.getElementById("annointsPanel");
  if (ann) (ann as HTMLElement).style.display = "none";
  document.body.classList.add("crafting-mode");
}

export async function show(): Promise<void> {
  setCraftingTabActive();
  const panel = ensurePanel();
  panel.style.display='';
  panel.innerHTML = `<div class='no-mods'>Loading PoE1 Fossils...</div>`;
  setTimeout(()=>{ panel.scrollTop=0; }, 10);
  try {
    const data = await (window as any).electronAPI.getPoe1Fossils();
    if (!data || data.error) { 
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load PoE1 Fossils (${data?.error||'unknown'})</div>`; 
      return; 
    }
    render(data.items || []);
  } catch (e) {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Exception loading PoE1 Fossils: ${e}</div>`;
  }
}

export function render(list: FossilItem[]): void {
  const panel = ensurePanel();
  state.cache = [...(list||[])];
  state.selectedTags.clear();
  state.tagCounts = {};

  const tagCounts: Record<string, number> = {};

  const deriveTags = (item: FossilItem): string[] => {
    const tags = new Set<string>();
    const blob = `${item.name||''} ${(item.mods||[]).join(' ')}`.toLowerCase();
    const add = (label: string) => tags.add(label);
    
    if (/physical|bleed|impale/.test(blob)) add('Physical');
    if (/fire|ignite|burn/.test(blob)) add('Fire');
    if (/cold|chill|freeze/.test(blob)) add('Cold');
    if (/lightning|shock/.test(blob)) add('Lightning');
    if (/chaos|poison|wither/.test(blob)) add('Chaos');
    if (/attack|weapon|melee|bow|projectile/.test(blob)) add('Attack');
    if (/spell|cast|mana/.test(blob)) add('Spell');
    if (/minion|summon/.test(blob)) add('Minion');
    if (/life|regeneration/.test(blob)) add('Life');
    if (/energy shield|es/.test(blob)) add('ES');
    if (/armour|evasion|block/.test(blob)) add('Defence');
    if (/speed|movement/.test(blob)) add('Speed');
    if (/crit|critical/.test(blob)) add('Critical');
    if (/elemental|resist/.test(blob)) add('Elemental');
    if (/curse|hex/.test(blob)) add('Curse');
    if (/flask/.test(blob)) add('Flask');
    if (/socket|link/.test(blob)) add('Sockets');
    if (/gem/.test(blob)) add('Gems');
    if (/quality/.test(blob)) add('Quality');
    
    return Array.from(tags);
  };

  state.cache.forEach(item => {
    const tags = deriveTags(item);
    (item as any)._tags = tags;
    tags.forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });

  state.tagCounts = { ...tagCounts };

  panel.innerHTML = `
    <div style='display:flex; gap:6px; align-items:center; margin-bottom:6px;'>
      <input id='fossilSearch' type='text' placeholder='Search fossils...' style='flex:1; padding:4px 8px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary); font-size:12px;'>
      <button id='fossilClear' class='pin-btn' style='padding:4px 8px;'>Clear</button>
    </div>
    <div id='fossilTagFiltersRow' style='display:flex; justify-content:center; width:100%;'>
      <div id='fossilTagFilters' style='display:inline-flex; flex-wrap:wrap; gap:4px; margin-bottom:4px;'></div>
    </div>
    <div id='fossilWrap' style='display:grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap:10px;'></div>`;
  
  state.input = panel.querySelector('#fossilSearch') as HTMLInputElement | null;
  const wrap = panel.querySelector('#fossilWrap') as HTMLElement | null;
  const tagWrap = panel.querySelector('#fossilTagFilters') as HTMLElement | null;

  const TAG_ORDER = ['Physical','Fire','Cold','Lightning','Chaos','Attack','Spell','Minion','Life','ES','Defence','Speed','Critical','Elemental','Curse','Flask','Sockets','Gems','Quality'];
  const tagOrderMap = TAG_ORDER.reduce<Record<string, number>>((acc, tag, index) => {
    acc[tag] = index;
    return acc;
  }, {});

  function tagRGB(tag: string) {
    const t = tag.toLowerCase();
    if (t === 'physical') return [207, 102, 121];
    if (t === 'fire') return [244, 67, 54];
    if (t === 'cold') return [100, 181, 246];
    if (t === 'lightning') return [255, 235, 59];
    if (t === 'chaos') return [186, 104, 200];
    if (t === 'attack') return [255, 138, 101];
    if (t === 'spell') return [121, 134, 203];
    if (t === 'minion') return [129, 199, 132];
    if (t === 'life') return [229, 115, 115];
    if (t === 'es') return [79, 195, 247];
    if (t === 'defence') return [161, 136, 127];
    if (t === 'speed') return [77, 208, 225];
    if (t === 'critical') return [255, 167, 38];
    if (t === 'elemental') return [171, 71, 188];
    if (t === 'curse') return [149, 117, 205];
    if (t === 'flask') return [102, 187, 106];
    if (t === 'sockets') return [144, 164, 174];
    if (t === 'gems') return [63, 81, 181];
    if (t === 'quality') return [129, 212, 250];
    return [120, 144, 156];
  }

  function chipCss(tag: string, active: boolean) {
    const [r, g, b] = tagRGB(tag);
    const bg = active ? `rgba(${r},${g},${b},0.9)` : `rgba(${r},${g},${b},0.22)`;
    const border = `rgba(${r},${g},${b},0.6)`;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const color = active ? (luma > 180 ? '#000' : '#fff') : 'var(--text-primary)';
    return `border:1px solid ${border}; background:${bg}; color:${color};`;
  }

  function highlight(s: string): string {
    return (s||"")
      .replace(/(\d+\s*[–-]\s*\d+)/g,'<span class="mod-value">$1</span>')
      .replace(/(?<![A-Za-z0-9>])([+\-]?\d+)(?![A-Za-z0-9<])/g,'<span class="mod-value">$1</span>')
      .replace(/(\d+%)/g,'<span class="mod-value">$1</span>');
  }

  function renderTagFilters(): void {
    if (!tagWrap) return;
    tagWrap.innerHTML = '';
    const available = Object.keys(state.tagCounts)
      .filter(tag => state.tagCounts[tag] > 0)
      .sort((a, b) => {
        const ai = tagOrderMap[a] ?? Number.MAX_SAFE_INTEGER;
        const bi = tagOrderMap[b] ?? Number.MAX_SAFE_INTEGER;
        if (ai === bi) return a.localeCompare(b);
        return ai - bi;
      });

    available.forEach(tag => {
      const active = state.selectedTags.has(tag);
      const count = state.tagCounts[tag] || 0;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = count ? `${tag} (${count})` : tag;
      btn.style.cssText = `padding:3px 8px; font-size:11px; border-radius:999px; cursor:pointer; ${chipCss(tag, active)}`;
      btn.addEventListener('click', () => {
        if (active) state.selectedTags.delete(tag); else state.selectedTags.add(tag);
        apply(state.input?.value || '');
        renderTagFilters();
      });
      tagWrap.appendChild(btn);
    });

    if (state.selectedTags.size) {
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.textContent = 'Reset filters';
      reset.style.cssText = 'padding:3px 8px; font-size:11px; border-radius:999px; cursor:pointer; background:var(--accent-red); color:#fff; border:1px solid var(--accent-red);';
      reset.addEventListener('click', () => {
        state.selectedTags.clear();
        apply(state.input?.value || '');
        renderTagFilters();
      });
      tagWrap.appendChild(reset);
    }
  }

  function apply(filter='') {
    if (!wrap) return;
    wrap.innerHTML='';
    const search = filter.toLowerCase();
    state.filtered = state.cache.filter(foss => {
      const name = (foss.name||'').toLowerCase();
      const modMatch = (foss.mods||[]).some(m => m.toLowerCase().includes(search));
      const matchesSearch = !search || name.includes(search) || modMatch;
      const tags = ((foss as any)._tags as string[]) || [];
      const matchesTags = !state.selectedTags.size || tags.some(tag => state.selectedTags.has(tag));
      return matchesSearch && matchesTags;
    });
    
    state.filtered.forEach(foss => {
      const modsHtml = (foss.mods||[]).map(m=>highlight(m)).join('<br>');
      const stackSize = foss.properties?.['Stack Size'] || '';
      const card = document.createElement('div');
      card.style.background='var(--bg-card)';
      card.style.border='1px solid var(--border-color)';
      card.style.borderRadius='6px';
      card.style.padding='6px';
      card.style.display='flex';
      card.style.flexDirection='column';
      card.style.gap='4px';
      
      const orig = foss.imageLocal ? `poe1/${foss.imageLocal}` : '';
      const imgHtml = orig ? `<img class='fossil-img' src='${TRANSPARENT_PLACEHOLDER}' data-orig-src='${orig}' decoding='async' style='width:26px; height:26px; object-fit:contain;'>` : '';
      
      card.innerHTML = `
        <div style='display:flex; align-items:center; gap:6px;'>
          ${imgHtml}
          <div style='font-weight:600;'>${foss.name}</div>
        </div>
        <div style='font-size:11px; color:var(--text-muted);'>Stack: ${stackSize}</div>
        <div style='font-size:11px;'>${modsHtml}</div>`;
      wrap.appendChild(card);
    });
    
    bindImageFallback(panel, '.fossil-img', '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 28 28"><rect width="28" height="28" rx="4" fill="#222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#555" font-size="8" font-family="sans-serif">?</text></svg>', 0.5);
  }

  state.input?.addEventListener('input', () => apply(state.input?.value || ''));
  panel.querySelector('#fossilClear')?.addEventListener('click', ()=>{ 
    if (state.input) { 
      state.input.value='';
      state.selectedTags.clear();
      apply('');
      renderTagFilters();
      state.input.focus(); 
    }
  });
  
  renderTagFilters();
  apply('');
}

export async function reload(): Promise<void> {
  const panel = ensurePanel();
  panel.querySelector('.no-mods')?.remove();
  const loader = document.createElement('div'); 
  loader.className='no-mods'; 
  loader.textContent='Reloading PoE1 Fossils...'; 
  panel.appendChild(loader);
  try {
    const data = await (window as any).electronAPI.getPoe1Fossils();
    if (!data || data.error) { 
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to reload PoE1 Fossils (${data?.error||'unknown'})</div>`; 
      return; 
    }
    render(data.items || []);
  } catch (e) {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Reload failed: ${e}</div>`;
  }
}
