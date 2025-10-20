// Regex tool module
// Provides UI + logic to build PoE style regex based on selected mods
import { GLOBALS, MODS, RegexAtomGroup } from './data';

interface State {
  panelEl: HTMLElement | null;
  include: Set<number>; // indices of MODS included (selection order matters for site-style regex)
  exclude: Set<number>; // indices explicitly excluded
  selectionOrder: number[]; // order mods were first included (preserves ordering like site)
  search: string;
  corrupted: boolean | null;
  waystoneChance: number | null; // minimum waystone %
  deliriousPct: number | null;   // minimum delirium %
  packsCount: number | null;
  baseRarityPct: number | null;
  basePackSizePct: number | null;
  baseMagicPct: number | null;
  baseRarePct: number | null;
  saved: Record<string,string>;
  tagFilters: Set<string>;
}

const LS_KEY = 'regexToolSaved';

const state: State = {
  panelEl: null,
  include: new Set<number>(),
  exclude: new Set<number>(),
  search: '',
  selectionOrder: [],
  corrupted: null,
  waystoneChance: null,
  deliriousPct: null,
  packsCount: null,
  baseRarityPct: null,
  basePackSizePct: null,
  baseMagicPct: null,
  baseRarePct: null,
  saved: loadSavedMap(),
  tagFilters: new Set<string>()
};

function loadSavedMap(): Record<string,string> {
  try { return JSON.parse(localStorage.getItem(LS_KEY)||'{}') || {}; } catch { return {}; }
}
function persistSaved(){ try { localStorage.setItem(LS_KEY, JSON.stringify(state.saved)); } catch {} }

function ensurePanel(): HTMLElement {
  if (state.panelEl && document.body.contains(state.panelEl)) return state.panelEl;
  const existing = document.getElementById('craftingPanel') as HTMLElement | null;
  if (existing) { state.panelEl = existing; return existing; }
  const el = document.createElement('div');
  el.id = 'craftingPanel';
  el.className = 'content';
  const footer = document.getElementById('footer');
  if (footer && footer.parentNode) footer.parentNode.insertBefore(el, footer);
  state.panelEl = el;
  return el;
}

// Hardcoded fragments: first 27 are include fragments; last 18 (for remaining mods) are exclude-only
const FRAG_INCLUDE: string[] = [
  // 0 - 26 (original include fragments)
  'rses','ign','fire$','eble','mage$','fe$','oure','sts','f br','yt','un m','ds','agu','ans','ndea','aa','chi','cke','e eva','ra ch','col','tn','f m','r,','cc','kn','emp',
  // 27 - 44 (previously exclude-only, now also available for inclusion)
  'tta','% ma','blee','lm','un b','eq','tak','mod','r el','tes','oj','ois','bon','ect$','mm','sk','wn','f l'
];
// Exclude fragments map 1:1 by mod index; keep identical where we only had one fragment
const FRAG_EXCLUDE: string[] = [
  // 0-26: no special exclude fragment distinct from include (leave blank to fallback to include when excluding)
  '','','','','','','','','','','','','','','','','','','','','','','','','','','',
  // 27-44 dedicated (same strings retained)
  'tta','% ma','blee','lm','un b','eq','tak','mod','r el','tes','oj','ois','bon','ect$','mm','sk','wn','f l'
];

function getIncludeFragment(i: number): string { return FRAG_INCLUDE[i] || ''; }
function getExcludeFragment(i: number): string { return FRAG_EXCLUDE[i] || ''; }

