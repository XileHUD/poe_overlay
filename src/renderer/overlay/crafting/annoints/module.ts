// Annoints module: encapsulates Annoints crafting UI
import { sanitizeCraftingHtml } from "../../utils";
import { bindImageFallback } from "../utils/imageFallback";
import { TRANSPARENT_PLACEHOLDER } from "../utils/imagePlaceholder";

export type Annoint = {
  name: string;
  description: string;
  emotions?: { name: string; image?: string; imageLocal?: string }[];
};

type State = {
  panelEl: HTMLElement | null;
  data: Annoint[];
  cards: HTMLElement[];
  searchInput: HTMLInputElement | null;
  selectedTags: Set<string>;
  searchTimer: any;
};

const state: State = {
  panelEl: null,
  data: [],
  cards: [],
  searchInput: null,
  selectedTags: new Set<string>(),
  searchTimer: null,
};

function ensurePanel(): HTMLElement {
  if (state.panelEl && document.body.contains(state.panelEl)) return state.panelEl;
  // Reuse generic craftingPanel if it already exists (align behavior with essences/omens/etc.)
  const existing = document.getElementById('craftingPanel') as HTMLElement | null;
  if (existing) { state.panelEl = existing; existing.id = 'craftingPanel'; existing.classList.add('content'); return existing; }
  const el = document.createElement('div');
  el.id = 'craftingPanel';
  el.className = 'content';
  el.style.padding = '8px';
  const footer = document.getElementById('footer');
  if (footer && footer.parentNode) footer.parentNode.insertBefore(el, footer);
  state.panelEl = el;
  return el;
}

