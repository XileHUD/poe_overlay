// Liquid Emotions module: renders the Liquid Emotions crafting panel and exposes an imperative API
import { sanitizeCraftingHtml } from "../../utils";

export type LiquidEmotionItem = {
  slug?: string;
  name: string;
  image?: string;
  imageLocal?: string;
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
  // Don't set inline display:none - let CSS handle visibility via body classes
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

  // Replace previous dynamic tag system with fixed chips requested by user.
  const fixedChips = [
    'Additional Modifier', 'Rarity of items', 'Pack size', 'Magic Monsters', 'Splinters', 'Tablets', 'Waystones found', 'Rare Monsters'
  ];

  const cards: string[] = [];
  for (const item of items) {
    cards.push(`
      <div class='liquid-emotion-card' data-slug='${item.slug||""}' data-name='${(item.name||"").replace(/'/g,"&#39;")}' style='background:var(--bg-card); border:1px solid var(--border-color); border-radius:6px; padding:6px; display:flex; flex-direction:column; gap:4px; transition:border-color .25s; height:100%'>
        <div style='display:flex; align-items:center; gap:6px;'>
          ${(item.imageLocal || item.image) ? `<img class='currency-img' src='' data-orig-src='${item.imageLocal || item.image}' alt='' loading='lazy' decoding='async' style='width:28px; height:28px; object-fit:contain;'>` : ''}
          <div style='font-weight:600; line-height:1.2;'>${item.name}</div>
        </div>
        <div style='font-size:11px; color:var(--text-muted);'>Stack: ${item.stack_current ?? '?'} / ${item.stack_max ?? '?'}</div>
        ${item.enchantMods && item.enchantMods.length ? `<div style='font-size:11px; color:#9ecbff;'>${(item.enchantMods||[]).map((m)=>sanitizeCraftingHtml(m)).join('<br>')}</div>` : ''}
        ${item.explicitMods && item.explicitMods.length ? `<div style='font-size:11px;'>${(item.explicitMods||[]).map((m)=>sanitizeCraftingHtml(m)).join('<br>')}</div>` : ''}
      </div>`);
  }

  panel.innerHTML = `
    <div class='page-inner'>
      <div style='display:flex; gap:6px; align-items:center; margin-bottom:8px;'>
        <input id='leSearch' type='text' placeholder='Search emotions...' style='flex:1; padding:4px 8px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary); font-size:12px;'>
        <button id='leClear' class='pin-btn' style='padding:4px 8px;'>Clear</button>
      </div>
      <div id='leTagFilters' style='display:flex; flex-wrap:wrap; gap:6px; margin:-2px 0 8px; justify-content:center; width:100%;'></div>
      <div id='leList' style='display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:10px;'>${cards.join("")}</div>
    </div>`;

  // Reload button removed per request
  const searchEl = panel.querySelector('#leSearch') as HTMLInputElement | null;
  const clearBtn = panel.querySelector('#leClear') as HTMLButtonElement | null;
  const listEl = panel.querySelector('#leList') as HTMLElement | null;
  const tagWrap = panel.querySelector('#leTagFilters') as HTMLElement | null;
  function chip(tag: string, active: boolean){
    return `<button data-chip='${tag}' style='padding:3px 8px; font-size:11px; border-radius:999px; cursor:pointer; border:1px solid var(--border-color); background:${active? 'var(--accent-blue)' : 'var(--bg-tertiary)'}; color:${active? '#fff':'var(--text-primary)'};'>${tag}</button>`;
  }
  function renderFixedChips(){
    if(!tagWrap) return; tagWrap.innerHTML = fixedChips.map(c=>chip(c, state.selectedTags.has(c.toLowerCase()))).join(' ')+ (state.selectedTags.size? ` <button id='leChipReset' style='padding:3px 10px; font-size:11px; border-radius:999px; cursor:pointer; background:var(--accent-red); color:#fff; border:1px solid var(--accent-red);'>Reset</button>` : '');
    tagWrap.querySelectorAll('button[data-chip]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const name = (btn as HTMLElement).getAttribute('data-chip')||''; const key=name.toLowerCase();
        if(state.selectedTags.has(key)) state.selectedTags.delete(key); else state.selectedTags.add(key);
        apply(searchEl?.value||'');
        renderFixedChips();
      });
    });
    tagWrap.querySelector('#leChipReset')?.addEventListener('click', ()=>{ state.selectedTags.clear(); apply(searchEl?.value||''); renderFixedChips(); });
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
  
  renderFixedChips();
}
