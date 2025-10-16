// PoE1 Scarabs module: displays scarabs for Path of Exile 1
import { bindImageFallback } from "../../utils/imageFallback";
import { TRANSPARENT_PLACEHOLDER } from "../../utils/imagePlaceholder";
import { resolveLocalImage } from "../../utils/localImage";

export type ScarabItem = {
  slug?: string;
  name?: string;
  imageLocal?: string;
  description?: string;
  stack_size?: string;
  limit?: string;
  properties?: Record<string, any>;
  mods?: string[];
};

type State = {
  panelEl: HTMLElement | null;
  cache: ScarabItem[];
  filtered: ScarabItem[];
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
  panel.innerHTML = `<div class='no-mods'>Loading PoE1 Scarabs...</div>`;
  setTimeout(()=>{ panel.scrollTop=0; }, 10);
  try {
    const data = await (window as any).electronAPI.getPoe1Scarabs();
    if (!data || data.error) { 
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load PoE1 Scarabs (${data?.error||'unknown'})<br><span style='color:var(--text-muted); font-size:11px;'>Run: npx tsx packages/collector/src/cli.ts scrape:poe1:scarabs</span></div>`; 
      return; 
    }
    render(data.items || []);
  } catch (e) {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Exception loading PoE1 Scarabs: ${e}</div>`;
  }
}

export function render(list: ScarabItem[]): void {
  const panel = ensurePanel();
  state.cache = [...(list||[])];
  
  // Derive tags from scarab names and descriptions
  function deriveTags(s: ScarabItem): string[] {
    const name = (s.name||'').toLowerCase();
    const desc = (s.description||'').toLowerCase();
    const tags = new Set<string>();
    
    // League mechanics
    if(/breach/i.test(name)) tags.add('Breach');
    if(/abyss/i.test(name)) tags.add('Abyss');
    if(/ambush|strongbox/i.test(name+desc)) tags.add('Strongboxes');
    if(/bestiary|einhar/i.test(name+desc)) tags.add('Bestiary');
    if(/beyond/i.test(name)) tags.add('Beyond');
    if(/betrayal|jun|syndicate/i.test(name+desc)) tags.add('Betrayal');
    if(/blight/i.test(name)) tags.add('Blight');
    if(/delirium/i.test(name)) tags.add('Delirium');
    if(/delve|sulphite|niko/i.test(name+desc)) tags.add('Delve');
    if(/domination|shrine/i.test(name+desc)) tags.add('Domination');
    if(/essence/i.test(name)) tags.add('Essence');
    if(/expedition/i.test(name)) tags.add('Expedition');
    if(/harbinger/i.test(name)) tags.add('Harbinger');
    if(/harvest/i.test(name)) tags.add('Harvest');
    if(/heist/i.test(name)) tags.add('Heist');
    if(/incursion|alva/i.test(name+desc)) tags.add('Incursion');
    if(/legion/i.test(name)) tags.add('Legion');
    if(/metamorph/i.test(name)) tags.add('Metamorph');
    if(/ritual/i.test(name)) tags.add('Ritual');
    if(/rogue|exile/i.test(name)) tags.add('Rogue Exiles');
    if(/torment/i.test(name)) tags.add('Torment');
    if(/ultimatum/i.test(name)) tags.add('Ultimatum');
    if(/anarchy|exarch|eater/i.test(name)) tags.add('Eldritch');
    if(/map|cartography/i.test(name)) tags.add('Maps');
    if(/scarab/i.test(name) && !/breach|abyss|ambush/i.test(name)) tags.add('Other');
    
    // Rarity/tier
    if(/lesser/i.test(name)) tags.add('Lesser');
    if(/greater/i.test(name)) tags.add('Greater');
    if(/gilded/i.test(name)) tags.add('Gilded');
    if(/winged/i.test(name)) tags.add('Winged');
    
    return [...tags];
  }

  const tagUniverse = new Set<string>();
  state.tagCounts = {};
  state.cache.forEach(s => {
    const t = deriveTags(s);
    (s as any)._tags = t;
    t.forEach(tag => { tagUniverse.add(tag); state.tagCounts[tag] = (state.tagCounts[tag]||0)+1; });
  });
  const allTags = [...tagUniverse].sort((a,b)=>a.localeCompare(b));

  panel.innerHTML = `
    <div style='display:flex; gap:6px; align-items:center; margin-bottom:6px;'>
      <input id='scarabSearch' type='text' placeholder='Search scarabs...' style='flex:1; padding:4px 8px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary); font-size:12px;'>
      <button id='scarabClear' class='pin-btn' style='padding:4px 8px;'>Clear</button>
    </div>
    <div id='scarabTagFilters' style='display:flex; flex-wrap:wrap; gap:4px; margin-bottom:4px; justify-content:center; width:100%;'></div>
    <div id='scarabWrap' style='display:grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap:10px;'></div>`;
  
  state.input = panel.querySelector('#scarabSearch') as HTMLInputElement | null;
  const wrap = panel.querySelector('#scarabWrap') as HTMLElement | null;
  const tagWrap = panel.querySelector('#scarabTagFilters') as HTMLElement | null;

  function highlight(s: string): string {
    return (s||"")
      .replace(/(\d+\s*[–-]\s*\d+)/g,'<span class="mod-value">$1</span>')
      .replace(/(?<![A-Za-z0-9>])([+\-]?\d+)(?![A-Za-z0-9<])/g,'<span class="mod-value">$1</span>')
      .replace(/(\d+%)/g,'<span class="mod-value">$1</span>');
  }

  function tagRGB(tag: string){
    const t = tag.toLowerCase();
    if(t==='breach') return [138,43,226];
    if(t==='abyss') return [0,255,127];
    if(t==='strongboxes' || t==='ambush') return [255,215,0];
    if(t==='bestiary') return [255,99,71];
    if(t==='beyond') return [148,0,211];
    if(t==='betrayal') return [220,20,60];
    if(t==='blight') return [107,142,35];
    if(t==='delirium') return [105,105,105];
    if(t==='delve') return [70,130,180];
    if(t==='domination') return [255,140,0];
    if(t==='essence') return [186,85,211];
    if(t==='expedition') return [210,105,30];
    if(t==='harbinger') return [100,149,237];
    if(t==='harvest') return [154,205,50];
    if(t==='heist') return [47,79,79];
    if(t==='incursion') return [255,69,0];
    if(t==='legion') return [178,34,34];
    if(t==='metamorph') return [139,69,19];
    if(t==='ritual') return [128,0,128];
    if(t==='torment') return [72,209,204];
    if(t==='ultimatum') return [255,0,0];
    if(t==='eldritch') return [255,20,147];
    if(t==='maps') return [30,144,255];
    if(t==='lesser') return [169,169,169];
    if(t==='greater') return [255,215,0];
    if(t==='gilded') return [218,165,32];
    if(t==='winged') return [255,255,224];
    return [100,120,140];
  }
  
  function chipCss(tag: string, active: boolean){
    const [r,g,b]=tagRGB(tag); 
    const bg=active?`rgba(${r},${g},${b},0.9)`:`rgba(${r},${g},${b},0.22)`; 
    const border=`rgba(${r},${g},${b},0.6)`; 
    const l=0.2126*r+0.7152*g+0.0722*b; 
    const color=active?(l>180?'#000':'#fff'):'var(--text-primary)';
    return `cursor:pointer; user-select:none; padding:2px 6px; font-size:11px; border-radius:999px; border:1px solid ${border}; background:${bg}; color:${color};`;
  }
  
  function renderTagFilters(){ 
    if(!tagWrap) return; 
    tagWrap.innerHTML=''; 
    allTags.forEach(tag=>{ 
      const active=state.selectedTags.has(tag); 
      const el=document.createElement('div'); 
      el.textContent = state.tagCounts[tag]? `${tag} (${state.tagCounts[tag]})` : tag; 
      el.style.cssText=chipCss(tag, active); 
      el.addEventListener('click',()=>{ 
        active?state.selectedTags.delete(tag):state.selectedTags.add(tag); 
        apply(state.input?.value||''); 
        renderTagFilters(); 
      }); 
      tagWrap.appendChild(el); 
    }); 
    if(state.selectedTags.size){ 
      const reset=document.createElement('div'); 
      reset.textContent='Reset'; 
      reset.style.cssText='cursor:pointer; user-select:none; padding:2px 6px; font-size:11px; border-radius:999px; border:1px solid var(--accent-red); background:var(--accent-red); color:#fff;'; 
      reset.addEventListener('click',()=>{ 
        state.selectedTags.clear(); 
        apply(state.input?.value||''); 
        renderTagFilters(); 
      }); 
      tagWrap.appendChild(reset); 
    } 
  }

  function apply(filter='') {
    if (!wrap) return;
    wrap.innerHTML='';
    const f = filter.toLowerCase();
    const matchTags = (s: ScarabItem) => {
      if(!state.selectedTags.size) return true;
      const tags = (s as any)._tags as string[] || [];
      return [...state.selectedTags].every(t=>tags.includes(t));
    };
    state.filtered = state.cache.filter(s => 
      (!f || (s.name||'').toLowerCase().includes(f) || (s.description||'').toLowerCase().includes(f)) && matchTags(s)
    );
    
    state.filtered.forEach(s => {
      const descHtml = highlight(s.description || '');
      const limitInfo = s.limit ? `<span style='color:var(--accent-blue);'>Limit: ${s.limit}</span>` : '';
      const card = document.createElement('div');
      card.style.background='var(--bg-card)';
      card.style.border='1px solid var(--border-color)';
      card.style.borderRadius='6px';
      card.style.padding='6px';
      card.style.display='flex';
      card.style.flexDirection='column';
      card.style.gap='4px';
      
      const orig = s.imageLocal ? `poe1/${s.imageLocal}` : '';
      const imgHtml = orig ? `<img class='scarab-img' src='${TRANSPARENT_PLACEHOLDER}' data-orig-src='${orig}' decoding='async' style='width:28px; height:28px; object-fit:contain;'>` : '';
      
      card.innerHTML = `
        <div style='display:flex; align-items:center; gap:6px;'>
          ${imgHtml}
          <div style='font-weight:600;'>${s.name}</div>
        </div>
        <div style='font-size:11px; color:var(--text-muted);'>
          Stack: ${s.stack_size || '?'} ${limitInfo}${(s as any)._tags.length?` • ${(s as any)._tags.join(', ')}`:''}</div>
        <div style='font-size:11px;'>${descHtml}</div>`;
      wrap.appendChild(card);
    });
    
    bindImageFallback(panel, '.scarab-img', '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><rect width="28" height="28" rx="4" fill="#222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#555" font-size="8" font-family="sans-serif">?</text></svg>', 0.5);
  }

  state.input?.addEventListener('input', () => apply(state.input?.value || ''));
  panel.querySelector('#scarabClear')?.addEventListener('click', ()=>{ 
    if (state.input) { 
      state.input.value=''; 
      apply(''); 
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
  loader.textContent='Reloading PoE1 Scarabs...'; 
  panel.appendChild(loader);
  try {
    const data = await (window as any).electronAPI.getPoe1Scarabs();
    if (!data || data.error) { 
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to reload PoE1 Scarabs (${data?.error||'unknown'})</div>`; 
      return; 
    }
    render(data.items || []);
  } catch (e) {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Reload failed: ${e}</div>`;
  }
}
