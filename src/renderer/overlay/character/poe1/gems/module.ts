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
  // Enhanced fields for detailed gem information
  gemDescription?: string; // Description from secDescrText div
  explicitMods?: Array<{ text: string; values: string[] }>; // Explicit modifiers with values
  modDescriptions?: string[]; // Explanatory text for mods (item_description spans)
  qualityMods?: Array<{ text: string; values: string[] }>; // Quality bonuses with value ranges
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
    <div style='display:flex; gap:6px; align-items:center; margin-bottom:8px;'>
      <button id='gemsBackBtn' class='pin-btn' style='padding:4px 8px;'>← Back</button>
      <input id='gemsSearch' type='text' placeholder='Search gems...' style='flex:1; padding:4px 8px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary); font-size:12px;'>
      <button id='gemsClear' class='pin-btn' style='padding:4px 8px;'>Clear</button>
    </div>
    <div style='background:var(--bg-secondary); padding:8px; border-radius:6px; margin-bottom:8px;'>
      <div id='gemTypeFilters' style='display:flex; gap:6px; justify-content:center; margin-bottom:8px; flex-wrap:wrap;'></div>
      <div id='gemTagFilters' style='display:flex; gap:4px; flex-wrap:wrap; justify-content:center;'></div>
    </div>
    <div id='gemsWrap' style='display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:10px;'></div>`;
  
  state.input = panel.querySelector('#gemsSearch') as HTMLInputElement | null;
  const wrap = panel.querySelector('#gemsWrap') as HTMLElement | null;
  const typeFilterWrap = panel.querySelector('#gemTypeFilters') as HTMLElement | null;
  const tagFilterWrap = panel.querySelector('#gemTagFilters') as HTMLElement | null;

  // Gem type filters - start with none selected (show all by default)
  const selectedGemTypes = new Set<string>();
  let tagsExpanded = false; // Track Show More/Less state for gem tags

  function getGemType(gem: Gem): string {
    if (gem.isTransfigured) return 'Transfigured';
    const name = gem.name || '';
    if (name.startsWith('Awakened ')) return 'Awakened';
    if (name.endsWith(' Support') || name.includes(' Support ')) return 'Support';
    return 'Skill';
  }

  // Color mapping for tags (matches Bases pattern)
  function tagRGB(tag: string): [number,number,number] {
    const t = (tag || '').toLowerCase();
    if (t === 'fire') return [220, 68, 61];
    if (t === 'cold') return [66, 165, 245];
    if (t === 'lightning') return [255, 213, 79];
    if (t === 'chaos') return [156, 39, 176];
    if (t === 'physical') return [158, 158, 158];
    if (t === 'attack') return [121, 85, 72];
    if (t === 'spell') return [92, 107, 192];
    if (t === 'projectile') return [255, 179, 0];
    if (t === 'aoe' || t === 'area') return [171, 71, 188];
    if (t === 'melee') return [121, 85, 72];
    if (t === 'critical' || t === 'crit') return [255, 179, 0];
    if (t === 'duration') return [66, 165, 245];
    if (t === 'minion' || t === 'summon') return [156, 39, 176];
    if (t === 'curse' || t === 'hex' || t === 'mark') return [156, 39, 176];
    if (t === 'aura' || t === 'herald') return [255, 193, 7];
    if (t === 'totem') return [121, 85, 72];
    if (t === 'trap') return [255, 112, 67];
    if (t === 'mine') return [255, 112, 67];
    if (t === 'bow') return [46, 125, 50];
    if (t === 'wand') return [92, 107, 192];
    if (t === 'channelling' || t === 'channeling') return [171, 71, 188];
    if (t === 'movement' || t === 'travel') return [67, 160, 71];
    if (t === 'support') return [156, 39, 176];
    if (t === 'trigger') return [255, 193, 7];
    if (t === 'vaal') return [220, 68, 61];
    if (t === 'guard') return [109, 76, 65];
    if (t === 'strike') return [121, 85, 72];
    if (t === 'slam') return [121, 85, 72];
    if (t === 'brand') return [92, 107, 192];
    if (t === 'link') return [255, 193, 7];
    if (t === 'orb') return [92, 107, 192];
    if (t === 'nova') return [171, 71, 188];
    if (t === 'chaining') return [255, 213, 79];
    return [120, 144, 156]; // Default gray
  }

  // Simplified chipCss matching Bases pattern
  function chipCss(tag: string, active: boolean) {
    const [r, g, b] = tagRGB(tag);
    const bg = active ? `rgba(${r},${g},${b},0.9)` : `rgba(${r},${g},${b},0.22)`;
    const border = `rgba(${r},${g},${b},0.6)`;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const color = active ? (luma > 180 ? '#000' : '#fff') : 'var(--text-primary)';
    return `border:1px solid ${border}; background:${bg}; color:${color};`;
  }

  // Chip CSS for type filters with preset colors
  function typeChipCss(type: string, active: boolean) {
    const typeColors: Record<string, string> = {
      'Skill': '255,87,34',      // Deep Orange
      'Support': '156,39,176',   // Purple
      'Awakened': '255,193,7',   // Amber
      'Transfigured': '0,188,212' // Cyan
    };
    const rgb = typeColors[type] || '120,144,156';
    const [r, g, b] = rgb.split(',').map(Number);
    const bg = active ? `rgba(${r},${g},${b},0.9)` : `rgba(${r},${g},${b},0.22)`;
    const border = `rgba(${r},${g},${b},0.6)`;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const color = active ? (luma > 180 ? '#000' : '#fff') : 'var(--text-primary)';
    return `border:1px solid ${border}; background:${bg}; color:${color};`;
  }

  function renderTypeFilters() {
    if (!typeFilterWrap) return;
    typeFilterWrap.innerHTML = '';
    ['Skill', 'Support', 'Awakened', 'Transfigured'].forEach(type => {
      const el = document.createElement('div');
      el.textContent = type;
      el.style.cssText = `cursor:pointer; user-select:none; padding:6px 14px; font-size:11px; border-radius:4px; ${typeChipCss(type, selectedGemTypes.has(type))}`;
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
    
    // Calculate if we need Show More button (approx 3 rows = ~21 tags @ 11px font with typical tag lengths)
    const MAX_TAGS_COLLAPSED = 21;
    const tagsToShow = (tagsExpanded || sortedTags.length <= MAX_TAGS_COLLAPSED) ? sortedTags : sortedTags.slice(0, MAX_TAGS_COLLAPSED);
    const needsShowMore = sortedTags.length > MAX_TAGS_COLLAPSED;
    
    tagsToShow.forEach(tag => {
      const count = state.tagCounts[tag];
      const el = document.createElement('div');
      el.textContent = `${tag} (${count})`;
      el.style.cssText = `cursor:pointer; user-select:none; padding:2px 6px; font-size:11px; border-radius:4px; ${chipCss(tag, state.selectedTags.has(tag))}`;
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
    
    // Show More/Less button
    if (needsShowMore) {
      const showMoreBtn = document.createElement('div');
      showMoreBtn.textContent = tagsExpanded ? 'Show Less' : `Show More (${sortedTags.length - MAX_TAGS_COLLAPSED} more)`;
      showMoreBtn.style.cssText = 'cursor:pointer; user-select:none; padding:2px 6px; font-size:11px; border:1px solid var(--border-color); border-radius:4px; background:var(--bg-tertiary); color:var(--text-secondary); font-style:italic;';
      showMoreBtn.addEventListener('click', () => {
        tagsExpanded = !tagsExpanded;
        renderTagFilters();
      });
      tagFilterWrap.appendChild(showMoreBtn);
    }
    
    // Reset button
    if (state.selectedTags.size > 0) {
      const reset = document.createElement('div');
      reset.textContent = 'Reset';
      reset.style.cssText = 'cursor:pointer; user-select:none; padding:2px 6px; font-size:11px; border:1px solid var(--accent-red); border-radius:4px; background:var(--accent-red); color:#fff';
      reset.addEventListener('click', () => {
        state.selectedTags.clear();
        applyFilter();
        renderTagFilters();
      });
      tagFilterWrap.appendChild(reset);
    }
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
      card.style.border = '2px solid rgba(144,164,174,0.3)';
      card.style.borderRadius = '6px';
      card.style.padding = '8px';
      card.style.display = 'flex';
      card.style.gap = '8px';
      card.style.alignItems = 'flex-start';
      card.style.minHeight = '70px';
      card.style.cursor = 'pointer';
      card.style.transition = 'transform 0.15s, box-shadow 0.15s, border-color 0.15s';
      card.style.background = 'var(--bg-secondary)';
      
      card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-2px)';
        card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
        card.style.borderColor = 'rgba(144,164,174,0.6)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
        card.style.boxShadow = '';
        card.style.borderColor = 'rgba(144,164,174,0.3)';
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
    let cleaned = name.replace(/^[\d.]+%?\s+(?:to\s+[\d.]+\s+)?/, '').trim();
    
    // If the text contains only ONE number (safe to remove placeholder), remove it
    // This handles cases like "equal to 5% of Flask's Recovery" -> "equal to % of Flask's Recovery"
    const numberMatches = cleaned.match(/\d+/g);
    if (numberMatches && numberMatches.length === 1) {
      // Only one number found - safe to remove it (it's likely a placeholder value)
      cleaned = cleaned.replace(/\d+/g, '').replace(/\s+/g, ' ').trim();
    }
    
    return cleaned;
  }

  // Helper to deduplicate array items and filter out internal game mods
  function deduplicateAndFilter<T extends { text: string }>(items: T[] | undefined): T[] {
    if (!items || items.length === 0) return [];
    
    const seen = new Set<string>();
    const internalModPatterns = [
      'console skill dont chase',
      'is area damage',
      'quality display',
      'display minion monster granted skill',
      'skill can add multiple charges per action',
      'base active skill totem placement speed',
      'active skill area of effect radius',
      'number of additional projectiles'
    ];
    
    return items.filter(item => {
      // Filter out internal game mods
      const lowerText = item.text.toLowerCase();
      if (internalModPatterns.some(pattern => lowerText.includes(pattern) && lowerText.includes('[1]'))) {
        return false;
      }
      
      // Deduplicate by text
      if (seen.has(item.text)) {
        return false;
      }
      seen.add(item.text);
      return true;
    });
  }

  // Helper to deduplicate simple string arrays - keep longest variant of similar strings
  function deduplicateStrings(items: string[] | undefined): string[] {
    if (!items || items.length === 0) return [];
    
    // Group similar strings (normalize by removing numbers and extra spaces)
    const groups = new Map<string, string[]>();
    items.forEach(item => {
      // Normalize: remove all numbers and collapse whitespace
      const normalized = item.replace(/[\d.]+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!groups.has(normalized)) {
        groups.set(normalized, []);
      }
      groups.get(normalized)!.push(item);
    });
    
    // For each group, keep only the longest string
    return Array.from(groups.values()).map(group => {
      return group.reduce((longest, current) => 
        current.length > longest.length ? current : longest
      );
    });
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

  // Filter out columns that don't scale (all values are the same)
  const chartColumns = numericColumns.filter(key => {
    // Extract all numeric values from this column across all levels
    const allValues: number[] = [];
    levelProgression.forEach(row => {
      const rawValue = row[key] || '';
      const matches = rawValue.match(/[\d.]+/g);
      if (matches) {
        matches.forEach(match => {
          const num = parseFloat(match);
          if (!isNaN(num)) allValues.push(num);
        });
      }
    });
    
    // Check if values actually vary
    if (allValues.length === 0) return false;
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const range = max - min;
    return range > 0.001; // Only include if values change
  });

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

  const gemDescription = detail.gemDescription || '';
  const description = detail.description || (gemImg as any)?.description || '';
  
  // Prefer gemDescription (cleaner), fall back to description, ignore "This item can be acquired..." sections
  const cleanDescription = gemDescription || description;
  
  const descriptionHtml = cleanDescription ? `
    <div style='background:var(--bg-secondary); padding:12px; border-radius:6px; margin-bottom:12px; font-size:13px; line-height:1.6; color:var(--text-primary);'>
      ${cleanDescription}
    </div>
  ` : '';

  const gemDescriptionHtml = ''; // No longer needed - using single clean description above

  // Deduplicate and filter explicit mods
  const uniqueExplicitMods = deduplicateAndFilter(detail.explicitMods);
  
  // Deduplicate and filter quality mods
  const uniqueQualityMods = deduplicateAndFilter(detail.qualityMods);
  
  // Filter out quality mods from explicit mods to avoid duplication
  // Normalize both for comparison (remove +, numbers in ranges, extra spaces)
  const normalizeModText = (text: string) => {
    return text
      .replace(/\+/g, '')  // Remove +
      .replace(/\([^)]+\)/g, '')  // Remove parentheses and their contents entirely
      .replace(/[\d.]+/g, '#')  // Replace all numbers with #
      .replace(/\s+/g, ' ')  // Collapse whitespace
      .trim()
      .toLowerCase();
  };
  
  const qualityTexts = new Set(uniqueQualityMods.map(m => normalizeModText(m.text)));
  const filteredExplicitMods = uniqueExplicitMods.filter(mod => {
    const normalized = normalizeModText(mod.text);
    return !qualityTexts.has(normalized);
  });
  
  const explicitModsHtml = filteredExplicitMods.length > 0 ? `
    <div style='background:rgba(65,105,225,0.08); border:1px solid rgba(65,105,225,0.25); padding:14px; border-radius:6px; margin-bottom:12px;'>
      <div style='font-weight:600; margin-bottom:10px; color:var(--accent-blue);'>Explicit Modifiers</div>
      <div style='display:flex; flex-direction:column; gap:6px;'>
        ${filteredExplicitMods.map(mod => `
          <div style='font-size:14px; line-height:1.5; color:var(--text-primary); display:flex; align-items:baseline; gap:8px;'>
            <span style='color:var(--accent-blue); font-weight:bold; flex-shrink:0;'>▸</span>
            <span style='flex:1;'>
              ${mod.text
                .replace(/\((\d+(?:–\d+)?(?:\.\d+)?)\)/g, '<span style="color:var(--accent-blue); font-weight:600;">($1)</span>')
                .replace(/(\d+(?:\.\d+)?)%/g, '<span style="color:var(--accent-blue); font-weight:600;">$1%</span>')
                .replace(/(\d+(?:\.\d+)?)\s+/g, '<span style="color:var(--accent-blue); font-weight:600;">$1</span> ')
              }
            </span>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  // Deduplicate mod descriptions
  const uniqueModDescriptions = deduplicateStrings(detail.modDescriptions);
  const modDescriptionsHtml = uniqueModDescriptions.length > 0 ? `
    <div style='background:var(--bg-secondary); padding:12px; border-radius:6px; margin-bottom:12px;'>
      <div style='font-weight:600; margin-bottom:8px; color:var(--text-primary);'>Modifier Explanations</div>
      <div style='display:flex; flex-direction:column; gap:6px;'>
        ${uniqueModDescriptions.map(desc => `
          <div style='font-size:12px; line-height:1.6; color:var(--text-secondary); font-style:italic;'>
            ${desc}
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  const qualityModsHtml = uniqueQualityMods.length > 0 ? `
    <div style='background:rgba(65,105,225,0.08); border:1px solid rgba(65,105,225,0.25); padding:14px; border-radius:6px; margin-bottom:12px;'>
      <div style='font-weight:600; margin-bottom:10px; color:var(--accent-blue);'>Additional Effects From Quality</div>
      <div style='display:flex; flex-direction:column; gap:4px;'>
        ${uniqueQualityMods.map(mod => `
          <div style='font-size:14px; line-height:1.5; color:var(--text-primary);'>
            ${mod.text
              .replace(/\((\d+(?:–\d+)?(?:\.\d+)?)\)/g, '<span style="color:var(--accent-blue); font-weight:600;">($1)</span>')
              .replace(/(\d+(?:\.\d+)?)%/g, '<span style="color:var(--accent-blue); font-weight:600;">$1%</span>')
            }
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  // Create reference links (will be positioned at the end)
  const gemSlug = state.currentGemSlug || '';
  const referenceLinksHtml = gemSlug ? `
    <div style='background:var(--bg-secondary); padding:12px; border-radius:6px; margin-top:12px;'>
      <div style='font-weight:600; margin-bottom:8px; color:var(--text-primary);'>External References</div>
      <div style='display:flex; gap:12px; flex-wrap:wrap;'>
        <a class='external-link' data-href='https://poe.ninja/' style='cursor:pointer; color:var(--accent-blue); text-decoration:none; font-size:12px; display:flex; align-items:center; gap:4px;'>
          <span>📊</span> poe.ninja
        </a>
        <a class='external-link' data-href='https://www.poewiki.net/wiki/${encodeURIComponent(detail.name.replace(/ /g, '_'))}' style='cursor:pointer; color:var(--accent-blue); text-decoration:none; font-size:12px; display:flex; align-items:center; gap:4px;'>
          <span>📖</span> Community Wiki
        </a>
        <a class='external-link' data-href='https://poedb.tw/us/${gemSlug}' style='cursor:pointer; color:var(--accent-blue); text-decoration:none; font-size:12px; display:flex; align-items:center; gap:4px;'>
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
    ${gemDescriptionHtml}
    ${explicitModsHtml}
    ${modDescriptionsHtml}
    ${qualityModsHtml}
    <div style='background:var(--bg-secondary); padding:12px; border-radius:6px; margin-bottom:12px;'>
      <div style='font-weight:600; margin-bottom:8px;'>Metadata</div>
      <div style='display:grid; grid-template-columns: auto 1fr; gap:6px 12px; font-size:12px;'>
        ${Object.entries(filteredMetadata).map(([k, v]) => `
          <div style='color:var(--text-secondary);'>${k}:</div>
          <div style='color:var(--text-primary);'>${v}</div>
        `).join('')}
      </div>
    </div>
    ${chartColumns.length > 0 ? `
      <div style='margin-bottom:12px;'>
        ${chartColumns.length >= 3 ? `
          <!-- For 3+ charts: 2 on top row, rest full-width below -->
          <div style='display:grid; grid-template-columns:repeat(2, 1fr); gap:12px; margin-bottom:12px;'>
            ${chartColumns.slice(0, 2).map((col, idx) => {
              return `
              <div>
                <canvas id='gemChart${idx}' style='width:100%; height:250px; background:var(--bg-secondary); border-radius:6px;'></canvas>
              </div>
            `;}).join('')}
          </div>
          ${chartColumns.slice(2).map((col, idx) => {
            const actualIdx = idx + 2;
            return `
            <div style='margin-bottom:12px;'>
              <canvas id='gemChart${actualIdx}' style='width:100%; height:250px; background:var(--bg-secondary); border-radius:6px;'></canvas>
            </div>
          `;}).join('')}
        ` : `
          <!-- For 1-2 charts: side by side -->
          <div style='display:grid; grid-template-columns:repeat(auto-fit, minmax(400px, 1fr)); gap:12px;'>
            ${chartColumns.map((col, idx) => {
              return `
              <div>
                <canvas id='gemChart${idx}' style='width:100%; height:250px; background:var(--bg-secondary); border-radius:6px;'></canvas>
              </div>
            `;}).join('')}
          </div>
        `}
      </div>
    ` : ''}
    <div style='background:var(--bg-secondary); padding:12px; border-radius:6px;'>
      <div style='font-weight:600; margin-bottom:8px;'>Level Progression</div>
      <div style='overflow-x:auto;'>
        <table style='width:100%; border-collapse:collapse; font-size:11px; table-layout:auto;'>
          <thead>
            <tr style='background:var(--bg-tertiary);'>
              ${Object.keys(firstRow).filter(k => !skipKeys.has(k)).map(k => {
                const cleanName = cleanColumnName(k);
                const lowerName = cleanName.toLowerCase();
                
                // Determine header color based on content
                let headerColor = 'var(--text-primary)';
                if (lowerName.includes('damage') || lowerName.includes('attack') || lowerName.includes('critical')) {
                  headerColor = '#ff6b6b';
                } else if (lowerName.includes('mana') || lowerName.includes('cost')) {
                  headerColor = '#4dabf7';
                } else if (lowerName.includes('duration') || lowerName.includes('cooldown')) {
                  headerColor = '#a78bfa';
                } else if (lowerName.includes('speed') || lowerName.includes('cast time')) {
                  headerColor = '#51cf66';
                }
                
                // Add % or other units to headers where appropriate
                let displayName = cleanName;
                if (lowerName.includes('damage') && !lowerName.includes('added') && !cleanName.includes('%')) {
                  displayName = cleanName + ' %';
                } else if ((lowerName.includes('increased') || lowerName.includes('more') || lowerName.includes('reduced')) && !cleanName.includes('%')) {
                  displayName = cleanName + ' %';
                }
                
                // SIMPLE: Let browser auto-size. Headers wrap to max 2 lines, data cells stay single line
                return `<th style='padding:4px 6px; border:1px solid var(--border-color); text-align:left; color:${headerColor}; font-weight:600; white-space:normal; word-wrap:break-word; line-height:1.25; vertical-align:top; font-size:10px; max-height:2.5em; overflow:hidden;'>${displayName}</th>`;
              }).join('')}
            </tr>
          </thead>
          <tbody>
            ${levelProgression.map((row, idx) => {
              const level = parseInt(row.Level || '0', 10);
              const isKeyLevel = level === 1 || level === 20 || level === 40;
              const rowBg = isKeyLevel 
                ? (level === 1 ? 'rgba(66,165,245,0.15)' : level === 20 ? 'rgba(255,193,7,0.15)' : 'rgba(156,39,176,0.15)')
                : (idx % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-tertiary)');
              const rowBorder = isKeyLevel ? '2px solid ' + (level === 1 ? '#42a5f5' : level === 20 ? '#ffc107' : '#9c27b0') : '';
              
              const cells = Object.keys(firstRow).filter(k => !skipKeys.has(k)).map(colKey => {
                const rawValue = row[colKey] || '';
                
                // For multi-value cells (e.g., "40, 1"), extract only the first value
                // This handles cases where the second value is constant/irrelevant
                const values = rawValue.split(',').map(v => v.trim()).filter(v => v);
                const primaryValue = values.length > 0 ? values[0] : rawValue;
                
                // Deduplicate cell values (e.g., "136.4%, 136.4%" -> "136.4%")
                let deduplicatedValue = rawValue.split(',').map(v => v.trim()).filter((v, i, arr) => arr.indexOf(v) === i).join(', ');
                
                // Hide varying numbers in descriptive text (e.g., "Deals up to 40% more Damage" -> "Deals up to % more Damage")
                // ONLY replace numbers in cells that contain descriptive words (Deals, up to, more, etc.)
                const hasDescriptiveText = /\b(deals|up to|more|less|increased|reduced|additional|maximum|minimum)\b/i.test(deduplicatedValue);
                if (hasDescriptiveText) {
                  // Replace standalone numbers followed by % with just %
                  deduplicatedValue = deduplicatedValue.replace(/\b(\d+(?:\.\d+)?%)\b/g, '%');
                }
                
                // Metadata columns that should NOT show deltas (Level, Requirements, Cost, Experience, Attributes)
                const metadataColumns = new Set([
                  'Level', 'Requires Level', 'RequiresLevel', 'Req Level',
                  'Str', 'Dex', 'Int', 'Strength', 'Dexterity', 'Intelligence',
                  'Cost', 'Mana Cost', 'ManaCost', 'Mana', 'Mana Reserved',
                  'Experience', 'Exp', 'Soul Cost'
                ]);
                
                const lowerColKey = colKey.toLowerCase();
                const isMetadata = metadataColumns.has(colKey) || 
                                  lowerColKey.includes('level') || 
                                  lowerColKey.includes('cost') || 
                                  lowerColKey.includes('exp') ||
                                  lowerColKey.includes('require');
                
                // Calculate delta from previous level (ONLY for damage/defense/special stats, NOT metadata)
                let deltaHtml = '';
                let isSignificant = false;
                if (!isMetadata && idx > 0 && /[\d.]/.test(primaryValue)) {
                  const prevRow = levelProgression[idx - 1];
                  const prevRawValue = prevRow[colKey] || '';
                  const prevValues = prevRawValue.split(',').map(v => v.trim()).filter(v => v);
                  const prevPrimaryValue = prevValues.length > 0 ? prevValues[0] : prevRawValue;
                  
                  // Extract first numeric value from both primary values
                  const currentMatch = primaryValue.match(/[\d.]+/);
                  const prevMatch = prevPrimaryValue.match(/[\d.]+/);
                  
                  if (currentMatch && prevMatch) {
                    const current = parseFloat(currentMatch[0]);
                    const prev = parseFloat(prevMatch[0]);
                    const delta = current - prev;
                    
                    if (Math.abs(delta) > 0.001) {
                      // NEW values are ALWAYS better - always show in green
                      const deltaColor = '#51cf66';
                      const deltaSign = delta > 0 ? '+' : '';
                      const deltaFormatted = Math.abs(delta) >= 10 ? delta.toFixed(1) : delta.toFixed(2);
                      deltaHtml = ` <span style="color:${deltaColor}; font-size:10px;">(${deltaSign}${deltaFormatted})</span>`;
                      
                      // ONLY highlight EXTREME outliers: >50% relative change OR >20 absolute for percentage stats
                      const relativeChange = prev > 0 ? Math.abs(delta / prev) : 0;
                      if (relativeChange > 0.5 || Math.abs(delta) > 20) {
                        isSignificant = true;
                      }
                    }
                  }
                }
                
                const cellStyle = isSignificant 
                  ? `padding:6px; border:1px solid var(--border-color); font-weight:700; background:rgba(255,193,7,0.1); white-space:nowrap;`
                  : `padding:6px; border:1px solid var(--border-color); white-space:nowrap;`;
                
                return `<td style='${cellStyle}'>${deduplicatedValue}${deltaHtml}</td>`;
              }).join('');
              
              return `<tr style='background:${rowBg}; ${rowBorder ? `border-left:${rowBorder}; border-right:${rowBorder};` : ''}'>${cells}</tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
    ${referenceLinksHtml}
  `;

  const backBtn = panel.querySelector('#gemDetailBackBtn') as HTMLButtonElement | null;
  if (backBtn) {
    backBtn.addEventListener('click', () => showList());
  }

  // Bind external links to open in system browser
  const externalLinks = panel.querySelectorAll('.external-link');
  externalLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const href = (link as HTMLElement).getAttribute('data-href');
      if (href && (window as any).electronAPI?.openExternal) {
        (window as any).electronAPI.openExternal(href);
      } else if (href) {
        // Fallback for non-Electron environments
        window.open(href, '_blank');
      }
    });
  });

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

  // Extract ALL data series (multiple lines for multi-value columns)
  const dataSeries: Array<{ level: number, value: number }[]> = [];
  let maxSeriesCount = 0;
  
  // First pass: determine how many series we have
  levelProgression.forEach(row => {
    const rawValue = row[columnName] || '';
    const matches = rawValue.match(/[\d.]+/g);
    if (matches && matches.length > maxSeriesCount) {
      maxSeriesCount = matches.length;
    }
  });
  
  // Initialize series arrays
  for (let i = 0; i < maxSeriesCount; i++) {
    dataSeries.push([]);
  }
  
  // Second pass: extract data points for each series
  levelProgression.forEach(row => {
    const level = parseInt(row.Level || '0', 10);
    const rawValue = row[columnName] || '';
    const matches = rawValue.match(/[\d.]+/g);
    
    if (matches) {
      matches.forEach((match, seriesIdx) => {
        const value = parseFloat(match);
        if (!isNaN(value) && dataSeries[seriesIdx]) {
          dataSeries[seriesIdx].push({ level, value });
        }
      });
    }
  });

  // Filter out empty series
  const validSeries = dataSeries.filter(series => series.length > 0);
  if (validSeries.length === 0) return;

  // Find min/max for scaling across ALL series
  const allPoints = validSeries.flat();
  const minLevel = Math.min(...allPoints.map(d => d.level));
  const maxLevel = Math.max(...allPoints.map(d => d.level));
  const minValue = Math.min(...allPoints.map(d => d.value));
  const maxValue = Math.max(...allPoints.map(d => d.value));

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

  // Colors for multiple series
  const seriesColors = [
    '#64b5f6',  // Blue
    '#81c784',  // Green
    '#ffb74d',  // Orange
    '#e57373',  // Red
    '#ba68c8',  // Purple
    '#4dd0e1',  // Cyan
  ];

  // Plot all series
  validSeries.forEach((dataPoints, seriesIdx) => {
    const color = seriesColors[seriesIdx % seriesColors.length];
    
    // Plot line
    ctx.strokeStyle = color;
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
    ctx.fillStyle = color;
    dataPoints.forEach(point => {
      const x = xScale(point.level);
      const y = yScale(point.value);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  // Title (show "min-max" if multiple series) with ellipsis if too long
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  const titleSuffix = validSeries.length > 1 ? ` (${validSeries.length} values)` : '';
  let titleText = columnName + titleSuffix;
  
  // Truncate with ellipsis if text is too wide
  const maxTitleWidth = width - 40; // Leave 20px padding on each side
  let titleWidth = ctx.measureText(titleText).width;
  
  if (titleWidth > maxTitleWidth) {
    // Binary search for the right length
    let low = 0;
    let high = columnName.length;
    let bestFit = columnName;
    
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const testText = columnName.substring(0, mid) + '...' + titleSuffix;
      const testWidth = ctx.measureText(testText).width;
      
      if (testWidth <= maxTitleWidth) {
        bestFit = columnName.substring(0, mid);
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    
    titleText = bestFit + '...' + titleSuffix;
  }
  
  ctx.fillText(titleText, width / 2, 15);
}

/**
 * Convert a gem name to its slug format for looking up details.
 * Examples:
 *   "Lightning Strike" -> "lightning_strike"
 *   "Awakened Deadly Ailments Support" -> "awakened_deadly_ailments_support"
 *   "Enlighten Support" -> "enlighten_support"
 */
function gemNameToSlug(gemName: string): string {
  if (!gemName) return '';
  return gemName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
}

/**
 * Find the gem slug for a given gem name by searching the cache.
 * This is more reliable than just converting the name to slug format
 * because gems might have special naming conventions.
 */
async function findGemSlugByName(gemName: string): Promise<string | null> {
  try {
    // Ensure we have the gems cache loaded
    if (!state.cache) {
      const data = await (window as any).electronAPI.getPoe1Gems?.();
      if (!data || data.error) return null;
      state.cache = data.gems || {};
    }

    // Get all gems
    let allGems: Gem[] = [];
    if (Array.isArray(state.cache)) {
      allGems = state.cache;
    } else if (state.cache && !Array.isArray(state.cache) && (state.cache.SkillGemsGem || state.cache.SupportGemsGem || state.cache.AwakenedGem)) {
      allGems = [
        ...(state.cache.SkillGemsGem || []),
        ...(state.cache.SupportGemsGem || []),
        ...(state.cache.AwakenedGem || [])
      ];
    }

    // Try to find exact match first
    const exactMatch = allGems.find(gem => gem.name === gemName);
    if (exactMatch && exactMatch.slug) {
      return exactMatch.slug;
    }

    // Try case-insensitive match
    const lowerGemName = gemName.toLowerCase();
    const caseInsensitiveMatch = allGems.find(gem => 
      gem.name?.toLowerCase() === lowerGemName
    );
    if (caseInsensitiveMatch && caseInsensitiveMatch.slug) {
      return caseInsensitiveMatch.slug;
    }

    // Fallback: convert name to slug format
    return gemNameToSlug(gemName);
  } catch (e) {
    console.error('[Gems] Error finding gem slug:', e);
    return gemNameToSlug(gemName);
  }
}

/**
 * Show gem detail by name (called when a gem is copied in-game)
 */
export async function showDetailByName(gemName: string): Promise<void> {
  if (!gemName) {
    console.warn('[Gems] showDetailByName called with empty name');
    return;
  }

  console.log('[Gems] Looking up gem:', gemName);
  const slug = await findGemSlugByName(gemName);
  
  if (!slug) {
    console.error('[Gems] Could not find slug for gem:', gemName);
    // Fallback: show the list
    await showList();
    return;
  }

  console.log('[Gems] Found slug:', slug, 'for gem:', gemName);
  await showDetail(slug);
}
