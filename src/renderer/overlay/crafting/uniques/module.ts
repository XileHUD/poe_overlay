// Uniques panel module: encapsulates Uniques UI and logic and exposes a window facade for overlay.html delegation
import { sanitizeCraftingHtml } from "../../utils";

type UniqueItem = {
  name: string;
  typeLine: string;
  image?: string;
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
  document.getElementById("historyHeader")?.setAttribute("style", "display:none");
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
  const totalItems = order.reduce((sum, sec) => sum + ((state.groups as any)[sec]||[]).length, 0);

  // Build tag set and counts from mods
  const uniqueTags = new Set<string>();
  const tagCounts: Record<string, number> = {};
  const considerTags = (mods: string)=>{
    const addOnce = (set: Set<string>, tag: string)=>{ if(!set.has(tag)) set.add(tag); };
    const tmp = new Set<string>();
    if(/Attack Speed|Attack/i.test(mods)) addOnce(tmp,'Attack Speed');
    if(/Minion/i.test(mods)) addOnce(tmp,'Minion');
    if(/Curse/i.test(mods)) addOnce(tmp,'Curse');
    if(/Cold Damage|Cold/i.test(mods)) addOnce(tmp,'Cold');
    if(/Lightning Damage|Lightning/i.test(mods)) addOnce(tmp,'Lightning');
    if(/Fire Damage|Fire/i.test(mods)) addOnce(tmp,'Fire');
    if(/Chaos Damage|Chaos/i.test(mods)) addOnce(tmp,'Chaos');
    if(/Bleed/i.test(mods)) addOnce(tmp,'Bleed');
    if(/Electrocute/i.test(mods)) addOnce(tmp,'Electrocute');
    if(/Poison/i.test(mods)) addOnce(tmp,'Poison');
    if(/Freeze|Frozen/i.test(mods)) addOnce(tmp,'Freeze');
    if(/Stun/i.test(mods)) addOnce(tmp,'Stun');
    if(/Critical/i.test(mods)) addOnce(tmp,'Critical');
    if(/Life|Health/i.test(mods)) addOnce(tmp,'Life');
    if(/Mana/i.test(mods)) addOnce(tmp,'Mana');
    if(/Energy Shield/i.test(mods)) addOnce(tmp,'Energy Shield');
    if(/Armour|Armor/i.test(mods)) addOnce(tmp,'Armour');
    if(/Evasion/i.test(mods)) addOnce(tmp,'Evasion');
    if(/Movement Speed|Move/i.test(mods)) addOnce(tmp,'Movement');
    if(/Aura|Aura Effect/i.test(mods)) addOnce(tmp,'Aura');
    if(/Cast Speed/i.test(mods)) addOnce(tmp,'Cast Speed');
    if(/Spell/i.test(mods)) addOnce(tmp,'Spell');
    if(/Projectile/i.test(mods)) addOnce(tmp,'Projectile');
    if(/Area/i.test(mods)) addOnce(tmp,'Area');
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
  <div id='uniqueTagFilters' style='display:flex; flex-wrap:wrap; gap:4px; margin:-2px 0 8px; justify-content:center;'></div>
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
  function chipCss(tag: string, active: boolean): string { const [r,g,b]=tagRGB(tag); const bg = active? `rgba(${r},${g},${b},0.9)` : `rgba(${r},${g},${b},0.22)`; const border=`rgba(${r},${g},${b},0.6)`; const luma=0.2126*r+0.7152*g+0.0722*b; const color = active ? (luma>180? '#000':'#fff') : 'var(--text-primary)'; return `border:1px solid ${border}; background:${bg}; color:${color};`; }

  function renderTagFilters(): void {
    if (!tagWrap) return; tagWrap.innerHTML='';
    sortedTags.forEach(tag => {
      const btn = document.createElement('div');
      const active = selectedTags.has(tag);
      const count = tagCounts[tag] || 0;
      btn.textContent = count ? `${tag} (${count})` : tag;
      (btn as HTMLElement).style.cssText = `cursor:pointer; user-select:none; padding:2px 6px; font-size:11px; border-radius:999px; ${chipCss(tag, active)}`;
      btn.addEventListener('click',()=>{ active?selectedTags.delete(tag):selectedTags.add(tag); build(searchEl?.value||''); renderTagFilters(); });
      tagWrap.appendChild(btn);
    });
    if (selectedTags.size) {
      const reset=document.createElement('div');
      reset.textContent='Reset';
      (reset as HTMLElement).style.cssText='cursor:pointer; user-select:none; padding:2px 6px; font-size:11px; border:1px solid var(--accent-red); border-radius:999px; background:var(--accent-red); color:#fff';
      reset.addEventListener('click',()=>{ selectedTags.clear(); build(searchEl?.value||''); renderTagFilters(); });
      tagWrap.appendChild(reset);
    }
  }

  function itemMatchesTags(item: UniqueItem): boolean {
    if (selectedTags.size === 0) return true;
    const mods = (item.explicitMods || []).join(' ');
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
        const imgBlock = u.image ? `<div style='flex:0 0 110px; display:flex; align-items:flex-start; justify-content:center;'><img class='unique-img' src='${u.image}' alt='' loading='lazy' decoding='async' style='width:110px; height:110px; object-fit:contain; image-rendering:crisp-edges;'></div>` : `<div style='flex:0 0 110px;'></div>`;
        const modsHtml = `<div style='font-size:11px;'>${(u.explicitMods||[]).map((m: string)=> highlightNumbers(sanitizeCraftingHtml(m)) ).join('<br>')}</div>`;
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
    // Image fallback: gray out and remove broken src to avoid endless retries
    const placeholder = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="110" height="110" viewBox="0 0 110 110"><rect width="110" height="110" rx="8" fill="%23222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23555" font-size="14" font-family="sans-serif">IMG</text></svg>';
    panel.querySelectorAll('img.unique-img').forEach((img: any)=>{
      if (img._fallbackBound) return;
      img._fallbackBound = true;
      img.addEventListener('error',()=>{
        img.src = placeholder;
        img.style.opacity='0.55';
        img.style.filter='grayscale(1)';
      }, { once:true });
    });
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
