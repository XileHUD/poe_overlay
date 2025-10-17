// PoE1 Gems module with list and detail views
import { bindImageFallback } from "../../../crafting/utils/imageFallback";
import { TRANSPARENT_PLACEHOLDER } from "../../../crafting/utils/imagePlaceholder";
import { resolveLocalImage } from "../../../crafting/utils/localImage";

export type Gem = {
  slug?: string;
  name?: string;
  imageLocal?: string;
  tags?: string[];
  color?: string;
  isTransfigured?: boolean;
};

export type GemDetail = {
  name: string;
  slug: string;
  metadata: Record<string, string>;
  levelProgression: Array<Record<string, string>>;
  description?: string;
  stats?: string[];
};

type State = {
  panelEl: HTMLElement | null;
  cache: Gem[] | { SkillGemsGem?: Gem[], SupportGemsGem?: Gem[], AwakenedGem?: Gem[] } | null;
  filtered: Gem[];
  input: HTMLInputElement | null;
  selectedTags: Set<string>;
  tagCounts: Record<string, number>;
  currentGemSlug: string | null;
  currentGemDetail: GemDetail | null;
};

const state: State = { 
  panelEl: null, 
  cache: null, 
  filtered: [], 
  input: null, 
  selectedTags: new Set(), 
  tagCounts: {},
  currentGemSlug: null,
  currentGemDetail: null
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
  state.panelEl = el; return el;
}

function setCharacterTabActive(): void {
  const tabMod = document.getElementById("tabModifier") as HTMLElement | null;
  const tabHist = document.getElementById("tabHistory") as HTMLElement | null;
  const craftingTab = document.getElementById("craftingTab") as HTMLElement | null;
  const itemsTab = document.getElementById("itemsTab") as HTMLElement | null;
  const charTab = document.getElementById("characterTab") as HTMLElement | null;
  const contentMod = document.getElementById("content") as HTMLElement | null;
  const contentHist = document.getElementById("historyContent") as HTMLElement | null;
  if (tabMod) { tabMod.classList.remove("active"); tabMod.style.background = "var(--bg-tertiary)"; tabMod.style.color = "var(--text-primary)"; }
  if (tabHist) { tabHist.classList.remove("active"); tabHist.style.background = "var(--bg-tertiary)"; tabHist.style.color = "var(--text-primary)"; }
  if (craftingTab) { craftingTab.style.background='var(--bg-tertiary)'; craftingTab.style.color='var(--text-primary)'; }
  if (itemsTab) { itemsTab.style.background='var(--bg-tertiary)'; itemsTab.style.color='var(--text-primary)'; }
  if (charTab) { charTab.style.background = "var(--accent-blue)"; charTab.style.color = "#fff"; }
  if (contentMod) contentMod.style.display = "none";
  if (contentHist) contentHist.style.display = "none";
  document.getElementById("modifierHeaderInfo")?.setAttribute("style", "display:none");
  document.getElementById("whittlingInfo")?.setAttribute("style", "display:none");
  const ann = document.getElementById("annointsPanel");
  if (ann) (ann as HTMLElement).style.display = "none";
  document.body.classList.add("crafting-mode");
}

