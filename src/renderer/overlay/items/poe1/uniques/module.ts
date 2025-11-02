// PoE1 Uniques module: Displays all PoE1 unique items including replicas with virtual scrolling
import { highlightNumbers, ensurePanel, setupItemsPanelUI, escapeHtml } from '../../shared/itemUtils';
import { bindImageFallback } from '../../../crafting/utils/imageFallback';
import { TRANSPARENT_PLACEHOLDER } from '../../../crafting/utils/imagePlaceholder';

// Local helper for PoE1 uniques images - returns path that IPC handler can resolve
function getUniqueImagePath(item: Poe1UniqueItem): string {
  if (item.imageLocal) {
    // Return path with poe1/ prefix so IPC handler finds it in bundled-images/poe1/
    return `poe1/${item.imageLocal}`;
  }
  return item.image || '';
}

type Poe1UniqueCategoryGroup = 'weapon' | 'armour' | 'accessory' | 'jewel' | 'flask' | 'misc';

type Poe1UniqueItem = {
  id: string;
  name: string;
  baseType: string;
  group: Poe1UniqueCategoryGroup;
  slug?: string;
  image?: string;
  imageLocal?: string;
  explicitMods?: string[];
  flavourText?: string;
  isReplica?: boolean;
  isCorrupted?: boolean;
  isRelic?: boolean;
};

type Poe1UniqueCategory = {
  id: string;
  name: string;
  group: Poe1UniqueCategoryGroup;
  total?: number;
  items: Poe1UniqueItem[];
};

type Poe1UniquesPayload = {
  slug?: string;
  generatedAt?: string;
  totalCategories?: number;
  totalItems?: number;
  categories: Poe1UniqueCategory[];
};

type PreparedUnique = {
  item: Poe1UniqueItem;
  category: Poe1UniqueCategory;
  tags: string[];
  searchText: string;
  tagSet: Set<string>;
};

const state = {
  panelEl: null as HTMLElement | null,
  payload: null as Poe1UniquesPayload | null,
  prepared: [] as PreparedUnique[],
};

let searchValue = '';
let selectedCategoryId = 'all';
const selectedFilters = new Set<string>();
let tagsExpanded = false;

/**
 * Show the PoE1 Uniques panel
 */
