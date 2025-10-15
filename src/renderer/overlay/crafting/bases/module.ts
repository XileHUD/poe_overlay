// Bases panel module: encapsulates Bases UI logic with filters and sorting
import { bindImageFallback } from "../utils/imageFallback";
import { TRANSPARENT_PLACEHOLDER } from "../utils/imagePlaceholder";
import { escapeHtml } from "../../utils";

// Helper to get image path - returns the path that will be resolved by auto-resolver
function getImagePath(item: any): string {
  // Use new imageLocal field (clean local paths)
  if (item.imageLocal) {
    return item.imageLocal; // Auto-resolver will convert to file:// URL
  }
  // Fallback to legacy image URL
  return item.image || '';
}

export type BaseItem = {
  name: string;
  image?: string;
  imageLocal?: string;
  implicitMods?: string[];
  properties?: { name: string; value: string }[];
  grants?: { name: string; level?: number }[];
  category?: string;
  __tags?: string[];
  __sortVal?: number;
};

export type BaseGroups = Record<string, BaseItem[]>; // category -> items

const state = {
  panelEl: null as HTMLElement | null,
  groups: {} as BaseGroups,
};

const CATEGORY_SYNONYMS: Record<string, string[]> = {
  Bucklers: ["Shields"],
  Offhand: ["Shields"],
  Shields: ["Shields"],
};

