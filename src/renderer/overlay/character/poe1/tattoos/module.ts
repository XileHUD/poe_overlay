// PoE1 Tattoos module
import { applyFilterChipChrome, type ChipChrome } from "../../../utils";
import { bindImageFallback } from "../../../crafting/utils/imageFallback";
import { TRANSPARENT_PLACEHOLDER } from "../../../crafting/utils/imagePlaceholder";
import { resolveLocalImage } from "../../../crafting/utils/localImage";

export type Tattoo = {
  slug?: string;
  name?: string;
  imageLocal?: string;
  properties?: Record<string, string>;
  mods?: string[];
};

type State = {
  panelEl: HTMLElement | null;
  cache: Tattoo[];
  filtered: Tattoo[];
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

function setCharacterTabActive(): void {
  const tabMod = document.getElementById("tabModifier") as HTMLElement | null;
  const tabHist = document.getElementById("tabHistory") as HTMLElement | null;
  const craftingTab = document.getElementById("craftingTab") as HTMLElement | null;
  const itemsTab = document.getElementById("itemsTab") as HTMLElement | null;
  const charTab = document.getElementById("characterTab") as HTMLElement | null;
  const contentMod = document.getElementById("content") as HTMLElement | null;
  const contentHist = document.getElementById("historyContent") as HTMLElement | null;
  if (tabMod) { tabMod.classList.remove("active"); tabMod.style.background = "var(--bg-tertiary)"; tabMod.style.color = "var(--text-primary)"; }
  if (tabHist) { tabHist.classList.remove("active"); tabHist.style.background = "var(--bg-tertiary)"; tabHist.style.color = "var(--text-primary)"; }
  if (craftingTab) { craftingTab.style.background='var(--bg-tertiary)'; craftingTab.style.color='var(--text-primary)'; }
  if (itemsTab) { itemsTab.style.background='var(--bg-tertiary)'; itemsTab.style.color='var(--text-primary)'; }
  if (charTab) { charTab.style.background = "var(--accent-blue)"; charTab.style.color = "#fff"; }
  if (contentMod) contentMod.style.display = "none";
  if (contentHist) contentHist.style.display = "none";
  document.getElementById("modifierHeaderInfo")?.setAttribute("style", "display:none");
  document.getElementById("whittlingInfo")?.setAttribute("style", "display:none");
  const ann = document.getElementById("annointsPanel");
  if (ann) (ann as HTMLElement).style.display = "none";
  document.body.classList.add("crafting-mode");
}

export async function show(): Promise<void> {
  (window as any).__lastPanel = 'poe1-tattoos';
  setCharacterTabActive();
  const panel = ensurePanel();
  panel.style.display='';
  panel.innerHTML = `<div class='no-mods'>Loading Tattoos...</div>`;
  setTimeout(()=>{ panel.scrollTop=0; }, 10);
  try {
    const data = await (window as any).electronAPI.getPoe1Tattoos?.();
    if (!data || data.error) { 
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load Tattoos (${data?.error||'unknown'})</div>`; 
      return; 
    }
    render(data.items || []);
  } catch (e) {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Exception loading Tattoos: ${e}</div>`;
  }
}

export function render(list: Tattoo[]): void {
  const panel = ensurePanel();
  state.cache = [...(list||[])];
  state.selectedTags.clear();
  state.tagCounts = {};
  let tagsExpanded = false; // Track Show More/Less state

  const tagCounts: Record<string, number> = {};

  const deriveTags = (item: Tattoo): string[] => {
    const tags = new Set<string>();
    const blob = `${item.name||''} ${(item.mods||[]).join(' ')} ${Object.values(item.properties||{}).join(' ')}`.toLowerCase();
    const add = (label: string) => tags.add(label);
    
    // Stack size-based tags
    const stackSize = item.properties?.["Stack Size"] || "";
    const match = stackSize.match(/(\d+)\s*\/\s*(\d+)/);
    if (match) {
      const total = parseInt(match[2], 10);
      if (total <= 5) add('Small Stack');
      else if (total <= 10) add('Medium Stack');
      else add('Large Stack');
    }

    // Limited to specific tribes
    const limitedTo = item.properties?.["Limited to"] || "";
    if (limitedTo) {
      if (limitedTo.includes('Honoured')) add('Honoured');
      if (limitedTo.includes('Makanga')) add('Makanga');
      if (limitedTo.includes('Utula')) add('Utula');
      if (limitedTo.includes('Tattoo')) add('Limited Tattoo');
    }

    // Mod-based categorization
    if (/strength|str\b/.test(blob)) add('Strength');
    if (/dexterity|dex\b/.test(blob)) add('Dexterity');
    if (/intelligence|int\b/.test(blob)) add('Intelligence');
    if (/life|maximum life/.test(blob)) add('Life');
    if (/mana|maximum mana/.test(blob)) add('Mana');
    if (/energy shield|es\b/.test(blob)) add('Energy Shield');
    if (/armour|armor|evasion|physical damage reduction/.test(blob)) add('Defences');
    if (/resistance|resist/.test(blob)) add('Resistances');
    if (/damage|physical|elemental|chaos|spell|attack/.test(blob)) add('Damage');
    if (/critical|crit/.test(blob)) add('Critical');
    if (/speed|attack speed|cast speed|movement speed/.test(blob)) add('Speed');
    if (/skill|passive|allocated/.test(blob)) add('Passive Skills');
    if (/charge|endurance|frenzy|power/.test(blob)) add('Charges');
    if (/flask|life flask|mana flask/.test(blob)) add('Flasks');
    if (/minion|totem|brand|trap|mine/.test(blob)) add('Minions & Totems');

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
    <div style='display:flex; gap:6px; align-items:center; margin-bottom:8px;'>
      <input id='tattoosSearch' type='text' placeholder='Search tattoos...' style='flex:1; padding:4px 8px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary); font-size:12px;'>
      <button id='tattoosClear' class='pin-btn' style='padding:4px 8px;'>Clear</button>
    </div>
    <div style='background:var(--bg-secondary); padding:8px; border-radius:6px; margin-bottom:8px;'>
      <div id='tattoosTagFilters' style='display:flex; flex-wrap:wrap; gap:4px; justify-content:center;'></div>
    </div>
    <div id='tattoosWrap' style='display:grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap:10px;'></div>`;
  
  state.input = panel.querySelector('#tattoosSearch') as HTMLInputElement | null;
  const wrap = panel.querySelector('#tattoosWrap') as HTMLElement | null;
  const tagWrap = panel.querySelector('#tattoosTagFilters') as HTMLElement | null;

  const TAG_ORDER = ['Small Stack','Medium Stack','Large Stack','Honoured','Makanga','Utula','Limited Tattoo','Strength','Dexterity','Intelligence','Life','Mana','Energy Shield','Defences','Resistances','Damage','Critical','Speed','Passive Skills','Charges','Flasks','Minions & Totems'];
  const tagOrderMap = TAG_ORDER.reduce<Record<string, number>>((acc, tag, index) => {
    acc[tag] = index;
    return acc;
  }, {});

  function tagRGB(tag: string) {
    const t = tag.toLowerCase();
    if (t === 'small stack') return [129, 199, 132];
    if (t === 'medium stack') return [255, 167, 38];
    if (t === 'large stack') return [239, 83, 80];
    if (t === 'honoured') return [139, 195, 74];
    if (t === 'makanga') return [255, 152, 0];
    if (t === 'utula') return [121, 85, 72];
    if (t === 'limited tattoo') return [186, 104, 200];
    if (t === 'strength') return [255, 82, 82];
    if (t === 'dexterity') return [76, 175, 80];
    if (t === 'intelligence') return [66, 165, 245];
    if (t === 'life') return [229, 57, 53];
    if (t === 'mana') return [66, 165, 245];
    if (t === 'energy shield') return [156, 204, 255];
    if (t === 'defences') return [144, 164, 174];
    if (t === 'resistances') return [255, 167, 38];
    if (t === 'damage') return [239, 83, 80];
    if (t === 'critical') return [255, 193, 7];
    if (t === 'speed') return [102, 187, 106];
    if (t === 'passive skills') return [171, 71, 188];
    if (t === 'charges') return [100, 221, 23];
    if (t === 'flasks') return [0, 188, 212];
    if (t === 'minions & totems') return [161, 136, 127];
    return [120, 120, 120];
  }

  function chipChrome(tag: string, active: boolean): ChipChrome {
    const [r, g, b] = tagRGB(tag);
    const background = active ? `rgba(${r},${g},${b},0.9)` : `rgba(${r},${g},${b},0.22)`;
    const border = `1px solid rgba(${r},${g},${b},0.6)`;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const color = active ? (l > 180 ? '#000' : '#fff') : 'var(--text-primary)';
    return { border, background, color };
  }
  
  function renderTagFilters() {
    if (!tagWrap) return;
    const sortedTags = Object.keys(state.tagCounts).sort((a, b) => {
      const orderA = tagOrderMap[a] ?? 9999;
      const orderB = tagOrderMap[b] ?? 9999;
      if (orderA !== orderB) return orderA - orderB;
      return a.localeCompare(b);
    });
    
    // Calculate if we need Show More button (approx 3 rows = ~21 tags @ 11px font with typical tag lengths)
    const MAX_TAGS_COLLAPSED = 21;
    const tagsToShow = (tagsExpanded || sortedTags.length <= MAX_TAGS_COLLAPSED) ? sortedTags : sortedTags.slice(0, MAX_TAGS_COLLAPSED);
    const needsShowMore = sortedTags.length > MAX_TAGS_COLLAPSED;
    
    tagWrap.innerHTML = '';
    tagsToShow.forEach(tag => {
      const count = state.tagCounts[tag] || 0;
      const isActive = state.selectedTags.has(tag);
      const el = document.createElement('div');
      el.textContent = `${tag} (${count})`;
      applyFilterChipChrome(el, chipChrome(tag, isActive), { padding: '3px 10px', fontWeight: isActive ? '600' : '500' });
      el.style.margin = '0 4px 4px 0';
      el.addEventListener('click', () => {
        if (isActive) state.selectedTags.delete(tag);
        else state.selectedTags.add(tag);
        applyFilter();
        renderTagFilters();
      });
      tagWrap.appendChild(el);
    });
    
    // Show More/Less button
    if (needsShowMore) {
      const showMoreBtn = document.createElement('div');
      showMoreBtn.textContent = tagsExpanded ? 'Show Less' : `Show More (${sortedTags.length - MAX_TAGS_COLLAPSED} more)`;
      // Apply individual style properties to preserve user font scaling
      showMoreBtn.style.cursor = 'pointer';
      showMoreBtn.style.userSelect = 'none';
      showMoreBtn.style.padding = '2px 6px';
      showMoreBtn.style.border = '1px solid var(--border-color)';
      showMoreBtn.style.borderRadius = '4px';
      showMoreBtn.style.background = 'var(--bg-secondary)';
      showMoreBtn.style.color = 'var(--text-secondary)';
      showMoreBtn.style.fontStyle = 'italic';
      showMoreBtn.addEventListener('click', () => {
        tagsExpanded = !tagsExpanded;
        renderTagFilters();
      });
      tagWrap.appendChild(showMoreBtn);
    }
    
    // Reset button
    if (state.selectedTags.size > 0) {
      const reset = document.createElement('div');
      reset.textContent = 'Reset';
      applyFilterChipChrome(reset, { border: '1px solid var(--accent-red)', background: 'var(--accent-red)', color: '#fff' }, { padding: '3px 10px', fontWeight: '600' });
      reset.style.margin = '0 4px 4px 0';
      reset.addEventListener('click', () => {
        state.selectedTags.clear();
        applyFilter();
        renderTagFilters();
      });
      tagWrap.appendChild(reset);
    }
  }

  function applyFilter() {
    const query = (state.input?.value || '').toLowerCase().trim();
    state.filtered = state.cache.filter(item => {
      const tags = (item as any)._tags || [];
      const matchTags = state.selectedTags.size === 0 || Array.from(state.selectedTags).every(tag => tags.includes(tag));
      const matchSearch = !query || (item.name||'').toLowerCase().includes(query) || (item.mods||[]).some(m => m.toLowerCase().includes(query));
      return matchTags && matchSearch;
    });
    renderCards();
  }

  function renderCards() {
    if (!wrap) return;
    wrap.innerHTML = '';
    if (state.filtered.length === 0) {
      wrap.innerHTML = `<div style='grid-column:1/-1; text-align:center; color:var(--text-secondary); padding:20px;'>No tattoos found</div>`;
      return;
    }
    state.filtered.forEach(item => {
      const card = document.createElement('div');
      card.style.background = 'var(--bg-card)';
      card.style.border = '1px solid var(--border-color)';
      card.style.borderRadius = '6px';
      card.style.padding = '8px';
      card.style.display = 'flex';
      card.style.gap = '8px';
      card.style.alignItems = 'flex-start';
      card.style.minHeight = '80px';
      card.style.transition = 'transform 0.15s, box-shadow 0.15s';
      
      card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-2px)';
        card.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
        card.style.boxShadow = '';
      });
      
      const orig = item.imageLocal ? `poe1/${item.imageLocal}` : '';
      const imgHtml = orig ? `<img class='tattoo-img' src='${TRANSPARENT_PLACEHOLDER}' data-orig-src='${orig}' decoding='async' style='width:48px; height:48px; object-fit:contain; flex-shrink:0;'>` : '<div style="width:48px; height:48px; flex-shrink:0;"></div>';
      const stackSize = item.properties?.["Stack Size"] || "";
      const limitedTo = item.properties?.["Limited to"] || "";
      const mods = (item.mods || []).map(m => `<div style='font-size:11px; line-height:1.4;'>${m}</div>`).join('');
      const tagsHtml = ((item as any)._tags||[]).map((t:string)=>{
        const [r,g,b] = tagRGB(t);
        return `<span style='display:inline-block; padding:1px 4px; margin:2px 2px 0 0; font-size:9px; border-radius:3px; background:rgba(${r},${g},${b},0.22); border:1px solid rgba(${r},${g},${b},0.6); color:var(--text-primary);'>${t}</span>`;
      }).join('');
      
      card.innerHTML = `
        ${imgHtml}
        <div style='flex:1; min-width:0; display:flex; flex-direction:column; gap:4px;'>
          <div style='font-weight:600; font-size:13px;'>${item.name||''}</div>
          ${stackSize ? `<div style='font-size:11px; color:var(--text-secondary);'>${stackSize}</div>` : ''}
          ${limitedTo ? `<div style='font-size:11px; color:var(--accent-blue);'>${limitedTo}</div>` : ''}
          ${mods ? mods : ''}
          ${tagsHtml ? `<div style='margin-top:4px;'>${tagsHtml}</div>` : ''}
        </div>`;
      wrap.appendChild(card);
    });
    bindImageFallback(wrap, '.tattoo-img', '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="4" fill="#222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#555" font-size="12" font-family="sans-serif">?</text></svg>', 0.5);
  }

  if (state.input) {
    state.input.addEventListener('input', applyFilter);
  }
  const clearBtn = panel.querySelector('#tattoosClear') as HTMLButtonElement | null;
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (state.input) state.input.value = '';
      applyFilter();
    });
  }

  renderTagFilters();
  applyFilter();
}
