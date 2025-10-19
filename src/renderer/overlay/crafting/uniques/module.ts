// Uniques panel module: encapsulates Uniques UI and logic and exposes a window facade for overlay.html delegation
import { applyFilterChipChrome, type ChipChrome, sanitizeCraftingHtml } from "../../utils";
import { buildPoe2ChipChrome } from "../../shared/filterChips";
import { bindImageFallback } from "../utils/imageFallback";
import { TRANSPARENT_PLACEHOLDER } from "../utils/imagePlaceholder";
import { resolveLocalImage } from "../utils/localImage";

// Helper to get image path - returns the path that will be resolved by auto-resolver
function getImagePath(item: any): string {
  return resolveLocalImage(item.imageLocal, item.image);
}

type UniqueItem = {
  name: string;
  typeLine: string;
  image?: string;
  imageLocal?: string;
  explicitMods?: string[];
};

type UniqueGroups = Record<string, UniqueItem[]>; // e.g. { Weapon: [...], Armour: [...], Other: [...] }

const state = {
  panelEl: null as HTMLElement | null,
  groups: {} as UniqueGroups,
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

function highlightNumbers(s: string): string {
  if (!s) return "";
  return s
    .replace(/(\d+\s*[–-]\s*\d+)/g, '<span class="mod-value">$1</span>')
    .replace(/(?<![A-Za-z0-9>])([+\-]?\d+)(?![A-Za-z0-9<])/g, '<span class="mod-value">$1</span>')
    .replace(/(\d+%)/g, '<span class="mod-value">$1</span>')
    .replace(/([\[\]\(\)%])/g, '<span class="mod-value">$1</span>');
}

export async function show(): Promise<void> {
  const tabMod = document.getElementById("tabModifier") as HTMLElement;
  const tabHist = document.getElementById("tabHistory") as HTMLElement;
  const craftingTab = document.getElementById("craftingTab") as HTMLElement;
  const itemsTab = document.getElementById("itemsTab") as HTMLElement;
  const contentMod = document.getElementById("content") as HTMLElement;
  const contentHist = document.getElementById("historyContent") as HTMLElement;
  tabMod?.classList.remove("active"); tabHist?.classList.remove("active");
  if (craftingTab) { craftingTab.style.background = "var(--bg-tertiary)"; craftingTab.style.color = "var(--text-primary)"; }
  if (itemsTab) { itemsTab.style.background = "var(--accent-blue)"; itemsTab.style.color = "#fff"; }
  if (contentMod) contentMod.style.display = "none";
  if (contentHist) contentHist.style.display = "none";
  // Don't set inline display:none - let CSS handle visibility via body classes
  document.getElementById("modifierHeaderInfo")?.setAttribute("style", "display:none");
  document.getElementById("whittlingInfo")?.setAttribute("style", "display:none");
  document.getElementById("controlPanel")?.setAttribute("style", "");
  // Hide Annoints panel if visible
  const ann = document.getElementById("annointsPanel");
  if (ann) (ann as HTMLElement).style.display = "none";
  document.body.classList.add("crafting-mode");

  const panel = ensurePanel();
  panel.style.display = "";
  panel.innerHTML = `<div class='no-mods'>Loading...</div>`;
  setTimeout(()=>{ panel.scrollTop = 0; }, 10);
  try {
    const data = await (window as any).electronAPI.getUniques();
    if (!data || data.error) {
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load Uniques (${data?.error||'unknown'})</div>`; return;
    }
    render(data.uniques || {});
  } catch {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Exception loading Uniques</div>`;
  }
}

export function render(groups: UniqueGroups): void {
  const panel = ensurePanel();
  state.groups = groups || {};
  const order = ["Weapon","Armour","Other"];

  // Build tag set and counts from mods
  const uniqueTags = new Set<string>();
  const tagCounts: Record<string, number> = {};
  const considerTags = (mods: string)=>{
    // Remove HTML tags & image URLs so regexes only see human-readable text (prevents false Chaos, etc.)
    const plain = (mods||'').replace(/<img[^>]*>/gi,' ').replace(/<[^>]+>/g,' ').replace(/https?:\/\/\S+/g,' ');
    const addOnce = (set: Set<string>, tag: string)=>{ if(!set.has(tag)) set.add(tag); };
    const tmp = new Set<string>();
    if(/Attack Speed|Attack/i.test(plain)) addOnce(tmp,'Attack Speed');
    if(/Minion/i.test(plain)) addOnce(tmp,'Minion');
    if(/Curse/i.test(plain)) addOnce(tmp,'Curse');
    if(/Cold Damage|Cold/i.test(plain)) addOnce(tmp,'Cold');
    if(/Lightning Damage|Lightning/i.test(plain)) addOnce(tmp,'Lightning');
    if(/Fire Damage|Fire/i.test(plain)) addOnce(tmp,'Fire');
    if(/Chaos Damage|Chaos/i.test(plain)) addOnce(tmp,'Chaos');
    if(/Bleed/i.test(plain)) addOnce(tmp,'Bleed');
    if(/Electrocute/i.test(plain)) addOnce(tmp,'Electrocute');
    if(/Poison/i.test(plain)) addOnce(tmp,'Poison');
    if(/Freeze|Frozen/i.test(plain)) addOnce(tmp,'Freeze');
    if(/Stun/i.test(plain)) addOnce(tmp,'Stun');
    if(/Critical/i.test(plain)) addOnce(tmp,'Critical');
    if(/Life|Health/i.test(plain)) addOnce(tmp,'Life');
    if(/Mana/i.test(plain)) addOnce(tmp,'Mana');
    if(/Energy Shield/i.test(plain)) addOnce(tmp,'Energy Shield');
    if(/Armour|Armor/i.test(plain)) addOnce(tmp,'Armour');
    if(/Evasion/i.test(plain)) addOnce(tmp,'Evasion');
    if(/Movement Speed|Move/i.test(plain)) addOnce(tmp,'Movement');
    if(/Aura|Aura Effect/i.test(plain)) addOnce(tmp,'Aura');
    if(/Cast Speed/i.test(plain)) addOnce(tmp,'Cast Speed');
    if(/Spell/i.test(plain)) addOnce(tmp,'Spell');
    if(/Projectile/i.test(plain)) addOnce(tmp,'Projectile');
    if(/Area/i.test(plain)) addOnce(tmp,'Area');
    return tmp;
  };
  order.forEach(sec => {
    ((state.groups as any)[sec]||[]).forEach((item: UniqueItem) => {
      const mods = (item.explicitMods || []).join(' ');
      const tagsForItem = considerTags(mods);
      tagsForItem.forEach(t=>{ uniqueTags.add(t); tagCounts[t] = (tagCounts[t]||0) + 1; });
    });
  });
  const sortedTags = [...uniqueTags].sort();
  const selectedTags = new Set<string>();

  const controls = `<div style='display:flex; gap:6px; align-items:center; margin-bottom:8px;'>
    <input id='uniqueSearch' type='text' placeholder='Search uniques...' style='flex:1; padding:4px 8px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary); font-size:12px;'>
    <button id='uniqueClear' class='pin-btn' style='padding:4px 8px;'>Clear</button>
  </div>
  <div style='background:var(--bg-secondary); padding:8px; border-radius:6px; margin-bottom:8px;'>
    <div id='uniqueTagFilters' style='display:flex; flex-wrap:wrap; gap:4px; justify-content:center; width:100%;'></div>
  </div>
  <div id='uniqueSections' style='display:flex; flex-direction:column; gap:14px;'></div>`;
  // Wrap in page-inner for consistent centering like other crafting panels
  panel.innerHTML = `<div class='page-inner'>${controls}</div>`;

  const searchEl = panel.querySelector('#uniqueSearch') as HTMLInputElement;
  const clearBtn = panel.querySelector('#uniqueClear') as HTMLButtonElement;
  const container = panel.querySelector('#uniqueSections') as HTMLElement;
  const tagWrap = panel.querySelector('#uniqueTagFilters') as HTMLElement;

  function tagRGB(tag: string): [number, number, number] { const t=(tag||'').toLowerCase();
    if(t==='fire' || t==='life') return [220,68,61];
    if(t==='cold' || t==='mana') return [66,165,245];
    if(t==='lightning') return [255,213,79];
    if(t==='chaos' || t==='minion') return [156,39,176];
    if(t==='energy shield' || t==='es') return [38,198,218];
    if(t==='armour' || t==='armor' || t==='defences') return [109,76,65];
    if(t==='evasion') return [46,125,50];
    if(t==='resistances' || t==='resist') return [255,112,67];
    if(t==='projectile') return [255,179,0];
    if(t==='area') return [171,71,188];
    if(t==='critical' || t==='crit') return [255,179,0];
    if(t==='spell') return [92,107,192];
    if(t==='attack' ) return [121,85,72];
    if(t==='damage' || t==='ailments' || t==='mechanics') return [96,125,139];
    if(t==='movement' || t==='attack speed' || t==='speed') return [67,160,71];
    if(t==='elemental') return [255,152,0];
    return [120,144,156]; }
  function chipChrome(tag: string, active: boolean): ChipChrome {
    return buildPoe2ChipChrome(tagRGB(tag), active);
  }

  function renderTagFilters(): void {
    if (!tagWrap) return; tagWrap.innerHTML='';
    sortedTags.forEach(tag => {
      const btn = document.createElement('div');
      const active = selectedTags.has(tag);
      const count = tagCounts[tag] || 0;
      btn.textContent = count ? `${tag} (${count})` : tag;
      applyFilterChipChrome(btn, chipChrome(tag, active), { padding: '3px 10px', fontWeight: active ? '600' : '500' });
      btn.style.margin = '0 4px 4px 0';
      btn.addEventListener('click',()=>{ active?selectedTags.delete(tag):selectedTags.add(tag); build(searchEl?.value||''); renderTagFilters(); });
      tagWrap.appendChild(btn);
    });
    if (selectedTags.size) {
      const reset=document.createElement('div');
      reset.textContent='Reset';
      applyFilterChipChrome(reset, { border: '1px solid var(--accent-red)', background: 'var(--accent-red)', color: '#fff' }, { padding: '3px 10px', fontWeight: '600' });
      reset.style.margin = '0 4px 4px 0';
      reset.addEventListener('click',()=>{ selectedTags.clear(); build(searchEl?.value||''); renderTagFilters(); });
      tagWrap.appendChild(reset);
    }
  }

  function itemMatchesTags(item: UniqueItem): boolean {
    if (selectedTags.size === 0) return true;
    const modsRaw = (item.explicitMods || []).join(' ');
    const mods = modsRaw.replace(/<img[^>]*>/gi,' ').replace(/<[^>]+>/g,' ').replace(/https?:\/\/\S+/g,' ');
    return [...selectedTags].some(tag => {
      switch(tag) {
        case 'Attack Speed': return /Attack Speed|Attack/i.test(mods);
        case 'Minion': return /Minion/i.test(mods);
        case 'Curse': return /Curse/i.test(mods);
        case 'Cold': return /Cold Damage|Cold/i.test(mods);
        case 'Lightning': return /Lightning Damage|Lightning/i.test(mods);
        case 'Fire': return /Fire Damage|Fire/i.test(mods);
        case 'Chaos': return /Chaos Damage|Chaos/i.test(mods);
        case 'Bleed': return /Bleed/i.test(mods);
        case 'Electrocute': return /Electrocute/i.test(mods);
        case 'Poison': return /Poison/i.test(mods);
        case 'Freeze': return /Freeze|Frozen/i.test(mods);
        case 'Stun': return /Stun/i.test(mods);
        case 'Critical': return /Critical/i.test(mods);
        case 'Life': return /Life|Health/i.test(mods);
        case 'Mana': return /Mana/i.test(mods);
        case 'Energy Shield': return /Energy Shield/i.test(mods);
        case 'Armour': return /Armour|Armor/i.test(mods);
        case 'Evasion': return /Evasion/i.test(mods);
        case 'Movement': return /Movement Speed|Move/i.test(mods);
        case 'Aura': return /Aura|Aura Effect/i.test(mods);
        case 'Cast Speed': return /Cast Speed/i.test(mods);
        case 'Spell': return /Spell/i.test(mods);
        case 'Projectile': return /Projectile/i.test(mods);
        case 'Area': return /Area/i.test(mods);
        default: return false;
      }
    });
  }

  function build(filter = ''): void {
    const f = (filter||'').toLowerCase().trim();
    container.innerHTML='';
    const order = ["Weapon","Armour","Other"];
    order.forEach(sec => {
      const list = ((state.groups as any)[sec]||[]).filter((u: UniqueItem) => {
        const matchesSearch = !f || u.name.toLowerCase().includes(f) || (u.typeLine||'').toLowerCase().includes(f) || (u.explicitMods||[]).some(m=>m.toLowerCase().includes(f));
        return matchesSearch && itemMatchesTags(u);
      });
      if (!list.length) return;
      const section = document.createElement('div');
      section.innerHTML = `<div style='font-weight:600; font-size:14px; margin-bottom:4px; text-align:center;'>${sec} (${list.length})</div>`;
      const wrap = document.createElement('div');
      // Responsive grid like Essences (fills width, minimal side gaps)
      wrap.style.display='grid';
      wrap.style.gridTemplateColumns='repeat(auto-fit, minmax(320px, 1fr))';
      wrap.style.gap='12px';
      list.forEach((u: UniqueItem)=>{
        const card = document.createElement('div');
        card.style.width='100%';
        card.style.background='var(--bg-card)';
        card.style.border='1px solid var(--border-color)';
        card.style.borderRadius='8px';
        card.style.padding='8px';
        card.style.display='flex';
        card.style.gap='12px';
        card.style.alignItems='flex-start';
  // Use imageLocal if available, fallback to image (legacy)
  const imgSrc = getImagePath(u);
  const imgBlock = imgSrc ? `<div style='flex:0 0 118px; display:flex; align-items:flex-start; justify-content:center;'><img class='unique-img' src='${TRANSPARENT_PLACEHOLDER}' data-orig-src='${(u.imageLocal || u.image || '').replace(/'/g,"&#39;")}' alt='' decoding='async' style='width:118px; height:118px; object-fit:contain; image-rendering:crisp-edges;'></div>` : `<div style='flex:0 0 118px;'></div>`;
  const cleanedMods = (u.explicitMods||[]).map(m=> m.replace(/<img[^>]*>/ig,'').trim()).filter(Boolean);
  const modsHtml = `<div style='font-size:11px;'>${cleanedMods.map((m: string)=> highlightNumbers(sanitizeCraftingHtml(m)) ).join('<br>')}</div>`;
        const right = `<div style='flex:1; display:flex; flex-direction:column;'>
          <div style='font-weight:600; font-size:15px; margin-bottom:4px;'>${u.name}</div>
          <div style='font-size:11px; color:var(--text-muted); margin-bottom:6px;'>${u.typeLine||''}</div>
          ${modsHtml}
        </div>`;
        card.innerHTML = imgBlock + right;
        wrap.appendChild(card);
      });
      section.appendChild(wrap);
      container.appendChild(section);
    });
    // Standardized fallback & local path resolution for unique images
    bindImageFallback(panel, 'img.unique-img', `<svg xmlns="http://www.w3.org/2000/svg" width="110" height="110" viewBox="0 0 110 110"><rect width="110" height="110" rx="8" fill="#222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#555" font-size="14" font-family="sans-serif">IMG</text></svg>`, 0.55);
  }

  searchEl?.addEventListener('input', ()=> build(searchEl.value));
  clearBtn?.addEventListener('click', ()=>{ if (searchEl) { searchEl.value=''; build(''); searchEl.focus(); } });
  renderTagFilters();
  build('');
}

export async function reload(): Promise<void> {
  const panel = ensurePanel();
  panel.querySelector('.no-mods')?.remove();
  const loader = document.createElement('div'); loader.className='no-mods'; loader.textContent='Reloading...';
  panel.appendChild(loader);
  try {
    const data = await (window as any).electronAPI.getUniques();
    if (!data || data.error) { panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load Uniques (${data?.error||'unknown'})</div>`; return; }
    render(data.uniques || {});
  } catch {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Reload failed</div>`;
  }
}

export function highlight(name?: string, baseType?: string): void {
  try {
    const root = ensurePanel()?.querySelector('#uniqueSections');
    if (!root) return;
    const nameLc = (name||'').toLowerCase();
    const baseLc = (baseType||'').toLowerCase();
    let best: Element | null = null;
    const cards = root.querySelectorAll('div');
    cards.forEach(card=>{
      if (best) return;
      const text = (card.textContent||'').toLowerCase();
      if (nameLc && text.includes(nameLc)) best=card;
      else if (baseLc && text.includes(baseLc)) best=card;
    });
    (best as any)?.scrollIntoView?.({behavior:'smooth', block:'center'});
  } catch {}
}