function buildIncludeExclude(): { include: string; exclude: string } {
  const incSeen = new Set<string>();
  const excSeen = new Set<string>();
  const includeTokens: string[] = [];
  const excludeTokens: string[] = [];

  // Build includes in selection order
  state.selectionOrder.forEach(idx => {
    if (!state.include.has(idx)) return;
    const frag = getIncludeFragment(idx);
    if (!frag || incSeen.has(frag)) return;
    incSeen.add(frag);
    includeTokens.push(frag);
  });
  // Build excludes
  state.selectionOrder.forEach(idx => {
    if (!state.exclude.has(idx)) return;
    let frag = getExcludeFragment(idx);
    if (!frag) frag = getIncludeFragment(idx); // fallback to include fragment if no dedicated exclude fragment
    if (!frag || excSeen.has(frag)) return;
    excSeen.add(frag);
    excludeTokens.push(frag);
  });
  // Any excluded mods never included previously
  [...state.exclude].forEach(idx => {
    if (state.selectionOrder.includes(idx)) return;
    let frag = getExcludeFragment(idx);
    if (!frag) frag = getIncludeFragment(idx);
    if (!frag || excSeen.has(frag)) return;
    excSeen.add(frag);
    excludeTokens.push(frag);
  });
  return {
    include: '"' + includeTokens.join('|') + '"',
    exclude: excludeTokens.length ? '"!' + excludeTokens.join('|') + '"' : ''
  };
}

// Simple >= min range pattern (optimized for 0-99 range actually used here)
function numRangePattern(min: number): string {
  if (min <= 0) return '\\d+'; // everything
  if (min < 10) return `[${min}-9]\\d?`; // 5 -> 5-9 OR 50-59 etc (good enough for our domain)
  if (min >= 100) return `${min}|[1-9]\\d{2,}`; // coarse fallback if ever needed
  const tens = Math.floor(min/10);
  const ones = min % 10;
  if (ones === 0) {
    // 40 -> [4-9]\\d  (40-99)
    return `[${tens}-9]\\d`;
  }
  if (tens === 9) {
    // 95 -> 95-99
    return `9[${ones}-9]`;
  }
  // 27 -> 27|2[8-9]|[3-9]\\d  (keep short: 2[7-9]|[3-9]\\d)
  return `${tens}[${ones}-9]|[${tens+1}-9]\\d`;
}

function buildMinTokens(): { includeTokens: string[]; excludeTokens: string[] } {
  const includeTokens: string[] = [];
  const excludeTokens: string[] = [];

  function push(shortLabel: string, min: number | null){
    if (min === null) return;
    const pat = numRangePattern(min);
    // parentheses only if pattern contains |
    const grouped = pat.includes('|') ? `(${pat})` : pat;
    includeTokens.push(`${shortLabel}\\+${grouped}%`);
  }

  // Shortest unique patterns that avoid collisions
  push('item rar.*', state.baseRarityPct);        // "item rar" vs "rare monsters" - unique enough
  push('pack siz.*', state.basePackSizePct);      // "pack siz" is unique to Monster Pack Size
  push('magic mon.*', state.baseMagicPct);        // "magic mon" vs other magic references
  push('rare mon.*', state.baseRarePct);          // "rare mon" vs "item rarity" - unique
  push('waystone.*', state.waystoneChance);       // "waystone" should be unique enough
  
  // Delirium (must be more specific to avoid false matches with random percentages)
  if (state.deliriousPct !== null) {
    const pat = numRangePattern(state.deliriousPct);
    const grouped = pat.includes('|') ? `(${pat})` : pat;
    includeTokens.push(`players.*area.*${grouped}%.*delirious`);
  }
  
  // Corruption
  if (state.corrupted === true) includeTokens.push('curr');
  else if (state.corrupted === false) excludeTokens.push('curr');

  return { includeTokens, excludeTokens };
}

function dedupe(arr: string[]): string[]{
  return Array.from(new Set(arr.filter(Boolean)));
}