export async function show(): Promise<void> {
  setupItemsPanelUI('itemsTab');
  
  const panel = ensurePanel();
  state.panelEl = panel;
  panel.style.display = '';
  panel.innerHTML = `<div class='no-mods'>Loading PoE1 Uniques...</div>`;
  
  setTimeout(() => { panel.scrollTop = 0; }, 10);
  
  // Only reset filters on first load
  const isFirstLoad = !state.payload;
  if (isFirstLoad) {
    searchValue = '';
    selectedCategoryId = 'all';
    selectedFilters.clear();
  }
  
  try {
    if (!state.payload) {
      const data = await (window as any).electronAPI.getPoe1Uniques();
      if (!data || data.error) {
        panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load PoE1 Uniques (${data?.error || 'unknown'})</div>`;
        return;
      }
      state.payload = data;
      if (state.payload) {
        state.prepared = prepareUniques(state.payload);
      }
    }
    
    render();
  } catch (e) {
    console.error('[PoE1 Uniques] Load error:', e);
    panel.innerHTML = `<div style='color:var(--accent-red);'>Exception loading PoE1 Uniques</div>`;
  }
}

/**
 * Prepare uniques with extracted tags for filtering
 */
function prepareUniques(payload: Poe1UniquesPayload): PreparedUnique[] {
  const prepared: PreparedUnique[] = [];
  
  payload.categories.forEach(category => {
    const items = category.items || [];
    items.forEach(item => {
      const tags = extractTags(item);
      const searchText = [
        item.name,
        item.baseType,
        ...(item.explicitMods || []),
        item.flavourText || ''
      ].join(' ').toLowerCase();
      
      prepared.push({
        item,
        category,
        tags,
        searchText,
        tagSet: new Set<string>(tags)
      });
    });
  });
  
  return prepared;
}

function getPreferredCategoryForBase(baseType: string): 'WeaponUnique' | 'ArmourUnique' | 'OtherUnique' {
  const lower = baseType.toLowerCase();

  const weaponKeywords = [
    'sword',
    'axe',
    'mace',
    'bow',
    'wand',
    'dagger',
    'claw',
    'staff',
    'sceptre',
    'scepter',
    'quiver',
    'hammer',
    'flail',
    'spear',
    'crossbow'
  ];

  if (weaponKeywords.some(keyword => lower.includes(keyword))) {
    return 'WeaponUnique';
  }

  const armourKeywords = [
    'helmet',
    'helm',
    'hood',
    'circlet',
    'hat',
    'body',
    'armour',
    'armor',
    'robe',
    'plate',
    'mail',
    'glove',
    'gauntlet',
    'mitten',
    'boot',
    'sandal',
    'greave',
    'shield',
    'buckler',
    'tower'
  ];

  if (armourKeywords.some(keyword => lower.includes(keyword))) {
    return 'ArmourUnique';
  }

  // Accessories, jewels, flasks, idols, etc. default to OtherUnique
  return 'OtherUnique';
}

/**
 * Extract filter tags from unique item
 */
function extractTags(item: Poe1UniqueItem): string[] {
  const tags = new Set<string>();
  
  // Replica tag
  if (item.isReplica || item.name?.startsWith('Replica ')) {
    tags.add('Replica');
  }
  
  // Combine all text for analysis
  const fullText = [item.name, item.baseType, ...(item.explicitMods || [])].join(' ').toLowerCase();
  
  // Damage types
  if (/\bfire\b|burning|ignite|combustion/.test(fullText)) tags.add('Fire');
  if (/\bcold\b|freeze|chill|frostbite/.test(fullText)) tags.add('Cold');
  if (/lightning|shock|electrocute/.test(fullText)) tags.add('Lightning');
  if (/chaos|poison|wither/.test(fullText)) tags.add('Chaos');
  if (/physical damage/.test(fullText)) tags.add('Physical');
  
  // Defenses
  if (/\blife\b|maximum life|life regeneration/.test(fullText)) tags.add('Life');
  if (/\bmana\b|maximum mana/.test(fullText)) tags.add('Mana');
  if (/energy shield/.test(fullText)) tags.add('Energy Shield');
  if (/armour/.test(fullText)) tags.add('Armour');
  if (/evasion/.test(fullText)) tags.add('Evasion');
  
  // Offense
  if (/critical|crit/.test(fullText)) tags.add('Critical');
  if (/attack speed|attacks per second/.test(fullText)) tags.add('Attack Speed');
  if (/cast speed/.test(fullText)) tags.add('Cast Speed');
  if (/increased damage|more damage/.test(fullText)) tags.add('Damage');
  if (/accuracy/.test(fullText)) tags.add('Accuracy');
  
  // Utility
  if (/movement speed/.test(fullText)) tags.add('Movement');
  if (/resistance|resist/.test(fullText)) tags.add('Resistances');
  if (/minion|summon/.test(fullText)) tags.add('Minions');
  if (/curse/.test(fullText)) tags.add('Curses');
  if (/aura/.test(fullText)) tags.add('Auras');
  if (/flask/.test(fullText)) tags.add('Flasks');
  if (/charge/.test(fullText)) tags.add('Charges');
  if (/leech/.test(fullText)) tags.add('Leech');
  if (/block/.test(fullText)) tags.add('Block');
  
  // Skills
  if (/spell/.test(fullText)) tags.add('Spell');
  if (/melee/.test(fullText)) tags.add('Melee');
  if (/projectile|bow/.test(fullText)) tags.add('Projectile');
  if (/area/.test(fullText)) tags.add('Area');
  if (/totem/.test(fullText)) tags.add('Totems');
  if (/trap/.test(fullText)) tags.add('Traps');
  if (/mine/.test(fullText)) tags.add('Mines');
  
  return Array.from(tags).sort((a, b) => a.localeCompare(b));
}

/**
 * Render the PoE1 Uniques UI with search and filters
 */
export function render(): void {
  const panel = ensurePanel();
  if (!state.prepared.length) return;
  
  // Extract all available tags from prepared uniques
  const allTags = new Set<string>();
  state.prepared.forEach(p => {
    p.tags.forEach(tag => allTags.add(tag));
  });
  const sortedTags = Array.from(allTags).sort((a, b) => a.localeCompare(b));
  
  // Build categories dropdown options
  const categoryOptions = ['<option value="all">All Categories</option>'];
  if (state.payload) {
    state.payload.categories.forEach(cat => {
      categoryOptions.push(`<option value="${cat.id}">${cat.name} (${cat.total || cat.items.length})</option>`);
    });
  }
  
  // Build UI
  panel.innerHTML = `
    <div class='page-inner' style='padding:16px;'>
      <div style='display:flex; gap:8px; margin-bottom:8px; align-items:center;'>
        <input type='text' id='poe1UniquesSearch' placeholder='Search by name, base, or mods...' 
          style='flex:1; min-width:200px; padding:8px 10px; background:var(--bg-tertiary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px; font-size:13px;' />
        <button id='poe1UniquesClear' style='padding:8px 12px; background:var(--bg-tertiary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px; font-size:13px; cursor:pointer;'>
          Clear
        </button>
      </div>
      
      ${sortedTags.length > 0 ? `
        <div style='background:var(--bg-tertiary); padding:8px; border-radius:4px; margin-bottom:12px;'>
          <div style='font-size:11px; color:var(--text-secondary); font-weight:600; margin-bottom:6px;'>FILTERS:</div>
          <div id='poe1UniquesFilterChips' style='display:flex; gap:6px; flex-wrap:wrap;'></div>
        </div>
      ` : ''}
      
      <div style='display:flex; gap:8px; margin-bottom:12px; align-items:center; flex-wrap:wrap;'>
        <select id='poe1UniquesCategory' style='padding:6px 10px; background:var(--bg-tertiary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px; font-size:12px; cursor:pointer;'>
          ${categoryOptions.join('')}
        </select>
        <div style='font-size:11px; color:var(--text-secondary);'>
          <span id='poe1UniquesCount'>${state.prepared.length} uniques</span>
        </div>
      </div>
      
      <div id='poe1UniquesContainer'></div>
    </div>
  `;
  
  const searchInput = panel.querySelector('#poe1UniquesSearch') as HTMLInputElement;
  const clearButton = panel.querySelector('#poe1UniquesClear') as HTMLButtonElement;
  const categorySelect = panel.querySelector('#poe1UniquesCategory') as HTMLSelectElement;
  const filterChipsContainer = panel.querySelector('#poe1UniquesFilterChips') as HTMLElement | null;
  const container = panel.querySelector('#poe1UniquesContainer') as HTMLElement;
  const countEl = panel.querySelector('#poe1UniquesCount') as HTMLElement;
  
  const categoryLabels: Record<string, string> = {
    All: 'All Categories',
    WeaponUnique: 'Weapon',
    ArmourUnique: 'Armour',
    OtherUnique: 'Other'
  };
  
  // Get tag color - returns RGB values for opacity control
  const getTagColor = (tag: string): [number, number, number] => {
    if (tag === 'Replica') return [255, 152, 0]; // Orange
    if (tag === 'Fire') return [255, 69, 0];
    if (tag === 'Cold') return [70, 130, 180];
    if (tag === 'Lightning') return [218, 165, 32];
    if (tag === 'Chaos') return [139, 0, 139];
    if (tag === 'Physical') return [139, 69, 19];
    if (tag === 'Life') return [220, 20, 60];
    if (tag === 'Mana') return [65, 105, 225];
    if (tag === 'Energy Shield') return [65, 105, 225];
    if (tag === 'Armour') return [184, 134, 11];
    if (tag === 'Evasion') return [34, 139, 34];
    if (tag === 'Critical') return [255, 20, 147];
    return [120, 144, 156]; // Default grey
  };
  
  const getChipStyle = (tag: string, isActive: boolean): string => {
    const [r, g, b] = getTagColor(tag);
    const bg = isActive ? `rgba(${r},${g},${b},0.9)` : `rgba(${r},${g},${b},0.22)`;
    const border = `rgba(${r},${g},${b},0.6)`;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const color = isActive ? (luma > 180 ? '#000' : '#fff') : 'var(--text-primary)';
    return `border:1px solid ${border}; background:${bg}; color:${color};`;
  };
  
  let updateListFrame = 0;
  const RENDER_BATCH_SIZE = 24;
  const RENDER_TIME_BUDGET = 12;
  let renderToken = 0;
  let searchDebounce: number | undefined;
  const SEARCH_DEBOUNCE_MS = 120;

  const scheduleUpdateList = () => {
    if (updateListFrame) {
      cancelAnimationFrame(updateListFrame);
    }
    updateListFrame = requestAnimationFrame(() => {
      updateListFrame = 0;
      updateList();
    });
  };

  // Render filter chips
  const renderFilterChips = (visibleItems: PreparedUnique[] = state.prepared) => {
    if (!filterChipsContainer || !sortedTags.length) return;
    
    filterChipsContainer.innerHTML = '';
    
    const tagCounts: Record<string, number> = {};
    visibleItems.forEach(p => {
      p.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });
    
    // Filter tags that have counts
    const tagsWithCounts = sortedTags.filter(tag => (tagCounts[tag] || 0) > 0);
    
    // Calculate if we need Show More button (approx 3 rows = ~21 tags @ 11px font with typical tag lengths)
    const MAX_TAGS_COLLAPSED = 21;
    const tagsToShow = (tagsExpanded || tagsWithCounts.length <= MAX_TAGS_COLLAPSED) ? tagsWithCounts : tagsWithCounts.slice(0, MAX_TAGS_COLLAPSED);
    const needsShowMore = tagsWithCounts.length > MAX_TAGS_COLLAPSED;
    
    tagsToShow.forEach(tag => {
      const count = tagCounts[tag] || 0;
      const isActive = selectedFilters.has(tag);
      const chip = document.createElement('div');
      chip.textContent = `${tag} (${count})`;
      
      // Apply individual style properties to preserve user font scaling
      chip.style.cursor = 'pointer';
      chip.style.userSelect = 'none';
      chip.style.padding = '4px 12px';
      chip.style.borderRadius = '4px';
      chip.style.transition = 'all 0.15s ease';
      if (isActive) chip.style.fontWeight = '600';
      
      // Apply color styles from getChipStyle
      const [r, g, b] = getTagColor(tag);
      const bg = isActive ? `rgba(${r},${g},${b},0.9)` : `rgba(${r},${g},${b},0.22)`;
      const border = `rgba(${r},${g},${b},0.6)`;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const color = isActive ? (luma > 180 ? '#000' : '#fff') : 'var(--text-primary)';
      chip.style.border = `1px solid ${border}`;
      chip.style.background = bg;
      chip.style.color = color;
      
      chip.addEventListener('click', () => {
        if (selectedFilters.has(tag)) {
          selectedFilters.delete(tag);
        } else {
          selectedFilters.add(tag);
        }
        scheduleUpdateList();
      });
      
      filterChipsContainer.appendChild(chip);
    });
    
    // Show More/Less button
    if (needsShowMore) {
      const showMoreBtn = document.createElement('div');
      showMoreBtn.textContent = tagsExpanded ? 'Show Less' : `Show More (${tagsWithCounts.length - MAX_TAGS_COLLAPSED} more)`;
      // Apply individual style properties to preserve user font scaling
      showMoreBtn.style.cursor = 'pointer';
      showMoreBtn.style.userSelect = 'none';
      showMoreBtn.style.padding = '4px 12px';
      showMoreBtn.style.borderRadius = '4px';
      showMoreBtn.style.border = '1px solid var(--border-color)';
      showMoreBtn.style.background = 'var(--bg-secondary)';
      showMoreBtn.style.color = 'var(--text-secondary)';
      showMoreBtn.style.fontStyle = 'italic';
      showMoreBtn.style.transition = 'all 0.15s ease';
      showMoreBtn.addEventListener('click', () => {
        tagsExpanded = !tagsExpanded;
        renderFilterChips(visibleItems);
      });
      filterChipsContainer.appendChild(showMoreBtn);
    }
    
    if (selectedFilters.size) {
      const reset = document.createElement('div');
      reset.textContent = '× Reset';
      reset.style.cssText = 'cursor:pointer; user-select:none; padding:4px 12px; font-size:11px; font-weight:600; border-radius:4px; background:var(--accent-red); color:#fff; border:1px solid var(--accent-red); transition: all 0.15s ease';
      reset.addEventListener('click', () => {
        selectedFilters.clear();
        scheduleUpdateList();
      });
      filterChipsContainer.appendChild(reset);
    }
  };
  
  // Update items list
  const updateList = () => {
    const query = searchValue.trim().toLowerCase();
    const token = ++renderToken;

    const categoryLabelsShort: Record<string, string> = {
      WeaponUnique: 'Weapon',
      ArmourUnique: 'Armour',
      OtherUnique: 'Other'
    };

    const filtered = state.prepared.filter((p) => {
      if (selectedCategoryId !== 'all' && p.category.id !== selectedCategoryId) return false;
      if (query && !p.searchText.includes(query)) return false;
      if (selectedFilters.size > 0) {
        for (const tag of selectedFilters) {
          if (!p.tagSet.has(tag)) return false;
        }
      }
      return true;
    });

    container.innerHTML = '';

    if (!filtered.length) {
      container.innerHTML = `<div class='no-mods'>No uniques found</div>`;
      countEl.textContent = '0 uniques';
      renderFilterChips([]);
      return;
    }

    const groups = new Map<string, PreparedUnique[]>();
    filtered.forEach((p) => {
      const key = p.category.id;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(p);
    });

    const fragment = document.createDocumentFragment();
    const sortedCategories = Array.from(groups.keys()).sort();

    type RenderQueueEntry = { grid: HTMLElement; items: PreparedUnique[] };
    const renderQueue: RenderQueueEntry[] = [];

    sortedCategories.forEach((catId) => {
      const items = groups.get(catId)!;
      const catName = items[0].category.name;

      const section = document.createElement('div');
      section.style.marginBottom = '12px';

      const header = document.createElement('div');
      header.style.fontWeight = '600';
      header.style.fontSize = '14px';
      header.style.margin = '0 0 8px 0';
      header.textContent = `${catName} (${items.length})`;
      section.appendChild(header);

      const grid = document.createElement('div');
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(280px, 1fr))';
      grid.style.gap = '14px';

      renderQueue.push({ grid, items: items.slice() });

      section.appendChild(grid);
      fragment.appendChild(section);
    });

    container.appendChild(fragment);
    countEl.textContent = `${filtered.length} uniques`;
    renderFilterChips(filtered);

    const finalize = () => {
      if (token !== renderToken) return;
      bindImageFallback(
        container,
        'img.unique-img',
        `<svg xmlns="http://www.w3.org/2000/svg" width="110" height="110" viewBox="0 0 110 110"><rect width="110" height="110" rx="8" fill="#222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#555" font-size="14" font-family="sans-serif">IMG</text></svg>`,
        0.55
      );
    };

    const processQueue = () => {
      if (token !== renderToken) return;
      const start = performance.now();
      while (renderQueue.length && performance.now() - start < RENDER_TIME_BUDGET) {
        const entry = renderQueue[0];
        let processed = 0;
        while (entry.items.length && processed < RENDER_BATCH_SIZE) {
          const next = entry.items.shift()!;
          entry.grid.appendChild(buildItemCard(next.item));
          processed++;
        }
        if (!entry.items.length) {
          renderQueue.shift();
        }
      }
      if (renderQueue.length && token === renderToken) {
        requestAnimationFrame(processQueue);
      } else if (token === renderToken) {
        finalize();
      }
    };

    requestAnimationFrame(processQueue);
  };
  
  // Build individual item card
  function buildItemCard(item: Poe1UniqueItem): HTMLElement {
    const card = document.createElement('div');
    card.style.width = '100%';
    card.style.background = 'linear-gradient(180deg, rgba(30,36,42,0.8), rgba(20,24,28,0.8))';
    card.style.border = '1px solid var(--border-color)';
    card.style.borderRadius = '8px';
    card.style.padding = '14px';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '10px';
    card.style.transition = 'border-color 0.2s ease';
    
    card.addEventListener('mouseenter', () => {
      card.style.borderColor = 'var(--accent-orange)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = 'var(--border-color)';
    });
    
    const modLines = item.explicitMods || [];
    
    // Extract descriptions from mods FIRST (before displaying)
    const descriptions: string[] = [];
    const cleanedModLines = modLines.map(mod => {
      let cleanMod = mod;
      const matches = mod.match(/\([^)]{15,}\)/g);
      if (matches) {
        matches.forEach(match => {
          if (/\b(You|While|Grants|Elusive|your|you|if|when|the|The|are|have|is|cannot|grants|Cannot)\b/.test(match)) {
            descriptions.push(match.replace(/[()]/g, '').trim());
            cleanMod = cleanMod.replace(match, '').replace(/\s*•\s*$/, '').replace(/\s+$/, '').trim();
          }
        });
      }
      
      if (/^(Cannot|Grants|You|While|Enemies|Minions)\b/i.test(cleanMod) && !/\d/.test(cleanMod)) {
        descriptions.push(cleanMod);
        cleanMod = '';
      }
      
      return cleanMod;
    }).filter(m => m.length > 0);
    
    // Header with image and title
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.gap = '12px';
    header.style.alignItems = 'center';
    header.style.paddingBottom = '10px';
    header.style.borderBottom = '1px solid rgba(255,152,0,0.2)';

    const img = document.createElement('img');
    img.className = 'unique-img';
    img.src = TRANSPARENT_PLACEHOLDER;
    img.loading = 'lazy';
    img.decoding = 'async';
    const imgPath = getUniqueImagePath(item);
    if (imgPath) {
      img.setAttribute('data-orig-src', imgPath);
    }
    img.alt = item.name;
    img.style.width = '64px';
    img.style.height = '64px';
    img.style.objectFit = 'contain';
    img.style.imageRendering = '-webkit-optimize-contrast';
    img.style.opacity = '0';
    img.style.transition = 'opacity 0.3s ease';
    img.style.borderRadius = '8px';
    img.style.background = 'rgba(255,255,255,0.05)';
    img.style.flexShrink = '0';

    header.appendChild(img);
    
    // Title wrapper (name + base type)
    const titleWrap = document.createElement('div');
    titleWrap.style.display = 'flex';
    titleWrap.style.flexDirection = 'column';
    titleWrap.style.gap = '4px';
    titleWrap.style.flex = '1';
    titleWrap.style.minWidth = '0';
    
    // Name
    const title = document.createElement('div');
    title.style.fontWeight = '600';
    title.style.fontSize = '15px';
    title.style.color = 'var(--accent-orange)';
    title.style.lineHeight = '1.2';
    title.textContent = item.name;
    titleWrap.appendChild(title);
    
    // Base type
    const baseType = document.createElement('div');
    baseType.style.fontSize = '12px';
    baseType.style.color = 'rgba(255,255,255,0.5)';
    baseType.textContent = item.baseType;
    titleWrap.appendChild(baseType);

    header.appendChild(titleWrap);
    
    // Details chip with descriptions (if any)
    if (descriptions.length > 0) {
      const detailsChip = document.createElement('div');
      detailsChip.style.display = 'inline-flex';
      detailsChip.style.alignItems = 'center';
      detailsChip.style.gap = '4px';
      detailsChip.style.padding = '4px 8px';
      detailsChip.style.background = 'rgba(255,152,0,0.15)';
      detailsChip.style.border = '1px solid rgba(255,152,0,0.4)';
      detailsChip.style.borderRadius = '4px';
      detailsChip.style.fontSize = '10px';
      detailsChip.style.fontWeight = '600';
      detailsChip.style.color = 'var(--accent-orange)';
      detailsChip.style.whiteSpace = 'nowrap';
      detailsChip.style.flexShrink = '0';
      detailsChip.style.cursor = 'help';
      detailsChip.innerHTML = `Details <span style="margin-left:2px;">⌵</span>`;
      
      // Create tooltip
      const tooltip = document.createElement('div');
      tooltip.style.position = 'absolute';
      tooltip.style.display = 'none';
      tooltip.style.background = 'rgba(20,20,20,0.95)';
      tooltip.style.border = '1px solid rgba(255,152,0,0.5)';
      tooltip.style.borderRadius = '6px';
      tooltip.style.padding = '10px 14px';
      tooltip.style.fontSize = '12px';
      tooltip.style.color = 'rgba(220,220,220,0.9)';
      tooltip.style.maxWidth = '400px';
      tooltip.style.zIndex = '10000';
      tooltip.style.pointerEvents = 'none';
      tooltip.style.whiteSpace = 'pre-wrap';
      tooltip.innerHTML = descriptions.map(d => `• ${escapeHtml(d)}`).join('\n\n');
      document.body.appendChild(tooltip);
      
      detailsChip.addEventListener('mouseenter', (e: MouseEvent) => {
        const rect = detailsChip.getBoundingClientRect();
        tooltip.style.display = 'block';
        tooltip.style.left = `${rect.left}px`;
        tooltip.style.top = `${rect.bottom + 5}px`;
      });
      
      detailsChip.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none';
      });
      
      // Cleanup
      card.addEventListener('DOMNodeRemoved', () => {
        if (tooltip.parentNode) {
          tooltip.parentNode.removeChild(tooltip);
        }
      });
      
      header.appendChild(detailsChip);
    }
    
    card.appendChild(header);
    
    // Mods section (using cleaned mods without descriptions)
    const mods = document.createElement('div');
    mods.style.fontSize = '13px';
    mods.style.lineHeight = '1.5';
    mods.style.color = 'var(--text-color)';
    mods.style.flex = '1';
    mods.style.overflow = 'hidden';

    if (cleanedModLines.length > 12) {
      const first12 = cleanedModLines.slice(0, 12);
      const remaining = cleanedModLines.length - 12;
      mods.innerHTML = first12.map((m: string) => highlightNumbers(escapeHtml(m))).join('<br>');
      const showMore = document.createElement('div');
      showMore.style.marginTop = '6px';
      showMore.style.fontSize = '12px';
      showMore.style.color = 'var(--accent-blue)';
      showMore.style.cursor = 'pointer';
      showMore.style.userSelect = 'none';
      showMore.textContent = `+${remaining} more...`;
      showMore.onclick = (e: Event) => {
        e.stopPropagation();
        mods.innerHTML = cleanedModLines.map((m: string) => highlightNumbers(escapeHtml(m))).join('<br>');
      };
      mods.appendChild(showMore);
    } else {
      mods.innerHTML = cleanedModLines.map((m: string) => highlightNumbers(escapeHtml(m))).join('<br>');
    }
    card.appendChild(mods);
    
    // Flavour text
    if (item.flavourText) {
      const flavour = document.createElement('div');
      flavour.style.fontSize = '11px';
      flavour.style.color = 'var(--accent-orange)';
      flavour.style.fontStyle = 'italic';
      flavour.style.opacity = '0.7';
      flavour.style.paddingTop = '8px';
      flavour.style.borderTop = '1px solid rgba(255,152,0,0.15)';
      flavour.textContent = item.flavourText;
      card.appendChild(flavour);
    }


    return card;
  }
  
  // Set initial values
  categorySelect.value = selectedCategoryId;
  searchInput.value = searchValue;
  
  // Event handlers
  categorySelect.addEventListener('change', () => {
    selectedCategoryId = categorySelect.value;
    scheduleUpdateList();
  });
  
  searchInput.addEventListener('input', () => {
    searchValue = searchInput.value;
    if (searchDebounce) {
      window.clearTimeout(searchDebounce);
    }
    searchDebounce = window.setTimeout(() => {
      scheduleUpdateList();
    }, SEARCH_DEBOUNCE_MS);
  });
  
  clearButton.addEventListener('click', () => {
    searchValue = '';
    searchInput.value = '';
    if (searchDebounce) {
      window.clearTimeout(searchDebounce);
      searchDebounce = undefined;
    }
    scheduleUpdateList();
  });
  
  // Initial render
  updateList();
}

export async function reload(): Promise<void> {
  state.payload = null;
  state.prepared = [];
  await show();
}

