// PoE1 Gems module with list and detail views
import { applyFilterChipChrome, type ChipChrome } from "../../../utils";
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

// Show a loading overlay to prevent flicker during async operations
function showLoadingOverlay(message = 'Loading...') {
  const panel = ensurePanel();
  panel.style.display = '';
  panel.innerHTML = `
    <div style='
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 400px;
      gap: 16px;
    '>
      <div style='
        width: 48px;
        height: 48px;
        border: 4px solid var(--bg-tertiary);
        border-top: 4px solid var(--accent-blue);
        border-radius: 50%;
        animation: spin 1s linear infinite;
      '></div>
      <div style='color: var(--text-secondary); font-size: 14px;'>${message}</div>
    </div>
    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  `;
}

export async function showList(): Promise<void> {
  (window as any).__lastPanel = 'poe1-gems-list';
  setCharacterTabActive();
  showLoadingOverlay('Loading Gems...');
  setTimeout(()=>{ ensurePanel().scrollTop=0; }, 10);
  try {
    const data = await (window as any).electronAPI.getPoe1Gems?.();
    if (!data || data.error) { 
      const panel = ensurePanel();
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load Gems (${data?.error||'unknown'})</div>`; 
      return; 
    }
    state.cache = data.gems || {};
    renderList();
  } catch (e) {
    const panel = ensurePanel();
    panel.innerHTML = `<div style='color:var(--accent-red);'>Exception loading Gems: ${e}</div>`;
  }
}

export async function showDetail(gemSlug: string): Promise<void> {
  (window as any).__lastPanel = `poe1-gem-detail:${gemSlug}`;
  setCharacterTabActive();
  showLoadingOverlay(`Loading gem details...`);
  setTimeout(()=>{ ensurePanel().scrollTop=0; }, 10);
  try {
    const detail = await (window as any).electronAPI.getPoe1GemDetail?.(gemSlug);
    if (!detail || detail.error) {
      const panel = ensurePanel();
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load gem detail for ${gemSlug} (${detail?.error||'unknown'})</div>`; 
      return; 
    }
    state.currentGemSlug = gemSlug;
    state.currentGemDetail = detail;
    renderDetail();
  } catch (e) {
    const panel = ensurePanel();
    panel.innerHTML = `<div style='color:var(--accent-red);'>Exception loading gem detail: ${e}</div>`;
  }
}