export async function showList(): Promise<void> {
  (window as any).__lastPanel = 'poe1-gems-list';
  setCharacterTabActive();
  const panel = ensurePanel();
  panel.style.display='';
  panel.innerHTML = `<div class='no-mods'>Loading Gems...</div>`;
  setTimeout(()=>{ panel.scrollTop=0; }, 10);
  try {
    const data = await (window as any).electronAPI.getPoe1Gems?.();
    if (!data || data.error) { 
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load Gems (${data?.error||'unknown'})</div>`; 
      return; 
    }
    state.cache = data.gems || {};
    renderList();
  } catch (e) {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Exception loading Gems: ${e}</div>`;
  }
}

export async function showDetail(gemSlug: string): Promise<void> {
  (window as any).__lastPanel = `poe1-gem-detail:${gemSlug}`;
  setCharacterTabActive();
  const panel = ensurePanel();
  panel.style.display='';
  panel.innerHTML = `<div class='no-mods'>Loading ${gemSlug}...</div>`;
  setTimeout(()=>{ panel.scrollTop=0; }, 10);
  try {
    const detail = await (window as any).electronAPI.getPoe1GemDetail?.(gemSlug);
    if (!detail || detail.error) { 
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load gem detail for ${gemSlug} (${detail?.error||'unknown'})</div>`; 
      return; 
    }
    state.currentGemSlug = gemSlug;
    state.currentGemDetail = detail;
    renderDetail();
  } catch (e) {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Exception loading gem detail: ${e}</div>`;
  }
}

function renderList(): void {
  const panel = ensurePanel();
  if (!state.cache) return;

  // Handle both old structure (with SkillGemsGem/SupportGemsGem/AwakenedGem) and new structure (flat array)
  let allGems: Gem[] = [];
  if (Array.isArray(state.cache)) {
    // New structure: state.cache is directly the gems array
    allGems = state.cache;
  } else if (!Array.isArray(state.cache) && (state.cache.SkillGemsGem || state.cache.SupportGemsGem || state.cache.AwakenedGem)) {
    // Old structure: gems organized by type
    allGems = [
      ...(state.cache.SkillGemsGem || []),
      ...(state.cache.SupportGemsGem || []),
      ...(state.cache.AwakenedGem || [])
    ];
  } else {
    // Fallback: empty
    allGems = [];
  }

  state.selectedTags.clear();
  state.tagCounts = {};

  const tagCounts: Record<string, number> = {};

  allGems.forEach(gem => {
    const tags = Array.isArray(gem.tags) ? gem.tags : [];
    tags.forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });

  state.tagCounts = { ...tagCounts };

  panel.innerHTML = `
    <div style='display:flex; gap:6px; align-items:center; margin-bottom:6px;'>
      <button id='gemsBackBtn' class='pin-btn' style='padding:4px 8px;'>← Back</button>
      <input id='gemsSearch' type='text' placeholder='Search gems...' style='flex:1; padding:4px 8px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary); font-size:12px;'>
      <button id='gemsClear' class='pin-btn' style='padding:4px 8px;'>Clear</button>
    </div>
    <div id='gemTypeFilters' style='display:flex; gap:6px; justify-content:center; margin-bottom:8px; flex-wrap:wrap;'></div>
    <div id='gemTagFilters' style='display:flex; gap:4px; flex-wrap:wrap; margin-bottom:8px; justify-content:center; max-height:120px; overflow-y:auto; padding:4px;'></div>
    <div id='gemsWrap' style='display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:10px;'></div>`;
  
  state.input = panel.querySelector('#gemsSearch') as HTMLInputElement | null;
  const wrap = panel.querySelector('#gemsWrap') as HTMLElement | null;
  const typeFilterWrap = panel.querySelector('#gemTypeFilters') as HTMLElement | null;
  const tagFilterWrap = panel.querySelector('#gemTagFilters') as HTMLElement | null;

  // Gem type filters - start with none selected (show all by default)
  const selectedGemTypes = new Set<string>();

  function getGemType(gem: Gem): string {
    if (gem.isTransfigured) return 'Transfigured';
    const name = gem.name || '';
    if (name.startsWith('Awakened ')) return 'Awakened';
    if (name.endsWith(' Support') || name.includes(' Support ')) return 'Support';
    return 'Skill';
  }

  function chipCss(tag: string, active: boolean, rgb: string = '144,164,174', isButton = false){
    const [r,g,b] = rgb.split(',').map(Number); 
    const bg=active?`rgba(${r},${g},${b},0.9)`:`rgba(${r},${g},${b},0.22)`; 
    const border=`rgba(${r},${g},${b},0.6)`; 
    const l=0.2126*r+0.7152*g+0.0722*b; 
    const color=active?(l>180?'#000':'#fff'):'var(--text-primary)';
    const padding = isButton ? '6px 14px' : '2px 6px';
    const fontSize = isButton ? '11px' : '9px';
    return `cursor:pointer; user-select:none; padding:${padding}; font-size:${fontSize}; border-radius:999px; border:1px solid ${border}; background:${bg}; color:${color}; white-space:nowrap; display:inline-block;`;
  }

  // Generate distinct colors for gem type filters
  const typeColors: Record<string, string> = {
    'Skill': '255,87,34',      // Deep Orange
    'Support': '156,39,176',    // Purple
    'Awakened': '255,193,7',    // Amber
    'Transfigured': '0,188,212' // Cyan
  };

  function renderTypeFilters() {
    if (!typeFilterWrap) return;
    typeFilterWrap.innerHTML = '';
    ['Skill', 'Support', 'Awakened', 'Transfigured'].forEach(type => {
      const el = document.createElement('div');
      el.textContent = type;
      el.style.cssText = chipCss(type, selectedGemTypes.has(type), typeColors[type], true);
      el.style.minWidth = '100px';
      el.style.textAlign = 'center';
      el.addEventListener('click', () => {
        // Toggle single filter
        if (selectedGemTypes.has(type)) {
          selectedGemTypes.delete(type);
        } else {
          selectedGemTypes.add(type);
        }
        renderTypeFilters();
        applyFilter();
      });
      typeFilterWrap.appendChild(el);
    });
  }

  function renderTagFilters() {
    if (!tagFilterWrap) return;
    tagFilterWrap.innerHTML = '';
    
    // Sort tags by count descending
    const sortedTags = Object.entries(state.tagCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
    
    // Generate distinct colors for each tag
    const tagColorMap: Record<string, string> = {};
    const hues = [210, 260, 30, 150, 330, 180, 60, 290, 120, 0]; // Diverse hues
    sortedTags.forEach((tag, idx) => {
      const hue = hues[idx % hues.length];
      const sat = 60 + (idx % 3) * 10;
      const light = 50 + (idx % 2) * 5;
      tagColorMap[tag] = `hsl(${hue}, ${sat}%, ${light}%)`;
    });
    
    sortedTags.forEach(tag => {
      const count = state.tagCounts[tag];
      const el = document.createElement('div');
      el.textContent = `${tag} (${count})`;
      
      // Convert HSL to RGB for chipCss
      const hslMatch = tagColorMap[tag].match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
      let rgb = '144,164,174';
      if (hslMatch) {
        const h = parseInt(hslMatch[1]) / 360;
        const s = parseInt(hslMatch[2]) / 100;
        const l = parseInt(hslMatch[3]) / 100;
        const [r, g, b] = hslToRgb(h, s, l);
        rgb = `${r},${g},${b}`;
      }
      
      el.style.cssText = chipCss(tag, state.selectedTags.has(tag), rgb, false);
      el.addEventListener('click', () => {
        if (state.selectedTags.has(tag)) {
          state.selectedTags.delete(tag);
        } else {
          state.selectedTags.add(tag);
        }
        renderTagFilters();
        applyFilter();
      });
      tagFilterWrap.appendChild(el);
    });
  }
  
  function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  function applyFilter() {
    const query = (state.input?.value || '').toLowerCase().trim();
    
    // Get all gems from cache (handle both new flat array and old structure)
    let allGems: Gem[] = [];
    if (Array.isArray(state.cache)) {
      allGems = state.cache;
    } else if (state.cache && !Array.isArray(state.cache)) {
      // Old structure with separate arrays
      allGems = [
        ...(state.cache.SkillGemsGem || []),
        ...(state.cache.SupportGemsGem || []),
        ...(state.cache.AwakenedGem || [])
      ];
    }
    
    // Filter by gem type (if any selected; otherwise show all)
    const filtered: Gem[] = allGems.filter(gem => {
      if (selectedGemTypes.size === 0) return true; // Show all if none selected
      const gemType = getGemType(gem);
      return selectedGemTypes.has(gemType);
    });

    state.filtered = filtered.filter(gem => {
      const tags = Array.isArray(gem.tags) ? gem.tags : [];
      const matchTags = state.selectedTags.size === 0 || Array.from(state.selectedTags).every(tag => tags.includes(tag));
      const matchSearch = !query || (gem.name||'').toLowerCase().includes(query) || tags.some(t => t.toLowerCase().includes(query));
      return matchTags && matchSearch;
    });
    renderGems();
  }

  function renderGems() {
    if (!wrap) return;
    wrap.innerHTML = '';
    if (state.filtered.length === 0) {
      wrap.innerHTML = `<div style='grid-column:1/-1; text-align:center; color:var(--text-secondary); padding:20px;'>No gems found</div>`;
      return;
    }
    state.filtered.forEach(gem => {
      const card = document.createElement('div');
      card.style.background = 'var(--bg-card)';
      card.style.border = '1px solid var(--border-color)';
      card.style.borderRadius = '6px';
      card.style.padding = '8px';
      card.style.display = 'flex';
      card.style.gap = '8px';
      card.style.alignItems = 'flex-start';
      card.style.minHeight = '70px';
      card.style.cursor = 'pointer';
      card.style.transition = 'transform 0.15s, box-shadow 0.15s';
      
      card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-2px)';
        card.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
        card.style.boxShadow = '';
      });
      card.addEventListener('click', () => {
        if (gem.slug) showDetail(gem.slug);
      });
      
      const orig = gem.imageLocal ? `poe1/${gem.imageLocal}` : '';
      const imgHtml = orig ? `<img class='gem-img' src='${TRANSPARENT_PLACEHOLDER}' data-orig-src='${orig}' decoding='async' style='width:48px; height:48px; object-fit:contain; flex-shrink:0;'>` : '<div style="width:48px; height:48px; flex-shrink:0;"></div>';
      const colorStyle = gem.color ? `color:${gem.color};` : '';
      const tags = Array.isArray(gem.tags) ? gem.tags : [];
      const description = (gem as any).description || '';
      const descriptionHtml = description ? `<div style='font-size:11px; color:var(--text-secondary); line-height:1.4; margin-bottom:4px;'>${description}</div>` : '';
      const tagsHtml = tags.map((t:string)=>`<span style='display:inline-block; padding:1px 4px; margin:1px 2px 0 0; font-size:9px; border-radius:3px; background:rgba(144,164,174,0.18); border:1px solid rgba(144,164,174,0.4); color:var(--text-secondary);'>${t}</span>`).join('');
      
      card.innerHTML = `
        ${imgHtml}
        <div style='flex:1; min-width:0; display:flex; flex-direction:column; gap:2px;'>
          <div style='font-weight:600; font-size:13px; ${colorStyle}'>${gem.name||''}</div>
          ${descriptionHtml}
          ${tagsHtml ? `<div style='margin-top:2px;'>${tagsHtml}</div>` : ''}
        </div>`;
      wrap.appendChild(card);
    });
    bindImageFallback(wrap, '.gem-img', '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="4" fill="#222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#555" font-size="12" font-family="sans-serif">?</text></svg>', 0.5);
  }

  const backBtn = panel.querySelector('#gemsBackBtn') as HTMLButtonElement | null;
  if (backBtn) {
    backBtn.style.display = 'none'; // No back in list view
  }

  if (state.input) {
    state.input.addEventListener('input', applyFilter);
  }
  const clearBtn = panel.querySelector('#gemsClear') as HTMLButtonElement | null;
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (state.input) state.input.value = '';
      applyFilter();
    });
  }

  renderTypeFilters();
  renderTagFilters();
  applyFilter();
}