function render(): void {
  const panel = ensurePanel();
  panel.style.display='';
  if (!panel.dataset.regexPrevOverflow) {
    panel.dataset.regexPrevOverflow = panel.style.overflow || '';
  }
  panel.style.overflow = 'hidden';
  panel.classList.add('regex-mode');
    panel.innerHTML = `
      <div id='regexToolRoot' class='regex-tool-root'>
        <div class='poe2-main-layout'>
          <div class='poe2-left-panel'>
            <div class='poe2-save-controls'>
              <input id='saveName' class='poe2-save-input' type='text' placeholder='Preset name...' />
              <button id='saveBtn' class='poe2-save-btn' title='Save preset'>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                  <polyline points="17 21 17 13 7 13 7 21"></polyline>
                  <polyline points="7 3 7 8 15 8"></polyline>
                </svg>
              </button>
              <select id='savedRegex' class='poe2-load-select'>
                <option value=''>Load preset...</option>
                ${Object.keys(state.saved).map(k=>`<option value='${k}'>${k}</option>`).join('')}
              </select>
              <button id='delSavedBtn' class='poe2-save-btn poe2-delete-btn' title='Delete preset'>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>
            </div>

            <div class='poe2-filter-section'>
              <div class='poe2-section-title'>Tag Filters</div>
              <div id='regexChips' class='poe2-chips'>
                ${renderChip('rarity','Rarity')}
                ${renderChip('pack','Pack Size')}
                ${renderChip('rare','Rare Monsters')}
                ${renderChip('mod','Additional Modifier')}
              </div>
            </div>

            <div class='poe2-filter-section'>
              <div class='poe2-section-title'>Waystone Filters</div>
              <div class='poe2-filter-grid'>
                <label class='poe2-filter-label'>Waystone %</label>
                <select id='waystonePct' class='poe2-filter-input' style='width:100px;'>
                  <option value=''>--</option>
                  ${[100,200,300,400,500,600,700,800].map(v=>`<option value='${v}' ${state.waystoneChance===v?"selected":""}>${v}%+</option>`).join('')}
                </select>
                <label class='poe2-filter-label'>Delir %</label>
                <input id='delirPct' type='number' value='${state.deliriousPct??''}' placeholder='N' class='poe2-filter-input' style='width:100px;'>
              </div>
            </div>

            <div class='poe2-filter-section'>
              <div class='poe2-section-title'>Base Stats</div>
              <div class='poe2-filter-grid'>
                <label class='poe2-filter-label'>Rarity %</label>
                <input id='baseRarity' type='number' value='${state.baseRarityPct??''}' placeholder='—' class='poe2-filter-input'>
                <label class='poe2-filter-label'>Pack %</label>
                <input id='basePack' type='number' value='${state.basePackSizePct??''}' placeholder='—' class='poe2-filter-input'>
                <label class='poe2-filter-label'>Magic %</label>
                <input id='baseMagic' type='number' value='${state.baseMagicPct??''}' placeholder='—' class='poe2-filter-input'>
                <label class='poe2-filter-label'>Rare %</label>
                <input id='baseRare' type='number' value='${state.baseRarePct??''}' placeholder='—' class='poe2-filter-input'>
                <label class='poe2-filter-label'>Corruption</label>
                <select id='corrFilter' class='poe2-filter-input'>
                  <option value=''>Any</option>
                  <option value='corrupted' ${state.corrupted===true?'selected':''}>Corrupted</option>
                  <option value='uncorrupted' ${state.corrupted===false?'selected':''}>Uncorrupted</option>
                </select>
              </div>
            </div>
          </div>

          <div class='poe2-right-panel'>
            <div class='poe2-search-bar'>
              <input id='regexSearch' type='text' placeholder='Search mods...' class='poe2-regex-input'>
            </div>
            <div id='regexMods' class='poe2-regex-list'></div>
            <div class='poe2-regex-footer'>
              <div id='regexCharCount' class='regex-count'>Regex (0/50 chars)</div>
              <div class='poe2-regex-actions'>
                <button id='copyRegex' class='regex-btn'>Copy</button>
                <button id='regexReset' class='regex-btn regex-btn-danger'>Reset</button>
              </div>
            </div>
            <input id='regexOutput' type='text' readonly class='poe2-regex-output' />
          </div>
        </div>
      </div>`;

  (panel.querySelector('#waystonePct') as HTMLSelectElement)?.addEventListener('change', e => { const v=(e.target as HTMLSelectElement).value; state.waystoneChance = v?parseInt(v):null; updateOutput(); });
  (panel.querySelector('#delirPct') as HTMLInputElement)?.addEventListener('input', e => { const v=(e.target as HTMLInputElement).value; state.deliriousPct = v?parseInt(v):null; updateOutput(); });
  (panel.querySelector('#baseRarity') as HTMLInputElement)?.addEventListener('input', e => { const v=(e.target as HTMLInputElement).value; state.baseRarityPct = v?parseInt(v):null; updateOutput(); });
  (panel.querySelector('#basePack') as HTMLInputElement)?.addEventListener('input', e => { const v=(e.target as HTMLInputElement).value; state.basePackSizePct = v?parseInt(v):null; updateOutput(); });
  (panel.querySelector('#baseMagic') as HTMLInputElement)?.addEventListener('input', e => { const v=(e.target as HTMLInputElement).value; state.baseMagicPct = v?parseInt(v):null; updateOutput(); });
  (panel.querySelector('#baseRare') as HTMLInputElement)?.addEventListener('input', e => { const v=(e.target as HTMLInputElement).value; state.baseRarePct = v?parseInt(v):null; updateOutput(); });
  // packs filter removed
  (panel.querySelector('#corrFilter') as HTMLSelectElement)?.addEventListener('change', e => { const v=(e.target as HTMLSelectElement).value; state.corrupted = v==='corrupted'?true: v==='uncorrupted'?false:null; updateOutput(); });
  (panel.querySelector('#regexReset') as HTMLButtonElement)?.addEventListener('click', () => { fullReset(); render(); });
  (panel.querySelector('#saveBtn') as HTMLButtonElement)?.addEventListener('click', () => { const name=(panel.querySelector('#saveName') as HTMLInputElement).value.trim(); if(!name) return; const regexEl=panel.querySelector('#regexOutput') as HTMLInputElement; if(regexEl) state.saved[name]=regexEl.value; persistSaved(); render(); });
  (panel.querySelector('#delSavedBtn') as HTMLButtonElement)?.addEventListener('click', () => {
    const sel = panel.querySelector('#savedRegex') as HTMLSelectElement; if(!sel) return;
    const key = sel.value; if(!key) return;
    if(!state.saved[key]) return;
    delete state.saved[key];
    persistSaved();
    render();
  });
  (panel.querySelector('#savedRegex') as HTMLSelectElement)?.addEventListener('change', e => {
    const name=(e.target as HTMLSelectElement).value; if (!name) return; const val = state.saved[name]; if(!val) return;
    (panel.querySelector('#regexOutput') as HTMLInputElement).value = val;
  });
  (panel.querySelector('#copyRegex') as HTMLButtonElement)?.addEventListener('click', () => { const out=panel.querySelector('#regexOutput') as HTMLInputElement; out.select(); document.execCommand('copy'); });
  const searchInput = panel.querySelector('#regexSearch') as HTMLInputElement; searchInput?.addEventListener('input', () => { state.search = searchInput.value.toLowerCase(); drawMods(); });
  // Chip handlers
  panel.querySelectorAll('.regex-chip').forEach(ch => {
    ch.addEventListener('click', () => {
      const key = (ch as HTMLElement).dataset.key!;
      if (state.tagFilters.has(key)) state.tagFilters.delete(key); else state.tagFilters.add(key);
      renderChips();
      updateOutput();
    });
  });
  drawMods();
  scheduleRegexHeightRecalc(panel);
  updateOutput();
}

