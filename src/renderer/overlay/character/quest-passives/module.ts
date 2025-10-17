// Quest Passives module extracted from overlay.html
// Provides show(), build(), render() wired to window.OverlayQuestPassives

type QpModel = { acts: Array<{ title:string; summary:string; steps:Array<{ id:string; text:string; notes?:string[]; tags?:string[] }> }>; tagSet: string[] };

function prepareCharacterPanel(label: string){
  const tabMod=document.getElementById('tabModifier')!;
  const craftingTab=document.getElementById('craftingTab')!;
  const itemsTab=document.getElementById('itemsTab')!;
  const charTab=document.getElementById('characterTab')!;
  tabMod.classList.remove('active');
  (craftingTab as any).style.background='var(--bg-tertiary)'; (craftingTab as any).style.color='var(--text-primary)';
  (itemsTab as any).style.background='var(--bg-tertiary)'; (itemsTab as any).style.color='var(--text-primary)';
  (charTab as any).style.background='var(--accent-blue)'; (charTab as any).style.color='#fff';
  const content = document.getElementById('content'); if (content) (content as any).style.display='none';
  const hist = document.getElementById('historyContainer'); if (hist) (hist as any).style.display='none';
  // Don't set inline display:none - let CSS handle visibility via body classes
  const mhi = document.getElementById('modifierHeaderInfo'); if (mhi) (mhi as any).style.display='none';
  const wi = document.getElementById('whittlingInfo'); if (wi) (wi as any).style.display='none';
  // Do not force show control panel; overlay shell manages it
  (window as any).OverlayAnnoints?.hide?.();
  document.body.classList.add('crafting-mode');
  let panel=document.getElementById('craftingPanel');
  if(!panel){
    panel=document.createElement('div');
    panel.id='craftingPanel'; panel.className='content'; (panel as any).style.padding='8px';
    const footer=document.getElementById('footer')!; footer.parentNode!.insertBefore(panel, footer);
  }
  (panel as any).style.display='';
  return panel as HTMLElement;
}

