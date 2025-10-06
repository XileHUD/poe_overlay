// Catalysts module: encapsulates Catalysts crafting UI
import { bindImageFallback } from "../utils/imageFallback";

export type Catalyst = {
  slug?: string;
  name?: string;
  image?: string;
  stack_current?: number;
  stack_max?: number;
  explicitMods?: string[];
};

type State = {
  panelEl: HTMLElement | null;
  cache: Catalyst[];
  filtered: Catalyst[];
  input: HTMLInputElement | null;
  selectedTags?: Set<string>;
  tagCounts?: Record<string, number>;
};

const state: State = {
  panelEl: null,
  cache: [],
  filtered: [],
  input: null,
  selectedTags: new Set<string>(),
  tagCounts: {},
};

// Reuse shared fallback for consistent offline resolution (currency already uses it)

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
  state.panelEl = el;
  return el;
}

function setCraftingTabActive(): void {
  const tabMod = document.getElementById("tabModifier") as HTMLElement | null;
  const tabHist = document.getElementById("tabHistory") as HTMLElement | null;
  const craftingTab = document.getElementById("craftingTab") as HTMLElement | null;
  const contentMod = document.getElementById("content") as HTMLElement | null;
  const contentHist = document.getElementById("historyContent") as HTMLElement | null;
  if (tabMod) { tabMod.classList.remove("active"); tabMod.style.background = "var(--bg-tertiary)"; tabMod.style.color = "var(--text-primary)"; }
  if (tabHist) { tabHist.classList.remove("active"); tabHist.style.background = "var(--bg-tertiary)"; tabHist.style.color = "var(--text-primary)"; }
  if (craftingTab) { craftingTab.style.background = "var(--accent-blue)"; craftingTab.style.color = "#fff"; }
  if (contentMod) contentMod.style.display = "none";
  if (contentHist) contentHist.style.display = "none";
  // Don't set inline display:none - let CSS handle visibility via body classes
  document.getElementById("modifierHeaderInfo")?.setAttribute("style", "display:none");
  document.getElementById("whittlingInfo")?.setAttribute("style", "display:none");
  document.getElementById("controlPanel")?.setAttribute("style", "");
  // Hide Annoints panel if present
  const ann = document.getElementById("annointsPanel");
  if (ann) (ann as HTMLElement).style.display = "none";
  document.body.classList.add("crafting-mode");
}