let regexResizeObserver: ResizeObserver | null = null;
function scheduleRegexHeightRecalc(panel: HTMLElement){
  requestAnimationFrame(()=>recalcRegexModsHeight(panel));
  if (!regexResizeObserver){
    try {
      regexResizeObserver = new ResizeObserver(()=>recalcRegexModsHeight(panel));
      regexResizeObserver.observe(panel);
      window.addEventListener('resize', () => recalcRegexModsHeight(panel));
    } catch {}
  }
}

function recalcRegexModsHeight(panel: HTMLElement){
  try {
    const mods = panel.querySelector('#regexMods') as HTMLElement | null;
    if (!mods) return;
    const bottom = panel.querySelector('.regex-bottom-results') as HTMLElement | null;
    const panelRect = panel.getBoundingClientRect();
    const modsRect = mods.getBoundingClientRect();
    const bottomH = bottom ? bottom.getBoundingClientRect().height : 0;
    const paddingBottom = parseFloat(getComputedStyle(panel).paddingBottom || '0');
    const headerSpace = Math.max(0, modsRect.top - panelRect.top);
    const available = panelRect.height - headerSpace - bottomH - paddingBottom - 4;
    const target = Math.max(180, available);
    mods.style.flex = '1 1 auto';
    mods.style.minHeight = '180px';
    mods.style.maxHeight = target + 'px';
    mods.style.height = target + 'px';
    mods.style.overflowY = 'auto';
  } catch {}
}