function renderDetail(): void {
  const panel = ensurePanel();
  const detail = state.currentGemDetail;
  if (!detail) return;

  // Helper to remove leading numbers and % from column names
  function cleanColumnName(name: string): string {
    // Match pattern like "20% increased..." or "5 to 10 added..." and remove the leading number part
    return name.replace(/^[\d.]+%?\s+(?:to\s+[\d.]+\s+)?/, '').trim();
  }

  // Extract numeric columns for charting
  const levelProgression = detail.levelProgression || [];
  if (levelProgression.length === 0) {
    panel.innerHTML = `<div style='color:var(--text-secondary);'>No level progression data available</div>`;
    return;
  }

  const firstRow = levelProgression[0];
  const skipKeys = new Set(['itemtype', 'activeskillscode', 'reference', 'basetype', 'BaseType', 'ItemType', 'ActiveSkillsCode', 'Reference']);
  const skipChartKeys = new Set([
    'Level', 'Requires Level', 'Experience', 'Cost', 
    'Str', 'Dex', 'Int', 'Strength', 'Dexterity', 'Intelligence',
    'itemtype', 'activeskillscode', 'reference', 'basetype', 'BaseType', 'ItemType', 'ActiveSkillsCode', 'Reference'
  ]);
  const numericColumns: string[] = [];
  Object.keys(firstRow).forEach(key => {
    if (skipChartKeys.has(key)) return; // Skip requirement/metadata columns
    const val = firstRow[key];
    // Check if numeric (can be parsed as number or contains numbers)
    if (val && /[\d.]/.test(val)) {
      numericColumns.push(key);
    }
  });

  // Take up to 2 most interesting numeric columns for charts
  const chartColumns = numericColumns.slice(0, 2);

  // Filter metadata
  const filteredMetadata = Object.fromEntries(
    Object.entries(detail.metadata || {}).filter(([k]) => !skipKeys.has(k))
  );

  // Get image
  let gemImg: Gem | undefined;
  if (Array.isArray(state.cache)) {
    gemImg = state.cache.find((g: Gem) => g.slug === state.currentGemSlug);
  } else if (state.cache && !Array.isArray(state.cache)) {
    // Old structure with separate arrays
    gemImg = state.cache.SkillGemsGem?.find((g: Gem) => g.slug === state.currentGemSlug) ||
             state.cache.SupportGemsGem?.find((g: Gem) => g.slug === state.currentGemSlug) ||
             state.cache.AwakenedGem?.find((g: Gem) => g.slug === state.currentGemSlug);
  }
  const orig = gemImg?.imageLocal ? `poe1/${gemImg.imageLocal}` : '';
  const imgHtml = orig ? `<img class='gem-detail-img' src='${TRANSPARENT_PLACEHOLDER}' data-orig-src='${orig}' decoding='async' style='width:64px; height:64px; object-fit:contain; margin-right:12px;'>` : '';

  const description = detail.description || (gemImg as any)?.description || '';
  const descriptionHtml = description ? `
    <div style='background:var(--bg-secondary); padding:12px; border-radius:6px; margin-bottom:12px; font-size:13px; line-height:1.6; color:var(--text-primary);'>
      ${description}
    </div>
  ` : '';

  // Create reference links
  const gemSlug = state.currentGemSlug || '';
  const referenceLinksHtml = gemSlug ? `
    <div style='background:var(--bg-secondary); padding:12px; border-radius:6px; margin-bottom:12px;'>
      <div style='font-weight:600; margin-bottom:8px; color:var(--text-primary);'>External References</div>
      <div style='display:flex; gap:12px; flex-wrap:wrap;'>
        <a href='https://poe.ninja/' target='_blank' style='color:var(--accent-blue); text-decoration:none; font-size:12px; display:flex; align-items:center; gap:4px;'>
          <span>📊</span> poe.ninja
        </a>
        <a href='https://www.poewiki.net/wiki/${encodeURIComponent(detail.name.replace(/ /g, '_'))}' target='_blank' style='color:var(--accent-blue); text-decoration:none; font-size:12px; display:flex; align-items:center; gap:4px;'>
          <span>📖</span> Community Wiki
        </a>
        <a href='https://poedb.tw/us/${gemSlug}' target='_blank' style='color:var(--accent-blue); text-decoration:none; font-size:12px; display:flex; align-items:center; gap:4px;'>
          <span>🔍</span> PoEDB
        </a>
      </div>
    </div>
  ` : '';

  panel.innerHTML = `
    <div style='display:flex; gap:6px; align-items:center; margin-bottom:12px;'>
      <button id='gemDetailBackBtn' class='pin-btn' style='padding:4px 8px;'>← Back to List</button>
    </div>
    <div style='display:flex; align-items:center; margin-bottom:12px;'>
      ${imgHtml}
      <h2 style='margin:0; flex:1; font-size:18px; color:var(--text-primary);'>${detail.name}</h2>
    </div>
    ${descriptionHtml}
    <div style='background:var(--bg-secondary); padding:12px; border-radius:6px; margin-bottom:12px;'>
      <div style='font-weight:600; margin-bottom:8px;'>Metadata</div>
      <div style='display:grid; grid-template-columns: auto 1fr; gap:6px 12px; font-size:12px;'>
        ${Object.entries(filteredMetadata).map(([k, v]) => `
          <div style='color:var(--text-secondary);'>${k}:</div>
          <div style='color:var(--text-primary);'>${v}</div>
        `).join('')}
      </div>
    </div>
    ${referenceLinksHtml}
    ${chartColumns.length > 0 ? `
      <div style='display:grid; grid-template-columns:repeat(auto-fit, minmax(400px, 1fr)); gap:12px; margin-bottom:12px;'>
        ${chartColumns.map((col, idx) => {
          const cleanName = cleanColumnName(col);
          return `
          <div>
            <div style='font-weight:600; margin-bottom:8px; text-align:center;'>${cleanName} by Level</div>
            <canvas id='gemChart${idx}' style='width:100%; height:250px; background:var(--bg-secondary); border-radius:6px;'></canvas>
          </div>
        `;}).join('')}
      </div>
    ` : ''}
    <div style='background:var(--bg-secondary); padding:12px; border-radius:6px;'>
      <div style='font-weight:600; margin-bottom:8px;'>Level Progression</div>
      <div style='overflow-x:auto;'>
        <table style='width:100%; border-collapse:collapse; font-size:11px;'>
          <thead>
            <tr style='background:var(--bg-tertiary);'>
              ${Object.keys(firstRow).filter(k => !skipKeys.has(k)).map(k => {
                const cleanName = cleanColumnName(k);
                return `<th style='padding:6px; border:1px solid var(--border-color); text-align:left;'>${cleanName}</th>`;
              }).join('')}
            </tr>
          </thead>
          <tbody>
            ${levelProgression.map((row, idx) => `
              <tr style='${idx % 2 === 0 ? 'background:var(--bg-secondary);' : 'background:var(--bg-tertiary);'}'>
                ${Object.keys(firstRow).filter(k => !skipKeys.has(k)).map(k => `<td style='padding:6px; border:1px solid var(--border-color);'>${row[k] || ''}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  const backBtn = panel.querySelector('#gemDetailBackBtn') as HTMLButtonElement | null;
  if (backBtn) {
    backBtn.addEventListener('click', () => showList());
  }

  // Bind image fallback
  bindImageFallback(panel, '.gem-detail-img', '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="4" fill="#222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#555" font-size="16" font-family="sans-serif">?</text></svg>', 0.5);

  // Render charts
  chartColumns.forEach((col, idx) => {
    const canvas = panel.querySelector(`#gemChart${idx}`) as HTMLCanvasElement | null;
    if (!canvas) return;
    renderChart(canvas, col, levelProgression);
  });
}

