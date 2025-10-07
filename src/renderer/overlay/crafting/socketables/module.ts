// Socketables module: encapsulates socketable crafting UI (refactored to grid + shared image fallback)
import { bindImageFallback } from "../utils/imageFallback";
import { resolveLocalImage } from "../utils/localImage";

export type Socketable = {
  slug?: string;
  name?: string;
  image?: string;
  imageLocal?: string;
  implicitMods?: string[];
  stack_current?: number;
  stack_max?: number;
  level_req?: number;
};

type State = {
  panelEl: HTMLElement | null;
  cache: Socketable[];
  filtered: Socketable[];
  input: HTMLInputElement | null;
  selectedTags: Set<string>;
  tagCounts: Record<string, number>;
};

const state: State = {
  panelEl: null,
  cache: [],
  filtered: [],
  input: null,
  selectedTags: new Set(),
  tagCounts: {},
};

function ensurePanel(): HTMLElement {
  if (state.panelEl && document.body.contains(state.panelEl)) return state.panelEl;
  const existing = document.getElementById('craftingPanel') as HTMLElement | null;
  if (existing) { state.panelEl = existing; return existing; }
  // Fallback (should not happen since overlay shell provides #craftingPanel)
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
  const ann = document.getElementById("annointsPanel");
  if (ann) (ann as HTMLElement).style.display = "none";
  document.body.classList.add("crafting-mode");
}

function deriveTags(e: Socketable): string[] {
  const text = `${e.name||''} ${(e.implicitMods||[]).join(' ')}`;
  const tags = new Set<string>();
  if(/Damage/i.test(text)) tags.add('Damage');
  if(/Ailment|Bleed|Ignite|Chill|Freeze|Shock|Poison|Stun|Electrocute/i.test(text)) tags.add('Ailments');
  if(/Attribute|Strength|Dexterity|Intelligence/i.test(text)) tags.add('Attributes');
  if(/Energy Shield|\bES\b/i.test(text)) tags.add('Energy Shield');
  if(/Armour|Armor|Evasion/i.test(text)) tags.add('Defences');
  if(/\bLife\b/i.test(text)) tags.add('Life');
  if(/\bMana\b/i.test(text)) tags.add('Mana');
  if(/\bFire\b/i.test(text)) tags.add('Fire');
  if(/\bCold\b/i.test(text)) tags.add('Cold');
  if(/Lightning|Electrocute/i.test(text)) tags.add('Lightning');
  if(/\bChaos\b/i.test(text)) tags.add('Chaos');
  if(/Resist/i.test(text)) tags.add('Resistances');
  if(/Projectile/i.test(text)) tags.add('Projectile');
  if(/\bArea\b/i.test(text)) tags.add('Area');
  if(/Critical/i.test(text)) tags.add('Critical');
  if(/Cast|Spell/i.test(text)) tags.add('Spell');
  if(/\bAttack\b/i.test(text)) tags.add('Attack');
  if(/Minion/i.test(text)) tags.add('Minion');
  if(/Trap|Totem|Trigger/i.test(text)) tags.add('Mechanics');
  return [...tags];
}