export function buildQuestPassivesData(): QpModel{
  const TAGS = ['Spirit','Resistance','Life','Gem','Passive Skill','Relic','Charm','Mana','Dexterity','Intelligence','Movement','Strength'];
  const t = (s:string)=>s;
  const acts: QpModel['acts'] = [];
  const add = (title:string, summary:string, steps:any)=> acts.push({title, summary, steps});
  add('Act 1', t('In Act 1, you acquire +4 passive skill points, +10% cold resistance, 30 spirit, and +20 maximum life.'), [
    { id:'a1-clearfell', text:'Clearfell - Kill Beira Of The Rotten Pack for +10 to cold resistance.', tags:['Resistance'] },
    { id:'a1-hunting', text:'Hunting Grounds - Kill Crowbell for +2 passive skill points.', tags:['Passive Skill'] },
    { id:'a1-freythorn', text:'Freythorn - Kill The King In The Mist for +30 spirit.', notes:['Summon him by completing Ritual encounters.','Drops a guaranteed Uncut Spirit Gem on 1st kill.'], tags:['Spirit','Gem','Ritual'] },
    { id:'a1-ogham-farmlands', text:"Ogham Farmlands - Find Una's Lute and deliver it to Una for +2 passive skill points.", tags:['Passive Skill','Quest'] },
    { id:'a1-ogham-village', text:'Ogham Village - Find Smithing Tools and deliver them to Renly to unlock the Salvaging Bench.', tags:['Quest'] },
    { id:'a1-manor', text:'Oghman Manor - Kill Candlemass, The Living Rite for +20 maximum life.', notes:['Wake him up by clicking on Psalm Of Madness.'], tags:['Life','Quest'] },
  ]);
  add('Act 2', t('In Act 2, you acquire +4 passive skill points, +10% lightning resistance and a special bonus of your choice.'), [
    { id:'a2-keth', text:'Keth - Kill Kabala, Constrictor Queen for +2 passive skill points.', tags:['Passive Skill'] },
    { id:'a2-kabala-relic', text:'The Bone Pits & Keth - Find Kabala and Sun Clan Relics needed for the Valley of The Titans.', tags:['Relic'] },
    { id:'a2-valley', text:'Valley Of The Titans - Deliver Kabala and Sun Clan Relics to the altar and choose one of the bonuses (swappable later).', notes:['30% increased Charm Charges gained, +1 increased Charm Slot.','30% increased Charm Effect Duration, +1 increased Charm Slot.'], tags:['Relic','Charm'] },
    { id:'a2-deshar', text:'Deshar - Find the Final Letter and deliver it to Shambrin for +2 passive skill points.', tags:['Passive Skill','Quest'] },
    { id:'a2-spires', text:'The Spires of Deshar - Find and click on the Sisters of Garukhan Shrine for +10% lightning resistance.', tags:['Resistance'] },
  ]);
  add('Act 3', t('In Act 3, you acquire +4 passive skill points, +10% fire resistance, 30 spirit, and a special bonus of your choice.'), [
    { id:'a3-sandswept', text:"Sandswept Marsh - Find Orok Campfire and click on the Basket to drop a guaranteed Lesser Jeweller's Orb.", tags:['Quest'] },
    { id:'a3-jungle', text:'Jungle Ruins - Kill Mighty Silverfist for +2 passive skill points.', tags:['Passive Skill'] },
    { id:'a3-bog', text:'The Azak Bog - Kill Ignagduk, The Bog Witch for +30 spirit.', notes:['Drops a guaranteed Uncut Spirit Gem on 1st kill.'], tags:['Spirit','Gem'] },
    { id:'a3-venom', text:'The Venom Crypts - Find the Venom Vial and deliver it to Servi. Choose one of three special bonuses (irreversible).', notes:['25% increased Stun Threshold.','30% increased Elemental Ailment Threshold.','25% increased Mana Regeneration Rate.'], tags:['Quest','Mana','Resistance'] },
    { id:'a3-machinarium', text:"Jiquani's Machinariumm - Kill Blackjaw, The Remnant for +10 fire resistance.", notes:['Deliver the Small Soul Core to one of the Stone Altars to open the entrance to the boss.'], tags:['Resistance','Quest'] },
    { id:'a3-vault', text:'The Molten Vault - Kill Mektul, The Forgemaster and talk to Oswald to unlock the Reforging Bench.', tags:['Quest'] },
    { id:'a3-aggorat', text:'Aggorat - Kill enemies until you drop Sacrificial Heart; sacrifice it at the altar for +2 passive skill points.', notes:['The Sacrificial Heart can also drop from enemies in Utzaal.'], tags:['Passive Skill','Quest'] },
  ]);
  add('Act 4', t('In Act 4, you acquire +4 passive skill points, +5% maximum mana, 3 choices between attributes and resistances, and a choice between Increased Mana or Life recovery from flasks.'), [
    { id:'a4-isle', text:'Isle Of Kin - Kill The Blind Beast for +2 passive skill points.', tags:['Passive Skill'] },
    { id:'a4-hinekora', text:'Eye of Hinekora - Pay your Respects at the Silent Hall for +5% maximum mana.', tags:['Mana'] },
    { id:'a4-halls', text:'Halls of the Dead - Complete 3 Trials to obtain 3 different Tattoos (irreversible choice on each).', notes:["Tawhoa's Test - +5 dexterity or +5 lightning resistance.","Tasalio's Test - +5 intelligence or +5 cold resistance.","Ngamahu's Test - +5 strength or +5 fire resistance."], tags:['Dexterity','Intelligence','Strength','Resistance'] },
    { id:'a4-ancestors', text:'Trial Of The Ancestors - Kill Yama The White and Speak to Hinekora for +2 passive skill points.', tags:['Passive Skill'] },
    { id:'a4-prison', text:'Abandoned Prison - Find Godess Of Justice and pick between one of the bonuses (swappable).', notes:['+30% Increased Mana recovery from flasks.','+30% Increased Life recovery from flasks.'], tags:['Flask','Life','Mana'] },
    { id:'a4-tip', text:'Tip: Killing the Great White One On the Whakapanu Island rewards you with the Shark Fin. Bring it to the Kaimana Rewards you with a choice between an Uncut Skill, Spirit or a Support Gem.', tags:['Gem','Spirit'] },
  ]);
  add('Interlude 1: The Curse Of Holten', t('Interlude Act 1 provides only 1 permanent bonus - +2 passive skill points.'), [
    { id:'i1-wolvenhold', text:'Wolvenhold - Kill Oswin, The Dread Warden for +2 passive skill points.', tags:['Passive Skill'] },
  ]);
  add('Interlude 2: The Stolen Barya', t('In Interlude Act 2 you acquire +2 passive skill points, +5% increased maximum life and a special bonus of your choice.'), [
    { id:'i2-clearing', text:'Complete the quest Clearing The Way by killing Akthi and Anundr and talking to Risu for +2 passive skill points.', tags:['Passive Skill','Quest'] },
    { id:'i2-khari', text:"The Khari Crossing - Enter the Skullmaw Stairway, find the Molten Shrine and use the Molten One's Gift for +5% increased maximum life.", tags:['Life','Quest'] },
    { id:'i2-qimah', text:'Qimah - Find The Seven Pillars and choose between 1 of the bonuses (swappable).', notes:['+5 to all Attributes','+5 to all Elemental Resistances','12% Increased Cooldown Recovery Rate','3% Increased Movement Speed','20% Increased Presence Area Of Effect','15% Increased Global Defences','5% Increased Experience Gain. WARNING: this bonus comes with a massive drawback of inverted value of all of the other bonuses, and -5% to all attributes instead of the +5!'], tags:['Movement','Attributes','Resistance','Defences'] },
  ]);
  add("Interlude 3: Doryani's Contingency", t("In Interlude Act 3 you acquire +4 passive skill points and +40 spirit."), [
    { id:'i3-kriar-village', text:'Kriar Village - Kill Lythara, The Wayward Spear for +40 Spirit. At this point you should have a total of 100 Spirit.', tags:['Spirit'] },
    { id:'i3-kriar-peaks', text:'Kriar Peaks - Find and talk to the Elder Madox for a free Unique Item. WARNING: you can choose only 1 of the presented items!', tags:['Unique','Warning'] },
    { id:'i3-howling', text:'Howling Caves - Kill The Abominable Yeti for +2 passive skill points.', tags:['Passive Skill'] },
    { id:'i3-kingsmarch', text:'Talk to The Hooded One in Kingsmarch after finishing the Interlude Acts to complete the quest Siege Of Oriath. This rewards you with +2 passive skill points.', tags:['Passive Skill','Quest'] },
  ]);
  return { acts, tagSet: TAGS };
}