function renderChips(){
  const wrap = document.getElementById('regexChips'); if(!wrap) return;
  const existingChip = wrap.querySelector('.regex-chip') as HTMLElement | null;
  const currentSize = existingChip ? getComputedStyle(existingChip).fontSize : '';
  wrap.innerHTML = ['rarity','pack','rare','mod'].map(k=>renderChip(k, chipLabel(k))).join('');
  if (currentSize) {
    wrap.querySelectorAll('.regex-chip').forEach(el => { (el as HTMLElement).style.fontSize = currentSize; });
  }
  wrap.querySelectorAll('.regex-chip').forEach(ch => {
    ch.addEventListener('click', () => {
      const key = (ch as HTMLElement).dataset.key!;
      if (state.tagFilters.has(key)) state.tagFilters.delete(key); else state.tagFilters.add(key);
      renderChips();
      drawMods();
    });
  });
}

function chipLabel(k:string){
  switch(k){
    case 'rarity': return 'Rarity';
    case 'pack': return 'Pack Size';
    case 'rare': return 'Rare Monsters';
    case 'mod': return 'Additional Modifier';
  }
  return k;
}

function renderChip(key: string, label: string){
  const active = state.tagFilters.has(key);
  return `<div class='regex-chip' data-key='${key}' style='padding:3px 8px; border:1px solid ${active?'var(--accent-blue)':'var(--border-color)'}; background:${active?'var(--accent-blue)':'var(--bg-secondary)'}; color:${active?'#fff':'var(--text-primary)'}; border-radius:12px; cursor:pointer; user-select:none;'>${label}</div>`;
}

