// Regex tool module
// Provides UI + logic to build PoE style regex based on selected mods
import { GLOBALS, MODS, RegexAtomGroup } from './data';

interface State {
  panelEl: HTMLElement | null;
  include: Set<number>; // indices of MODS included
  exclude: Set<number>; // indices of MODS excluded
  search: string;
  // Filters (now only influence automatic stems added)
  corrupted: boolean | null; // true=only corrupted, false=only uncorrupted, null=ignore
  waystoneChance: number | null; // presence -> add 'drop'
  deliriousPct: number | null; // presence -> add 'delir'
  packsCount: number | null; // presence -> add 'packs'
  saved: Record<string,string>; // name -> combined string include + space + exclude
}

const LS_KEY = 'regexToolSaved';

const state: State = {
  panelEl: null,
  include: new Set<number>(),
  exclude: new Set<number>(),
  search: '',
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

// === Stemming logic ===
const STEMS: Record<string,string> = {
  'ignited ground':'ign',
  'extra fire':'fire$',
  'extra cold':'cold$',
  'extra lightning':'light$',
  'extra chaos':'chaos$',
  'pack size':'pack',
  'rarity of items':'rar',
  'enfeeble':'enf',
  'elemental weakness':'elew',
  'temporal chains':'temp',
  'accuracy rating':'acc',
  'monster damage':'mdam',
  'more monster life':'mlife',
  'armoured':'arm',
  'evasive':'evas',
  'energy shield':'esh',
  'steal power, frenzy and endurance charges':'steal',
  'poison on hit':'pois',
  'projectiles':'proj',
  'area of effect':'aoe',
  'freeze buildup':'fb',
  'shock chance':'sc',
  'flammability magnitude':'flam',
  'drop chance':'drop',
  'delirious':'delir',
  'additional packs':'packs',
  'corrupted':'corrupted',
  'bleeding':'blee',
  'reduced extra damage from critical hits':'tak',
  'additional modifier':'mod'
};

const STEM_KEYS = Object.keys(STEMS).sort((a,b)=>b.length-a.length); // prefer longest matches first

function stemRight(text: string): string {
  const t = text.toLowerCase();
  for (const k of STEM_KEYS) if (t.includes(k)) return STEMS[k];
  return t.replace(/[^a-z ]/g,' ').trim().split(/\s+/).map(w=>w.slice(0,3)).join('');
}

function extractRight(label: string): string {
  return label.split('•').pop()!.trim();
}

function buildIncludeExclude(): { include: string; exclude: string } {
  const includeLabels = [...state.include].map(i => MODS[i].label);
  const excludeLabels = [...state.exclude].map(i => MODS[i].label);

  // Add filter-derived stems
  if (state.corrupted === true) includeLabels.push('corrupted');
  if (state.corrupted === false) excludeLabels.push('corrupted');
  if (state.waystoneChance) includeLabels.push('drop chance');
  if (state.deliriousPct) includeLabels.push('delirious');
  if (state.packsCount) includeLabels.push('additional packs');

  const include = includeLabels
    .map(lbl => stemRight(extractRight(lbl)))
    .filter((v,i,a)=>v && a.indexOf(v)===i)
    .join('|');
  const exclude = excludeLabels
    .map(lbl => stemRight(extractRight(lbl)))
    .filter((v,i,a)=>v && a.indexOf(v)===i)
    .join('|');
  return { include, exclude: exclude?('!'+exclude):'' };
}

function render(): void {
  const panel = ensurePanel();
  panel.style.display='';
  panel.innerHTML = `
    <div style='display:flex; flex-direction:column; gap:10px;'>
      <div style='text-align:center; font-size:16px; font-weight:600;'>Regex Builder</div>
      <div style='display:flex; flex-direction:column; gap:4px; background:var(--bg-tertiary); padding:8px; border:1px solid var(--border-color); border-radius:6px;'>
        <div style='display:flex; gap:6px; flex-wrap:wrap; align-items:center;'>
          <label style='font-size:11px;'>Waystone %</label>
          <select id='waystonePct' style='width:80px;'>
            <option value=''>--</option>
            ${[100,200,300,400,500,600,700,800].map(v=>`<option value='${v}' ${state.waystoneChance===v?"selected":""}>${v}%+</option>`).join('')}
          </select>
          <label style='font-size:11px;'>Delir %</label>
          <input id='delirPct' type='number' value='${state.deliriousPct??''}' placeholder='N' style='width:70px;'>
          <label style='font-size:11px;'>Packs ≥</label>
          <input id='packsK' type='number' value='${state.packsCount??''}' placeholder='20-50' style='width:80px;'>
          <label style='font-size:11px;'>Corruption</label>
          <select id='corrFilter' style='width:110px;'>
            <option value=''>Any</option>
            <option value='corrupted' ${state.corrupted===true?'selected':''}>Corrupted</option>
            <option value='uncorrupted' ${state.corrupted===false?'selected':''}>Uncorrupted</option>
          </select>
          <div style='margin-left:auto; font-size:11px;'>Cycle: none → include (blue) → exclude (red)</div>
        </div>
        <div style='display:flex; flex-direction:column; gap:4px;'>
          <div style='display:flex; gap:6px; align-items:center;'>
            <span style='font-size:11px; font-weight:600;'>Include</span>
            <input id='regexOutputInclude' type='text' readonly style='flex:1; padding:4px 6px; font-size:11px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary);'>
            <button id='copyInclude' class='pin-btn' style='padding:4px 8px;'>Copy</button>
          </div>
          <div style='display:flex; gap:6px; align-items:center;'>
            <span style='font-size:11px; font-weight:600;'>Exclude</span>
            <input id='regexOutputExclude' type='text' readonly style='flex:1; padding:4px 6px; font-size:11px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary);'>
            <button id='copyExclude' class='pin-btn' style='padding:4px 8px;'>Copy</button>
            <button id='regexReset' class='pin-btn' style='padding:4px 8px; background:var(--accent-red);'>Reset</button>
          </div>
          <div style='display:flex; gap:6px; align-items:center;'>
            <select id='savedRegex' style='width:160px;'>
              <option value=''>-- Load saved --</option>
              ${Object.keys(state.saved).map(k=>`<option value='${k}'>${k}</option>`).join('')}
            </select>
            <input id='saveName' type='text' placeholder='Name' style='width:120px;'>
            <button id='saveBtn' class='pin-btn' style='padding:4px 8px;'>Save</button>
          </div>
        </div>
      </div>
      <input id='regexSearch' type='text' placeholder='Search mods...' style='padding:6px 8px; width:100%; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary);'>
      <div id='regexMods' style='display:flex; flex-direction:column; gap:4px; max-height:360px; overflow:auto; border:1px solid var(--border-color); border-radius:6px; padding:6px; background:var(--bg-tertiary);'></div>
    </div>`;

  (panel.querySelector('#waystonePct') as HTMLSelectElement)?.addEventListener('change', e => { const v=(e.target as HTMLSelectElement).value; state.waystoneChance = v?parseInt(v):null; updateOutput(); });
  (panel.querySelector('#delirPct') as HTMLInputElement)?.addEventListener('input', e => { const v=(e.target as HTMLInputElement).value; state.deliriousPct = v?parseInt(v):null; updateOutput(); });
  (panel.querySelector('#packsK') as HTMLInputElement)?.addEventListener('input', e => { const v=(e.target as HTMLInputElement).value; state.packsCount = v?parseInt(v):null; updateOutput(); });
  (panel.querySelector('#corrFilter') as HTMLSelectElement)?.addEventListener('change', e => { const v=(e.target as HTMLSelectElement).value; state.corrupted = v==='corrupted'?true: v==='uncorrupted'?false:null; updateOutput(); });
  (panel.querySelector('#regexReset') as HTMLButtonElement)?.addEventListener('click', () => { reset(); render(); });
  (panel.querySelector('#saveBtn') as HTMLButtonElement)?.addEventListener('click', () => { const name=(panel.querySelector('#saveName') as HTMLInputElement).value.trim(); if(!name) return; const {include,exclude}=buildIncludeExclude(); state.saved[name]=[include,exclude].filter(Boolean).join(' '); persistSaved(); render(); updateOutput(); });
  (panel.querySelector('#savedRegex') as HTMLSelectElement)?.addEventListener('change', e => {
    const name=(e.target as HTMLSelectElement).value; if (!name) return; const val = state.saved[name]; if(!val) return;
    const parts = val.split(/\s+/);
    const inc: string[] = []; const exc: string[] = [];
    parts.forEach(token => { if(!token) return; if(token.startsWith('!')) exc.push(...token.slice(1).split('|')); else inc.push(...token.split('|')); });
    (panel.querySelector('#regexOutputInclude') as HTMLInputElement).value=inc.join('|');
    (panel.querySelector('#regexOutputExclude') as HTMLInputElement).value=exc.length?'!'+exc.join('|'):'';
  });
  (panel.querySelector('#copyInclude') as HTMLButtonElement)?.addEventListener('click', () => { const out=panel.querySelector('#regexOutputInclude') as HTMLInputElement; out.select(); document.execCommand('copy'); });
  (panel.querySelector('#copyExclude') as HTMLButtonElement)?.addEventListener('click', () => { const out=panel.querySelector('#regexOutputExclude') as HTMLInputElement; out.select(); document.execCommand('copy'); });
  const searchInput = panel.querySelector('#regexSearch') as HTMLInputElement; searchInput?.addEventListener('input', () => { state.search = searchInput.value.toLowerCase(); drawMods(); });
  drawMods();
  updateOutput();
}

function drawMods(){
  const list = document.getElementById('regexMods'); if (!list) return;
  const q = state.search;
  const rows = MODS.map((m, idx) => ({...m, idx})).filter(m => !q || m.label.toLowerCase().includes(q));
  list.innerHTML = rows.map(m => {
    const inc = state.include.has(m.idx);
    const exc = state.exclude.has(m.idx);
    let border = 'var(--border-color)';
    let bg = 'var(--bg-secondary)';
    if (inc){ border='var(--accent-blue)'; bg='rgba(0,128,255,0.25)'; }
    if (exc){ border='var(--accent-red)'; bg='rgba(255,0,0,0.25)'; }
    return `<div class='regex-mod' data-idx='${m.idx}' style='padding:4px 6px; border:1px solid ${border}; background:${bg}; border-radius:4px; cursor:pointer; font-size:11px; line-height:1.3; user-select:none;'>${m.label}</div>`;
  }).join('');
  list.querySelectorAll('.regex-mod').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt((el as HTMLElement).dataset.idx||'0');
      if (!state.include.has(idx) && !state.exclude.has(idx)) {
        state.include.add(idx); // none -> include
      } else if (state.include.has(idx)) {
        state.include.delete(idx); state.exclude.add(idx); // include -> exclude
      } else { // exclude -> none
        state.exclude.delete(idx);
      }
      updateOutput(); drawMods();
    });
  });
}