export async function show(): Promise<void> {
  const tabMod = document.getElementById("tabModifier") as HTMLElement;
  const tabHist = document.getElementById("tabHistory") as HTMLElement;
  const craftingTab = document.getElementById("craftingTab") as HTMLElement;
  const contentMod = document.getElementById("content") as HTMLElement;
  const contentHist = document.getElementById("historyContent") as HTMLElement;

  if (tabMod) { tabMod.classList.remove("active"); tabMod.style.background = "var(--bg-tertiary)"; tabMod.style.color = "var(--text-primary)"; }
  if (tabHist) { tabHist.classList.remove("active"); tabHist.style.background = "var(--bg-tertiary)"; tabHist.style.color = "var(--text-primary)"; }
  if (craftingTab) { craftingTab.style.background = "var(--accent-blue)"; craftingTab.style.color = "#fff"; }
  if (contentMod) contentMod.style.display = "none";
  if (contentHist) contentHist.style.display = "none";
  // Don't set inline display:none - let CSS handle visibility via body classes
  (document.getElementById("modifierHeaderInfo") as HTMLElement)?.setAttribute("style", "display:none");
  (document.getElementById("whittlingInfo") as HTMLElement)?.setAttribute("style", "display:none");
  (document.getElementById("controlPanel") as HTMLElement)?.setAttribute("style", "");
  document.body.classList.add("crafting-mode");
  // Ensure legacy crafting panel (used by Liquid/Essences/etc.) is hidden
  const craft = document.getElementById("craftingPanel");
  if (craft) (craft as HTMLElement).style.display = "none";

  const panel = ensurePanel();
  panel.style.display = '';
  panel.innerHTML = `<div class='no-mods'>Loading...</div>`;

  try {
    const data = await (window as any).electronAPI.getAnnoints();
    if (!data || data.error) { panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load Annoints (${data?.error||'unknown'})</div>`; return; }
    state.data = (data.annoints || []) as Annoint[];
    render();
  } catch (e) {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Exception loading Annoints</div>`;
  }
}

export function hide(): void {
  if (state.panelEl) state.panelEl.style.display = 'none';
}

function deriveAnnointTags(a: Annoint): string[] {
  const text = String(a.description||'').replace(/<[^>]+>/g,' ');
  const tags = new Set<string>();
  if(/Damage/i.test(text)) tags.add('Damage');
  if(/Ailment|Bleed|Ignite|Chill|Freeze|Shock|Poison|Stun/i.test(text)) tags.add('Ailments');
  if(/Attribute|Strength|Dexterity|Intelligence/i.test(text)) tags.add('Attributes');
  if(/Energy Shield|\bES\b/i.test(text)) tags.add('Energy Shield');
  if(/Armour|Armor|Evasion/i.test(text)) tags.add('Defences');
  if(/\bLife\b/i.test(text)) tags.add('Life');
  if(/\bMana\b/i.test(text)) tags.add('Mana');
  if(/\bFire\b/i.test(text)) tags.add('Fire');
  if(/\bCold\b/i.test(text)) tags.add('Cold');
  if(/Lightning/i.test(text)) tags.add('Lightning');
  if(/\bChaos\b/i.test(text)) tags.add('Chaos');
  if(/Resistance/i.test(text)) tags.add('Resistances');
  if(/Projectile/i.test(text)) tags.add('Projectile');
  if(/\bArea\b/i.test(text)) tags.add('Area');
  if(/Critical/i.test(text)) tags.add('Critical');
  if(/Cast|Spell/i.test(text)) tags.add('Spell');
  if(/\bAttack\b/i.test(text)) tags.add('Attack');
  if(/Minion/i.test(text)) tags.add('Minion');
  if(/Trap|Totem|Trigger/i.test(text)) tags.add('Mechanics');
  return [...tags];
}

function tagRGB(tag: string): [number, number, number] {
  const t = (tag||'').toLowerCase();
  if(t==='fire' || t==='life') return [220,68,61];
  if(t==='cold' || t==='mana') return [66,165,245];
  if(t==='lightning') return [255,213,79];
  if(t==='chaos' || t==='minion') return [156,39,176];
  if(t==='energy shield' || t==='es') return [38,198,218];
  if(t==='defences' || t==='armour' || t==='armor') return [109,76,65];
  if(t==='evasion') return [46,125,50];
  if(t==='resistances' || t==='resistance') return [255,112,67];
  if(t==='projectile') return [255,179,0];
  if(t==='area' || t==='aoe') return [171,71,188];
  if(t==='critical' || t==='crit') return [255,179,0];
  if(t==='spell' || t==='caster') return [92,107,192];
  if(t==='attack') return [121,85,72];
  if(t==='damage' || t==='ailments' || t==='mechanics') return [96,125,139];
  if(t==='movement' || t==='attack speed' || t==='speed') return [67,160,71];
  if(t==='elemental') return [255,152,0];
  if(t==='attribute' || t==='attributes' || t==='strength' || t==='dexterity' || t==='intelligence') return [32,178,170];
  return [120,144,156];
}

function chipCss(tag: string, active: boolean): string {
  const [r,g,b] = tagRGB(tag);
  const bg = active? `rgba(${r},${g},${b},0.9)` : `rgba(${r},${g},${b},0.22)`;
  const border=`rgba(${r},${g},${b},0.6)`;
  const luma=0.2126*r+0.7152*g+0.0722*b;
  const color = active ? (luma>180? '#000':'#fff') : 'var(--text-primary)';
  return `border:1px solid ${border}; background:${bg}; color:${color};`;
}

export function render(): void {
  const panel = ensurePanel();
  const total = state.data.length;
  const curatedTags = [
    'Damage','Ailments','Attributes','Energy Shield','Defences','Life','Mana',
    'Fire','Cold','Lightning','Chaos','Resistances','Projectile','Area','Critical',
    'Spell','Attack','Minion','Mechanics'
  ];
  const tagCounts = new Map<string, number>(curatedTags.map(t=>[t,0]));

  state.data.forEach(a => { (a as any).__tags = deriveAnnointTags(a); (a as any).__tags.forEach((t: string) => { if(tagCounts.has(t)) tagCounts.set(t, (tagCounts.get(t)||0)+1); }); });
  const allTags = curatedTags;

  const tagsHtml = allTags.map(tag => {
    const key = tag.toLowerCase();
    const active = state.selectedTags.has(key);
    const count = tagCounts.get(tag) || 0;
    return `<button class='ann-tag' data-tag='${key}' style='font-size:11px; padding:2px 10px; border-radius:4px; cursor:pointer; ${chipCss(tag, active)}'>${tag} <span style="opacity:.8">(${count})</span></button>`;
  }).join(' ');

  const header = `<div style='max-width:980px; margin:0 auto;'>
    <div style='padding:4px 0 8px 0; display:flex; gap:8px; align-items:center; flex-wrap:wrap;'>
      <span id='annointsCount'>Annoints (${total})</span>
      <input id='annointsSearch' type='text' placeholder='Search annoints...' style='flex:1 1 220px; min-width:200px; font-size:12px; padding:2px 6px; background:var(--bg-tertiary); color:var(--text-primary); border:1px solid var(--border-color); border-radius:4px;'>
      <button id='annointsClear' style='font-size:11px; padding:2px 8px; background:var(--bg-tertiary); color:var(--text-primary); border:1px solid var(--border-color); border-radius:4px; cursor:pointer;'>Clear</button>
    </div>
    <div style='background:var(--bg-secondary); padding:8px; border-radius:6px; margin-bottom:8px;'>
      <div id='annointsTagBar' style='display:flex; flex-wrap:wrap; gap:6px; justify-content:center;'>${tagsHtml}</div>
    </div>
  </div>`;

  if (!total) { panel.innerHTML = header + `<div class='no-mods'>No annoints.</div>`; return; }

  const cardsHtml = state.data.map(a => {
  const emotions = (a.emotions||[]).map(e=>{ const raw = e.imageLocal || e.image || ''; return `<span style='display:inline-flex; align-items:center; gap:2px; background:var(--bg-tertiary); padding:1px 4px; border-radius:3px; font-size:10px;'>${raw?`<img src='${TRANSPARENT_PLACEHOLDER}' data-orig-src='${raw}' style='width:14px;height:14px;object-fit:contain;'>`:''}${e.name}</span>`; }).join(' ');
    const desc = sanitizeCraftingHtml(a.description);
    const searchBlob = [a.name, desc, ...(a.emotions||[]).map(e=>e.name)].join(' ').toLowerCase();
    return `<div class='annoint-card' data-name='${a.name.replace(/'/g,"&#39;")}' data-search='${searchBlob.replace(/'/g,"&#39;")}' data-tags='${(a as any).__tags.map((t: string)=>t.toLowerCase()).join('|').replace(/'/g,"&#39;")}' style='flex:0 0 300px; background:var(--bg-card); border:1px solid var(--border-color); border-radius:6px; padding:6px; display:flex; flex-direction:column; gap:4px;'>
  <div>${a.name}</div>
      <div style='display:flex; flex-wrap:wrap; gap:4px;'>${emotions}</div>
      <div style='font-size:11px;'>${desc}</div>
    </div>`;
  }).join('');

  panel.innerHTML = header + `<div id='annointsCards' style='display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:12px; max-width:980px; margin:0 auto;'>${cardsHtml}</div>`;

  state.searchInput = panel.querySelector('#annointsSearch') as HTMLInputElement | null;
  state.cards = Array.from(panel.querySelectorAll('.annoint-card')) as HTMLElement[];
  // Image fallback for inner emotion icons
  const placeholderSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14"><rect width="14" height="14" rx="2" fill="#222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#555" font-size="6" font-family="sans-serif">?</text></svg>';
  bindImageFallback(panel, '.annoint-card img', placeholderSvg, 0.5);
  state.searchInput?.addEventListener('input', () => scheduleFilter());

  const tagButtons = Array.from(panel.querySelectorAll('.ann-tag')) as HTMLElement[];
  tagButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const key = (btn.getAttribute('data-tag') || '').toLowerCase();
      if (!key) return;
      if (state.selectedTags.has(key)) {
        state.selectedTags.delete(key);
        const label = key.replace(/\b\w/g, (m) => m.toUpperCase());
        const [r,g,b]=tagRGB(label);
        const bg=`rgba(${r},${g},${b},0.22)`; const border=`rgba(${r},${g},${b},0.6)`; const color='var(--text-primary)';
        (btn as HTMLElement).style.cssText = `font-size:11px; padding:2px 10px; border-radius:4px; cursor:pointer; border:1px solid ${border}; background:${bg}; color:${color};`;
      } else {
        state.selectedTags.add(key);
        const label = key.replace(/\b\w/g, (m) => m.toUpperCase());
        const [r,g,b]=tagRGB(label);
        const bg=`rgba(${r},${g},${b},0.9)`; const border=`rgba(${r},${g},${b},0.6)`; const luma=0.2126*r+0.7152*g+0.0722*b; const color = (luma>180? '#000':'#fff');
        (btn as HTMLElement).style.cssText = `font-size:11px; padding:2px 10px; border-radius:4px; cursor:pointer; border:1px solid ${border}; background:${bg}; color:${color};`;
      }
      applyFilter();
    });
  });

  const clearBtn = panel.querySelector('#annointsClear') as HTMLElement | null;
  clearBtn?.addEventListener('click', () => {
    if (state.searchInput) state.searchInput.value = '';
    state.selectedTags.clear();
    tagButtons.forEach(btn => {
      const key = (btn.getAttribute('data-tag') || '').toLowerCase();
      const label = key.replace(/\b\w/g, (m) => m.toUpperCase());
      const [r,g,b]=tagRGB(label);
      const bg=`rgba(${r},${g},${b},0.22)`; const border=`rgba(${r},${g},${b},0.6)`; const color='var(--text-primary)';
      (btn as HTMLElement).style.cssText = `font-size:11px; padding:2px 10px; border-radius:4px; cursor:pointer; border:1px solid ${border}; background:${bg}; color:${color};`;
    });
    applyFilter();
    state.searchInput?.focus();
  });
}