function drawMods(){
  const list = document.getElementById('regexMods'); if (!list) return;
  const q = state.search;
  const allRows = MODS.map((m, idx) => ({...m, idx, stem: getIncludeFragment(idx)}))
    .filter(m => !q || m.label.toLowerCase().includes(q))
    .filter(m => filterByChips(m));
  
  // Separate selected and unselected mods
  const selectedMods = allRows.filter(m => state.include.has(m.idx) || state.exclude.has(m.idx));
  const unselectedMods = allRows.filter(m => !state.include.has(m.idx) && !state.exclude.has(m.idx));
  
  let html = '';
  
  // Render selected mods section if there are any
  if (selectedMods.length > 0) {
    html += `<div class='poe2-selected-header'>Selected Mods (${selectedMods.length})</div>`;
    html += selectedMods.map(m => {
      const inc = state.include.has(m.idx);
      const exc = state.exclude.has(m.idx);
      let border = 'var(--border-color)';
      let bg = 'var(--bg-secondary)';
      if (inc){ border='var(--accent-blue)'; bg='rgba(0,128,255,0.25)'; }
      if (exc){ border='var(--accent-red)'; bg='rgba(255,0,0,0.25)'; }
      return `<div class='regex-mod' data-idx='${m.idx}' style='padding:4px 6px; border:1px solid ${border}; background:${bg}; border-radius:4px; cursor:pointer; font-size:11px; line-height:1.25; user-select:none;'>
        <div>${m.label}</div>
        <div style='font-size:10px; opacity:.7; margin-top:2px;'>${m.stem}</div>
      </div>`;
    }).join('');
    
    // Add separator
    html += `<div class='poe2-mods-separator'></div>`;
  }
  
  // Render unselected mods
  html += unselectedMods.map(m => {
    const border = 'var(--border-color)';
    const bg = 'var(--bg-secondary)';
    return `<div class='regex-mod' data-idx='${m.idx}' style='padding:4px 6px; border:1px solid ${border}; background:${bg}; border-radius:4px; cursor:pointer; font-size:11px; line-height:1.25; user-select:none;'>
      <div>${m.label}</div>
      <div style='font-size:10px; opacity:.7; margin-top:2px;'>${m.stem}</div>
    </div>`;
  }).join('');
  
  list.innerHTML = html;
  
  list.querySelectorAll('.regex-mod').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt((el as HTMLElement).dataset.idx||'0');
      if (!state.include.has(idx) && !state.exclude.has(idx)) {
        state.include.add(idx); // none -> include
        if (!state.selectionOrder.includes(idx)) state.selectionOrder.push(idx);
      } else if (state.include.has(idx)) {
        state.include.delete(idx); state.exclude.add(idx); // include -> exclude
      } else { // exclude -> none
        state.exclude.delete(idx);
      }
      updateOutput(); drawMods();
    });
  });
}

function filterByChips(m: any): boolean {
  if (state.tagFilters.size===0) return true;
  const txt = m.label.toLowerCase();
  for (const key of state.tagFilters){
    if (key==='rarity' && /rarity of items/.test(txt)) return true;
    if (key==='pack' && /pack size/.test(txt)) return true;
    if (key==='rare' && /rare monsters/.test(txt)) return true;
    if (key==='mod' && /additional modifier/.test(txt)) return true;
  }
  return false;
}

function updateOutput(){
  const { include, exclude } = buildIncludeExclude(); // existing mod fragments only
  const regexEl = document.getElementById('regexOutput') as HTMLInputElement | null;
  const countEl = document.getElementById('regexCharCount') as HTMLElement | null;
  const base = buildMinTokens();
  
  if (regexEl) {
    // Build AND logic using separate quoted strings: "token1" "token2" "token3"
    const innerMods = include.slice(1, -1); // remove quotes from existing
    const modTokens = innerMods ? innerMods.split('|').filter(Boolean) : [];
    const allIncludeTokens = [...modTokens, ...base.includeTokens].filter(s=>s && s.length);
    
    const includeParts = allIncludeTokens.map(token => `"${token}"`);
    
    // Add exclude parts with ! prefix: "!token1" "!token2"
    const existing = exclude ? exclude.replace(/^"!|"$/g,'') : '';
    const excludeTokens = existing ? existing.split('|').filter(Boolean) : [];
    const combinedExc = [...excludeTokens, ...base.excludeTokens].filter(Boolean);
    const excludeParts = combinedExc.map(token => `"!${token}"`);
    
    // Combine all parts with spaces
    const allParts = [...includeParts, ...excludeParts];
    const finalRegex = allParts.join(' ');
    
    regexEl.value = finalRegex || '""';
    
    // Update character count
    if (countEl) {
      const charCount = finalRegex.length;
      const color = charCount > 50 ? '#ff4444' : charCount > 40 ? '#ffaa00' : '#44ff44';
      countEl.innerHTML = `Regex (<span style='color:${color}'>${charCount}/50</span> chars)`;
    }
  }
}