export async function show(): Promise<void> {
  setCraftingTabActive();
  const panel = ensurePanel();
  panel.style.display = "";
  panel.innerHTML = `<div class="no-mods">Loading...</div>`;
  setTimeout(() => { panel.scrollTop = 0; }, 10);
  try {
    const data = await (window as any).electronAPI.getSocketables();
    if (!data || data.error) {
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load Socketables (${data?.error||'unknown'})<br><span style='color:var(--text-muted); font-size:11px;'>Run collector scraper</span></div>`;
      return;
    }
    render(data.socketables || []);
  } catch (e) {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Exception loading Socketables</div>`;
  }
}

export function render(list: Socketable[]): void {
  const panel = ensurePanel();
  state.cache = [...(list||[])];
  // annotate tags & counts
  state.tagCounts = {};
  state.cache.forEach(e=>{
    (e as any).__tags = deriveTags(e);
    (e as any).__tags.forEach((t:string)=>{ state.tagCounts[t] = (state.tagCounts[t]||0)+1; });
  });

  panel.innerHTML = `
    <div class='page-inner'>
    <div style='display:flex; gap:6px; align-items:center; margin-bottom:8px;'>
      <input id='socketableSearch' type='text' placeholder='Search...' style='flex:1; padding:4px 8px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary); font-size:12px;'>
      <button id='socketableClear' class='pin-btn' style='padding:4px 8px;'>Clear</button>
    </div>
    <div id='socketableTagFilters' style='display:flex; flex-wrap:wrap; gap:6px; margin:-2px 0 8px; justify-content:center;'></div>
    <div id='socketableList' style='display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:10px; align-items:stretch;'></div>
    </div>`;

  state.input = panel.querySelector('#socketableSearch') as HTMLInputElement | null;
  const listEl = panel.querySelector('#socketableList') as HTMLElement | null;
  const tagWrap = panel.querySelector('#socketableTagFilters') as HTMLElement | null;

  function tagRGB(tag: string){ const t=(tag||'').toLowerCase();
    if(t==='fire' || t==='life') return [220,68,61];
    if(t==='cold' || t==='mana') return [66,165,245];
    if(t==='lightning') return [255,213,79];
    if(t==='chaos' || t==='minion') return [156,39,176];
    if(t==='energy shield' || t==='es') return [38,198,218];
    if(t==='defences' || t==='armour' || t==='armor') return [109,76,65];
    if(t==='evasion') return [46,125,50];
    if(t==='resistances') return [255,112,67];
    if(t==='projectile') return [255,179,0];
    if(t==='area') return [171,71,188];
    if(t==='critical' || t==='crit') return [255,179,0];
    if(t==='spell') return [92,107,192];
    if(t==='attack') return [121,85,72];
    if(t==='damage' || t==='ailments' || t==='mechanics') return [96,125,139];
    if(t==='movement' || t==='attack speed' || t==='speed') return [67,160,71];
    if(t==='elemental') return [255,152,0];
    return [120,144,156]; }
  function chipCss(tag: string, active: boolean){ const [r,g,b]=tagRGB(tag); const bg = active? `rgba(${r},${g},${b},0.9)` : `rgba(${r},${g},${b},0.22)`; const border=`rgba(${r},${g},${b},0.6)`; const luma=0.2126*r+0.7152*g+0.0722*b; const color = active ? (luma>180? '#000':'#fff') : 'var(--text-primary)'; return `border:1px solid ${border}; background:${bg}; color:${color};`; }

  function renderTagFilters(){ if(!tagWrap) return; tagWrap.innerHTML='';
    const curated = ['Damage','Ailments','Attributes','Energy Shield','Defences','Life','Mana','Fire','Cold','Lightning','Chaos','Resistances','Projectile','Area','Critical','Spell','Attack','Minion','Mechanics'];
    curated.forEach(tag=>{ const key=tag.toLowerCase(); const active=state.selectedTags.has(key);
      const btn=document.createElement('button'); const count=state.tagCounts[tag]||0; btn.className='sock-tag'; btn.setAttribute('data-tag', key);
      btn.textContent = count? `${tag} (${count})` : tag;
      btn.style.cssText = `padding:3px 8px; font-size:11px; border-radius:999px; cursor:pointer; ${chipCss(tag, active)}`;
      btn.addEventListener('click',()=>{ if(active) state.selectedTags.delete(key); else state.selectedTags.add(key); apply(state.input?.value||''); renderTagFilters(); });
      tagWrap.appendChild(btn);
    });
    if(state.selectedTags.size){ const reset=document.createElement('button'); reset.textContent='Reset'; reset.style.cssText='padding:3px 8px; font-size:11px; border-radius:999px; cursor:pointer; background:var(--accent-red); color:#fff; border:1px solid var(--accent-red);'; reset.addEventListener('click',()=>{ state.selectedTags.clear(); apply(state.input?.value||''); renderTagFilters(); }); tagWrap.appendChild(reset); }
  }

  function matchTags(e: Socketable){ if(!state.selectedTags.size) return true; const lc=((e as any).__tags||[]).map((t:string)=>t.toLowerCase()); return [...state.selectedTags].every(t=> lc.includes(t)); }

  function highlight(s: string): string { return (s||"")
      .replace(/(\d+\s*[–-]\s*\d+)/g,'<span class="mod-value">$1</span>')
      .replace(/(?<![A-Za-z0-9])([+\-]?\d+)(?![A-Za-z0-9])/g,'<span class="mod-value">$1</span>')
      .replace(/(\d+%)/g,'<span class="mod-value">$1</span>')
      .replace(/([\[\]\(\)%])/g,'<span class="mod-value">$1</span>'); }

  function apply(filter = ""): void {
    const f = filter.toLowerCase().trim();
    if (!listEl) return;
    listEl.innerHTML = '';
    state.filtered = state.cache.filter((e) => {
      const matchesSearch = !f || (e.name && e.name.toLowerCase().includes(f)) || (e.slug||'').toLowerCase().includes(f) || (e.implicitMods||[]).some((m)=>m.toLowerCase().includes(f));
      return matchesSearch && matchTags(e);
    });
    state.filtered.forEach((e) => {
      const card = document.createElement('div');
      card.className = 'socketable-card';
      card.style.background = 'var(--bg-card)';
      card.style.border = '1px solid var(--border-color)';
      card.style.borderRadius = '6px';
      card.style.padding = '6px';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '4px';
      card.style.height = '100%';
      const modsHtml = (e.implicitMods && e.implicitMods.length) ? `<div style='font-size:11px;'>${e.implicitMods.map((m)=>highlight(m.replace(/<a[^>]*>(.*?)<\/a>/g,'$1'))).join('<br>')}</div>` : '';
      const stackInfo = (e.stack_current!=null || e.stack_max!=null) ? `<div style='font-size:11px; color:var(--text-muted);'>Stack: ${e.stack_current ?? '?'} / ${e.stack_max ?? '?'}</div>` : '';
      const levelInfo = (e.level_req!=null) ? `<div style='font-size:11px; color:var(--text-muted);'>Requires Level ${e.level_req}</div>` : '';
    const origPath = e.imageLocal || e.image || '';
    card.innerHTML = `<div style='display:flex; align-items:center; gap:6px;'>
      ${(e.imageLocal || e.image) ? `<img src='' data-orig-src='${origPath}' alt='' class='socketable-img' style='width:32px; height:32px; object-fit:contain;'>` : `<img src='' alt='' class='socketable-img' style='width:32px; height:32px; object-fit:contain;'>`}
          <div style='font-weight:600; line-height:1.2;'>${e.name}</div>
        </div>
        ${stackInfo}
        ${levelInfo}
        ${modsHtml}`;
      listEl.appendChild(card);
    });
    // Shared image fallback with placeholder
    const placeholder = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='#222'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#555' font-size='10' font-family='sans-serif'>?</text></svg>`;
    bindImageFallback(listEl, 'img.socketable-img', placeholder, 0.5);
  }

  state.input?.addEventListener('input', () => apply(state.input?.value || ''));
  const clearBtn = panel.querySelector('#socketableClear');
  clearBtn?.addEventListener('click', () => { if (state.input) { state.input.value = ''; state.selectedTags.clear(); apply(''); renderTagFilters(); state.input.focus(); } });
  apply('');
  renderTagFilters();
}

export async function reload(): Promise<void> {
  const panel = ensurePanel();
  panel.querySelector('.no-mods')?.remove();
  const loader = document.createElement('div'); loader.className = 'no-mods'; loader.textContent = 'Reloading...'; panel.appendChild(loader);
  try {
    const data = await (window as any).electronAPI.getSocketables();
    if (!data || data.error) { panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load Socketables (${data?.error||'unknown'})</div>`; return; }
    render(data.socketables || []);
  } catch { panel.innerHTML = `<div style='color:var(--accent-red);'>Reload failed</div>`; }
}
