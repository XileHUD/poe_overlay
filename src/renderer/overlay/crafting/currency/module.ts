// Currency module: displays generic stackable currency (excluding Omens/Catalysts) similar to Essences
import { bindImageFallback } from "../utils/imageFallback";

export type CurrencyItem = {
  slug?: string;
  name?: string;
  image?: string;
  stack_current?: number;
  stack_max?: number;
  explicitMods?: string[];
  minimum_modifier_level?: number;
};

type State = {
  panelEl: HTMLElement | null;
  cache: CurrencyItem[];
  filtered: CurrencyItem[];
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
  document.getElementById("historyHeader")?.setAttribute("style", "display:none");
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
  panel.innerHTML = `<div class='no-mods'>Loading...</div>`;
  setTimeout(()=>{ panel.scrollTop=0; }, 10);
  try {
    const data = await (window as any).electronAPI.getCurrency();
    if (!data || data.error) { panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load Currency (${data?.error||'unknown'})</div>`; return; }
    render(data.currency || []);
  } catch {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Exception loading Currency</div>`;
  }
}

export function render(list: CurrencyItem[]): void {
  const panel = ensurePanel();
  state.cache = [...(list||[])];
  // --- Derive tags for each currency item ---
  function deriveTags(c: CurrencyItem): string[] {
    const name = (c.name||'').toLowerCase();
    const mods = (c.explicitMods||[]).join(' ').toLowerCase();
    const tags = new Set<string>();
    if(/(orb|shard|splinter|artifact|feather|key)\b/.test(name)) {
      if(name.includes('orb')) tags.add('Orb');
      if(name.includes('shard')) tags.add('Shard');
      if(name.includes('splinter')) tags.add('Splinter');
      if(name.includes('artifact')) tags.add('Artifact');
      if(name.includes('feather')) tags.add('Feather');
      if(name.includes('key')) tags.add('Key');
    }
    if(/quality/.test(mods) || /quality/.test(name)) tags.add('Quality');
    if(/socket/.test(mods) || /adds? a rune socket/.test(mods)) tags.add('Sockets');
    if(/fracture/.test(mods)) tags.add('Fracture');
    if(/desecrates?/.test(mods)) tags.add('Desecrate');
    if(/corrupts?/.test(mods) || /corrupt/.test(mods)) tags.add('Corrupt');
    if(/duplicate/.test(mods) || name.includes('mirror')) tags.add('Duplicate');
    if(/foresee/.test(mods) || name.includes('lock')) tags.add('Preview');
    if(/identif(y|ies)/.test(mods)) tags.add('Identify');
    if(/reroll|removes a random modifier/.test(mods)) tags.add('Reroll');
    if(/augments?/.test(mods)) tags.add('Augment');
    if(/upgrades?/.test(mods)) tags.add('Upgrade');
    if(/randomises the numeric values/.test(mods)) tags.add('Reroll Values');
    if(/sets a skill gem to have \d support gem sockets/.test(mods)) tags.add('Gem Sockets');
    if(/spent at vendors/.test(mods) || name==='gold') tags.add('Vendor');
    if(c.minimum_modifier_level) tags.add('Tiered');
    if(/greater/.test(name)) tags.add('Greater');
    if(/perfect/.test(name)) tags.add('Perfect');
    if(/lesser/.test(name)) tags.add('Lesser');
    return [...tags];
  }

  const tagUniverse = new Set<string>();
  state.tagCounts = {};
  state.cache.forEach(c => {
    const t = deriveTags(c);
    (c as any)._tags = t; // store for quick filter
    t.forEach(tag => { tagUniverse.add(tag); state.tagCounts[tag] = (state.tagCounts[tag]||0)+1; });
  });
  const allTags = [...tagUniverse].sort((a,b)=>a.localeCompare(b));

  panel.innerHTML = `
    <div style='display:flex; gap:6px; align-items:center; margin-bottom:6px;'>
      <input id='currencySearch' type='text' placeholder='Search currency...' style='flex:1; padding:4px 8px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary); font-size:12px;'>
      <button id='currencyClear' class='pin-btn' style='padding:4px 8px;'>Clear</button>
    </div>
    <div id='currencyTagFilters' style='display:flex; flex-wrap:wrap; gap:4px; margin-bottom:4px;'></div>
    <div id='currencyWrap' style='display:grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap:10px;'></div>`;
  state.input = panel.querySelector('#currencySearch') as HTMLInputElement | null;
  const wrap = panel.querySelector('#currencyWrap') as HTMLElement | null;
  const tagWrap = panel.querySelector('#currencyTagFilters') as HTMLElement | null;

  function highlight(s: string): string {
    return (s||"")
      .replace(/(\d+\s*[–-]\s*\d+)/g,'<span class="mod-value">$1</span>')
      .replace(/(?<![A-Za-z0-9>])([+\-]?\d+)(?![A-Za-z0-9<])/g,'<span class="mod-value">$1</span>')
      .replace(/(\d+%)/g,'<span class="mod-value">$1</span>');
  }

  function tagRGB(tag: string){
    const t = tag.toLowerCase();
    if(t==='orb' || t==='augment') return [121,85,72];
    if(t==='reroll' || t==='reroll values') return [255,112,67];
    if(t==='upgrade') return [66,165,245];
    if(t==='sockets' || t==='gem sockets') return [255,213,79];
    if(t==='fracture') return [244,143,177];
    if(t==='desecrate') return [149,117,205];
    if(t==='duplicate') return [38,198,218];
    if(t==='corrupt') return [220,68,61];
    if(t==='preview') return [96,125,139];
    if(t==='quality') return [171,71,188];
    if(t==='vendor') return [46,125,50];
    if(t==='artifact') return [255,152,0];
    if(t==='splinter' || t==='shard') return [255,179,0];
    if(t==='tiered' || t==='greater' || t==='perfect' || t==='lesser') return [120,144,156];
    if(t==='feather' || t==='key') return [109,76,65];
    return [80,110,120];
  }
  function chipCss(tag: string, active: boolean){
    const [r,g,b]=tagRGB(tag); const bg=active?`rgba(${r},${g},${b},0.9)`:`rgba(${r},${g},${b},0.22)`; const border=`rgba(${r},${g},${b},0.6)`; const l=0.2126*r+0.7152*g+0.0722*b; const color=active?(l>180?'#000':'#fff'):'var(--text-primary)';
    return `cursor:pointer; user-select:none; padding:2px 6px; font-size:11px; border-radius:999px; border:1px solid ${border}; background:${bg}; color:${color};`;
  }
  function renderTagFilters(){ if(!tagWrap) return; tagWrap.innerHTML=''; allTags.forEach(tag=>{ const active=state.selectedTags.has(tag); const el=document.createElement('div'); el.textContent = state.tagCounts[tag]? `${tag} (${state.tagCounts[tag]})` : tag; el.style.cssText=chipCss(tag, active); el.addEventListener('click',()=>{ active?state.selectedTags.delete(tag):state.selectedTags.add(tag); apply(state.input?.value||''); renderTagFilters(); }); tagWrap.appendChild(el); }); if(state.selectedTags.size){ const reset=document.createElement('div'); reset.textContent='Reset'; reset.style.cssText='cursor:pointer; user-select:none; padding:2px 6px; font-size:11px; border-radius:999px; border:1px solid var(--accent-red); background:var(--accent-red); color:#fff;'; reset.addEventListener('click',()=>{ state.selectedTags.clear(); apply(state.input?.value||''); renderTagFilters(); }); tagWrap.appendChild(reset); } }

  function apply(filter='') {
    if (!wrap) return;
    wrap.innerHTML='';
    const f = filter.toLowerCase();
    const matchTags = (c: CurrencyItem) => {
      if(!state.selectedTags.size) return true;
      const tags = (c as any)._tags as string[] || [];
      return [...state.selectedTags].every(t=>tags.includes(t));
    };
    state.filtered = state.cache.filter(c => (!f || (c.name||'').toLowerCase().includes(f) || (c.explicitMods||[]).some(m => m.toLowerCase().includes(f))) && matchTags(c));
    state.filtered.forEach(c => {
      const modsHtml = (c.explicitMods||[]).map(m=>highlight(m)).join('<br>');
      const minLvl = c.minimum_modifier_level ? `<div style='font-size:11px; color:var(--text-muted);'>Min Modifier Lvl: ${c.minimum_modifier_level}</div>` : '';
      const card = document.createElement('div');
      card.style.background='var(--bg-card)';
      card.style.border='1px solid var(--border-color)';
      card.style.borderRadius='6px';
      card.style.padding='6px';
      card.style.display='flex';
      card.style.flexDirection='column';
      card.style.gap='4px';
      card.innerHTML = `<div style='display:flex; align-items:center; gap:6px;'>${c.image?`<img class='currency-img' src='${c.image}' decoding='async' style='width:26px; height:26px; object-fit:contain;'>`:''}<div style='font-weight:600;'>${c.name}</div></div><div style='font-size:11px; color:var(--text-muted);'>Stack: ${c.stack_current??'?'} / ${c.stack_max??'?'}${(c as any)._tags.length?` • ${(c as any)._tags.join(', ')}`:''}</div>${minLvl}<div style='font-size:11px;'>${modsHtml}</div>`;
      wrap.appendChild(card);
    });
    bindImageFallback(panel, '.currency-img', '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 28 28"><rect width="28" height="28" rx="4" fill="#222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#555" font-size="8" font-family="sans-serif">?</text></svg>', 0.5);
  }

  state.input?.addEventListener('input', () => apply(state.input?.value || ''));
  panel.querySelector('#currencyClear')?.addEventListener('click', ()=>{ if (state.input) { state.input.value=''; apply(''); state.input.focus(); }});
  renderTagFilters();
  apply('');
}

export async function reload(): Promise<void> {
  const panel = ensurePanel();
  panel.querySelector('.no-mods')?.remove();
  const loader = document.createElement('div'); loader.className='no-mods'; loader.textContent='Reloading...'; panel.appendChild(loader);
  try {
    const data = await (window as any).electronAPI.getCurrency();
    if (!data || data.error) { panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load Currency (${data?.error||'unknown'})</div>`; return; }
    render(data.currency || []);
  } catch {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Reload failed</div>`;
  }
}
