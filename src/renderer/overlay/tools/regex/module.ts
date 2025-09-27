// Regex tool module
// Provides UI + logic to build PoE style regex based on selected mods
import { GLOBALS, MODS, RegexAtomGroup } from './data';

interface State {
  panelEl: HTMLElement | null;
  mode: 'ALL' | 'PARTIAL' | 'NOT';
  selected: Set<number>; // indices of MODS
  search: string;
  pgMin: number; // user provided percentage min threshold (Waystone drop chance / delirious etc.)
  round10: boolean;
  over100: boolean;
  minTier: number;
  maxTier: number;
  corrupted: boolean | null; // true=only corrupted, false=only uncorrupted, null=ignore
  waystoneChance: number | null; // selected N for Waystone drop chance over N%
  deliriousPct: number | null;
  packsCount: number | null; // additional packs threshold K
  saved: Record<string,string>; // name -> regex
}

const LS_KEY = 'regexToolSaved';

const state: State = {
  panelEl: null,
  mode: 'ALL',
  selected: new Set<number>(),
  search: '',
  pgMin: 20,
  round10: true,
  over100: false,
  minTier: 1,
  maxTier: 16,
  corrupted: null,
  waystoneChance: null,
  deliriousPct: null,
  packsCount: null,
  saved: loadSavedMap()
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

function badge(color: string, text: string){
  return `<span style="background:${color}; color:#fff; padding:2px 6px; border-radius:4px; font-size:10px; letter-spacing:.5px;">${text}</span>`;
}

// Percent guard builder PG(min)
function buildPG(min: number, round10: boolean, over100: boolean): string {
  let m = min;
  if (round10) m = Math.floor(m/10)*10;
  if (m < 10) return '([0-9].)%';
  if (m < 20) return '([1-9].)%';
  if (m < 30) return '([2-9].)%';
  if (m < 30) return '([2-9].)%';
  if (m < 100) return '([3-9].|1..)%';
  if (!over100) return '([3-9].|1..)%';
  // >=100 and over100 enabled
  if (m < 200) return '(1..)%';
  if (m < 300) return '(2.)%';
  return '([3-9]..)%';
}

// Count guard CG(K)
function buildCG(K: number): string {
  if (K <= 1) return '([1-9])';
  if (K <= 9) return '([1-9])';
  if (K <= 19) return '(1.)';
  if (K <= 39) return '(2.|3.)';
  if (K <= 49) return '(4.)';
  return '50';
}

function substituteAtoms(atoms: string[]): string[] {
  const pg = buildPG(state.pgMin, state.round10, state.over100);
  const cg = state.packsCount ? buildCG(state.packsCount) : '(?:[0-9]{1,2})';
  return atoms.map(a => a.replace(/PG/g, pg).replace(/CG/g, cg));
}

function buildRegex(): string {
  const indices = [...state.selected];
  if (!indices.length) return '';
  const selectedAtoms: string[][] = indices.map(i => substituteAtoms(MODS[i].atoms));
  // Flatten per mod to group atoms for that mod
  let parts: string[] = [];
  if (state.mode === 'ALL') {
    // For ALL each atom of each mod must appear
    const allAtoms = selectedAtoms.flat();
    parts = allAtoms.map(a => `(?=.*${a})`);
    return `^(?i)${parts.join('')}.*$`;
  } else if (state.mode === 'PARTIAL') {
    const alt = selectedAtoms.flat().join('|');
    return `^(?i)(?=.*(?:${alt})).*$`;
  } else { // NOT
    const alt = selectedAtoms.flat().join('|');
    return `^(?i)(?!.*(?:${alt})).*$`;
  }
}

function render(): void {
  const panel = ensurePanel();
  panel.style.display='';
  panel.innerHTML = `
    <div style='display:flex; flex-direction:column; gap:10px;'>
      <div style='text-align:center; font-size:16px; font-weight:600;'>Result</div>
      <div style='display:flex; gap:6px; align-items:center; justify-content:center;'>
        <input id='regexOutput' type='text' readonly style='flex:1; padding:6px 8px; font-size:12px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary);'>
        <button id='regexCopy' class='pin-btn'>Copy</button>
        <button id='regexReset' class='pin-btn' style='background:var(--accent-red);'>Reset</button>
      </div>
      <div style='display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end; justify-content:center; background:var(--bg-tertiary); padding:8px; border:1px solid var(--border-color); border-radius:6px;'>
        <div style='display:flex; flex-direction:column; gap:4px;'>
          <label style='font-size:11px;'>Mode</label>
          <div style='display:flex; gap:4px;'>
            <button data-mode='ALL' class='mode-btn ${state.mode==='ALL'?'active':''}'>All</button>
            <button data-mode='PARTIAL' class='mode-btn ${state.mode==='PARTIAL'?'active':''}'>Partial</button>
            <button data-mode='NOT' class='mode-btn ${state.mode==='NOT'?'active':''}'>Not</button>
          </div>
        </div>
        <div style='display:flex; flex-direction:column;'>
          <label style='font-size:11px;'>Min %</label>
          <input id='pgMin' type='number' value='${state.pgMin}' min='0' style='width:70px;'>
        </div>
        <div style='display:flex; flex-direction:column;'>
          <label style='font-size:11px;'>Round 10</label>
          <input id='round10' type='checkbox' ${state.round10?'checked':''}>
        </div>
        <div style='display:flex; flex-direction:column;'>
          <label style='font-size:11px;'>>100%</label>
          <input id='over100' type='checkbox' ${state.over100?'checked':''}>
        </div>
        <div style='display:flex; flex-direction:column;'>
          <label style='font-size:11px;'>Waystone %</label>
          <select id='waystonePct' style='width:90px;'>
            <option value=''>--</option>
            ${[100,200,300,400,500,600,700,800].map(v=>`<option value='${v}' ${state.waystoneChance===v?"selected":""}>${v}%+</option>`).join('')}
          </select>
        </div>
        <div style='display:flex; flex-direction:column;'>
          <label style='font-size:11px;'>Delir %</label>
          <input id='delirPct' type='number' value='${state.deliriousPct??''}' placeholder='N' style='width:70px;'>
        </div>
        <div style='display:flex; flex-direction:column;'>
          <label style='font-size:11px;'>Packs ≥</label>
          <input id='packsK' type='number' value='${state.packsCount??''}' placeholder='20-50' style='width:80px;'>
        </div>
        <div style='display:flex; flex-direction:column;'>
          <label style='font-size:11px;'>Corruption</label>
          <select id='corrFilter' style='width:110px;'>
            <option value=''>Any</option>
            <option value='corrupted' ${state.corrupted===true?'selected':''}>Corrupted</option>
            <option value='uncorrupted' ${state.corrupted===false?'selected':''}>Uncorrupted</option>
          </select>
        </div>
        <div style='display:flex; flex-direction:column;'>
          <label style='font-size:11px;'>Saved</label>
          <select id='savedRegex' style='width:160px;'>
            <option value=''>-- Load saved --</option>
            ${Object.keys(state.saved).map(k=>`<option value='${k}'>${k}</option>`).join('')}
          </select>
        </div>
        <div style='display:flex; flex-direction:column;'>
          <label style='font-size:11px;'>Save As</label>
          <div style='display:flex; gap:4px;'>
            <input id='saveName' type='text' placeholder='Name' style='width:120px;'>
            <button id='saveBtn' class='pin-btn'>Save</button>
          </div>
        </div>
      </div>
      <input id='regexSearch' type='text' placeholder='Search mods...' style='padding:6px 8px; width:100%; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary);'>
      <div id='regexMods' style='display:flex; flex-direction:column; gap:4px; max-height:340px; overflow:auto; border:1px solid var(--border-color); border-radius:6px; padding:6px; background:var(--bg-tertiary);'></div>
    </div>
  `;

  panel.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.mode = (btn as HTMLElement).dataset.mode as any;
      render();
      updateOutput();
    });
  });
  const out = panel.querySelector('#regexOutput') as HTMLInputElement;
  panel.querySelector('#regexCopy')?.addEventListener('click', () => { if (out) { out.select(); document.execCommand('copy'); }});
  panel.querySelector('#regexReset')?.addEventListener('click', () => { reset(); });
  (panel.querySelector('#pgMin') as HTMLInputElement)?.addEventListener('input', e => { state.pgMin = parseInt((e.target as HTMLInputElement).value||'0')||0; updateOutput(); });
  (panel.querySelector('#round10') as HTMLInputElement)?.addEventListener('change', e => { state.round10 = (e.target as HTMLInputElement).checked; updateOutput(); });
  (panel.querySelector('#over100') as HTMLInputElement)?.addEventListener('change', e => { state.over100 = (e.target as HTMLInputElement).checked; updateOutput(); });
  (panel.querySelector('#waystonePct') as HTMLSelectElement)?.addEventListener('change', e => { const v=(e.target as HTMLSelectElement).value; state.waystoneChance = v?parseInt(v):null; updateOutput(); });
  (panel.querySelector('#delirPct') as HTMLInputElement)?.addEventListener('input', e => { const v=(e.target as HTMLInputElement).value; state.deliriousPct = v?parseInt(v):null; updateOutput(); });
  (panel.querySelector('#packsK') as HTMLInputElement)?.addEventListener('input', e => { const v=(e.target as HTMLInputElement).value; state.packsCount = v?parseInt(v):null; updateOutput(); });
  (panel.querySelector('#corrFilter') as HTMLSelectElement)?.addEventListener('change', e => { const v=(e.target as HTMLSelectElement).value; state.corrupted = v==='corrupted'?true: v==='uncorrupted'?false:null; updateOutput(); });
  (panel.querySelector('#saveBtn') as HTMLButtonElement)?.addEventListener('click', () => { const name=(panel.querySelector('#saveName') as HTMLInputElement).value.trim(); if(!name) return; state.saved[name]=buildRegex(); persistSaved(); render(); updateOutput(); });
  (panel.querySelector('#savedRegex') as HTMLSelectElement)?.addEventListener('change', e => { const name=(e.target as HTMLSelectElement).value; if (!name) return; const rx = state.saved[name]; if (rx) { (panel.querySelector('#regexOutput') as HTMLInputElement).value = rx; } });

  const searchInput = panel.querySelector('#regexSearch') as HTMLInputElement;
  searchInput?.addEventListener('input', () => { state.search = searchInput.value.toLowerCase(); drawMods(); });
  drawMods();
  updateOutput();
}

