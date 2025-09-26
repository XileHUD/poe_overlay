// Liquid Emotions module: renders the Liquid Emotions crafting panel and exposes an imperative API
import { sanitizeCraftingHtml } from "../../utils";

export type LiquidEmotionItem = {
  slug?: string;
  name: string;
  image?: string;
  stack_current?: number;
  stack_max?: number;
  enchantMods?: string[];
  explicitMods?: string[];
};

const state = {
  panelEl: null as HTMLElement | null,
  items: [] as LiquidEmotionItem[],
  selectedTags: new Set<string>(),
  tagCounts: {} as Record<string, number>,
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

export async function show(): Promise<void> {
  const tabMod = document.getElementById("tabModifier") as HTMLElement;
  const tabHist = document.getElementById("tabHistory") as HTMLElement;
  const craftingTab = document.getElementById("craftingTab") as HTMLElement;
  const contentMod = document.getElementById("content") as HTMLElement;
  const contentHist = document.getElementById("historyContent") as HTMLElement;

  // Visual tab states
  if (tabMod) { tabMod.classList.remove("active"); tabMod.style.background = "var(--bg-tertiary)"; tabMod.style.color = "var(--text-primary)"; }
  if (tabHist) { tabHist.classList.remove("active"); tabHist.style.background = "var(--bg-tertiary)"; tabHist.style.color = "var(--text-primary)"; }
  if (craftingTab) { craftingTab.style.background = "var(--accent-blue)"; craftingTab.style.color = "#fff"; }
  if (contentMod) contentMod.style.display = "none";
  if (contentHist) contentHist.style.display = "none";
  document.getElementById("historyHeader")?.setAttribute("style", "display:none");
  document.getElementById("historyHeaderLeft")?.setAttribute("style", "display:none");
  const hh = document.getElementById("historyHeaderMain"); if (hh) (hh as HTMLElement).style.display='none';
  document.getElementById("modifierHeaderInfo")?.setAttribute("style", "display:none");
  document.getElementById("whittlingInfo")?.setAttribute("style", "display:none");
  // Keep control panel visible on crafting pages
  document.getElementById("controlPanel")?.setAttribute("style", "");
  document.body.classList.add("crafting-mode");
  // Ensure Annoints panel is hidden when switching to Liquid Emotions
  const ann = document.getElementById("annointsPanel");
  if (ann) (ann as HTMLElement).style.display = "none";

  const panel = ensurePanel();
  panel.style.display = "";
  panel.innerHTML = `<div class="no-mods">Loading...</div>`;
  setTimeout(() => { panel.scrollTop = 0; }, 10);

  try {
    const data = await (window as any).electronAPI.getLiquidEmotions();
    if (!data || data.error) {
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load Liquid Emotions (${data?.error||'unknown'})<br><span style='color:var(--text-muted); font-size:11px;'>Run collector scraper to generate Liquid_Emotions.json</span></div>`;
      return;
    }
    state.items = (data.emotions || []) as LiquidEmotionItem[];
    render(state.items);
  } catch (e) {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Exception loading Liquid Emotions</div>`;
  }
}

export function hide(): void {
  if (state.panelEl) state.panelEl.style.display = "none";
}

export function highlight(name: string): void {
  const panel = ensurePanel();
  const needle = (name || "").toLowerCase();
  const cards = panel.querySelectorAll(".liquid-emotion-card");
  cards.forEach((card) => {
    const cardName = (card.getAttribute("data-name") || "").toLowerCase();
    if (cardName.includes(needle)) {
      (card as any).scrollIntoView?.({ behavior: "smooth", block: "center" });
      (card as HTMLElement).style.borderColor = "var(--accent-blue)";
      setTimeout(() => { (card as HTMLElement).style.borderColor = "var(--border-color)"; }, 2000);
    }
  });
}

export async function reload(): Promise<void> {
  const panel = ensurePanel();
  panel.querySelector(".no-mods")?.remove();
  const loader = document.createElement("div"); loader.className = "no-mods"; loader.textContent = "Reloading..."; panel.appendChild(loader);
  try {
    const data = await (window as any).electronAPI.getLiquidEmotions();
    if (!data || data.error) { panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load Liquid Emotions (${data?.error||'unknown'})</div>`; return; }
    state.items = (data.emotions || []) as LiquidEmotionItem[];
    render(state.items);
  } catch {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Reload failed</div>`;
  }
}

export function render(items: LiquidEmotionItem[]): void {
  const panel = ensurePanel();
  // Defensive filtering (dedupe + drop empties)
  const seen = new Set<string>();
  items = (items || [])
    .filter((it) => {
      if (!it.name || !it.name.trim()) return false;
      const key = (it.slug || it.name) as string;
      if (seen.has(key)) return false; seen.add(key); return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  state.items = items;
  if (!items.length) {
    panel.innerHTML = '<div class="no-mods">No Liquid Emotions found.</div>';
    return;
  }

  // Build tag stats across emotions based on enchant/explicit text
  const curated = [
    'Damage','Ailments','Attributes','Life','Mana','Energy Shield','Armour','Evasion','Resistances',
    'Fire','Cold','Lightning','Chaos','Spell','Attack','Minion','Projectile','Area','Critical','Speed','Curse','DoT'
  ];
  state.tagCounts = Object.fromEntries(curated.map(t => [t, 0]));
  const lowerInc = (k: string) => { state.tagCounts[k] = (state.tagCounts[k] || 0) + 1; };
  const addTagsFor = (e: LiquidEmotionItem) => {
    const blob = `${e.name||''} ${(e.enchantMods||[]).join(' ')} ${(e.explicitMods||[]).join(' ')}`.toLowerCase();
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
  };
  items.forEach(addTagsFor);

  const cards: string[] = [];
  for (const item of items) {
    cards.push(`
      <div class='liquid-emotion-card' data-slug='${item.slug||""}' data-name='${(item.name||"").replace(/'/g,"&#39;")}' style='background:var(--bg-card); border:1px solid var(--border-color); border-radius:6px; padding:6px; display:flex; flex-direction:column; gap:4px; transition:border-color .25s; height:100%'>
        <div style='display:flex; align-items:center; gap:6px;'>
          ${item.image ? `<img src='${item.image}' alt='' style='width:28px; height:28px; object-fit:contain;'>` : ''}
          <div style='font-weight:600; line-height:1.2;'>${item.name}</div>
        </div>
        <div style='font-size:11px; color:var(--text-muted);'>Stack: ${item.stack_current ?? '?'} / ${item.stack_max ?? '?'}</div>
        ${item.enchantMods && item.enchantMods.length ? `<div style='font-size:11px; color:#9ecbff;'>${(item.enchantMods||[]).map((m)=>sanitizeCraftingHtml(m)).join('<br>')}</div>` : ''}
        ${item.explicitMods && item.explicitMods.length ? `<div style='font-size:11px;'>${(item.explicitMods||[]).map((m)=>sanitizeCraftingHtml(m)).join('<br>')}</div>` : ''}
      </div>`);
  }

  panel.innerHTML = `
    <div style='display:flex; gap:6px; align-items:center; margin-bottom:8px;'>
      <input id='leSearch' type='text' placeholder='Search emotions...' style='flex:1; padding:4px 8px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary); font-size:12px;'>
      <button id='leClear' class='pin-btn' style='padding:4px 8px;'>Clear</button>
      <button id='leReload' style='font-size:11px; padding:2px 6px; background:var(--bg-tertiary); color:var(--text-primary); border:1px solid var(--border-color); border-radius:4px; cursor:pointer;'>Reload</button>
    </div>
    <div id='leTagFilters' style='display:flex; flex-wrap:wrap; gap:6px; margin:-2px 0 8px; justify-content:center;'></div>
    <div id='leList' style='display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:10px;'>${cards.join("")}</div>`;

  const reloadBtn = panel.querySelector("#leReload");
  reloadBtn?.addEventListener("click", () => reload());
  const searchEl = panel.querySelector('#leSearch') as HTMLInputElement | null;
  const clearBtn = panel.querySelector('#leClear') as HTMLButtonElement | null;
  const listEl = panel.querySelector('#leList') as HTMLElement | null;
  const tagWrap = panel.querySelector('#leTagFilters') as HTMLElement | null;
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
      const active = state.selectedTags.has(lc);
      const count = state.tagCounts[tag] || 0;
      if (!count) return;
      const el = document.createElement('button');
      el.textContent = count ? `${tag} (${count})` : tag;
      el.style.cssText = `padding:3px 8px; font-size:11px; border-radius:999px; cursor:pointer; ${chipCss(tag, active)}`;
      el.addEventListener('click', ()=>{
        if (active) state.selectedTags.delete(lc); else state.selectedTags.add(lc);
        apply(searchEl?.value || '');
        renderTagFilters();
      });
      tagWrap.appendChild(el);
    });
    if (state.selectedTags.size) {
      const reset=document.createElement('button');
      reset.textContent='Reset';
      reset.style.cssText='padding:3px 8px; font-size:11px; border-radius:999px; cursor:pointer; background:var(--accent-red); color:#fff; border:1px solid var(--accent-red);';
      reset.addEventListener('click', ()=>{ state.selectedTags.clear(); apply(''); renderTagFilters(); });
      tagWrap.appendChild(reset);
    }
  }
  const apply = (q: string) => {
    const f = (q||'').toLowerCase().trim();
    if (!listEl) return;
    const cards = Array.from(listEl.querySelectorAll('.liquid-emotion-card')) as HTMLElement[];
    cards.forEach((card) => {
      const name = (card.getAttribute('data-name')||'').toLowerCase();
      const slug = (card.getAttribute('data-slug')||'').toLowerCase();
      // Tag filtering checks the inner text of the card
      const text = card.textContent?.toLowerCase() || '';
      const tagsOk = !state.selectedTags.size || [...state.selectedTags].every(t => text.includes(t) || (t==='energy shield' && /energy\s*shield|\bes\b/.test(text)) || (t==='dot' && /damage over time|degeneration|bleed|ignite/.test(text)));
      card.style.display = ((!f || name.includes(f) || slug.includes(f)) && tagsOk) ? '' : 'none';
    });
  };
  searchEl?.addEventListener('input', ()=> apply(searchEl.value));
  clearBtn?.addEventListener('click', ()=> { if (searchEl) { searchEl.value=''; apply(''); searchEl.focus(); } });
  renderTagFilters();
}