export async function show(): Promise<void> {
  setCraftingTabActive();
  const panel = ensurePanel();
  panel.style.display = "";
  panel.innerHTML = `<div class="no-mods">Loading...</div>`;
  setTimeout(() => { panel.scrollTop = 0; }, 10);
  try {
    const data = await (window as any).electronAPI.getCatalysts();
    if (!data || data.error) {
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load Catalysts (${data?.error||'unknown'})<br><span style='color:var(--text-muted); font-size:11px;'>Run collector scraper</span></div>`;
      return;
    }
    render(data.catalysts || []);
  } catch (e) {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Exception loading Catalysts</div>`;
  }
}

export function render(list: Catalyst[]): void {
  const panel = ensurePanel();
  state.cache = [...(list || [])];
  // Curated tags for catalysts based on typical catalyst effects
  const curated = [
    'Damage','Ailments','Attributes','Life','Mana','Energy Shield','Armour','Evasion','Resistances',
    'Fire','Cold','Lightning','Chaos','Spell','Attack','Minion','Projectile','Area','Critical','Speed','Curse','DoT','Socket'
  ];
  const lowerInc = (k: string) => { (state.tagCounts as any)[k] = ((state.tagCounts as any)[k] || 0) + 1; };
  state.tagCounts = Object.fromEntries(curated.map(t => [t, 0]));
  const addTagsFor = (e: Catalyst) => {
    const blob = `${e.name||''} ${(e.explicitMods||[]).join(' ')}`.toLowerCase();
    if (/strength|dexterity|intelligence|attribute/.test(blob)) lowerInc('Attributes');
    if (/life/.test(blob)) lowerInc('Life');
    if (/mana/.test(blob)) lowerInc('Mana');
    if (/energy\s*shield|\bes\b/.test(blob)) lowerInc('Energy Shield');
    if (/armour|armor/.test(blob)) lowerInc('Armour');
    if (/evasion/.test(blob)) lowerInc('Evasion');
    if (/resist/.test(blob)) lowerInc('Resistances');
    if (/fire/.test(blob)) lowerInc('Fire');
    if (/cold|freeze|chill/.test(blob)) lowerInc('Cold');
    if (/lightning|shock|electrocute/.test(blob)) lowerInc('Lightning');
    if (/chaos|poison/.test(blob)) lowerInc('Chaos');
    if (/spell/.test(blob)) lowerInc('Spell');
    if (/attack|weapon/.test(blob)) lowerInc('Attack');
    if (/minion/.test(blob)) lowerInc('Minion');
    if (/projectile/.test(blob)) lowerInc('Projectile');
    if (/area/.test(blob)) lowerInc('Area');
    if (/critical|crit/.test(blob)) lowerInc('Critical');
    if (/speed|attack speed|cast speed|movement/.test(blob)) lowerInc('Speed');
    if (/curse/.test(blob)) lowerInc('Curse');
    if (/damage over time|degeneration|bleed|ignite/.test(blob)) lowerInc('DoT');
    if (/socketed|socket/.test(blob)) lowerInc('Socket');
    if (/damage|increased|more/.test(blob)) lowerInc('Damage');
    if (/ailment|impale|bleed|ignite|poison|shock|chill|freeze|electrocute/.test(blob)) lowerInc('Ailments');
  };
  state.cache.forEach(addTagsFor);

  panel.innerHTML = `
    <div style='display:flex; gap:6px; align-items:center; margin-bottom:8px;'>
      <input id='catalystSearch' type='text' placeholder='Search...' style='flex:1; padding:4px 8px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary); font-size:12px;'>
      <button id='catalystClear' class='pin-btn' style='padding:4px 8px;'>Clear</button>
    </div>
    <div id='catalystTagFilters' style='display:flex; flex-wrap:wrap; gap:6px; margin:-2px 0 8px; justify-content:center;'></div>
  <div id='catalystList' style='display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:10px;'></div>`;
  state.input = panel.querySelector('#catalystSearch') as HTMLInputElement | null;
  const listEl = panel.querySelector('#catalystList') as HTMLElement | null;
  const tagWrap = panel.querySelector('#catalystTagFilters') as HTMLElement | null;

  function tagRGB(tag: string){
    const t=(tag||'').toLowerCase();
    if (t==='fire' || t==='life') return [220,68,61];
    if (t==='cold' || t==='mana') return [66,165,245];
    if (t==='lightning') return [255,213,79];
    if (t==='chaos' || t==='minion') return [156,39,176];
    if (t==='energy shield' || t==='es') return [38,198,218];
    if (t==='defences' || t==='armour' || t==='armor') return [109,76,65];
    if (t==='evasion') return [46,125,50];
    if (t==='resistances' || t==='resist') return [255,112,67];
    if (t==='projectile') return [255,179,0];
    if (t==='area') return [171,71,188];
    if (t==='critical' || t==='crit') return [255,179,0];
    if (t==='spell') return [92,107,192];
    if (t==='attack') return [121,85,72];
    if (t==='damage' || t==='ailments' || t==='mechanics' || t==='dot') return [96,125,139];
    if (t==='speed' || t==='movement') return [67,160,71];
    if (t==='elemental') return [255,152,0];
    return [120,144,156];
  }
  function chipCss(tag: string, active: boolean){
    const [r,g,b]=tagRGB(tag);
    const bg = active? `rgba(${r},${g},${b},0.9)` : `rgba(${r},${g},${b},0.22)`;
    const border=`rgba(${r},${g},${b},0.6)`;
    const luma=0.2126*r+0.7152*g+0.0722*b;
    const color = active ? (luma>180? '#000':'#fff') : 'var(--text-primary)';
    return `border:1px solid ${border}; background:${bg}; color:${color};`;
  }
  function renderTagFilters(){
    if (!tagWrap) return;
    tagWrap.innerHTML='';
    curated.forEach(tag=>{
      const lc = tag.toLowerCase();
      const active = (state.selectedTags as Set<string>).has(lc);
      const count = (state.tagCounts as any)[tag] || 0;
      if (!count) return;
      const el = document.createElement('button');
      el.textContent = count ? `${tag} (${count})` : tag;
      el.style.cssText = `padding:3px 8px; font-size:11px; border-radius:999px; cursor:pointer; ${chipCss(tag, active)}`;
      el.addEventListener('click', ()=>{
        if (active) (state.selectedTags as Set<string>).delete(lc); else (state.selectedTags as Set<string>).add(lc);
        apply(state.input?.value || '');
        renderTagFilters();
      });
      tagWrap.appendChild(el);
    });
    if ((state.selectedTags as Set<string>).size) {
      const reset=document.createElement('button');
      reset.textContent='Reset';
      reset.style.cssText='padding:3px 8px; font-size:11px; border-radius:999px; cursor:pointer; background:var(--accent-red); color:#fff; border:1px solid var(--accent-red);';
      reset.addEventListener('click', ()=>{ (state.selectedTags as Set<string>).clear(); apply(''); renderTagFilters(); });
      tagWrap.appendChild(reset);
    }
  }

  function highlight(s: string): string {
    return (s||"")
      .replace(/(\d+\s*[–-]\s*\d+)/g,'<span class="mod-value">$1</span>')
      .replace(/(?<![A-Za-z0-9])([+\-]?\d+)(?![A-Za-z0-9])/g,'<span class="mod-value">$1</span>')
      .replace(/(\d+%)/g,'<span class="mod-value">$1</span>')
      .replace(/([\[\]\(\)%])/g,'<span class="mod-value">$1</span>');
  }

  function apply(filter = ""): void {
    const f = filter.toLowerCase().trim();
    if (!listEl) return;
    listEl.innerHTML = '';
    const hasTags = (state.selectedTags as Set<string>).size > 0;
    const matchesTags = (e: Catalyst) => {
      if (!hasTags) return true;
      const blob = `${e.name||''} ${(e.explicitMods||[]).join(' ')}`.toLowerCase();
      return [...(state.selectedTags as Set<string>)].every(t => blob.includes(t) || (
        t==='energy shield' && /energy\s*shield|\bes\b/.test(blob)
      ) || (t==='dot' && /damage over time|degeneration|bleed|ignite/.test(blob)) || (t==='socket' && /socketed|socket/.test(blob)));
    };
    state.filtered = state.cache.filter((e) =>
      (!f || (e.name && e.name.toLowerCase().includes(f)) || (e.slug||'').toLowerCase().includes(f) || (e.explicitMods||[]).some((m)=>m.toLowerCase().includes(f))) && matchesTags(e)
    );
    const placeholder = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><rect width="28" height="28" rx="4" fill="%23222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23555" font-size="8" font-family="sans-serif">IMG</text></svg>';
    state.filtered.forEach((e) => {
      const card = document.createElement('div');
      card.className = 'liquid-emotion-card';
      card.style.background = 'var(--bg-card)';
      card.style.border = '1px solid var(--border-color)';
      card.style.borderRadius = '6px';
      card.style.padding = '6px';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '4px';
      const modsHtml = (e.explicitMods && e.explicitMods.length) ? `<div style='font-size:11px;'>${e.explicitMods.map((m)=>highlight(m.replace(/<a[^>]*>(.*?)<\/a>/g,'$1'))).join('<br>')}</div>` : '';
      const imgHtml = e.image ? `<img class='catalyst-img' src='${e.image}' alt='' decoding='async' style='width:28px; height:28px; object-fit:contain;'>` : `<img src='${placeholder}' style='width:28px; height:28px; opacity:.4;'>`;
      card.innerHTML = `<div style='display:flex; align-items:center; gap:6px;'>
          ${imgHtml}
          <div style='font-weight:600; line-height:1.2;'>${e.name}</div>
        </div>
        <div style='font-size:11px; color:var(--text-muted);'>Stack: ${e.stack_current ?? '?'} / ${e.stack_max ?? '?'}</div>
        ${modsHtml}`;
      listEl.appendChild(card);
    });
    listEl.querySelectorAll('img.catalyst-img').forEach((img: any)=>{
      if (img._fallbackBound) return; img._fallbackBound = true;
      img.addEventListener('error',()=>{ img.src = placeholder; img.style.opacity='0.55'; img.style.filter='grayscale(1)'; }, { once:true });
    });
  }

  state.input?.addEventListener('input', () => apply(state.input?.value || ''));
  const clearBtn = panel.querySelector('#catalystClear');
  clearBtn?.addEventListener('click', () => { if (state.input) { state.input.value = ''; apply(''); state.input.focus(); } });
  renderTagFilters();
  apply('');
}

export async function reload(): Promise<void> {
  const panel = ensurePanel();
  panel.querySelector('.no-mods')?.remove();
  const loader = document.createElement('div'); loader.className = 'no-mods'; loader.textContent = 'Reloading...'; panel.appendChild(loader);
    // Apply shared fallback (which also attempts local bundled resolution) then ensure placeholder style
    bindImageFallback(panel, 'img.catalyst-img', `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><rect width="28" height="28" rx="4" fill="#222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#555" font-size="8" font-family="sans-serif">?</text></svg>`, 0.55);
  try {
    const data = await (window as any).electronAPI.getCatalysts();
    if (!data || data.error) { panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load Catalysts (${data?.error||'unknown'})</div>`; return; }
    render(data.catalysts || []);
  } catch { panel.innerHTML = `<div style='color:var(--accent-red);'>Reload failed</div>`; }
}