function renderList(): void {
  const panel = ensurePanel();
  if (!state.cache) return;

  // Handle multiple structure formats:
  // state.cache should be either:
  // 1. Array of gem objects (current structure after IPC loads data.gems)
  // 2. Object with SkillGemsGem/SupportGemsGem/AwakenedGem (old legacy structure)
  let allGems: Gem[] = [];
  if (Array.isArray(state.cache)) {
    // Direct array of gems (current structure)
    allGems = state.cache;
  } else if (state.cache.SkillGemsGem || state.cache.SupportGemsGem || state.cache.AwakenedGem) {
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

  console.log('[Gems] Total gems loaded:', allGems.length);
  console.log('[Gems] Sample gem:', allGems[0]);

  state.selectedTags.clear();
  state.tagCounts = {};

  const tagCounts: Record<string, number> = {};

  // Generate smart tags from gem names and descriptions if tags don't exist
  allGems.forEach(gem => {
    let tags = Array.isArray(gem.tags) && gem.tags.length > 0 ? gem.tags : [];
    
    // If no tags, generate them from name and description
    if (tags.length === 0) {
      const smartTags: string[] = [];
      const text = `${gem.name || ''} ${(gem as any).description || ''}`.toLowerCase();
      
      // Damage types
      if (/\b(fire|burning|ignite|flame)\b/.test(text)) smartTags.push('Fire');
      if (/\b(cold|chill|freeze|frost|ice)\b/.test(text)) smartTags.push('Cold');
      if (/\b(lightning|shock|electric)\b/.test(text)) smartTags.push('Lightning');
      if (/\b(chaos|poison|wither)\b/.test(text)) smartTags.push('Chaos');
      if (/\b(physical|bleed|impale)\b/.test(text)) smartTags.push('Physical');
      
      // Skill types
      if (/\b(attack|weapon|melee|bow|strike|slam|shot)\b/.test(text)) smartTags.push('Attack');
      if (/\b(spell|cast|nova|blast|bolt)\b/.test(text)) smartTags.push('Spell');
      if (/\b(minion|summon|zombie|skeleton|spectre|golem)\b/.test(text)) smartTags.push('Minion');
      if (/\b(aura|banner|stance)\b/.test(text)) smartTags.push('Aura');
      if (/\b(curse|hex|mark)\b/.test(text)) smartTags.push('Curse');
      if (/\b(trap|mine)\b/.test(text)) smartTags.push('Trap/Mine');
      if (/\b(totem)\b/.test(text)) smartTags.push('Totem');
      if (/\b(warcry|cry)\b/.test(text)) smartTags.push('Warcry');
      if (/\b(movement|travel|dash|leap|blink)\b/.test(text)) smartTags.push('Movement');
      if (/\b(guard|block|shield|armour)\b/.test(text)) smartTags.push('Defence');
      
      // Support indicators
      if (gem.name && /support/i.test(gem.name)) smartTags.push('Support');
      if (gem.name && /awakened/i.test(gem.name)) smartTags.push('Awakened');
      if (gem.name && /vaal/i.test(gem.name)) smartTags.push('Vaal');
      
      tags = smartTags;
      // Store generated tags back to gem for consistency
      (gem as any).tags = smartTags;
    }
    
    tags.forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });

  console.log('[Gems] Tag counts:', tagCounts);
  console.log('[Gems] Total unique tags:', Object.keys(tagCounts).length);

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
    <div id='gemsWrap' style='display:grid; grid-template-columns: repeat(2, 1fr); gap:16px;'></div>`;
  
  state.input = panel.querySelector('#gemsSearch') as HTMLInputElement | null;
  const wrap = panel.querySelector('#gemsWrap') as HTMLElement | null;
  const typeFilterWrap = panel.querySelector('#gemTypeFilters') as HTMLElement | null;
  const tagFilterWrap = panel.querySelector('#gemTagFilters') as HTMLElement | null;

  // Gem type filters - start with none selected (show all by default)
  const selectedGemTypes = new Set<string>();
  let tagsExpanded = false; // Track Show More/Less state for gem tags

  function getGemType(gem: Gem): string {
    const name = gem.name || '';
    // Check for isTransfigured property OR name pattern " of "
    if (gem.isTransfigured || / of /.test(name)) return 'Transfigured';
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

  // Simplified chip chrome matching Bases pattern
  function chipChrome(tag: string, active: boolean): ChipChrome {
    const [r, g, b] = tagRGB(tag);
    const background = active ? `rgba(${r},${g},${b},0.9)` : `rgba(${r},${g},${b},0.22)`;
    const border = `1px solid rgba(${r},${g},${b},0.6)`;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const color = active ? (luma > 180 ? '#000' : '#fff') : 'var(--text-primary)';
    return { border, background, color };
  }

  // Chip CSS for type filters with preset colors
  function typeChipChrome(type: string, active: boolean): ChipChrome {
    const typeColors: Record<string, string> = {
      'Skill': '255,87,34',      // Deep Orange
      'Support': '156,39,176',   // Purple
      'Awakened': '255,193,7',   // Amber
      'Transfigured': '0,188,212' // Cyan
    };
    const rgb = typeColors[type] || '120,144,156';
    const [r, g, b] = rgb.split(',').map(Number);
    const background = active ? `rgba(${r},${g},${b},0.9)` : `rgba(${r},${g},${b},0.22)`;
    const border = `1px solid rgba(${r},${g},${b},0.6)`;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const color = active ? (luma > 180 ? '#000' : '#fff') : 'var(--text-primary)';
    return { border, background, color };
  }

  function renderTypeFilters() {
    if (!typeFilterWrap) return;
    typeFilterWrap.innerHTML = '';
    ['Skill', 'Support', 'Awakened', 'Transfigured'].forEach(type => {
      const el = document.createElement('div');
      el.textContent = type;
      const active = selectedGemTypes.has(type);
      applyFilterChipChrome(el, typeChipChrome(type, active), { padding: '6px 14px', fontWeight: active ? '600' : '500' });
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
      const active = state.selectedTags.has(tag);
      applyFilterChipChrome(el, chipChrome(tag, active), { padding: '3px 10px', fontWeight: active ? '600' : '500' });
      el.style.margin = '0 4px 4px 0';
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
      showMoreBtn.style.cursor = 'pointer';
      showMoreBtn.style.userSelect = 'none';
      showMoreBtn.style.padding = '2px 6px';
      showMoreBtn.style.border = '1px solid var(--border-color)';
      showMoreBtn.style.borderRadius = '4px';
      showMoreBtn.style.background = 'var(--bg-tertiary)';
      showMoreBtn.style.color = 'var(--text-secondary)';
      showMoreBtn.style.fontStyle = 'italic';
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
      applyFilterChipChrome(reset, { border: '1px solid var(--accent-red)', background: 'var(--accent-red)', color: '#fff' }, { padding: '3px 10px', fontWeight: '600' });
      reset.style.margin = '0 4px 4px 0';
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
    
    // Get all gems from cache
    let allGems: Gem[] = [];
    if (Array.isArray(state.cache)) {
      allGems = state.cache;
    } else if (state.cache && (state.cache.SkillGemsGem || state.cache.SupportGemsGem || state.cache.AwakenedGem)) {
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
      card.style.background = 'linear-gradient(135deg, rgba(30,36,42,0.95), rgba(20,24,28,0.95))';
      card.style.border = '2px solid rgba(144,164,174,0.3)';
      card.style.borderRadius = '8px';
      card.style.padding = '16px';
      card.style.display = 'flex';
      card.style.flexDirection = 'row';
      card.style.gap = '16px';
      card.style.alignItems = 'flex-start';
      card.style.cursor = 'pointer';
      card.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease';
      card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
      
      card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-2px)';
        card.style.boxShadow = '0 6px 16px rgba(0,0,0,0.5)';
        card.style.borderColor = 'rgba(144,164,174,0.7)';
        card.style.background = 'linear-gradient(135deg, rgba(35,42,50,0.95), rgba(25,30,36,0.95))';
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
        card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        card.style.borderColor = 'rgba(144,164,174,0.3)';
        card.style.background = 'linear-gradient(135deg, rgba(30,36,42,0.95), rgba(20,24,28,0.95))';
      });
      card.addEventListener('click', () => {
        if (gem.slug) showDetail(gem.slug);
      });
      
      // Left side: Image
      const imgWrap = document.createElement('div');
      imgWrap.style.flex = '0 0 auto';
      imgWrap.style.display = 'flex';
      imgWrap.style.alignItems = 'center';
      imgWrap.style.justifyContent = 'center';
      
      const img = document.createElement('img');
      img.className = 'gem-img';
      img.src = TRANSPARENT_PLACEHOLDER;
      const orig = gem.imageLocal ? `poe1/${gem.imageLocal}` : '';
      if (orig) img.setAttribute('data-orig-src', orig);
      img.decoding = 'async';
      img.style.width = '96px';
      img.style.height = '96px';
      img.style.objectFit = 'contain';
      img.style.borderRadius = '8px';
      img.style.background = 'rgba(255,255,255,0.03)';
      img.style.padding = '8px';
      img.style.border = '1px solid rgba(255,255,255,0.1)';
      
      imgWrap.appendChild(img);
      card.appendChild(imgWrap);
      
      // Right side: Content
      const contentBlock = document.createElement('div');
      contentBlock.style.flex = '1';
      contentBlock.style.display = 'flex';
      contentBlock.style.flexDirection = 'column';
      contentBlock.style.gap = '8px';
      contentBlock.style.minWidth = '0';
      
      // Header with name and details chip
      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      header.style.justifyContent = 'space-between';
      header.style.gap = '8px';
      header.style.paddingBottom = '8px';
      header.style.borderBottom = '1px solid rgba(144,164,174,0.2)';
      
      const nameDiv = document.createElement('div');
      nameDiv.style.fontWeight = '600';
      nameDiv.style.fontSize = '16px';
      nameDiv.style.flex = '1';
      nameDiv.style.minWidth = '0';
      if (gem.color) nameDiv.style.color = gem.color;
      nameDiv.textContent = gem.name || '';
      header.appendChild(nameDiv);
      
      const detailsChip = document.createElement('div');
      detailsChip.style.display = 'inline-flex';
      detailsChip.style.alignItems = 'center';
      detailsChip.style.gap = '3px';
      detailsChip.style.padding = '3px 8px';
      detailsChip.style.background = 'rgba(66,165,245,0.15)';
      detailsChip.style.border = '1px solid rgba(66,165,245,0.4)';
      detailsChip.style.borderRadius = '4px';
      detailsChip.style.fontSize = '10px';
      detailsChip.style.fontWeight = '600';
      detailsChip.style.color = '#42A5F5';
      detailsChip.style.whiteSpace = 'nowrap';
      detailsChip.style.flexShrink = '0';
      detailsChip.innerHTML = `Details <span style="margin-left:3px;">→</span>`;
      header.appendChild(detailsChip);
      
      contentBlock.appendChild(header);
      
      // Description
      const description = (gem as any).description || '';
      if (description) {
        const descDiv = document.createElement('div');
        descDiv.style.fontSize = '13px';
        descDiv.style.color = 'var(--text-secondary)';
        descDiv.style.lineHeight = '1.5';
        descDiv.textContent = description;
        contentBlock.appendChild(descDiv);
      }
      
      // Tags
      const tags = Array.isArray(gem.tags) ? gem.tags : [];
      if (tags.length > 0) {
        const tagsDiv = document.createElement('div');
        tagsDiv.style.display = 'flex';
        tagsDiv.style.flexWrap = 'wrap';
        tagsDiv.style.gap = '4px';
        
        tags.forEach((tag: string) => {
          const tagSpan = document.createElement('span');
          tagSpan.style.display = 'inline-block';
          tagSpan.style.padding = '2px 6px';
          tagSpan.style.fontSize = '10px';
          tagSpan.style.borderRadius = '3px';
          tagSpan.style.background = 'rgba(144,164,174,0.18)';
          tagSpan.style.border = '1px solid rgba(144,164,174,0.4)';
          tagSpan.style.color = 'var(--text-secondary)';
          tagSpan.textContent = tag;
          tagsDiv.appendChild(tagSpan);
        });
        
        contentBlock.appendChild(tagsDiv);
      }
      
      card.appendChild(contentBlock);
      wrap.appendChild(card);
    });
    bindImageFallback(wrap, '.gem-img', '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 48 48"><rect width="48" height="48" rx="4" fill="#222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#555" font-size="12" font-family="sans-serif">?</text></svg>', 0.5);
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
    } else if (state.cache && (state.cache.SkillGemsGem || state.cache.SupportGemsGem || state.cache.AwakenedGem)) {
      // Old structure with separate arrays
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

    // Try matching with " Support" suffix added (for support gems in leveling data that may omit it)
    if (!gemName.toLowerCase().endsWith(' support')) {
      const withSupport = gemName + ' Support';
      const supportMatch = allGems.find(gem => 
        gem.name?.toLowerCase() === withSupport.toLowerCase()
      );
      if (supportMatch && supportMatch.slug) {
        console.log('[Gems] Found support gem by adding suffix:', withSupport);
        return supportMatch.slug;
      }
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
  
  // Show loading immediately to prevent flicker
  setCharacterTabActive();
  showLoadingOverlay(`Finding ${gemName}...`);
  
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
