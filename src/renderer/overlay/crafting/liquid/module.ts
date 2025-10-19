// Liquid Emotions module: renders the Liquid Emotions crafting panel and exposes an imperative API
import { TRANSPARENT_PLACEHOLDER } from "../utils/imagePlaceholder";
import { applyFilterChipChrome, type ChipChrome, sanitizeCraftingHtml } from "../../utils";
import { buildPoe2ChipChrome } from "../../shared/filterChips";
import { bindImageFallback } from "../utils/imageFallback";

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

function chipChrome(tag: string, active: boolean): ChipChrome {
  const key = tag.toLowerCase();
  const palette: Record<string, [number, number, number]> = {
    "additional modifier": [156, 39, 176],
    "rarity of items": [255, 193, 7],
    "pack size": [3, 155, 229],
    "magic monsters": [121, 134, 203],
    splinters: [255, 112, 67],
    tablets: [0, 188, 212],
    "waystones found": [102, 187, 106],
    "rare monsters": [244, 81, 30],
  };
  return buildPoe2ChipChrome(palette[key] ?? [64, 120, 192], active);
}

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

  const tagCounts: Record<string, number> = Object.fromEntries(fixedChips.map(label => [label.toLowerCase(), 0]));

  const cards: string[] = [];
  for (const item of items) {
    const haystack = [
      item.name,
      ...(item.enchantMods || []),
      ...(item.explicitMods || [])
    ].join(' ').toLowerCase();
    const tagsForItem: string[] = [];
    fixedChips.forEach(label => {
      const key = label.toLowerCase();
      if (haystack.includes(key)) {
        tagsForItem.push(key);
        tagCounts[key] = (tagCounts[key] || 0) + 1;
      }
    });
    cards.push(`
      <div class='liquid-emotion-card' data-slug='${item.slug||""}' data-name='${(item.name||"").replace(/'/g,"&#39;")}' data-tags='${tagsForItem.join("|")}' style='background:var(--bg-card); border:1px solid var(--border-color); border-radius:6px; padding:6px; display:flex; flex-direction:column; gap:4px; transition:border-color .25s; height:100%'>
        <div style='display:flex; align-items:center; gap:6px;'>
          ${(item.imageLocal || item.image) ? `<img class='currency-img' src='${TRANSPARENT_PLACEHOLDER}' data-orig-src='${item.imageLocal || item.image}' alt='' loading='lazy' decoding='async' style='width:28px; height:28px; object-fit:contain;'>` : ''}
          <div style='font-weight:600; line-height:1.2;'>${item.name}</div>
        </div>
        <div style='font-size:11px; color:var(--text-muted);'>Stack: ${item.stack_current ?? '?'} / ${item.stack_max ?? '?'}</div>
        ${item.enchantMods && item.enchantMods.length ? `<div style='font-size:11px; color:#9ecbff;'>${(item.enchantMods||[]).map((m)=>sanitizeCraftingHtml(m)).join('<br>')}</div>` : ''}
        ${item.explicitMods && item.explicitMods.length ? `<div style='font-size:11px;'>${(item.explicitMods||[]).map((m)=>sanitizeCraftingHtml(m)).join('<br>')}</div>` : ''}
      </div>`);
  }

  state.tagCounts = { ...tagCounts };

  panel.innerHTML = `
    <div class='page-inner'>
      <div style='display:flex; gap:6px; align-items:center; margin-bottom:8px;'>
        <input id='leSearch' type='text' placeholder='Search emotions...' style='flex:1; padding:4px 8px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary); font-size:12px;'>
        <button id='leClear' class='pin-btn' style='padding:4px 8px;'>Clear</button>
      </div>
      <div style='background:var(--bg-secondary); padding:8px; border-radius:6px; margin-bottom:8px;'>
        <div id='leTagFilters' style='display:flex; flex-wrap:wrap; gap:6px; justify-content:center; width:100%;'></div>
      </div>
      <div id='leList' style='display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:10px;'>${cards.join("")}</div>
    </div>`;

  // Reload button removed per request
  const searchEl = panel.querySelector('#leSearch') as HTMLInputElement | null;
  const clearBtn = panel.querySelector('#leClear') as HTMLButtonElement | null;
  const listEl = panel.querySelector('#leList') as HTMLElement | null;
  const tagWrap = panel.querySelector('#leTagFilters') as HTMLElement | null;
  function renderFixedChips(){
    if(!tagWrap) return;
    tagWrap.innerHTML = '';
    fixedChips.forEach(label => {
      const key = label.toLowerCase();
      const active = state.selectedTags.has(key);
      const count = state.tagCounts[key] || 0;
      const chip = document.createElement('div');
      chip.textContent = count ? `${label} (${count})` : label;
      applyFilterChipChrome(chip, chipChrome(label, active), { fontWeight: active ? '600' : '500', padding: '3px 10px' });
      chip.style.margin = '0 4px 4px 0';
      chip.dataset.chip = key;
      chip.addEventListener('click', () => {
        if(state.selectedTags.has(key)) state.selectedTags.delete(key); else state.selectedTags.add(key);
        apply(searchEl?.value||'');
        renderFixedChips();
      });
      tagWrap.appendChild(chip);
    });
    if (state.selectedTags.size) {
      const reset = document.createElement('div');
      reset.textContent = 'Reset';
      applyFilterChipChrome(reset, { border: '1px solid var(--accent-red)', background: 'var(--accent-red)', color: '#fff' }, { fontWeight: '600', padding: '3px 10px' });
      reset.style.margin = '0 4px 4px 0';
      reset.addEventListener('click', () => {
        state.selectedTags.clear();
        apply(searchEl?.value || '');
        renderFixedChips();
      });
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
      const cardTags = new Set((card.getAttribute('data-tags') || '').split('|').filter(Boolean));
      const tagsOk = !state.selectedTags.size || [...state.selectedTags].every(t => cardTags.has(t));
      card.style.display = ((!f || name.includes(f) || slug.includes(f)) && tagsOk) ? '' : 'none';
    });
  };
  searchEl?.addEventListener('input', ()=> apply(searchEl.value));
  clearBtn?.addEventListener('click', ()=> { if (searchEl) { searchEl.value=''; apply(''); searchEl.focus(); } });
  
  // Bind image fallback to handle loading
  bindImageFallback(panel, 'img.currency-img', `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><rect width="28" height="28" rx="4" fill="#222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#555" font-size="8" font-family="sans-serif">?</text></svg>`, 0.55);
  
  renderFixedChips();
}