function updateOutput(){
  const { include, exclude } = buildIncludeExclude();
  const incEl = document.getElementById('regexOutputInclude') as HTMLInputElement | null;
  const excEl = document.getElementById('regexOutputExclude') as HTMLInputElement | null;
  if (incEl) incEl.value = include;
  if (excEl) excEl.value = exclude;
}

export async function show(): Promise<void> {
  const panel = ensurePanel();
  panel.innerHTML = '<div style="padding:20px; text-align:center; font-size:12px;">Loading Regex Tool...</div>';
  render();
}

export function reset(){ state.include.clear(); state.exclude.clear(); state.waystoneChance=null; state.deliriousPct=null; state.packsCount=null; state.corrupted=null; updateOutput(); drawMods(); }
export function saveCurrent(name: string){ if(!name) return; const {include,exclude}=buildIncludeExclude(); state.saved[name]=[include,exclude].filter(Boolean).join(' '); persistSaved(); }
export function loadSavedRegex(name: string){ const val = state.saved[name]; if(!val) return; const incEl=document.getElementById('regexOutputInclude') as HTMLInputElement; const excEl=document.getElementById('regexOutputExclude') as HTMLInputElement; const [inc,excRaw] = val.split(/\s+/); if(incEl) incEl.value=inc||''; if(excEl && excRaw) excEl.value=excRaw.startsWith('!')?excRaw:'!'+excRaw; }
export function listSaved(){ return Object.keys(state.saved); }
export { render };
