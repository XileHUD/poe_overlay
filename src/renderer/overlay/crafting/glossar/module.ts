// Glossar (Keywords) panel module

export type GlossEntry = { name: string; description_plain?: string; description_html?: string; __tags?: string[] };

const state = {
  panelEl: null as HTMLElement | null,
  entries: [] as GlossEntry[],
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
  const tabMod=document.getElementById('tabModifier') as HTMLElement;
  const tabHist=document.getElementById('tabHistory') as HTMLElement;
  const craftingTab=document.getElementById('craftingTab') as HTMLElement;
  const itemsTab=document.getElementById('itemsTab') as HTMLElement;
  const glossarTab=document.getElementById('tabGlossar') as HTMLElement;
  tabMod?.classList.remove('active'); tabHist?.classList.remove('active');
  if (craftingTab) { craftingTab.style.background='var(--bg-tertiary)'; craftingTab.style.color='var(--text-primary)'; }
  if (itemsTab) { itemsTab.style.background='var(--bg-tertiary)'; itemsTab.style.color='var(--text-primary)'; }
  if (glossarTab) { glossarTab.classList.add('active'); glossarTab.style.background='var(--accent-blue)'; glossarTab.style.color='#fff'; }
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
  setTimeout(()=>{ panel.scrollTop=0; }, 10);
  try {
    const data = await (window as any).electronAPI.getKeywords();
    if (!data || data.error) { panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load Keywords (${data?.error||'unknown'})</div>`; return; }
    render((data.entries||data.keywords||data.items||[]) as GlossEntry[]);
  } catch {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Exception loading Glossar</div>`;
  }
}

export function render(entries: GlossEntry[]): void {
  const panel=ensurePanel();
  const list = Array.isArray(entries) ? entries : [];
  state.entries = list;
  const curatedTags = ['Damage','Ailments','Attributes','Energy Shield','Defences','Life','Mana','Fire','Cold','Lightning','Chaos','Resistances','Projectile','Area','Critical','Spell','Attack','Minion','Mechanics'];
  const selected = new Set<string>();

  function deriveTags(entry: GlossEntry): string[] {
    const text = `${entry.name||''} ${entry.description_plain||''}`;
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

  list.forEach(e=>{ e.__tags = deriveTags(e); });

  function tagRGB(tag: string): [number,number,number]{ const t=(tag||'').toLowerCase();
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
    if(t==='attack') return [121,85,72];
    if(t==='damage' || t==='ailments' || t==='mechanics') return [96,125,139];
    if(t==='movement' || t==='attack speed' || t==='speed') return [67,160,71];
    if(t==='elemental') return [255,152,0];
    return [120,144,156]; }
  function chipCss(tag: string, active: boolean){ const [r,g,b]=tagRGB(tag); const bg = active? `rgba(${r},${g},${b},0.9)` : `rgba(${r},${g},${b},0.22)`; const border=`rgba(${r},${g},${b},0.6)`; const luma=0.2126*r+0.7152*g+0.0722*b; const color = active ? (luma>180? '#000':'#fff') : 'var(--text-primary)'; return `border:1px solid ${border}; background:${bg}; color:${color};`; }

  const total = list.length|0;
  const controls = `<div style='display:flex; gap:6px; align-items:center; margin-bottom:6px;'>
    <input id='glossSearch' type='text' placeholder='Search keywords...' style='flex:1; padding:4px 8px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary); font-size:12px;'>
    <button id='glossClear' class='pin-btn' style='padding:4px 8px;'>Clear</button>
  </div>
  <div style='background:var(--bg-secondary); padding:8px; border-radius:6px; margin-bottom:8px;'>
    <div id='glossTagFilters' style='display:flex; flex-wrap:wrap; gap:6px; justify-content:center; width:100%;'></div>
  </div>
  <div id='glossList' style='display:flex; flex-direction:column; gap:8px;'></div>`;
  const panelEl = ensurePanel();
  panelEl.innerHTML = `<div class='page-inner'>${controls}</div>`;

  const input=panelEl.querySelector('#glossSearch') as HTMLInputElement;
  const clear=panelEl.querySelector('#glossClear') as HTMLButtonElement;
  const tagWrap=panelEl.querySelector('#glossTagFilters') as HTMLElement;
  const listEl=panelEl.querySelector('#glossList') as HTMLElement;

  panelEl.addEventListener('click',(e)=>{ const t = e.target as HTMLElement; const a = t && (t.closest as any) ? (t.closest('a') as HTMLElement) : null; if(a){ e.preventDefault(); e.stopPropagation(); }});

  function renderTagFilters(){ if(!tagWrap) return; tagWrap.innerHTML='';
    curatedTags.forEach(tag=>{
      const active = selected.has(tag);
      const count = list.filter(e=> (e.__tags||[]).includes(tag)).length;
      const btn=document.createElement('button');
      btn.textContent = count ? `${tag} (${count})` : tag;
      (btn as HTMLElement).style.cssText = `cursor:pointer; user-select:none; padding:3px 8px; font-size:11px; border-radius:4px; ${chipCss(tag, active)}`;
      btn.addEventListener('click',()=>{ active?selected.delete(tag):selected.add(tag); build(input.value||''); renderTagFilters(); });
      tagWrap.appendChild(btn);
    });
    if(selected.size){ const reset=document.createElement('button'); reset.textContent='Reset'; (reset as HTMLElement).style.cssText='cursor:pointer; user-select:none; padding:3px 8px; font-size:11px; border:1px solid var(--accent-red); border-radius:4px; background:var(--accent-red); color:#fff'; reset.addEventListener('click',()=>{ selected.clear(); build(input.value||''); renderTagFilters(); }); tagWrap.appendChild(reset); }
  }

  const highlight=(s: string)=> s
    .replace(/(\d+\s*[–-]\s*\d+)/g,'<span class="mod-value">$1<\/span>')
    .replace(/(?<![A-Za-z0-9>])([+\-]?\d+)(?![A-Za-z0-9<])/g,'<span class="mod-value">$1<\/span>')
    .replace(/(\d+%)/g,'<span class="mod-value">$1<\/span>')
    .replace(/[\[\]\(\)%]/g,'<span class="mod-value">$&<\/span>');
  const stripAnchors=(html: string)=> (html||'').replace(/<a[^>]*>([\s\S]*?)<\/a>/gi,'$1');
  function matchesTags(e: GlossEntry){ if(!selected.size) return true; const tags=e.__tags||[]; return [...selected].every(t=> tags.includes(t)); }

  function build(filter=''){
    listEl.innerHTML='';
    const f=(filter||'').toLowerCase().trim();
    const filtered = list.filter(k=>{ const name=(k.name||'').toLowerCase(); const plain=(k.description_plain||'').toLowerCase(); const matches = !f || name.includes(f) || plain.includes(f); return matches && matchesTags(k); });
    filtered.forEach(k=>{
      const card=document.createElement('div');
      card.style.background='var(--bg-card)'; card.style.border='1px solid var(--border-color)'; card.style.borderRadius='6px'; card.style.padding='8px'; card.style.display='flex'; card.style.flexDirection='column'; card.style.gap='6px';
      const title = `<div style='font-weight:700; font-size:16px; margin-bottom:4px;'>${k.name}</div>`;
      const descHtml = k.description_html ? highlight(stripAnchors(k.description_html)) : highlight(k.description_plain||'');
      const body = `<div style='font-size:12px; line-height:1.35;'>${descHtml}</div>`;
      card.innerHTML = title + body;
      listEl.appendChild(card);
    });
  }

  input.addEventListener('input',()=>build(input.value));
  clear.addEventListener('click',()=>{ input.value=''; build(''); input.focus();});
  renderTagFilters();
  build('');
}