function drawMods(){
  const list = document.getElementById('regexMods'); if (!list) return;
  const q = state.search;
  const rows = MODS.map((m, idx) => ({...m, idx})).filter(m => !q || m.label.toLowerCase().includes(q));
  list.innerHTML = rows.map(m => {
    const active = state.selected.has(m.idx);
    return `<div class='regex-mod ${active?'active':''}' data-idx='${m.idx}' style='padding:4px 6px; border:1px solid ${active?'var(--accent-blue)':'var(--border-color)'}; background:${active?'rgba(0,128,255,0.2)':'var(--bg-secondary)'}; border-radius:4px; cursor:pointer; font-size:11px; line-height:1.3;'>${m.label}</div>`;
  }).join('');
  list.querySelectorAll('.regex-mod').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt((el as HTMLElement).dataset.idx||'0');
      if (state.selected.has(idx)) state.selected.delete(idx); else state.selected.add(idx);
      updateOutput();
      drawMods();
    });
  });
}

function updateOutput(){
  const out = document.getElementById('regexOutput') as HTMLInputElement | null;
  if (!out) return;
  const base = buildRegex();
  let extra = '';
  if (state.waystoneChance) extra += `(?=.*${buildPG(state.waystoneChance, state.round10, state.over100)}.*drop.*chance)`;
  if (state.deliriousPct) extra += `(?=.*${buildPG(state.deliriousPct, state.round10, state.over100)}.*delir)`;
  if (state.packsCount) extra += `(?=.*${buildCG(state.packsCount)}.*add.*packs)`;
  if (state.corrupted === true) extra += '(?=.*(?:^|\n)corrupted(?:\n|$))';
  if (state.corrupted === false) extra = '(?!.*(?:^|\n)corrupted(?:\n|$))' + extra; // put negative first
  const full = base ? `^${base.replace(/^\^/, '').replace(/\$$/,'')}${extra}.*$` : (extra?`^${extra}.*$`:'');
  out.value = full;
}

export async function show(): Promise<void> {
  const panel = ensurePanel();
  panel.innerHTML = '<div style="padding:20px; text-align:center; font-size:12px;">Loading Regex Tool...</div>';
  render();
}

export function reset(){ state.selected.clear(); state.mode='ALL'; state.pgMin=20; state.round10=true; state.over100=false; state.waystoneChance=null; state.deliriousPct=null; state.packsCount=null; state.corrupted=null; updateOutput(); drawMods(); }
export function saveCurrent(name: string){ if(!name) return; state.saved[name]=buildRegex(); persistSaved(); }
export function loadSavedRegex(name: string){ const rx = state.saved[name]; if (rx) { const out = document.getElementById('regexOutput') as HTMLInputElement; if (out) out.value = rx; } }
export function listSaved(){ return Object.keys(state.saved); }
export { buildRegex, render };
