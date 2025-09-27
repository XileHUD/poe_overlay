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
    panel.innerHTML = `
      <div id='regexToolRoot' class='regex-tool-root' style='display:flex; flex-direction:column; gap:12px;'>
        <!-- Row 1: Chips + Save/Load -->
        <div class='regex-top'>
          <div id='regexChips' class='regex-chips'>
            ${renderChip('rarity','Rarity')}
            ${renderChip('pack','Pack Size')}
            ${renderChip('rare','Rare Monsters')}
            ${renderChip('mod','Additional Modifier')}
          </div>
          <div class='regex-save'>
            <select id='savedRegex' class='regex-input' style='width:140px;'>
              <option value=''>Saved...</option>
              ${Object.keys(state.saved).map(k=>`<option value='${k}'>${k}</option>`).join('')}
            </select>
            <input id='saveName' class='regex-input' type='text' placeholder='Name' style='width:110px;'>
            <button id='saveBtn' class='regex-btn'>Save</button>
            <button id='delSavedBtn' title='Delete selected saved regex' class='regex-btn regex-btn-danger' style='padding:6px 10px;'>Del</button>
          </div>
        </div>
        <!-- Row 2: Filters (packs removed, add base stats) -->
        <div class='regex-filters'>
          <label style='font-size:11px;'>Waystone %</label>
          <select id='waystonePct' class='regex-input' style='width:80px;'>
            <option value=''>--</option>
            ${[100,200,300,400,500,600,700,800].map(v=>`<option value='${v}' ${state.waystoneChance===v?"selected":""}>${v}%+</option>`).join('')}
          </select>
          <label style='font-size:11px;'>Delir %</label>
          <input id='delirPct' type='number' value='${state.deliriousPct??''}' placeholder='N' class='regex-input' style='width:70px;'>
          <label style='font-size:11px;'>Rarity %</label>
          <input id='baseRarity' type='number' value='${state.baseRarityPct??''}' placeholder='—' class='regex-input' style='width:60px;'>
          <label style='font-size:11px;'>Pack %</label>
          <input id='basePack' type='number' value='${state.basePackSizePct??''}' placeholder='—' class='regex-input' style='width:60px;'>
          <label style='font-size:11px;'>Magic %</label>
          <input id='baseMagic' type='number' value='${state.baseMagicPct??''}' placeholder='—' class='regex-input' style='width:60px;'>
          <label style='font-size:11px;'>Rare %</label>
          <input id='baseRare' type='number' value='${state.baseRarePct??''}' placeholder='—' class='regex-input' style='width:60px;'>
          <label style='font-size:11px;'>Corruption</label>
          <select id='corrFilter' class='regex-input' style='width:110px;'>
            <option value=''>Any</option>
            <option value='corrupted' ${state.corrupted===true?'selected':''}>Corrupted</option>
            <option value='uncorrupted' ${state.corrupted===false?'selected':''}>Uncorrupted</option>
          </select>
          <span style='margin-left:auto; font-size:10px; opacity:.6;'>Click mod to cycle include/exclude</span>
        </div>
        <!-- Row 3: Search (full width) -->
        <div class='regex-search' style='width:100%;'>
          <input id='regexSearch' type='text' placeholder='Search mods...' class='regex-input' style='width:100%;'>
        </div>
        <!-- Row 4: Mods list (info text moved inside for height savings) -->
        <div id='regexMods' style='display:flex; flex-direction:column; gap:4px; overflow:auto; border:1px solid var(--border-color); border-radius:6px; padding:6px; background:var(--bg-tertiary);'>
          <div id='regexInfoCycle' style='cursor:pointer; font-size:10px; opacity:.55; padding:2px 0 6px 0;'>Click mod to cycle include / exclude • fragments are shortest unique substrings</div>
        </div>
        <!-- Row 5: Combined Results at bottom -->
        <div class='regex-bottom-results'>
          <div class='regex-label-row'><span id='regexCharCount'>Regex (0/50 chars)</span><div style='display:flex; gap:6px;'><button id='copyRegex' class='regex-copy-btn'>Copy</button><button id='regexReset' class='regex-btn regex-btn-danger'>Reset</button></div></div>
          <input id='regexOutput' type='text' readonly class='regex-output' style='width:100%;'>
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
    const headerFiltersHeight = 200; // refined static height after spacing reductions
    const panelRect = panel.getBoundingClientRect();
    const bottomH = bottom ? bottom.getBoundingClientRect().height : 0;
    const available = panelRect.height - bottomH - headerFiltersHeight - 8; // tighter padding
    const maxH = Math.max(180, available);
    mods.style.maxHeight = maxH + 'px';
    mods.style.minHeight = '180px';
    mods.style.overflowY = 'auto';
  } catch {}
}

function renderChips(){
  const wrap = document.getElementById('regexChips'); if(!wrap) return;
  wrap.innerHTML = ['rarity','pack','rare','mod'].map(k=>renderChip(k, chipLabel(k))).join('');
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
  return `<div class='regex-chip' data-key='${key}' style='padding:3px 8px; border:1px solid ${active?'var(--accent-blue)':'var(--border-color)'}; background:${active?'var(--accent-blue)':'var(--bg-secondary)'}; color:${active?'#fff':'var(--text-primary)'}; border-radius:12px; font-size:11px; cursor:pointer; user-select:none;'>${label}</div>`;
}

