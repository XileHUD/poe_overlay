// PoE1 Embers module
import { bindImageFallback } from "../../utils/imageFallback";
import { TRANSPARENT_PLACEHOLDER } from "../../utils/imagePlaceholder";

export type EmberItem = {
  slug?: string;
  name?: string;
  imageLocal?: string;
  properties?: Record<string, string>;
  mods?: string[];
};

type State = {
  panelEl: HTMLElement | null;
  cache: EmberItem[];
  filtered: EmberItem[];
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
  panel.innerHTML = `<div class='no-mods'>Loading PoE1 Embers...</div>`;
  setTimeout(()=>{ panel.scrollTop=0; }, 10);
  try {
    const data = await (window as any).electronAPI.getPoe1Embers();
    if (!data || data.error) { 
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load PoE1 Embers (${data?.error||'unknown'})</div>`; 
      return; 
    }
    render(data.items || []);
  } catch (e) {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Exception loading PoE1 Embers: ${e}</div>`;
  }
}

export function render(list: EmberItem[]): void {
  const panel = ensurePanel();
  state.cache = [...(list||[])];
  state.selectedTags.clear();
  state.tagCounts = {};

  const tagCounts: Record<string, number> = {};

  const deriveTags = (item: EmberItem): string[] => {
    const tags = new Set<string>();
    const blob = `${item.name||''} ${(item.mods||[]).join(' ')}`.toLowerCase();
    const add = (label: string) => tags.add(label);
    
    // League mechanic types
    if (/breach/.test(blob)) add('Breach');
    if (/legion/.test(blob)) add('Legion');
    if (/harbinger/.test(blob)) add('Harbinger');
    if (/abyss/.test(blob)) add('Abyss');
    if (/beyond/.test(blob)) add('Beyond');
    if (/ambush/.test(blob)) add('Ambush');
    if (/anarchy/.test(blob)) add('Anarchy');
    if (/torment/.test(blob)) add('Torment');
    if (/domination/.test(blob)) add('Domination');
    if (/bloodlines/.test(blob)) add('Bloodlines');
    if (/nemesis/.test(blob)) add('Nemesis');
    if (/rogue exile/.test(blob)) add('Rogue Exiles');
    if (/invasion/.test(blob)) add('Invasion');
    if (/rampage/.test(blob)) add('Rampage');
    if (/tempest/.test(blob)) add('Tempest');
    if (/warbands/.test(blob)) add('Warbands');
    
    // Effects
    if (/quantity|quant/.test(blob)) add('Quantity');
    if (/rarity/.test(blob)) add('Rarity');
    if (/pack size/.test(blob)) add('Pack Size');
    if (/magic|rare/.test(blob)) add('Monster Mods');
    
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
      <input id='emberSearch' type='text' placeholder='Search allflames...' style='flex:1; padding:4px 8px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary); font-size:12px;'>
      <button id='emberClear' class='pin-btn' style='padding:4px 8px;'>Clear</button>
    </div>
    <div style='background:var(--bg-secondary); padding:8px; border-radius:6px; margin-bottom:8px;'>
      <div id='emberTagFilters' style='display:flex; flex-wrap:wrap; gap:4px; justify-content:center; width:100%;'></div>
    </div>
    <div id='emberWrap' style='display:grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap:10px;'></div>`;
  
  state.input = panel.querySelector('#emberSearch') as HTMLInputElement | null;
  const wrap = panel.querySelector('#emberWrap') as HTMLElement | null;
  const tagWrap = panel.querySelector('#emberTagFilters') as HTMLElement | null;

  const TAG_ORDER = ['Breach','Legion','Harbinger','Abyss','Beyond','Ambush','Anarchy','Torment','Domination','Bloodlines','Nemesis','Rogue Exiles','Invasion','Rampage','Tempest','Warbands','Quantity','Rarity','Pack Size','Monster Mods'];
  const tagOrderMap = TAG_ORDER.reduce<Record<string, number>>((acc, tag, index) => {
    acc[tag] = index;
    return acc;
  }, {});

  function tagRGB(tag: string) {
    const t = tag.toLowerCase();
    if (t === 'breach') return [186, 104, 200];
    if (t === 'legion') return [229, 115, 115];
    if (t === 'harbinger') return [100, 181, 246];
    if (t === 'abyss') return [102, 187, 106];
    if (t === 'beyond') return [239, 83, 80];
    if (t === 'ambush') return [255, 167, 38];
    if (t === 'anarchy') return [207, 102, 121];
    if (t === 'torment') return [149, 117, 205];
    if (t === 'domination') return [255, 213, 79];
    if (t === 'bloodlines') return [244, 67, 54];
    if (t === 'nemesis') return [171, 71, 188];
    if (t === 'rogue exiles') return [161, 136, 127];
    if (t === 'invasion') return [121, 134, 203];
    if (t === 'rampage') return [255, 138, 101];
    if (t === 'tempest') return [77, 208, 225];
    if (t === 'warbands') return [144, 164, 174];
    if (t === 'quantity') return [246, 191, 79];
    if (t === 'rarity') return [129, 212, 250];
    if (t === 'pack size') return [129, 199, 132];
    if (t === 'monster mods') return [79, 195, 247];
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
      btn.style.cssText = `padding:3px 8px; font-size:11px; border-radius:4px; cursor:pointer; ${chipCss(tag, active)}`;
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
      reset.style.cssText = 'padding:3px 8px; font-size:11px; border-radius:4px; cursor:pointer; background:var(--accent-red); color:#fff; border:1px solid var(--accent-red);';
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
    state.filtered = state.cache.filter(ember => {
      const name = (ember.name||'').toLowerCase();
      const modMatch = (ember.mods||[]).some(m => m.toLowerCase().includes(search));
      const matchesSearch = !search || name.includes(search) || modMatch;
      const tags = ((ember as any)._tags as string[]) || [];
      const matchesTags = !state.selectedTags.size || tags.some(tag => state.selectedTags.has(tag));
      return matchesSearch && matchesTags;
    });
    
    state.filtered.forEach(ember => {
      const modsHtml = (ember.mods||[]).map(m=>highlight(m)).join('<br>');
      const stackSize = ember.properties?.['Stack Size'] || '';
      const card = document.createElement('div');
      card.style.background='var(--bg-card)';
      card.style.border='1px solid var(--border-color)';
      card.style.borderRadius='6px';
      card.style.padding='6px';
      card.style.display='flex';
      card.style.flexDirection='column';
      card.style.gap='4px';
      card.style.minHeight='90px';
      
      const orig = ember.imageLocal ? `poe1/${ember.imageLocal}` : '';
      const imgHtml = orig ? `<img class='ember-img' src='${TRANSPARENT_PLACEHOLDER}' data-orig-src='${orig}' decoding='async' style='width:26px; height:26px; object-fit:contain;'>` : '';
      
      const stackHtml = stackSize ? `<div style='font-size:11px; color:var(--text-muted);'>Stack: ${stackSize}</div>` : '';
      
      card.innerHTML = `
        <div style='display:flex; align-items:center; gap:6px;'>
          ${imgHtml}
          <div style='font-weight:600;'>${ember.name}</div>
        </div>
        ${stackHtml}
        <div style='font-size:11px;'>${modsHtml}</div>`;
      wrap.appendChild(card);
    });
    
    bindImageFallback(panel, '.ember-img', '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 28 28"><rect width="28" height="28" rx="4" fill="#222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#555" font-size="8" font-family="sans-serif">?</text></svg>', 0.5);
  }

  state.input?.addEventListener('input', () => apply(state.input?.value || ''));
  panel.querySelector('#emberClear')?.addEventListener('click', ()=>{ 
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
  loader.textContent='Reloading PoE1 Embers...'; 
  panel.appendChild(loader);
  try {
    const data = await (window as any).electronAPI.getPoe1Embers();
    if (!data || data.error) { 
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to reload PoE1 Embers (${data?.error||'unknown'})</div>`; 
      return; 
    }
    render(data.items || []);
  } catch (e) {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Reload failed: ${e}</div>`;
  }
}
