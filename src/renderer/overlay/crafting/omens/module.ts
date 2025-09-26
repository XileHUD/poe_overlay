// Omens module: encapsulates Omens crafting UI

export type Omen = {
  slug?: string;
  name?: string;
  image?: string;
  stack_current?: number;
  stack_max?: number;
  explicitMods?: string[];
};

type State = {
  panelEl: HTMLElement | null;
  cache: Omen[];
  filtered: Omen[];
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
  panel.style.display = "";
  panel.innerHTML = `<div class="no-mods">Loading...</div>`;
  setTimeout(() => { panel.scrollTop = 0; }, 10);
  try {
    const data = await (window as any).electronAPI.getOmens();
    if (!data || data.error) {
      panel.innerHTML = `<div style="color:var(--accent-red);">Failed to load Omens (${data?.error||'unknown'})</div>`;
      return;
    }
    render(data.omens || []);
  } catch (e) {
    panel.innerHTML = `<div style="color:var(--accent-red);">Exception loading Omens</div>`;
  }
}

export function render(list: Omen[]): void {
  const panel = ensurePanel();
  state.cache = [...(list||[])];
  // Curated tag set similar to Essences, adapted to common Omen effects
  const curated = [
    'Damage','Ailments','Attributes','Life','Mana','Energy Shield','Armour','Evasion','Resistances',
    'Fire','Cold','Lightning','Chaos','Spell','Attack','Minion','Projectile','Area','Critical','Speed','Curse','DoT',
    'Exalt','Divine','Regal','Essence'
  ];
  // Build tag counts scanning explicit mods and names
  const lowerInc = (k: string) => { (state.tagCounts as any)[k] = ((state.tagCounts as any)[k] || 0) + 1; };
  state.tagCounts = Object.fromEntries(curated.map(t => [t, 0]));
  const addTagsFor = (e: Omen) => {
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
    if (/damage|increased|more/.test(blob)) lowerInc('Damage');
    if (/ailment|impale|bleed|ignite|poison|shock|chill|freeze|electrocute/.test(blob)) lowerInc('Ailments');
    if (/exalt/.test(blob)) lowerInc('Exalt');
    if (/divine/.test(blob)) lowerInc('Divine');
    if (/regal/.test(blob)) lowerInc('Regal');
    if (/essence/.test(blob)) lowerInc('Essence');
  };
  state.cache.forEach(addTagsFor);

  panel.innerHTML = `
    <div style='display:flex; gap:6px; align-items:center; margin-bottom:8px;'>
      <input id='omenSearch' type='text' placeholder='Search omens...' style='flex:1; padding:4px 8px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary); font-size:12px;'>
      <button id='omenClear' class='pin-btn' style='padding:4px 8px;'>Clear</button>
    </div>
    <div id='omenTagFilters' style='display:flex; flex-wrap:wrap; gap:6px; margin:-2px 0 8px; justify-content:center;'></div>
    <div id='omenWrap' style='display:flex; flex-wrap:wrap; gap:10px;'></div>`;

  state.input = panel.querySelector('#omenSearch') as HTMLInputElement | null;
  const wrap = panel.querySelector('#omenWrap') as HTMLElement | null;
  const tagWrap = panel.querySelector('#omenTagFilters') as HTMLElement | null;

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
      .replace(/(?<![A-Za-z0-9>])([+\-]?\d+)(?![A-Za-z0-9<])/g,'<span class="mod-value">$1</span>')
      .replace(/(\d+%)/g,'<span class="mod-value">$1</span>');
  }

  function apply(filter = ""): void {
    if (!wrap) return;
    wrap.innerHTML = '';
    const f = filter.toLowerCase();
    const hasTags = (state.selectedTags as Set<string>).size > 0;
    const matchesTags = (o: Omen) => {
      if (!hasTags) return true;
      const blob = `${o.name||''} ${(o.explicitMods||[]).join(' ')}`.toLowerCase();
      return [...(state.selectedTags as Set<string>)].every(t => blob.includes(t) || (
        t==='energy shield' && /energy\s*shield|\bes\b/.test(blob)
      ) || (t==='dot' && /damage over time|degeneration|bleed|ignite/.test(blob)));
    };
    state.filtered = state.cache.filter(o => (!f || (o.name||'').toLowerCase().includes(f) || (o.explicitMods||[]).some(m => (m||'').toLowerCase().includes(f))) && matchesTags(o));
    state.filtered.forEach(o => {
      const card = document.createElement('div');
      card.style.flex = '0 0 240px';
      card.style.background = 'var(--bg-card)';
      card.style.border = '1px solid var(--border-color)';
      card.style.borderRadius = '6px';
      card.style.padding = '6px';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '4px';
      card.innerHTML = `<div style='display:flex; align-items:center; gap:6px;'>${o.image?`<img src='${o.image}' style='width:28px; height:28px; object-fit:contain;'>`:''}<div style='font-weight:600;'>${o.name}</div></div><div style='font-size:11px; color:var(--text-muted);'>Stack: ${o.stack_current??'?'} / ${o.stack_max??'?'}</div><div style='font-size:11px;'>${(o.explicitMods||[]).map(m=>highlight(m)).join('<br>')}</div>`;
      wrap.appendChild(card);
    });
  }

  state.input?.addEventListener('input', () => apply(state.input?.value || ''));
  const clearBtn = panel.querySelector('#omenClear');
  clearBtn?.addEventListener('click', () => { if (state.input) { state.input.value=''; apply(''); state.input.focus(); } });
  renderTagFilters();
  apply('');
}

export async function reload(): Promise<void> {
  const panel = ensurePanel();
  panel.querySelector('.no-mods')?.remove();
  const loader = document.createElement('div'); loader.className = 'no-mods'; loader.textContent = 'Reloading...'; panel.appendChild(loader);
  try {
    const data = await (window as any).electronAPI.getOmens();
    if (!data || data.error) { panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load Omens (${data?.error||'unknown'})</div>`; return; }
    render(data.omens || []);
  } catch { panel.innerHTML = `<div style='color:var(--accent-red);'>Reload failed</div>`; }
}