export async function show(){
  (window as any).__lastPanel='quest_passives';
  const panel = prepareCharacterPanel('Quest Passives');
  try{
    // Don't set inline display:none - let CSS handle visibility via body classes
    const mhi=document.getElementById('modifierHeaderInfo'); if(mhi){ (mhi as any).style.display='none'; }
  }catch{}
  panel.innerHTML = '<div class="no-mods">Loading...</div>';
  const model = buildQuestPassivesData();
  render(model);
}

export function render(model: QpModel){
  const panel = document.getElementById('craftingPanel'); if(!panel) return;
  const storageKey='qp:checked:v1';
  const saved = JSON.parse(localStorage.getItem(storageKey)||'{}');
  const collapsedKey='qp:collapsed:v1';
  const collapsed = JSON.parse(localStorage.getItem(collapsedKey)||'{}');
  panel.innerHTML = `
    <div class='page-inner'>
      <div class='qp-topbar'>
        <input id='qpSearch' class='qp-search' placeholder='Search steps...'>
        <div style='background:var(--bg-secondary); padding:8px; border-radius:6px; margin-bottom:8px; width:100%;'>
          <div id='qpTagFilters' style='display:flex; flex-wrap:wrap; gap:6px; justify-content:center; width:100%;'></div>
        </div>
      </div>
      <div id='qpSections' style='display:flex; flex-direction:column; gap:12px;'></div>
    </div>`;
  const searchEl = panel.querySelector('#qpSearch') as HTMLInputElement | null;
  const tagWrap = panel.querySelector('#qpTagFilters') as HTMLElement | null;
  const container = panel.querySelector('#qpSections') as HTMLElement | null;
  const selectedTags = new Set<string>();
  const colorClass = (tag:string)=>{
    const m = tag.toLowerCase();
    if(m==='life') return 'life';
    if(m==='mana') return 'mana';
    if(m==='resistance') return 'resistance';
    if(m==='spirit') return 'spirit';
    if(m==='gem') return 'gem';
    if(m==='passive skill') return 'passive';
    if(m==='relic') return 'relic';
    if(m==='charm') return 'charm';
    if(m==='flask') return 'flask';
    if(m==='dexterity') return 'dexterity';
    if(m==='intelligence') return 'intelligence';
    if(m==='movement') return 'movement';
    if(m==='strength') return 'strength';
    return '';
  };
  function recomputeCounts(){
    const counts: Record<string, number> = Object.fromEntries(model.tagSet.map(t=>[t,0]));
    for(const act of model.acts){
      for(const step of act.steps){
        const tags = (step.tags||[]);
        model.tagSet.forEach(t=>{ if(tags.map(x=>x.toLowerCase()).includes(t.toLowerCase())) counts[t]++; });
      }
    }
    return counts;
  }
  function renderTagFilters(){
    if(!tagWrap) return; tagWrap.innerHTML='';
    const counts = recomputeCounts();
    model.tagSet.forEach(tag=>{
      const btn=document.createElement('button');
      btn.className='qp-chip';
      const isActive=selectedTags.has(tag);
      if(isActive) btn.classList.add('active');
      const count = counts[tag]||0;
      btn.textContent = count ? `${tag} (${count})` : tag;
      btn.addEventListener('click', ()=>{ isActive?selectedTags.delete(tag):selectedTags.add(tag); build(searchEl?.value||''); renderTagFilters(); });
      tagWrap.appendChild(btn);
    });
    if(selectedTags.size){
      const reset=document.createElement('button');
      reset.className='qp-chip';
      (reset as any).style.background='var(--accent-red)'; (reset as any).style.borderColor='var(--accent-red)'; (reset as any).style.color='#fff';
      reset.textContent='×'; reset.title='Clear filters';
      reset.addEventListener('click',()=>{ selectedTags.clear(); build(searchEl?.value||''); renderTagFilters(); });
      tagWrap.appendChild(reset);
    }
  }
  function stepMatches(step:any, filter:string){
    const f=(filter||'').toLowerCase().trim();
    const text = (step.text||'').toLowerCase();
    const notesText = (step.notes||[]).join(' ').toLowerCase();
    const matchSearch = !f || text.includes(f) || notesText.includes(f);
    const tagsLc = (step.tags||[]).map((x:string)=>x.toLowerCase());
    const matchTags = !selectedTags.size || [...selectedTags].every((t:string)=> tagsLc.includes(t.toLowerCase()));
    return matchSearch && matchTags;
  }
  function highlight(s:string){
    return String(s)
      .replace(/(\+\d+\b|\d+%|\b\d+\b)/g,'<span class="mod-value">$1</span>')
      .replace(/(WARNING:)/g,'<span style="color:#f0c674; font-weight:700;">$1</span>')
      .replace(/(Tip:)/g,'<span style="color:#9ad27f; font-weight:700;">$1</span>');
  }
  function build(filter=''){
    if(!container) return; container.innerHTML='';
    for(const act of model.acts){
      const steps = act.steps.filter(s=> stepMatches(s, filter));
      if(!steps.length) continue;
      const sec = document.createElement('div'); sec.className='qp-section';
      const isCollapsed = !!(collapsed as any)[act.title];
      sec.innerHTML = `
        <div class='qp-title'>
          <h3 style='display:flex; align-items:center; gap:8px; margin:0;'>
            <span class='collapse-arrow' style='cursor:pointer; user-select:none;'>${isCollapsed?'►':'▼'}</span>
            ${act.title}
          </h3>
          <div class='qp-summary'>${highlight(act.summary)}</div>
        </div>
        <div class='qp-list' style='${isCollapsed?'display:none;':''}'></div>`;
      const list = sec.querySelector('.qp-list')! as HTMLElement;
      steps.forEach((step:any)=>{
        const row=document.createElement('div'); row.className='qp-item';
        if((saved as any)[step.id]) row.classList.add('checked');
        row.innerHTML = `
          <input type='checkbox' class='qp-check' ${((saved as any)[step.id])?'checked':''} />
          <div class='qp-body'>
            <div class='qp-line'>${highlight(step.text)}</div>
            ${(step.notes&&step.notes.length)? step.notes.map((n:string)=>`<div class='qp-note'>• ${highlight(n)}</div>`).join('') : ''}
            ${(step.tags&&step.tags.length)? `<div class='qp-tags'>${step.tags.map((t:string)=>`<span class='qp-tag ${colorClass(t)}'>${t}</span>`).join('')}</div>`: ''}
          </div>`;
        const cb = row.querySelector('.qp-check') as HTMLInputElement; 
        cb.addEventListener('change',()=>{
          (saved as any)[step.id] = !!cb.checked;
          localStorage.setItem(storageKey, JSON.stringify(saved));
          row.classList.toggle('checked', !!cb.checked);
        });
        list.appendChild(row);
      });
      const arrow = sec.querySelector('.collapse-arrow')! as HTMLElement;
      const listEl = sec.querySelector('.qp-list')! as HTMLElement;
      arrow.addEventListener('click',()=>{
        const now = listEl.style.display==='none' ? '' : 'none';
        listEl.style.display = now;
        arrow.textContent = now==='none' ? '►' : '▼';
        (collapsed as any)[act.title] = now==='none';
        localStorage.setItem(collapsedKey, JSON.stringify(collapsed));
      });
      container.appendChild(sec);
    }
    setTimeout(()=>{ const el=document.getElementById('craftingPanel'); if(el) (el as any).scrollTop=0; }, 10);
  }
  searchEl?.addEventListener('input',()=>build(searchEl.value));
  build('');
  renderTagFilters();
}