function normalizeCategorySlug(input?: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  if (!trimmed) return "";
  return trimmed
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function deriveDefenseSuffix(base: BaseItem): string | null {
  const props = Array.isArray(base?.properties) ? base.properties : [];
  const hasArmour = props.some((p) => /Armour|Armor/i.test(p?.name || ""));
  const hasEvasion = props.some((p) => /Evasion/i.test(p?.name || ""));
  const hasES = props.some((p) => /Energy Shield/i.test(p?.name || ""));
  const parts: string[] = [];
  if (hasArmour) parts.push("str");
  if (hasEvasion) parts.push("dex");
  if (hasES) parts.push("int");
  if (!parts.length) return null;
  return parts.join("_");
}

function buildModifierSlugCandidates(base: BaseItem, parentKey: string): string[] {
  const ordered: string[] = [];
  const explicitCategory = normalizeCategorySlug(base?.category);
  const parent = normalizeCategorySlug(parentKey === "All" ? base?.category : parentKey);
  const synonyms = new Set<string>();
  const collectSynonyms = (key?: string) => {
    if (!key) return;
    const normalizedKey = normalizeCategorySlug(key);
    const opts = CATEGORY_SYNONYMS[key] || CATEGORY_SYNONYMS[normalizedKey] || [];
    opts.forEach((entry) => {
      const normalized = normalizeCategorySlug(entry);
      if (normalized) synonyms.add(normalized);
    });
  };
  collectSynonyms(base?.category);
  collectSynonyms(parentKey);
  if (explicitCategory) collectSynonyms(explicitCategory);
  collectSynonyms(parent);

  const seeds = [explicitCategory, parent, ...Array.from(synonyms)].filter(Boolean);
  const defenceSuffix = deriveDefenseSuffix(base);
  if (defenceSuffix) {
    seeds.forEach((seed) => {
      if (!seed) return;
      ordered.push(`${seed}_${defenceSuffix}`);
    });
  }
  seeds.forEach((seed) => {
    if (!seed) return;
    ordered.push(seed);
  });
  const unique = new Set<string>();
  const result: string[] = [];
  ordered.forEach((slug) => {
    const trimmed = slug.trim();
    if (!trimmed) return;
    if (unique.has(trimmed)) return;
    unique.add(trimmed);
    result.push(trimmed);
  });
  return result;
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
  const tabMod=document.getElementById('tabModifier') as HTMLElement;
  const tabHist=document.getElementById('tabHistory') as HTMLElement;
  const craftingTab=document.getElementById('craftingTab') as HTMLElement;
  const itemsTab=document.getElementById('itemsTab') as HTMLElement;
  tabMod?.classList.remove('active'); tabHist?.classList.remove('active');
  if (craftingTab) { craftingTab.style.background='var(--bg-tertiary)'; craftingTab.style.color='var(--text-primary)'; }
  if (itemsTab) { itemsTab.style.background='var(--accent-blue)'; itemsTab.style.color='#fff'; }
  const content = document.getElementById('content'); if (content) content.style.display='none';
  const hist = document.getElementById('historyContainer'); if (hist) (hist as HTMLElement).style.display='none';
  // Don't set inline display:none - let CSS handle visibility via body classes
  document.getElementById('modifierHeaderInfo')?.setAttribute('style','display:none');
  document.getElementById('whittlingInfo')?.setAttribute('style','display:none');
  // Do not force show control panel; overlay shell manages it
  const ann = document.getElementById('annointsPanel'); if (ann) (ann as HTMLElement).style.display='none';
  document.body.classList.add('crafting-mode');

  const panel = ensurePanel();
  panel.style.display='';
  panel.innerHTML='';
  panel.insertAdjacentHTML('beforeend','<div class="no-mods">Loading...</div>');
  setTimeout(()=>{ panel.scrollTop=0; },10);
  try{
    const data = await (window as any).electronAPI.getBases();
    if (!data || data.error) { panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load Bases (${data?.error||'unknown'})</div>`; return; }
    render(data.bases||{});
  } catch {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Exception loading Bases</div>`;
  }
}

function tagRGB(tag: string): [number,number,number]{ const t=(tag||'').toLowerCase();
  if(t==='fire' || t==='life') return [220,68,61];
  if(t==='cold' || t==='mana') return [66,165,245];
  if(t==='lightning') return [255,213,79];
  if(t==='chaos' || t==='minion') return [156,39,176];
  if(t==='es' || t==='energy shield') return [38,198,218];
  if(t==='armour' || t==='armor' || t==='defences') return [109,76,65];
  if(t==='evasion') return [46,125,50];
  if(t==='resist' || t==='resistances') return [255,112,67];
  if(t==='projectile') return [255,179,0];
  if(t==='area') return [171,71,188];
  if(t==='critical' || t==='crit') return [255,179,0];
  if(t==='spell') return [92,107,192];
  if(t==='attack' || t==='attackspeed') return [121,85,72];
  if(t==='damage' || t==='ailments' || t==='mechanics') return [96,125,139];
  if(t==='movement' || t==='move' || t==='attack speed') return [67,160,71];
  if(t==='elemental') return [255,152,0];
  if(t==='physical') return [158,158,158];
  if(t==='block') return [120,144,156];
  return [120,144,156]; }
function chipCss(tag: string, active: boolean){ const [r,g,b]=tagRGB(tag); const bg = active? `rgba(${r},${g},${b},0.9)` : `rgba(${r},${g},${b},0.22)`; const border=`rgba(${r},${g},${b},0.6)`; const luma=0.2126*r+0.7152*g+0.0722*b; const color = active ? (luma>180? '#000':'#fff') : 'var(--text-primary)'; return `border:1px solid ${border}; background:${bg}; color:${color};`; }

export function render(groups: BaseGroups): void {
  const panel=ensurePanel();
  state.groups = groups || {};
  const rawCategoryKeys = Object.keys(state.groups).sort((a,b)=>a.localeCompare(b));
  const categoryKeys = ['All', ...rawCategoryKeys];
  if(!categoryKeys.length){ panel.innerHTML='<div class="no-mods">No bases found</div>'; return; }

  rawCategoryKeys.forEach((key) => {
    const entries = ((state.groups as any)[key] || []) as BaseItem[];
    entries.forEach((base) => {
      if (!base.category) {
        base.category = key;
      }
    });
  });

  // Derive tags per base and collect universe + counts
  const tagUniverse = new Set<string>();
  const deriveTags = (base: BaseItem)=>{
    const tags = new Set<string>();
    const textParts = [base.name, ...(base.implicitMods||[]), ...(base.properties||[]).map(p=>p.name+':'+p.value), ...(base.grants||[]).map(g=>'Grants '+g.name)].join(' ');
    const add = (t?: string)=>{ if(t) tags.add(t); };
    if(/Armour/i.test(textParts)) add('Armour');
    if(/Evasion/i.test(textParts)) add('Evasion');
    if(/Energy Shield|Energy\s*Shield/i.test(textParts)) add('ES');
    if(/Block/i.test(textParts)) add('Block');
    if(/Life/i.test(textParts)) add('Life');
    if(/Mana/i.test(textParts)) add('Mana');
    if(/Attack Speed|Attacks per Second|attack speed/i.test(textParts)) add('AttackSpeed');
    if(/Critical Strike|Critical Hit|Crit/i.test(textParts)) add('Crit');
    if(/Spell/i.test(textParts)) add('Spell');
    if(/Attack/i.test(textParts)) add('Attack');
    if(/Damage/i.test(textParts)) add('Damage');
    if(/Physical/i.test(textParts)) add('Physical');
    if(/Fire/i.test(textParts)) add('Fire');
    if(/Cold/i.test(textParts)) add('Cold');
    if(/Lightning/i.test(textParts)) add('Lightning');
    if(tags.has('Fire')||tags.has('Cold')||tags.has('Lightning')) add('Elemental');
    if(/Chaos/i.test(textParts)) add('Chaos');
    if(/Strength/i.test(textParts)) add('Strength');
    if(/Dexterity/i.test(textParts)) add('Dexterity');
    if(/Intelligence/i.test(textParts)) add('Intelligence');
    if((base.grants||[]).length) add('Skill');
    if(/Movement Speed/i.test(textParts)) add('Move');
    if(/Resistance|Resist/i.test(textParts)) add('Resist');
    if(/Wand/i.test(base.name)) add('Caster');
    if(/Staff|Quarterstaff/i.test(base.name)) add('Staff');
    if(/Claw/i.test(base.name)) add('Claw');
    if(/Dagger/i.test(base.name)) add('Dagger');
    if(/Sceptre/i.test(base.name)) add('Sceptre');
    if(/Mace/i.test(base.name)) add('Mace');
    if(/Axe/i.test(base.name)) add('Axe');
    if(/Sword/i.test(base.name)) add('Sword');
    if(/Bow|Crossbow/i.test(base.name)) add('Ranged');
    if(/Shield|Buckler|Focus|Foci/i.test(base.name)) add('Shield');
    if(/Gloves/i.test(base.name)) add('Gloves');
    if(/Boots/i.test(base.name)) add('Boots');
    if(/Helmet|Helm/i.test(base.name)) add('Helmet');
    if(/Body Armour|Armour|Plate|Vest/i.test(base.name)) add('Body');
    base.__tags = [...tags];
    base.__tags.forEach(t=>tagUniverse.add(t));
  };
  categoryKeys.forEach(k => ((state.groups as any)[k]||[]).forEach((b: BaseItem)=>deriveTags(b)));
  const allTags=[...tagUniverse].sort();
  const tagCounts: Record<string, number> = {};
  categoryKeys.forEach(k => ((state.groups as any)[k]||[]).forEach((b: BaseItem)=>{ (b.__tags||[]).forEach(t=>{ tagCounts[t] = (tagCounts[t]||0)+1; }); }));

  const selectedTags=new Set<string>();
  // Multi-select defense filters (user can now pick any combination of Armour / Evasion / ES)
  const defenseQuick = new Set<'Armour'|'Evasion'|'ES'>();
  let sortTag: 'Armour'|'Evasion'|'ES'|'AttackSpeed'|'Crit'|'Physical'|'Fire'|'Cold'|'Lightning'|'Chaos'|'Life'|'Mana'|'Block'|'Move'|'Elemental'|null = null;
  let sortDir: 'asc'|'desc' = 'desc';

  panel.innerHTML=`
    <div class='page-inner'>
      <div style='display:flex; gap:6px; align-items:center; margin-bottom:8px;'>
          <select id='baseCategorySelect' style='padding:4px 6px; background:var(--bg-tertiary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px; font-size:12px;'>
            ${categoryKeys.map(c=>`<option value='${c}'>${c.replace(/_/g,' ')}</option>`).join('')}
          </select>
          <input id='baseSearch' type='text' placeholder='Search bases...' style='flex:1; padding:4px 8px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary); font-size:12px;'>
          <button id='baseClear' class='pin-btn' style='padding:4px 8px;'>Clear</button>
      </div>
      <div id='baseDefQuick' style='display:flex; gap:6px; margin:-4px 0 10px; justify-content:center;'></div>
      <div id='baseTagFilters' style='display:flex; flex-wrap:wrap; gap:4px; margin:-2px 0 8px; justify-content:center; width:100%;'></div>
      <div id='baseList' style='display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:10px;'></div>
    </div>`;

  const searchEl=panel.querySelector('#baseSearch') as HTMLInputElement;
  const clearBtn=panel.querySelector('#baseClear') as HTMLButtonElement;
  const selectEl=panel.querySelector('#baseCategorySelect') as HTMLSelectElement;
  const listEl=panel.querySelector('#baseList') as HTMLElement;
  const quickWrap=panel.querySelector('#baseDefQuick') as HTMLElement;
  const tagWrap=panel.querySelector('#baseTagFilters') as HTMLElement;

  function renderTagFilters(){
    if(!tagWrap) return; tagWrap.innerHTML='';
    allTags.forEach(tag=>{
      const btn=document.createElement('div');
      const active=selectedTags.has(tag);
      const count = tagCounts[tag]||0;
      btn.textContent = count ? `${tag} (${count})` : tag;
      (btn as HTMLElement).style.cssText = `cursor:pointer; user-select:none; padding:2px 6px; font-size:11px; border-radius:999px; ${chipCss(tag, active)}`;
      btn.addEventListener('click',()=>{ active?selectedTags.delete(tag):selectedTags.add(tag); build(); renderTagFilters(); });
      tagWrap.appendChild(btn);
    });
    if(selectedTags.size){ const reset=document.createElement('div'); reset.textContent='Reset'; (reset as HTMLElement).style.cssText='cursor:pointer; user-select:none; padding:2px 6px; font-size:11px; border:1px solid var(--accent-red); border-radius:999px; background:var(--accent-red); color:#fff'; reset.addEventListener('click',()=>{ selectedTags.clear(); build(); renderTagFilters(); }); tagWrap.appendChild(reset); }
  }
  function baseMatchesTags(b: BaseItem){ if(!selectedTags.size) return true; if(!b.__tags) return false; return [...selectedTags].every(t=> (b.__tags as string[]).includes(t)); }
  function matchesDefenseQuick(b: BaseItem){
    if(!defenseQuick.size) return true;
    const props=b.properties||[];
    // Determine presence flags
    const hasArmour = props.some(p=>/Armour|Armor/i.test(p.name));
    const hasEvasion = props.some(p=>/Evasion/i.test(p.name));
    const hasES = props.some(p=>/Energy Shield/i.test(p.name));
    // All selected defenses must be present (intersection semantics)
    for(const sel of defenseQuick){
      if(sel==='Armour' && !hasArmour) return false;
      if(sel==='Evasion' && !hasEvasion) return false;
      if(sel==='ES' && !hasES) return false;
    }
    return true;
  }

  function highlight(s: string){ return s.replace(/(\d+%?)/g,'<span class="mod-value">$1</span>'); }

  function build(): void {
    const cat=selectEl.value;
    const f=(searchEl.value||'').toLowerCase().trim(); listEl.innerHTML='';
    let basesArr: BaseItem[] = cat==='All' ? rawCategoryKeys.flatMap(k=> (state.groups as any)[k]||[]) : ((state.groups as any)[cat]||[]);
    let arr=basesArr.filter(b=>(!f || b.name.toLowerCase().includes(f) || (b.implicitMods||[]).some(m=>m.toLowerCase().includes(f)) || (b.grants||[]).some(g=>g.name.toLowerCase().includes(f))) && baseMatchesTags(b) && matchesDefenseQuick(b));
    if(sortTag){
      const propMatchers: Record<string, (p: {name:string; value:string})=>boolean> = {
        Armour:(p)=>/Armour|Armor/i.test(p.name),
        Evasion:(p)=>/Evasion/i.test(p.name),
        ES:(p)=>/Energy Shield/i.test(p.name),
        AttackSpeed:(p)=>/Attacks per Second|Attack Speed/i.test(p.name),
        Crit:(p)=>/Critical/i.test(p.name),
        Physical:(p)=>/Physical Damage/i.test(p.name),
        Fire:(p)=>/Fire Damage/i.test(p.name),
        Cold:(p)=>/Cold Damage/i.test(p.name),
        Lightning:(p)=>/Lightning Damage/i.test(p.name),
        Chaos:(p)=>/Chaos Damage/i.test(p.name),
        Life:(p)=>/Life/i.test(p.name),
        Mana:(p)=>/Mana/i.test(p.name),
        Block:(p)=>/Block Chance|to Block/i.test(p.name),
        Move:(p)=>/Movement Speed/i.test(p.name),
        Elemental:(p)=>/Fire Damage|Cold Damage|Lightning Damage/i.test(p.name)
      };
      const extractNum = (val: string)=>{ const nums=(val.match(/\d+(?:\.\d+)?/g)||[]).map(Number); if(!nums.length) return NaN as number; return Math.max(...nums); };
      arr.forEach(b=>{ let val=-Infinity; if(sortTag==='Elemental'){ let sum=0; let found=false; (b.properties||[]).forEach(p=>{ if(/Fire Damage|Cold Damage|Lightning Damage/i.test(p.name)){ const n=extractNum(p.value); if(!isNaN(n)){ sum+=n; found=true; }}}); if(found) val=sum; }
        else { (b.properties||[]).forEach((p)=>{ if(propMatchers[sortTag as string]?.(p)){ const n=extractNum(p.value); if(!isNaN(n) && n>val) val=n; }});} (b as any).__sortVal=val; });
      arr.sort((a,b)=>{ const av=(a as any).__sortVal, bv=(b as any).__sortVal; if(av===bv) return a.name.localeCompare(b.name); return sortDir==='desc'? (bv-av):(av-bv); });
    } else if(defenseQuick.size>1){
      // Composite defense sort: sum of selected defense values
      const extractNum = (val: string)=>{ const nums=(val.match(/\d+(?:\.\d+)?/g)||[]).map(Number); if(!nums.length) return NaN as number; return Math.max(...nums); };
      arr.forEach(b=>{
        const props=b.properties||[];
        let total=0; let missing=false;
        const need=[...defenseQuick];
        need.forEach(sel=>{
          let best=-Infinity;
            props.forEach(p=>{
              if(sel==='Armour' && /Armour|Armor/i.test(p.name)) { const n=extractNum(p.value); if(!isNaN(n) && n>best) best=n; }
              if(sel==='Evasion' && /Evasion/i.test(p.name)) { const n=extractNum(p.value); if(!isNaN(n) && n>best) best=n; }
              if(sel==='ES' && /Energy Shield/i.test(p.name)) { const n=extractNum(p.value); if(!isNaN(n) && n>best) best=n; }
            });
          if(best===-Infinity) missing=true; else total+=best;
        });
        (b as any).__sortVal = missing? -Infinity : total;
      });
      arr.sort((a,b)=>{ const av=(a as any).__sortVal, bv=(b as any).__sortVal; if(av===bv) return a.name.localeCompare(b.name); return bv-av; });
    }
    arr.forEach(b=>{
      const card=document.createElement('div');
      card.style.width='100%';
      card.style.background='var(--bg-card)';
      card.style.border='1px solid var(--border-color)';
      card.style.borderRadius='8px';
      card.style.padding='8px';
      card.style.display='flex';
      card.style.gap='12px';
      card.style.alignItems='flex-start';
      // Use imageLocal if available, fallback to image (legacy)
      const imgSrc = getImagePath(b);
      const imgBlock = imgSrc ? `<div style='flex:0 0 110px; display:flex; align-items:flex-start; justify-content:center;'><img class='base-img' src='${TRANSPARENT_PLACEHOLDER}' data-orig-src='${imgSrc}' alt='' style='width:110px; height:110px; object-fit:contain; image-rendering:crisp-edges;'></div>` : `<div style='flex:0 0 110px;'></div>`;
      const implicitHtml = (b.implicitMods||[]).length ? `<div style=\"font-size:11px; margin-bottom:4px;\">${(b.implicitMods||[]).map(m=>highlight(m)).join('<br>')}</div>` : '<div style=\"font-size:10px; color:var(--text-muted); margin-bottom:4px;\">No implicit</div>';
      const grantHtml = (b.grants||[]).length ? `<div style='font-size:10px; color:var(--accent-blue); margin-bottom:4px;'>${(b.grants||[]).map(g=>`Grants Skill: ${g.name}${g.level?` (Level ${g.level})`:''}`).join('<br>')}</div>` : '';
      const propHtml = (b.properties||[]).length ? `<div style=\"font-size:10px; display:flex; flex-wrap:wrap; gap:4px; margin-bottom:4px;\">${(b.properties||[]).map(p=>`<span style='background:var(--bg-tertiary); padding:2px 4px; border-radius:3px;'>${p.name}: ${p.value}</span>`).join('')}</div>` : '';
      const tagsLine = (b.__tags&&b.__tags.length) ? `<div style='display:flex; flex-wrap:wrap; gap:4px; margin-top:2px;'>${(b.__tags||[]).map(t=>{
        const highlightTag = (sortTag===t) || (defenseQuick.size>1 && defenseQuick.has(t as any) && ['Armour','Evasion','ES'].includes(t));
        return `<span style=\"background:${highlightTag?'var(--accent-blue)':'var(--bg-tertiary)'}; padding:2px 6px; border-radius:4px; font-size:10px; cursor:pointer;\" data-sort-tag='${t}'>${t}</span>`;
      }).join('')}</div>` : '';
  const slugCandidates = buildModifierSlugCandidates(b, cat);
      const primarySlug = slugCandidates.length ? slugCandidates[0] : '';
      const sortBadge = (sortTag && (b as any).__sortVal!==-Infinity)?` <span style='font-size:11px; color:var(--accent-blue);'>(${(b as any).__sortVal})</span>`:'';
      const safeName = escapeHtml(b.name || '');
      const safeSlug = escapeHtml(primarySlug);
      const modButton = primarySlug
        ? `<button class='base-modifiers-btn' data-mod-cat='${safeSlug}' title='Open modifiers for ${safeName}' aria-label='Open modifiers for ${safeName}' style='border:1px solid var(--border-color); background:var(--bg-tertiary); color:var(--text-secondary); width:26px; height:26px; border-radius:6px; display:inline-flex; align-items:center; justify-content:center; font-size:13px; cursor:pointer; transition:background 0.15s ease;'>✦</button>`
        : '';
      const headerLine = `<div style='display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px;'>
        <div style='font-weight:600; font-size:15px;'>${b.name}${sortBadge}</div>
        ${modButton}
      </div>`;
      const right = `<div style='flex:1; display:flex; flex-direction:column;'>
        ${headerLine}
        ${implicitHtml}${grantHtml}${propHtml}${tagsLine}
      </div>`;
      card.innerHTML = imgBlock + right;
      listEl.appendChild(card);

      if (primarySlug) {
        const btn = card.querySelector<HTMLButtonElement>('button.base-modifiers-btn');
        if (btn) {
          if (slugCandidates.length) {
            try {
              btn.dataset.modCandidates = JSON.stringify(slugCandidates);
            } catch {
              btn.dataset.modCandidates = slugCandidates.join('|');
            }
            btn.setAttribute('data-mod-cat', slugCandidates[0]);
          }
          btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const currentTarget = ev.currentTarget as HTMLElement;
            let slugs: string[] = [];
            const rawCandidates = currentTarget?.dataset?.modCandidates || '';
            if (rawCandidates) {
              try {
                const parsed = JSON.parse(rawCandidates);
                if (Array.isArray(parsed)) {
                  slugs = parsed.map((entry) => String(entry)).filter(Boolean);
                }
              } catch {
                slugs = rawCandidates.split('|').map((entry) => entry.trim()).filter(Boolean);
              }
            }
            if (!slugs.length) {
              const fallback = currentTarget.getAttribute('data-mod-cat');
              if (fallback) slugs = [fallback];
            }
            if (!slugs.length) return;
            try {
              (window as any).openModifiersCategory?.(slugs, { bypassDebounce: true });
            } catch (err) {
              console.warn('[Bases] Failed to open modifiers category via helper:', slugs, err);
              try {
                const select = document.getElementById('categorySelect') as HTMLSelectElement | null;
                if (select) {
                  const optionList = Array.from(select.options || []);
                  let resolved = '';
                  for (const candidate of slugs) {
                    const match = optionList.find(opt => (opt.value || '').toUpperCase() === candidate.toUpperCase());
                    if (match) {
                      resolved = match.value;
                      break;
                    }
                  }
                  if (!resolved) {
                    // Final attempt: try first candidate verbatim
                    resolved = slugs[0];
                  }
                  select.value = resolved;
                }
                (window as any).setView?.('modifiers');
                (window as any).switchCategory?.();
              } catch (fallbackErr) {
                console.warn('[Bases] Fallback category switch failed:', fallbackErr);
              }
            }
          });
        }
      }
    });

    // Standardized fallback & local path resolution
    bindImageFallback(listEl, 'img.base-img', `<svg xmlns="http://www.w3.org/2000/svg" width="110" height="110" viewBox="0 0 110 110"><rect width="110" height="110" rx="8" fill="#222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#555" font-size="12" font-family="sans-serif">?</text></svg>`, 0.5);

    listEl.querySelectorAll('[data-sort-tag]').forEach(el=>{
      el.addEventListener('click',(e)=>{
        e.stopPropagation();
        const t=(e.currentTarget as HTMLElement).getAttribute('data-sort-tag');
        const sortable=['Armour','Evasion','ES','AttackSpeed','Crit','Physical','Fire','Cold','Lightning','Chaos','Elemental','Life','Mana','Block','Move'];
        if(!t || !sortable.includes(t)) return;
        if(sortTag===t as any){ sortTag=null; } else { sortTag=t as any; sortDir='desc'; }
        build();
        panel.scrollTo({ top:0, behavior:'smooth' });
      });
    });
  }

  function renderDefenseQuick(){
    if(!quickWrap) return; quickWrap.innerHTML='';
    const defs: {k:'Armour'|'Evasion'|'ES'; label:string}[] = [
      {k:'Armour',label:'Armour'},
      {k:'Evasion',label:'Evasion'},
      {k:'ES',label:'Energy Shield'}
    ];
    defs.forEach(d=>{
      const active = defenseQuick.has(d.k);
      const btn=document.createElement('button');
      btn.textContent=d.label;
      btn.style.padding='4px 10px';
      btn.style.fontSize='12px';
      btn.style.border='1px solid var(--border-color)';
      btn.style.borderRadius='4px';
      btn.style.cursor='pointer';
      btn.style.background= active ? 'var(--accent-blue)' : 'var(--bg-tertiary)';
      btn.style.color= active ? '#fff':'var(--text-primary)';
      btn.addEventListener('click',()=>{
        if(active){ defenseQuick.delete(d.k); }
        else { defenseQuick.add(d.k); }
        // Sorting: only auto-apply if a single defense selected; otherwise clear defense-based sort
        if(defenseQuick.size===1){ const only=[...defenseQuick][0]; sortTag=only as any; sortDir='desc'; }
        else if(['Armour','Evasion','ES'].includes(sortTag as string)) { sortTag=null; }
        build();
        panel.scrollTo({top:0, behavior:'smooth'});
        renderDefenseQuick();
      });
      quickWrap.appendChild(btn);
    });
    if(defenseQuick.size){
      const clear=document.createElement('button');
      clear.textContent='×';
      clear.title='Clear defense filters';
      clear.style.padding='4px 8px';
      clear.style.fontSize='12px';
      clear.style.border='1px solid var(--border-color)';
      clear.style.borderRadius='4px';
      clear.style.cursor='pointer';
      clear.style.background='var(--accent-red)';
      clear.style.color='#fff';
      clear.addEventListener('click',()=>{
        defenseQuick.clear();
        if(['Armour','Evasion','ES'].includes(sortTag as string)) sortTag=null;
        build();
        panel.scrollTo({top:0, behavior:'smooth'});
        renderDefenseQuick();
      });
      quickWrap.appendChild(clear);
    }
  }

  searchEl.addEventListener('input',()=>build());
  clearBtn.addEventListener('click',()=>{ searchEl.value=''; build(); searchEl.focus(); });
  selectEl.addEventListener('change',()=>build());
  renderTagFilters();
  renderDefenseQuick();
  build();
}

export async function reload(): Promise<void> {
  const panel = ensurePanel();
  panel.querySelector('.no-mods')?.remove();
  const loader = document.createElement('div'); loader.className='no-mods'; loader.textContent='Reloading...'; panel.appendChild(loader);
  try {
    const data = await (window as any).electronAPI.getBases();
    if (!data || data.error) { panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load Bases (${data?.error||'unknown'})</div>`; return; }
    render(data.bases || {});
  } catch {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Reload failed</div>`;
  }
}