export function scheduleFilter(): void {
  if (state.searchTimer) clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(applyFilter, 130);
}

export function applyFilter(): void {
  const q = (state.searchInput?.value || '').trim().toLowerCase();
  const activeTags = Array.from(state.selectedTags);
  let shown = 0;
  state.cards.forEach((el) => {
    const blob = el.getAttribute('data-search') || '';
    const tags = (el.getAttribute('data-tags') || '').split('|').filter(Boolean);
    const matchesQ = !q || blob.includes(q);
    const matchesTags = !activeTags.length || activeTags.every((t) => tags.includes(t));
    (el as HTMLElement).style.display = (matchesQ && matchesTags) ? '' : 'none';
    if (matchesQ && matchesTags) shown++;
  });
  const total = state.data.length;
  const countEl = document.getElementById('annointsCount');
  const any = !!q || activeTags.length>0;
  if (countEl) (countEl as HTMLElement).textContent = any ? `Annoints (${shown} / ${total})` : `Annoints (${total})`;
  // When the user has scrolled far down and then narrows results to a few cards,
  // the old scroll position leaves the visible cards sitting mid / bottom with a big empty gap above.
  // Always reset to top after a filter action so the header + remaining results start at the top.
  try {
    const panel = state.panelEl || document.getElementById('craftingPanel');
    if (panel) (panel as HTMLElement).scrollTop = 0; // simple top reset like other panels
  } catch {}
}

export async function reload(): Promise<void> {
  const panel = ensurePanel();
  panel.querySelector('.no-mods')?.remove();
  const loader = document.createElement('div'); loader.className='no-mods'; loader.textContent='Reloading...'; panel.appendChild(loader);
  try {
    const data = await (window as any).electronAPI.getAnnoints();
    if (!data || data.error) { panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load Annoints (${data?.error||'unknown'})</div>`; return; }
    state.data = (data.annoints||[]) as Annoint[];
    render(); applyFilter();
  } catch { panel.innerHTML = `<div style='color:var(--accent-red);'>Reload failed</div>`; }
}
