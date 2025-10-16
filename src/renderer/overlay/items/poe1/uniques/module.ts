// PoE1 Uniques module: Displays all PoE1 unique items including replicas with virtual scrolling
import { highlightNumbers, getImagePath, ensurePanel, setupItemsPanelUI, escapeHtml } from '../../shared/itemUtils';
import { bindImageFallback } from '../../../crafting/utils/imageFallback';
import { TRANSPARENT_PLACEHOLDER } from '../../../crafting/utils/imagePlaceholder';

type Poe1UniqueItem = {
  name: string;
  baseType: string;
  slug?: string;
  image?: string;
  imageLocal?: string;
  explicitMods?: string[];
  flavourText?: string;
  mods?: string[]; // Legacy replica uniques
};

type Poe1UniqueGroups = {
  WeaponUnique: Poe1UniqueItem[];
  ArmourUnique: Poe1UniqueItem[];
  OtherUnique: Poe1UniqueItem[];
};

type PreparedUnique = {
  item: Poe1UniqueItem;
  category: string;
  tags: string[];
  searchText: string;
};

const state = {
  panelEl: null as HTMLElement | null,
  groups: null as Poe1UniqueGroups | null,
  prepared: [] as PreparedUnique[],
};

let searchValue = '';
let selectedCategory = 'All';
const selectedFilters = new Set<string>();

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
  const isFirstLoad = !state.groups;
  if (isFirstLoad) {
    searchValue = '';
    selectedCategory = 'All';
    selectedFilters.clear();
  }
  
  try {
    if (!state.groups) {
      const data = await (window as any).electronAPI.getPoe1Uniques();
      if (!data || data.error) {
        panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load PoE1 Uniques (${data?.error || 'unknown'})</div>`;
        return;
      }
      state.groups = data.uniques || { WeaponUnique: [], ArmourUnique: [], OtherUnique: [] };
      if (state.groups) {
        state.prepared = prepareUniques(state.groups);
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
function prepareUniques(groups: Poe1UniqueGroups): PreparedUnique[] {
  const dedup = new Map<string, PreparedUnique>();
  const categories = ['WeaponUnique', 'ArmourUnique', 'OtherUnique'] as const;
  
  categories.forEach(category => {
    const items = groups[category] || [];
    items.forEach(item => {
      const tags = extractTags(item, category);
      // Note: searchText includes ALL mods (including those not displayed), so search/filter work even for hidden mods
      const searchText = [
        item.name,
        item.baseType,
        ...(item.explicitMods || []),
        ...(item.mods || []),
        item.flavourText || ''
      ].join(' ').toLowerCase();
      
      const prepared: PreparedUnique = {
        item,
        category,
        tags,
        searchText
      };

      const key = `${(item.name || '').toLowerCase()}|${(item.baseType || '').toLowerCase()}`;
      const preferredCategory = getPreferredCategoryForBase(item.baseType || '');
      const existing = dedup.get(key);

      if (!existing) {
        dedup.set(key, prepared);
        return;
      }

      const existingMatchesPreferred = existing.category === preferredCategory;
      const currentMatchesPreferred = category === preferredCategory;

      if (currentMatchesPreferred && !existingMatchesPreferred) {
        dedup.set(key, prepared);
        return;
      }

      // If both match or neither match the preferred category, keep the first entry.
    });
  });
  
  return Array.from(dedup.values());
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
function extractTags(item: Poe1UniqueItem, category: string): string[] {
  const tags = new Set<string>();
  
  // Replica tag
  if (item.name?.startsWith('Replica ')) {
    tags.add('Replica');
  }
  
  // Combine all text for analysis
  const allMods = [...(item.explicitMods || []), ...(item.mods || [])];
  const fullText = [item.name, item.baseType, ...allMods].join(' ').toLowerCase();
  
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
  
  const categoryLabels: Record<string, string> = {
    All: 'All Categories',
    WeaponUnique: 'Weapon',
    ArmourUnique: 'Armour',
    OtherUnique: 'Other'
  };
  
  // Extract all available tags from prepared uniques
  const allTags = new Set<string>();
  state.prepared.forEach(p => {
    p.tags.forEach(tag => allTags.add(tag));
  });
  const sortedTags = Array.from(allTags).sort((a, b) => a.localeCompare(b));
  
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
          <option value='All'>All Categories</option>
          <option value='WeaponUnique'>Weapon Uniques</option>
          <option value='ArmourUnique'>Armour Uniques</option>
          <option value='OtherUnique'>Other Uniques</option>
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
  
  // Get tag color
  const getTagColor = (tag: string): string => {
    if (tag === 'Replica') return 'var(--accent-orange)';
    if (tag === 'Fire') return '#ff4500';
    if (tag === 'Cold') return '#4682b4';
    if (tag === 'Lightning') return '#daa520';
    if (tag === 'Chaos') return '#8b008b';
    if (tag === 'Physical') return '#8b4513';
    if (tag === 'Life') return '#dc143c';
    if (tag === 'Mana') return '#4169e1';
    if (tag === 'Energy Shield') return '#4169e1';
    if (tag === 'Armour') return '#b8860b';
    if (tag === 'Evasion') return '#228b22';
    if (tag === 'Critical') return '#ff1493';
    return 'var(--border-color)';
  };
  
  let updateListFrame = 0;

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
    
    sortedTags.forEach(tag => {
      const count = tagCounts[tag] || 0;
      if (!count) return;
      
      const isActive = selectedFilters.has(tag);
      const chip = document.createElement('div');
      chip.textContent = `${tag} (${count})`;
      
      const tagColor = getTagColor(tag);
      chip.style.cssText = [
        'cursor:pointer',
        'user-select:none',
        'padding:4px 12px',
        'font-size:11px',
        'border-radius:4px',
        `border:1px solid ${isActive ? tagColor : 'var(--border-color)'}`,
        `background:${isActive ? tagColor : 'var(--bg-secondary)'}`,
        `color:${isActive ? '#fff' : 'var(--text-primary)'}`,
        'transition: all 0.15s ease',
        isActive ? 'font-weight: 600' : ''
      ].join(';');
      
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
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    const categoryLabelsShort: Record<string, string> = {
      WeaponUnique: 'Weapon',
      ArmourUnique: 'Armour',
      OtherUnique: 'Other'
    };
    
    // Filter items
    const filtered = state.prepared.filter(p => {
      // Category filter
      if (selectedCategory !== 'All' && p.category !== selectedCategory) return false;
      
      // Search filter
      if (query && !p.searchText.includes(query)) return false;
      
      // Tag filters (AND logic - must have all selected tags)
      if (selectedFilters.size > 0) {
        const itemTags = new Set(p.tags);
        for (const tag of selectedFilters) {
          if (!itemTags.has(tag)) return false;
        }
      }
      
      return true;
    });
    
    if (filtered.length === 0) {
      container.innerHTML = `<div class='no-mods'>No uniques found</div>`;
      countEl.textContent = '0 uniques';
      renderFilterChips([]); // Update tag counts
      return;
    }
    
    // Group by category
    const groups = new Map<string, PreparedUnique[]>();
    filtered.forEach(p => {
      if (!groups.has(p.category)) {
        groups.set(p.category, []);
      }
      groups.get(p.category)!.push(p);
    });
    
    // Render each category
    const sortedCategories = Array.from(groups.keys()).sort();
    
    sortedCategories.forEach(cat => {
      const items = groups.get(cat)!;
      
  const section = document.createElement('div');
  section.style.marginBottom = '12px';
      
      const header = document.createElement('div');
      header.style.fontWeight = '600';
      header.style.fontSize = '14px';
      header.style.margin = '0 0 8px 0';
      header.textContent = `${categoryLabelsShort[cat]} (${items.length})`;
      section.appendChild(header);
      
      // Items grid - 3 per row
      const grid = document.createElement('div');
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
  grid.style.gap = '10px';
      
      items.forEach(p => {
        const card = buildItemCard(p.item);
        grid.appendChild(card);
      });
      
      section.appendChild(grid);
      fragment.appendChild(section);
    });
    
    container.appendChild(fragment);
    countEl.textContent = `${filtered.length} uniques`;
    
    // Resolve image paths and apply fallbacks
    bindImageFallback(
      container,
      'img.unique-img',
      `<svg xmlns="http://www.w3.org/2000/svg" width="110" height="110" viewBox="0 0 110 110"><rect width="110" height="110" rx="8" fill="#222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#555" font-size="14" font-family="sans-serif">IMG</text></svg>`,
      0.55
    );

    // Update filter chips with new counts
    renderFilterChips(filtered);
  };
  
  // Build individual item card
  function buildItemCard(item: Poe1UniqueItem): HTMLElement {
    const card = document.createElement('div');
    card.style.width = '100%';
    card.style.background = 'var(--bg-card)';
    card.style.border = '1px solid var(--border-color)';
    card.style.borderRadius = '8px';
    card.style.padding = '8px';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '8px';
    card.style.transition = 'all 0.2s ease';
    
    card.addEventListener('mouseenter', () => {
      card.style.borderColor = 'var(--accent-orange)';
      card.style.transform = 'translateY(-2px)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = 'var(--border-color)';
      card.style.transform = 'translateY(0)';
    });
    
    // Top row: image + name/base
    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.gap = '10px';
    topRow.style.alignItems = 'center';

    const imgWrap = document.createElement('div');
    imgWrap.style.flex = '0 0 auto';
    imgWrap.style.display = 'flex';
    imgWrap.style.alignItems = 'center';
    imgWrap.style.justifyContent = 'center';

    const img = document.createElement('img');
    img.className = 'unique-img';
    img.src = TRANSPARENT_PLACEHOLDER;
    img.loading = 'lazy';
    img.decoding = 'async';
    const imgPath = getImagePath(item);
    if (imgPath) {
      img.setAttribute('data-orig-src', imgPath);
    }
    img.alt = item.name;
    img.style.width = '80px';
    img.style.height = '100px';
    img.style.objectFit = 'contain';
    img.style.imageRendering = '-webkit-optimize-contrast';
    img.style.opacity = '0';
    img.style.transition = 'opacity 0.3s ease';

    imgWrap.appendChild(img);
    topRow.appendChild(imgWrap);
    
    // Name + base next to image
    const nameBlock = document.createElement('div');
    nameBlock.style.flex = '1';
    nameBlock.style.display = 'flex';
    nameBlock.style.flexDirection = 'column';
    nameBlock.style.gap = '4px';
    nameBlock.style.minWidth = '0';
    
    const modLines = (item.explicitMods && item.explicitMods.length > 0) ? item.explicitMods : (item.mods || []);
    
    // Name
    const title = document.createElement('div');
    title.style.fontWeight = '600';
    title.style.fontSize = '15px';
    title.style.color = 'var(--accent-orange)';
    title.style.lineHeight = '1.3';
    title.textContent = item.name;
    nameBlock.appendChild(title);
    
    // Base type
    const baseType = document.createElement('div');
    baseType.style.fontSize = '11px';
    baseType.style.color = 'var(--text-secondary)';
    baseType.textContent = item.baseType;
    nameBlock.appendChild(baseType);

    topRow.appendChild(nameBlock);
    card.appendChild(topRow);
    
    // Mods below (full width)
    if (modLines.length > 0) {
      const mods = document.createElement('div');
      mods.style.fontSize = '11px';
      mods.style.color = 'var(--text-primary)';
      mods.style.paddingTop = '6px';
      mods.style.borderTop = '1px solid var(--border-color)';
      mods.style.lineHeight = '1.35';
      
      const MAX_INLINE = 12; // expanded inline threshold
      const initialCount = Math.min(MAX_INLINE, modLines.length);
      const displayMods = modLines.slice(0, initialCount);
      mods.innerHTML = displayMods.map(m => highlightNumbers(escapeHtml(m))).join('<br>');
      
      if (modLines.length > initialCount) {
        const more = document.createElement('div');
        more.style.color = 'var(--text-secondary)';
        more.style.fontStyle = 'italic';
        more.style.marginTop = '4px';
        more.style.fontSize = '10px';
        more.style.cursor = 'pointer';
        more.style.textDecoration = 'underline dotted';
        more.style.textDecorationColor = 'var(--text-secondary)';
        more.textContent = `+${modLines.length - initialCount} more...`;
        
        const hiddenMods = modLines.slice(initialCount);
        more.title = hiddenMods.map(m => m.replace(/<[^>]*>/g, '')).join('\n');
        
        more.addEventListener('click', () => {
          // Expand to show all mods inline
          mods.innerHTML = modLines.map(m => highlightNumbers(escapeHtml(m))).join('<br>');
        });
        
        mods.appendChild(more);
      }
      
      card.appendChild(mods);
    }
    
    // Flavour text
    if (item.flavourText) {
      const flavour = document.createElement('div');
      flavour.style.fontSize = '10px';
      flavour.style.color = 'var(--accent-orange)';
      flavour.style.marginTop = '4px';
      flavour.style.fontStyle = 'italic';
      flavour.style.opacity = '0.8';
      flavour.textContent = item.flavourText;
      card.appendChild(flavour);
    }

    return card;
  }
  
  // Set initial values
  categorySelect.value = selectedCategory;
  searchInput.value = searchValue;
  
  // Event handlers
  categorySelect.addEventListener('change', () => {
    selectedCategory = categorySelect.value;
    scheduleUpdateList();
  });
  
  searchInput.addEventListener('input', () => {
    searchValue = searchInput.value;
    scheduleUpdateList();
  });
  
  clearButton.addEventListener('click', () => {
    searchValue = '';
    searchInput.value = '';
    scheduleUpdateList();
  });
  
  // Initial render
  updateList();
}

export async function reload(): Promise<void> {
  state.groups = null;
  state.prepared = [];
  await show();
}