function renderChart(canvas: HTMLCanvasElement, columnName: string, levelProgression: Array<Record<string, string>>): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Set canvas size
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };

  // Extract data points
  const dataPoints: { level: number, value: number }[] = [];
  levelProgression.forEach(row => {
    const level = parseInt(row.Level || '0', 10);
    const rawValue = row[columnName] || '';
    // Try to extract first number from value (handles ranges like "21, 31" or percentages)
    const match = rawValue.match(/[\d.]+/);
    if (match) {
      const value = parseFloat(match[0]);
      if (!isNaN(value)) {
        dataPoints.push({ level, value });
      }
    }
  });

  if (dataPoints.length === 0) return;

  // Find min/max for scaling
  const minLevel = Math.min(...dataPoints.map(d => d.level));
  const maxLevel = Math.max(...dataPoints.map(d => d.level));
  const minValue = Math.min(...dataPoints.map(d => d.value));
  const maxValue = Math.max(...dataPoints.map(d => d.value));

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const xScale = (level: number) => padding.left + ((level - minLevel) / (maxLevel - minLevel)) * chartWidth;
  const yScale = (value: number) => padding.top + chartHeight - ((value - minValue) / (maxValue - minValue)) * chartHeight;

  // Clear
  ctx.clearRect(0, 0, width, height);
  
  // Background
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, 0, width, height);

  // Grid lines
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = padding.top + (chartHeight / 5) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();
  }

  // Axes
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartHeight);
  ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
  ctx.stroke();

  // Y-axis labels
  ctx.fillStyle = '#aaa';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const value = minValue + ((maxValue - minValue) / 5) * (5 - i);
    const y = padding.top + (chartHeight / 5) * i;
    ctx.fillText(value.toFixed(1), padding.left - 10, y + 4);
  }

  // X-axis labels
  ctx.textAlign = 'center';
  for (let i = 0; i <= 5; i++) {
    const level = Math.round(minLevel + ((maxLevel - minLevel) / 5) * i);
    const x = padding.left + (chartWidth / 5) * i;
    ctx.fillText(level.toString(), x, padding.top + chartHeight + 20);
  }

  // Plot line
  ctx.strokeStyle = '#64b5f6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  dataPoints.forEach((point, idx) => {
    const x = xScale(point.level);
    const y = yScale(point.value);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Plot points
  ctx.fillStyle = '#2196f3';
  dataPoints.forEach(point => {
    const x = xScale(point.level);
    const y = yScale(point.value);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // Title
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(columnName, width / 2, 15);
}
