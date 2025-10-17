// PoE1 Divination Cards module
import { bindImageFallback } from "../../../crafting/utils/imageFallback";
import { TRANSPARENT_PLACEHOLDER } from "../../../crafting/utils/imagePlaceholder";
import { resolveLocalImage } from "../../../crafting/utils/localImage";

export type DivinationCard = {
  slug?: string;
  name?: string;
  imageLocal?: string;
  properties?: Record<string, string>;
  mods?: string[];
};

type State = {
  panelEl: HTMLElement | null;
  cache: DivinationCard[];
  filtered: DivinationCard[];
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
  (window as any).__lastPanel = 'poe1-divination-cards';
  setCharacterTabActive();
  const panel = ensurePanel();
  panel.style.display='';
  panel.innerHTML = `<div class='no-mods'>Loading Divination Cards...</div>`;
  setTimeout(()=>{ panel.scrollTop=0; }, 10);
  try {
    const data = await (window as any).electronAPI.getPoe1DivinationCards?.();
    if (!data || data.error) { 
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load Divination Cards (${data?.error||'unknown'})</div>`; 
      return; 
    }
    render(data.items || []);
  } catch (e) {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Exception loading Divination Cards: ${e}</div>`;
  }
}

export function render(list: DivinationCard[]): void {
  const panel = ensurePanel();
  state.cache = [...(list||[])];
  state.selectedTags.clear();
  state.tagCounts = {};

  const tagCounts: Record<string, number> = {};

  const deriveTags = (item: DivinationCard): string[] => {
    const tags = new Set<string>();
    const blob = `${item.name||''} ${(item.mods||[]).join(' ')} ${Object.values(item.properties||{}).join(' ')}`.toLowerCase();
    const add = (label: string) => tags.add(label);
    
    // Stack size-based tags
    const stackSize = item.properties?.["Stack Size"] || "";
    const match = stackSize.match(/(\d+)\s*\/\s*(\d+)/);
    if (match) {
      const total = parseInt(match[2], 10);
      if (total <= 3) add('Small Stack');
      else if (total <= 6) add('Medium Stack');
      else add('Large Stack');
    }

    // Reward type tags based on card flavor text
    if (/currency|chaos|exalt|divine|mirror|vaal orb|annul|regal/.test(blob)) add('Currency');
    if (/unique|league-specific unique/.test(blob)) add('Unique');
    if (/divination|card/.test(blob)) add('Cards');
    if (/gem|skill gem|support gem|quality/.test(blob)) add('Gems');
    if (/armour|weapon|jewellery|jewelry|ring|amulet|belt/.test(blob)) add('Equipment');
    if (/map|atlas|tier/.test(blob)) add('Maps');
    if (/fragment|splinter|scarab/.test(blob)) add('Fragments');
    if (/essence|fossil|resonator|catalyst/.test(blob)) add('Crafting Materials');
    if (/corrupted|tainted/.test(blob)) add('Corrupted');
    if (/six-link|6-link|linked/.test(blob)) add('Linked Items');

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
      <input id='divCardsSearch' type='text' placeholder='Search divination cards...' style='flex:1; padding:4px 8px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary); font-size:12px;'>
      <button id='divCardsClear' class='pin-btn' style='padding:4px 8px;'>Clear</button>
    </div>
    <div id='divCardsTagFiltersRow' style='display:flex; justify-content:center; width:100%;'>
      <div id='divCardsTagFilters' style='display:inline-flex; flex-wrap:wrap; gap:4px; margin-bottom:4px;'></div>
    </div>
    <div id='divCardsWrap' style='display:grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap:10px;'></div>`;
  
  state.input = panel.querySelector('#divCardsSearch') as HTMLInputElement | null;
  const wrap = panel.querySelector('#divCardsWrap') as HTMLElement | null;
  const tagWrap = panel.querySelector('#divCardsTagFilters') as HTMLElement | null;

  const TAG_ORDER = ['Small Stack','Medium Stack','Large Stack','Currency','Unique','Cards','Gems','Equipment','Maps','Fragments','Crafting Materials','Corrupted','Linked Items'];
  const tagOrderMap = TAG_ORDER.reduce<Record<string, number>>((acc, tag, index) => {
    acc[tag] = index;
    return acc;
  }, {});

  function tagRGB(tag: string) {
    const t = tag.toLowerCase();
    if (t === 'small stack') return [129, 199, 132];
    if (t === 'medium stack') return [255, 167, 38];
    if (t === 'large stack') return [239, 83, 80];
    if (t === 'currency') return [246, 191, 79];
    if (t === 'unique') return [175, 96, 37];
    if (t === 'cards') return [186, 104, 200];
    if (t === 'gems') return [102, 187, 106];
    if (t === 'equipment') return [100, 181, 246];
    if (t === 'maps') return [255, 138, 101];
    if (t === 'fragments') return [161, 136, 127];
    if (t === 'crafting materials') return [144, 164, 174];
    if (t === 'corrupted') return [255, 82, 82];
    if (t === 'linked items') return [156, 39, 176];
    return [120, 120, 120];
  }

  function chipCss(tag: string, active: boolean){
    const [r,g,b]=tagRGB(tag); 
    const bg=active?`rgba(${r},${g},${b},0.9)`:`rgba(${r},${g},${b},0.22)`; 
    const border=`rgba(${r},${g},${b},0.6)`; 
    const l=0.2126*r+0.7152*g+0.0722*b; 
    const color=active?(l>180?'#000':'#fff'):'var(--text-primary)';
    return `cursor:pointer; user-select:none; padding:2px 6px; font-size:11px; border-radius:999px; border:1px solid ${border}; background:${bg}; color:${color};`;
  }
  
  function renderTagFilters() {
    if (!tagWrap) return;
    const sortedTags = Object.keys(state.tagCounts).sort((a, b) => {
      const orderA = tagOrderMap[a] ?? 9999;
      const orderB = tagOrderMap[b] ?? 9999;
      if (orderA !== orderB) return orderA - orderB;
      return a.localeCompare(b);
    });
    tagWrap.innerHTML = '';
    sortedTags.forEach(tag => {
      const count = state.tagCounts[tag] || 0;
      const isActive = state.selectedTags.has(tag);
      const el = document.createElement('div');
      el.textContent = `${tag} (${count})`;
      el.style.cssText = chipCss(tag, isActive);
      el.addEventListener('click', () => {
        if (isActive) state.selectedTags.delete(tag);
        else state.selectedTags.add(tag);
        applyFilter();
        renderTagFilters();
      });
      tagWrap.appendChild(el);
    });
    if (state.selectedTags.size > 0) {
      const reset = document.createElement('div');
      reset.textContent = 'Reset';
      reset.style.cssText = 'cursor:pointer; user-select:none; padding:2px 6px; font-size:11px; border-radius:999px; border:1px solid var(--accent-red); background:var(--accent-red); color:#fff;';
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
      wrap.innerHTML = `<div style='grid-column:1/-1; text-align:center; color:var(--text-secondary); padding:20px;'>No divination cards found</div>`;
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
      const imgHtml = orig ? `<img class='divcard-img' src='${TRANSPARENT_PLACEHOLDER}' data-orig-src='${orig}' decoding='async' style='width:48px; height:48px; object-fit:contain; flex-shrink:0;'>` : '<div style="width:48px; height:48px; flex-shrink:0;"></div>';
      const stackSize = item.properties?.["Stack Size"] || "";
      
      // Format mods: add space before capital letters, Quality, Implicit, Corrupted, etc
      const formatMod = (m: string) => {
        return m
          .replace(/([a-z])([A-Z])/g, '$1 $2')  // Add space before capitals
          .replace(/Quality:/g, '\nQuality:')
          .replace(/Implicit/g, '\nImplicit')
          .replace(/Corrupted/g, '\nCorrupted')
          .replace(/Influenced/g, '\nInfluenced')
          .replace(/Synthesised/g, '\nSynthesised')
          .replace(/Fractured/g, '\nFractured')
          .replace(/Item Level:/g, '\nItem Level:')
          .replace(/^\s+/, ''); // Remove leading whitespace
      };
      
      const modsFormatted = (item.mods || []).map(m => formatMod(m)).join('');
      const modsHtml = modsFormatted ? `<div style='font-size:11px; line-height:1.4; white-space:pre-line;'><strong>Reward:</strong> ${modsFormatted}</div>` : '';
      
      const tagsHtml = ((item as any)._tags||[]).map((t:string)=>{
        const [r,g,b] = tagRGB(t);
        return `<span style='display:inline-block; padding:1px 4px; margin:2px 2px 0 0; font-size:9px; border-radius:3px; background:rgba(${r},${g},${b},0.22); border:1px solid rgba(${r},${g},${b},0.6); color:var(--text-primary);'>${t}</span>`;
      }).join('');
      
      card.innerHTML = `
        ${imgHtml}
        <div style='flex:1; min-width:0; display:flex; flex-direction:column; gap:4px;'>
          <div style='font-weight:600; font-size:13px;'>${item.name||''}</div>
          ${stackSize ? `<div style='font-size:11px; color:var(--text-secondary);'>${stackSize}</div>` : ''}
          ${modsHtml}
          ${tagsHtml ? `<div style='margin-top:4px;'>${tagsHtml}</div>` : ''}
        </div>`;
      wrap.appendChild(card);
    });
    bindImageFallback(wrap, '.divcard-img', '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="4" fill="#222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#555" font-size="12" font-family="sans-serif">?</text></svg>', 0.5);
  }

  if (state.input) {
    state.input.addEventListener('input', applyFilter);
  }
  const clearBtn = panel.querySelector('#divCardsClear') as HTMLButtonElement | null;
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (state.input) state.input.value = '';
      applyFilter();
    });
  }

  renderTagFilters();
  applyFilter();
}