function drawMods(){
  const list = document.getElementById('regexMods'); if (!list) return;
  const q = state.search;
  const rows = MODS.map((m, idx) => ({...m, idx, stem: getIncludeFragment(idx)}))
    .filter(m => !q || m.label.toLowerCase().includes(q))
    .filter(m => filterByChips(m));
  list.innerHTML = rows.map(m => {
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
  #regexToolRoot { display:flex; flex-direction:column; min-height:420px; height:100%; }
  #regexToolRoot { flex:1 1 auto; }
  #regexToolRoot > * { box-sizing:border-box; }
  .regex-input { background: var(--bg-secondary); border:1px solid var(--border-color); color: var(--text-primary); border-radius:6px; padding:6px 8px; font-size:11px; }
  .regex-input:focus { outline:1px solid var(--accent-blue); }
  .regex-output { background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--accent-blue); border-radius:8px; padding:10px 12px; font-size:11px; font-family:monospace; width:100%; }
  .regex-mod:hover { filter:brightness(1.15); }
  .regex-chip { transition:background .15s,border-color .15s; }
  .regex-copy-btn, .regex-btn { background: var(--accent-blue); color:#fff; border:1px solid var(--accent-blue); padding:6px 14px; border-radius:18px; cursor:pointer; font-size:11px; line-height:1; font-weight:500; letter-spacing:.3px; }
  .regex-copy-btn:hover, .regex-btn:hover { filter:brightness(1.2); }
  .regex-btn-danger { background:#c63b3b; border-color:#c63b3b; color:#fff; }
  .regex-btn-danger:hover { filter:brightness(1.15); }
  .regex-top { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
  .regex-chips { display:flex; gap:6px; flex-wrap:wrap; }
  .regex-save { display:flex; gap:6px; align-items:center; }
  .regex-save select, .regex-save input { height:30px; }
  .regex-include-exclude { display:flex; gap:12px; }
  .regex-include-exclude .col { flex:1; display:flex; flex-direction:column; gap:4px; }
  .regex-label-row { display:flex; justify-content:space-between; align-items:center; font-size:11px; font-weight:600; padding:0 2px; }
  .regex-filters { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
  .regex-search { width:100%; }
  .regex-bottom-results { display:flex; flex-direction:column; gap:4px; margin-top:6px; }
  #regexMods { min-height:180px; }
  /* Allow panel to grow with window; parent container should stretch */
  .regex-bottom-results .regex-label-row { display:flex; justify-content:space-between; align-items:center; font-size:11px; font-weight:600; padding:0 2px; }
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