function escapeBaseFragment(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
}

// Inject minimal styling for dark mode specific to regex tool
(function ensureRegexStyles(){
  const id = 'regex-tool-styles';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
  /* Base container styles */
  #regexToolRoot { display:flex; flex-direction:column; height:100%; flex:1 1 auto; min-height:600px; min-width:800px; width:100%; }
  .regex-tool-root { display:flex; flex-direction:column; height:100%; min-width:800px; width:100%; }
  
  /* Main grid layout - side by side */
  .poe2-main-layout { display:grid; grid-template-columns:320px minmax(480px, 1fr); gap:12px; height:100%; overflow:hidden; width:100%; }
  .poe2-left-panel { display:flex; flex-direction:column; gap:8px; overflow-y:auto; padding-right:4px; min-width:320px; }
  .poe2-right-panel { display:flex; flex-direction:column; gap:8px; overflow:hidden; min-width:480px; }
  
  /* Save/Load controls */
  .poe2-save-controls { display:grid; grid-template-columns:1fr auto 1fr auto; gap:6px; align-items:center; padding:8px; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-tertiary); }
  .poe2-save-input { padding:4px 6px; font-size:11px; border:1px solid var(--border-color); border-radius:4px; background:var(--bg-secondary); color:var(--text-primary); min-width:0; }
  .poe2-load-select { padding:4px 6px; font-size:11px; border:1px solid var(--border-color); border-radius:4px; background:var(--bg-secondary); color:var(--text-primary); cursor:pointer; min-width:0; }
  .poe2-save-btn { padding:6px 8px; font-size:11px; border-radius:4px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); cursor:pointer; display:flex; align-items:center; justify-content:center; }
  .poe2-save-btn svg { display:block; }
  .poe2-save-btn:hover { background:var(--accent-blue); border-color:var(--accent-blue); color:#fff; }
  .poe2-delete-btn:hover { background:var(--accent-red); border-color:var(--accent-red); color:#fff; }
  
  /* Filter sections */
  .poe2-filter-section { display:flex; flex-direction:column; gap:6px; border:1px solid var(--border-color); border-radius:6px; padding:8px; background:var(--bg-tertiary); }
  .poe2-section-title { font-size:12px; font-weight:600; color:var(--text-primary); margin-bottom:4px; }
  .poe2-chips { display:flex; gap:6px; flex-wrap:wrap; }
  .regex-chip { padding:3px 8px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); border-radius:12px; cursor:pointer; user-select:none; transition:background .15s,border-color .15s; font-size:11px; line-height:1; }
  
  /* Filter grid for inputs */
  .poe2-filter-grid { display:grid; grid-template-columns:auto 1fr; gap:6px 8px; align-items:center; }
  .poe2-filter-label { font-size:11px; color:var(--text-primary); }
  .poe2-filter-input { padding:4px 6px; font-size:11px; border:1px solid var(--border-color); border-radius:4px; background:var(--bg-secondary); color:var(--text-primary); width:100%; }
  
  /* Right panel - search and mods list */
  .poe2-search-bar { display:flex; gap:8px; align-items:center; padding:8px; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-tertiary); }
  .poe2-regex-input { flex:1; padding:6px 8px; font-size:12px; border:1px solid var(--border-color); border-radius:4px; background:var(--bg-secondary); color:var(--text-primary); min-width:0; }
  .poe2-regex-input::placeholder { color:var(--text-secondary); opacity:0.6; }
  
  /* Mods list */
  .poe2-regex-list { flex:1; overflow-y:auto; border:1px solid var(--border-color); border-radius:6px; padding:6px; background:var(--bg-tertiary); min-height:0; }
  .poe2-selected-header { font-size:12px; font-weight:600; color:var(--text-primary); padding:8px 6px 6px 6px; margin-bottom:4px; border-bottom:1px solid var(--border-color); }
  .poe2-mods-separator { height:1px; background:var(--border-color); margin:12px 0; }
  .regex-mod { padding:4px 6px; border:1px solid var(--border-color); background:var(--bg-secondary); border-radius:4px; cursor:pointer; font-size:11px; line-height:1.25; user-select:none; margin-bottom:6px; }
  .regex-mod:hover { filter:brightness(1.15); }
  
  /* Footer with regex output */
  .poe2-regex-footer { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-tertiary); }
  .poe2-regex-actions { display:flex; gap:6px; }
  .regex-count { font-size:10px; color:var(--text-secondary); }
  .regex-btn { padding:4px 10px; font-size:11px; border-radius:4px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); cursor:pointer; }
  .regex-btn:hover { background:var(--accent-blue); border-color:var(--accent-blue); color:#fff; }
  .regex-btn.regex-btn-danger { border-color:var(--accent-red); color:var(--accent-red); }
  .regex-btn.regex-btn-danger:hover { background:var(--accent-red); border-color:var(--accent-red); color:#fff; }
  .poe2-regex-output { width:100%; padding:6px 8px; font-size:11px; border:1px solid var(--border-color); border-radius:4px; background:var(--bg-secondary); color:var(--accent-blue); font-family:monospace; }
  
  /* Legacy compatibility */
  .regex-input { background: var(--bg-secondary); border:1px solid var(--border-color); color: var(--text-primary); border-radius:6px; padding:6px 8px; font-size:11px; }
  .regex-input:focus { outline:1px solid var(--accent-blue); }
  .regex-output { background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--accent-blue); border-radius:8px; padding:10px 12px; font-size:11px; font-family:monospace; width:100%; }
  .regex-copy-btn { background: var(--accent-blue); color:#fff; border:1px solid var(--accent-blue); padding:6px 14px; border-radius:18px; cursor:pointer; font-size:11px; line-height:1; font-weight:500; letter-spacing:.3px; }
  .regex-copy-btn:hover { filter:brightness(1.2); }
  
  /* Panel mode adjustments */
  #craftingPanel.regex-mode { display:flex !important; flex-direction:column; overflow:hidden; }
  #craftingPanel.regex-mode > #regexToolRoot { flex:1 1 auto; display:flex; flex-direction:column; min-height:0; }
  `;
  document.head.appendChild(style);
})();

export async function show(): Promise<void> {
  const panel = ensurePanel();
  panel.innerHTML = '<div style="padding:20px; text-align:center; font-size:12px;">Loading Regex Tool...</div>';
  render();
}

export function reset(){ state.include.clear(); state.exclude.clear(); state.selectionOrder=[]; state.waystoneChance=null; state.deliriousPct=null; state.packsCount=null; state.corrupted=null; state.tagFilters.clear(); updateOutput(); drawMods(); renderChips(); }
// Enhanced reset to also clear base stat mins & search
// (kept original export for backward compatibility; new function invoked after render button click)
function fullReset(){
  state.include.clear();
  state.exclude.clear();
  state.selectionOrder = [];
  state.waystoneChance = null;
  state.deliriousPct = null;
  state.packsCount = null;
  state.corrupted = null;
  state.baseRarityPct = null;
  state.basePackSizePct = null;
  state.baseMagicPct = null;
  state.baseRarePct = null;
  state.search = '';
  state.tagFilters.clear();
  updateOutput();
  drawMods();
  renderChips();
}
export function saveCurrent(name: string){ if(!name) return; const regexEl=document.getElementById('regexOutput') as HTMLInputElement; if(regexEl) state.saved[name]=regexEl.value; persistSaved(); }
export function loadSavedRegex(name: string){ const val = state.saved[name]; if(!val) return; const regexEl=document.getElementById('regexOutput') as HTMLInputElement; if(regexEl) regexEl.value=val||''; }
export function listSaved(){ return Object.keys(state.saved); }
export { render };
