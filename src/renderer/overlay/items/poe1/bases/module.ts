import { highlightNumbers, getImagePath, ensurePanel, setupItemsPanelUI, escapeHtml } from '../../shared/itemUtils';
import { bindImageFallback } from '../../../crafting/utils/imageFallback';
import { TRANSPARENT_PLACEHOLDER } from '../../../crafting/utils/imagePlaceholder';

type RawBaseItem = {
  name: string;
  properties?: Record<string, number | string>;
  implicitMods?: string[];
  imageLocal?: string;
  image?: string;
};

type RawBaseGroups = Record<string, RawBaseItem[]>;

type SortKey =
  | 'default'
  | 'armour'
  | 'evasion'
  | 'energyShield'
  | 'block'
  | 'critChance'
  | 'attackSpeed'
  | 'physicalDamage';

interface PreparedBase {
  name: string;
  category: string;
  implicitMods: string[];
  imageLocal?: string;
  image?: string;
  propertyLines: string[];
  statMap: Record<string, number>;
  slugCandidates: string[];
  tags: string[];
  tagSet: Set<string>;
  searchText: string;
}

const CATEGORY_SLUG_MAP: Record<string, string[]> = {
  Amulets: ['Amulets'],
  Belts: ['Belts'],
  Body_Armours: [
    'Body_Armours_str',
    'Body_Armours_dex',
    'Body_Armours_int',
    'Body_Armours_str_dex',
    'Body_Armours_str_int',
    'Body_Armours_dex_int',
    'Body_Armours_str_dex_int',
    'Body_Armours'
  ],
  Boots: [
    'Boots_str',
    'Boots_dex',
    'Boots_int',
    'Boots_str_dex',
    'Boots_str_int',
    'Boots_dex_int',
    'Boots'
  ],
  Bows: ['Bows'],
  Claws: ['Claws'],
  Daggers: ['Daggers'],
  Fishing_Rods: ['Fishing_Rods'],
  Gloves: [
    'Gloves_str',
    'Gloves_dex',
    'Gloves_int',
    'Gloves_str_dex',
    'Gloves_str_int',
    'Gloves_dex_int',
    'Gloves'
  ],
  Helmets: [
    'Helmets_str',
    'Helmets_dex',
    'Helmets_int',
    'Helmets_str_dex',
    'Helmets_str_int',
    'Helmets_dex_int',
    'Helmets'
  ],
  Hybrid_Flasks: ['Hybrid_Flasks'],
  Life_Flasks: ['Life_Flasks'],
  Mana_Flasks: ['Mana_Flasks'],
  One_Hand_Axes: ['One_Hand_Axes'],
  One_Hand_Maces: ['One_Hand_Maces'],
  One_Hand_Swords: ['One_Hand_Swords'],
  Quivers: ['Quivers'],
  Rings: ['Rings', 'Unset_Ring'],
  Sceptres: ['Sceptres'],
  Shields: [
    'Shields_str',
    'Shields_dex',
    'Shields_int',
    'Shields_str_dex',
    'Shields_str_int',
    'Shields_dex_int',
    'Shields'
  ],
  Staves: ['Staves'],
  Thrusting_One_Hand_Swords: ['Thrusting_One_Hand_Swords', 'One_Hand_Swords'],
  Two_Hand_Axes: ['Two_Hand_Axes'],
  Two_Hand_Maces: ['Two_Hand_Maces'],
  Two_Hand_Swords: ['Two_Hand_Swords'],
  Utility_Flasks: ['Utility_Flasks'],
  Wands: ['Wands'],
  Warstaves: ['Warstaves']
};

const CATEGORY_TAG_HINTS: Record<string, string[]> = {
  Amulets: ['Attribute'],
  Belts: ['Attribute'],
  Body_Armours: ['Armour'],
  Boots: ['Movement'],
  Bows: ['Projectile', 'Weapon'],
  Claws: ['Attack', 'Life Leech'],
  Daggers: ['Attack', 'Critical'],
  Fishing_Rods: ['Utility'],
  Gloves: ['Attack'],
  Helmets: ['Armour'],
  Hybrid_Flasks: ['Flask'],
  Life_Flasks: ['Flask', 'Life'],
  Mana_Flasks: ['Flask', 'Mana'],
  One_Hand_Axes: ['Attack', 'Physical'],
  One_Hand_Maces: ['Attack', 'Physical'],
  One_Hand_Swords: ['Attack', 'Physical'],
  Quivers: ['Projectile'],
  Rings: ['Attribute'],
  Sceptres: ['Spell', 'Elemental'],
  Shields: ['Block'],
  Staves: ['Spell'],
  Thrusting_One_Hand_Swords: ['Attack', 'Critical'],
  Two_Hand_Axes: ['Attack', 'Physical'],
  Two_Hand_Maces: ['Attack', 'Physical'],
  Two_Hand_Swords: ['Attack', 'Physical'],
  Utility_Flasks: ['Flask'],
  Wands: ['Spell'],
  Warstaves: ['Spell']
};

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: 'Default', value: 'default' },
  { label: 'Armour', value: 'armour' },
  { label: 'Evasion', value: 'evasion' },
  { label: 'Energy Shield', value: 'energyShield' },
  { label: 'Block', value: 'block' },
  { label: 'Crit Chance', value: 'critChance' },
  { label: 'Attack Speed', value: 'attackSpeed' },
  { label: 'Physical Damage', value: 'physicalDamage' }
];

const state: { raw: RawBaseGroups | null; prepared: PreparedBase[] } = {
  raw: null,
  prepared: []
};

let searchValue = '';
let selectedCategory = 'All';
let currentSort: SortKey = 'default';
const selectedTags = new Set<string>();

export async function show(): Promise<void> {
  setupItemsPanelUI('itemsTab');
  const panel = ensurePanel();
  panel.style.display = '';
  panel.innerHTML = `<div class='no-mods'>Loading PoE1 Base Items...</div>`;

  // Only reset filters if this is the first load
  const isFirstLoad = !state.raw;
  
  if (isFirstLoad) {
    searchValue = '';
    selectedCategory = 'All';
    currentSort = 'default';
    selectedTags.clear();
  }

  try {
    if (!state.raw) {
      const response = await (window as any).electronAPI.getPoe1Bases();
      if (!response || response.error) {
        panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load PoE1 Bases (${response?.error || 'unknown'})</div>`;
        return;
      }
      state.raw = response.bases || {};
      state.prepared = prepareBases(state.raw);
    }

    renderPrepared();
  } catch (err) {
    console.error('[PoE1 Bases] Load error:', err);
    panel.innerHTML = `<div style='color:var(--accent-red);'>Exception loading PoE1 Bases</div>`;
  }
}

function prepareBases(raw: RawBaseGroups | null | undefined): PreparedBase[] {
  const result: PreparedBase[] = [];
  if (!raw) return result;

  for (const [category, entries] of Object.entries(raw)) {
    if (!Array.isArray(entries)) continue;
    entries.forEach((item) => {
      const props = item?.properties ?? {};
      const { lines, stats } = buildPropertySummary(props);
      const slugCandidates = getSlugCandidates(category, item, stats);
      const tags = deriveTags(category, item, lines);
      const tagSet = new Set<string>(tags);
      const searchText = [
        category,
        item.name,
        ...(Array.isArray(item.implicitMods) ? item.implicitMods : []),
        ...lines,
        ...tags
      ]
        .filter(Boolean)
        .map((part) => String(part).toLowerCase())
        .join(' ');

      result.push({
        name: item.name,
        category,
        implicitMods: Array.isArray(item.implicitMods) ? item.implicitMods : [],
        imageLocal: item.imageLocal,
        image: item.image,
        propertyLines: lines,
        statMap: stats,
        slugCandidates,
        tags,
        tagSet,
        searchText
      });
    });
  }

  return result;
}
function buildPropertySummary(input: Record<string, number | string> | undefined): { lines: string[]; stats: Record<string, number> } {
  const lines: string[] = [];
  const stats: Record<string, number> = {};
  if (!input) return { lines, stats };

  // Weapon stats
  if (input.physicalDamageMin != null && input.physicalDamageMax != null) {
    const min = Number(input.physicalDamageMin);
    const max = Number(input.physicalDamageMax);
    if (!Number.isNaN(min) && !Number.isNaN(max)) {
      lines.push(`Physical Damage: ${min}–${max}`);
      stats.physicalDamage = max;
    }
  }
  
  if (input.criticalStrikeChance != null) {
    const val = Number(input.criticalStrikeChance);
    if (!Number.isNaN(val)) {
      lines.push(`Critical Strike Chance: ${val}%`);
      stats.critChance = val;
    }
  }
  
  if (input.attacksPerSecond != null) {
    const val = Number(input.attacksPerSecond);
    if (!Number.isNaN(val)) {
      lines.push(`Attacks per Second: ${val}`);
      stats.attackSpeed = val;
    }
  }
  
  if (input.weaponRange != null) {
    const val = Number(input.weaponRange);
    if (!Number.isNaN(val)) {
      lines.push(`Weapon Range: ${val}`);
    }
  }

  // Defense stats - show ranges if available
  if (input.armourMin != null && input.armourMax != null) {
    lines.push(`Armour: ${input.armourMin}–${input.armourMax}`);
    stats.armour = Number(input.armour || Math.round((Number(input.armourMin) + Number(input.armourMax)) / 2));
  } else if (input.armour != null) {
    const val = Number(input.armour);
    if (!Number.isNaN(val)) {
      lines.push(`Armour: ${val}`);
      stats.armour = val;
    }
  }
  
  if (input.evasionMin != null && input.evasionMax != null) {
    lines.push(`Evasion: ${input.evasionMin}–${input.evasionMax}`);
    stats.evasion = Number(input.evasion || Math.round((Number(input.evasionMin) + Number(input.evasionMax)) / 2));
  } else if (input.evasion != null) {
    const val = Number(input.evasion);
    if (!Number.isNaN(val)) {
      lines.push(`Evasion: ${val}`);
      stats.evasion = val;
    }
  }
  
  if (input.energyShieldMin != null && input.energyShieldMax != null) {
    lines.push(`Energy Shield: ${input.energyShieldMin}–${input.energyShieldMax}`);
    stats.energyShield = Number(input.energyShield || Math.round((Number(input.energyShieldMin) + Number(input.energyShieldMax)) / 2));
  } else if (input.energyShield != null) {
    const val = Number(input.energyShield);
    if (!Number.isNaN(val)) {
      lines.push(`Energy Shield: ${val}`);
      stats.energyShield = val;
    }
  }
  
  if (input.block != null) {
    const val = Number(input.block);
    if (!Number.isNaN(val)) {
      lines.push(`Chance to Block: ${val}%`);
      stats.block = val;
    }
  }
  
  if (input.movementSpeed != null) {
    const val = Number(input.movementSpeed);
    if (!Number.isNaN(val)) {
      lines.push(`Movement Speed: ${val >= 0 ? '+' : ''}${val}%`);
    }
  }

  // Requirements
  if (input.levelReq != null) {
    lines.push(`Level: ${input.levelReq}`);
  }
  if (input.strReq != null) {
    lines.push(`Str: ${input.strReq}`);
  }
  if (input.dexReq != null) {
    lines.push(`Dex: ${input.dexReq}`);
  }
  if (input.intReq != null) {
    lines.push(`Int: ${input.intReq}`);
  }

  return { lines, stats };
}

function deriveTags(category: string, base: RawBaseItem, properties: string[]): string[] {
  const tags = new Set<string>();
  (CATEGORY_TAG_HINTS[category] || []).forEach((tag) => tags.add(tag));

  const text = [category, base.name, ...(base.implicitMods || []), ...properties]
    .join(' ')
    .toLowerCase();

  if (/armou?r/.test(text)) tags.add('Armour');
  if (/evasion/.test(text)) tags.add('Evasion');
  if (/energy shield/.test(text)) tags.add('Energy Shield');
  if (/block/.test(text)) tags.add('Block');
  if (/life/.test(text)) tags.add('Life');
  if (/mana/.test(text)) tags.add('Mana');
  if (/attack speed|attacks per second/.test(text)) tags.add('Attack Speed');
  if (/critical/.test(text)) tags.add('Critical');
  if (/physical/.test(text)) tags.add('Physical');
  if (/fire/.test(text)) tags.add('Fire');
  if (/cold/.test(text)) tags.add('Cold');
  if (/lightning/.test(text)) tags.add('Lightning');
  if (/chaos/.test(text)) tags.add('Chaos');
  if (/poison/.test(text)) tags.add('Poison');
  if (/minion/.test(text)) tags.add('Minion');
  if (/curse/.test(text)) tags.add('Curse');
  if (/projectile|bow/.test(text)) tags.add('Projectile');
  if (/spell|wand|staff|sceptre/.test(text)) tags.add('Spell');
  if (/movement/.test(text)) tags.add('Movement');
  if (/strength/.test(text)) tags.add('Strength');
  if (/dexterity/.test(text)) tags.add('Dexterity');
  if (/intelligence/.test(text)) tags.add('Intelligence');
  if (/flask/.test(text)) tags.add('Flask');
  if (/weapon|sword|axe|mace|claw/.test(text)) tags.add('Weapon');

  if (tags.has('Fire') || tags.has('Cold') || tags.has('Lightning')) {
    tags.add('Elemental');
  }

  return Array.from(tags).sort((a, b) => a.localeCompare(b));
}

function getAutoSortForCategory(category: string): SortKey {
  // Auto-select best sort based on category
  if (category.includes('Body_Armours') || category.includes('Boots') || category.includes('Gloves') || category.includes('Helmets')) {
    return 'armour'; // Armor pieces: sort by armor first
  }
  if (category.includes('Shields')) {
    return 'block';
  }
  if (category.includes('Bow') || category.includes('Wand') || category.includes('Claw') || category.includes('Dagger') || 
      category.includes('Sword') || category.includes('Axe') || category.includes('Mace') || category.includes('Staff') || category.includes('Sceptre')) {
    return 'physicalDamage'; // Weapons: sort by damage
  }
  return 'default';
}

function getSlugCandidates(category: string, item: RawBaseItem, stats: Record<string, number>): string[] {
  const mapped = CATEGORY_SLUG_MAP[category];
  if (!mapped || !mapped.length) return [category];
  if (mapped.length === 1) return mapped;
  
  // For multi-stat categories (Body_Armours, Boots, Gloves, Helmets, Shields), determine the best match
  const hasArmour = stats.armour && stats.armour > 0;
  const hasEvasion = stats.evasion && stats.evasion > 0;
  const hasES = stats.energyShield && stats.energyShield > 0;
  
  // Count how many defenses
  const defenseCount = [hasArmour, hasEvasion, hasES].filter(Boolean).length;
  
  if (defenseCount === 0) {
    // No defenses, return the base category
    return [mapped[mapped.length - 1]];
  }
  
  if (defenseCount === 3) {
    // Str/Dex/Int hybrid
    const hybrid3 = mapped.find(s => s.includes('_str_dex_int'));
    return hybrid3 ? [hybrid3] : mapped;
  }
  
  if (defenseCount === 2) {
    // Two-stat hybrid - determine which
    if (hasArmour && hasEvasion) {
      const hybrid = mapped.find(s => s.includes('_str_dex') && !s.includes('_int'));
      return hybrid ? [hybrid] : mapped;
    }
    if (hasArmour && hasES) {
      const hybrid = mapped.find(s => s.includes('_str_int') && !s.includes('_dex'));
      return hybrid ? [hybrid] : mapped;
    }
    if (hasEvasion && hasES) {
      const hybrid = mapped.find(s => s.includes('_dex_int') && !s.includes('_str'));
      return hybrid ? [hybrid] : mapped;
    }
  }
  
  // Single defense type
  if (hasArmour && !hasEvasion && !hasES) {
    const str = mapped.find(s => s.includes('_str') && !s.includes('_dex') && !s.includes('_int'));
    return str ? [str] : mapped;
  }
  if (hasEvasion && !hasArmour && !hasES) {
    const dex = mapped.find(s => s.includes('_dex') && !s.includes('_str') && !s.includes('_int'));
    return dex ? [dex] : mapped;
  }
  if (hasES && !hasArmour && !hasEvasion) {
    const int = mapped.find(s => s.includes('_int') && !s.includes('_str') && !s.includes('_dex'));
    return int ? [int] : mapped;
  }
  
  // Fallback to all candidates
  return mapped;
}

function renderPrepared(): void {
  const panel = ensurePanel();
  panel.style.display = '';

  if (!state.prepared.length) {
    panel.innerHTML = `<div class='no-mods'>No base items available</div>`;
    return;
  }

  const categories = Array.from(new Set(state.prepared.map((base) => base.category))).sort((a, b) => a.localeCompare(b));
  const total = state.prepared.length;

  panel.innerHTML = `
    <div class="page-inner" id="poe1BasesRoot">
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:10px;">
        <select id="poe1BaseCategory" style="padding:4px 8px; background:var(--bg-tertiary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px; font-size:12px;">
          <option value="All">All Categories</option>
          ${categories.map((cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat.replace(/_/g, ' '))}</option>`).join('')}
        </select>
        <input
          id="poe1BaseSearch"
          type="text"
          placeholder="Search base items..."
          style="flex:1; min-width:200px; padding:4px 8px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary); font-size:12px;"
        />
        <button id="poe1BaseClear" class="pin-btn" style="padding:4px 10px;">Clear</button>
        <div style="font-size:11px; color:var(--text-secondary); margin-left:auto;">${total} bases</div>
      </div>
      <div id="poe1BaseSortChips" style="display:flex; flex-wrap:wrap; gap:6px; margin:-4px 0 10px;"></div>
      <div id="poe1BaseTagFilters" style="display:flex; flex-wrap:wrap; gap:6px; margin:0 0 12px; padding:8px; background:var(--bg-tertiary); border-radius:6px;"></div>
      <div id="poe1BaseList" style="display:flex; flex-direction:column; gap:18px;"></div>
    </div>
  `;

  const categorySelect = panel.querySelector('#poe1BaseCategory') as HTMLSelectElement;
  const searchInput = panel.querySelector('#poe1BaseSearch') as HTMLInputElement;
  const clearButton = panel.querySelector('#poe1BaseClear') as HTMLButtonElement;
  const sortContainer = panel.querySelector('#poe1BaseSortChips') as HTMLElement;
  const tagContainer = panel.querySelector('#poe1BaseTagFilters') as HTMLElement;
  const listContainer = panel.querySelector('#poe1BaseList') as HTMLElement;

  const allTags = Array.from(new Set(state.prepared.flatMap((base) => base.tags))).sort((a, b) => a.localeCompare(b));

  const renderTagFilters = (visibleItems: PreparedBase[] = state.prepared) => {
    tagContainer.innerHTML = '';
    if (!allTags.length) return;

    const counts: Record<string, number> = {};
    visibleItems.forEach((base) => {
      base.tags.forEach((tag) => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });

    // Color mapping for different tag types - returns RGB values for opacity control
    const getTagColor = (tag: string): [number, number, number] => {
      // Defense types
      if (tag === 'Armour') return [184, 134, 11]; // Gold
      if (tag === 'Evasion') return [34, 139, 34]; // Green
      if (tag === 'Energy Shield') return [65, 105, 225]; // Blue
      
      // Damage types
      if (tag === 'Physical') return [139, 69, 19]; // Brown
      if (tag === 'Fire') return [255, 69, 0]; // Red-Orange
      if (tag === 'Cold') return [70, 130, 180]; // Steel Blue
      if (tag === 'Lightning') return [218, 165, 32]; // Goldenrod
      if (tag === 'Chaos') return [139, 0, 139]; // Dark Magenta
      if (tag === 'Elemental') return [255, 99, 71]; // Tomato
      
      // Attributes
      if (tag === 'Strength') return [220, 20, 60]; // Crimson
      if (tag === 'Dexterity') return [50, 205, 50]; // Lime Green
      if (tag === 'Intelligence') return [65, 105, 225]; // Royal Blue
      
      // Other
      if (tag === 'Attack' || tag === 'Weapon') return [205, 133, 63]; // Peru
      if (tag === 'Spell') return [147, 112, 219]; // Medium Purple
      if (tag === 'Critical') return [255, 20, 147]; // Deep Pink
      if (tag === 'Block') return [112, 128, 144]; // Slate Gray
      
      return [120, 144, 156]; // Default grey
    };
    
    const getChipStyle = (tag: string, active: boolean): string => {
      const [r, g, b] = getTagColor(tag);
      const bg = active ? `rgba(${r},${g},${b},0.9)` : `rgba(${r},${g},${b},0.22)`;
      const border = `rgba(${r},${g},${b},0.6)`;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const color = active ? (luma > 180 ? '#000' : '#fff') : 'var(--text-primary)';
      return `border:1px solid ${border}; background:${bg}; color:${color};`;
    };

    allTags.forEach((tag) => {
      const active = selectedTags.has(tag);
      const count = counts[tag] || 0;
      if (!count) return;
      
      const chip = document.createElement('div');
      chip.textContent = count ? `${tag} (${count})` : tag;
      
      // Apply individual style properties to preserve user font scaling
      chip.style.cursor = 'pointer';
      chip.style.userSelect = 'none';
      chip.style.padding = '4px 12px';
      chip.style.borderRadius = '4px';
      chip.style.transition = 'all 0.15s ease';
      if (active) chip.style.fontWeight = '600';
      
      // Apply color styles from getChipStyle
      const [r, g, b] = getTagColor(tag);
      const bg = active ? `rgba(${r},${g},${b},0.9)` : `rgba(${r},${g},${b},0.22)`;
      const border = `rgba(${r},${g},${b},0.6)`;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const color = active ? (luma > 180 ? '#000' : '#fff') : 'var(--text-primary)';
      chip.style.border = `1px solid ${border}`;
      chip.style.background = bg;
      chip.style.color = color;
      
      chip.addEventListener('click', () => {
        if (active) {
          selectedTags.delete(tag);
        } else {
          selectedTags.add(tag);
        }
        scheduleUpdateList();
      });
      tagContainer.appendChild(chip);
    });

    if (selectedTags.size) {
      const reset = document.createElement('div');
      reset.textContent = '× Reset';
      reset.style.cssText = 'cursor:pointer; user-select:none; padding:4px 12px; font-size:11px; font-weight:600; border-radius:4px; background:var(--accent-red); color:#fff; border:1px solid var(--accent-red); transition: all 0.15s ease';
      reset.addEventListener('click', () => {
        selectedTags.clear();
        scheduleUpdateList();
      });
      tagContainer.appendChild(reset);
    }
  };

  const renderSortChips = () => {
    sortContainer.innerHTML = '';
    SORT_OPTIONS.forEach(({ label, value }) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.padding = '4px 10px';
      btn.style.fontSize = '12px';
      btn.style.borderRadius = '999px';
      btn.style.border = '1px solid ' + (currentSort === value ? 'var(--accent-blue)' : 'var(--border-color)');
      btn.style.background = currentSort === value ? 'var(--accent-blue)' : 'var(--bg-tertiary)';
      btn.style.color = currentSort === value ? '#fff' : 'var(--text-primary)';
      btn.style.cursor = 'pointer';
      btn.addEventListener('click', () => {
        currentSort = value;
        renderSortChips();
        scheduleUpdateList();
      });
      sortContainer.appendChild(btn);
    });
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

  const updateList = () => {
    const query = searchValue.trim().toLowerCase();
    const token = ++renderToken;

    const filtered = state.prepared.filter((base) => {
      if (selectedCategory !== 'All' && base.category !== selectedCategory) return false;
      if (query && !base.searchText.includes(query)) return false;
      if (selectedTags.size) {
        for (const tag of selectedTags) {
          if (!base.tagSet.has(tag)) return false;
        }
      }
      return true;
    });

    const groups = new Map<string, PreparedBase[]>();
    filtered.forEach((base) => {
      if (!groups.has(base.category)) {
        groups.set(base.category, []);
      }
      groups.get(base.category)!.push(base);
    });

    listContainer.innerHTML = '';

    if (!groups.size) {
      const empty = document.createElement('div');
      empty.className = 'no-mods';
      empty.textContent = 'No bases matched your filters';
      listContainer.appendChild(empty);
      renderTagFilters([]);
      return;
    }

    const fragment = document.createDocumentFragment();
    const sortedCategories = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));

    type RenderQueueEntry = { grid: HTMLElement; items: PreparedBase[] };
    const renderQueue: RenderQueueEntry[] = [];

    sortedCategories.forEach((cat) => {
      const section = document.createElement('div');
      const header = document.createElement('div');
      header.style.fontWeight = '600';
      header.style.fontSize = '14px';
      header.style.margin = '0 0 6px 4px';
      const sourceItems = groups.get(cat)!;
      header.textContent = `${cat.replace(/_/g, ' ')} (${sourceItems.length})`;

      const grid = document.createElement('div');
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
      grid.style.gap = '12px';

      const items = sourceItems.slice();
      items.sort((a, b) => {
        if (currentSort === 'default') {
          return a.name.localeCompare(b.name);
        }
        const av = a.statMap[currentSort] ?? 0;
        const bv = b.statMap[currentSort] ?? 0;
        if (av === bv) return a.name.localeCompare(b.name);
        return bv - av;
      });

      renderQueue.push({ grid, items });

      section.appendChild(header);
      section.appendChild(grid);
      fragment.appendChild(section);
    });

    listContainer.appendChild(fragment);
    renderTagFilters(filtered);

    const finalize = () => {
      if (token !== renderToken) return;
      bindImageFallback(
        listContainer,
        'img.base-img',
        `<svg xmlns="http://www.w3.org/2000/svg" width="110" height="110" viewBox="0 0 110 110"><rect width="110" height="110" rx="8" fill="#222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#555" font-size="14" font-family="sans-serif">IMG</text></svg>`,
        0.55
      );

      attachModifierButtons(listContainer);

      listContainer.querySelectorAll<HTMLElement>('[data-add-tag]').forEach((el) => {
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const tag = el.dataset.addTag;
          if (!tag) return;
          selectedTags.add(tag);
          scheduleUpdateList();
        });
      });
    };

    const processQueue = () => {
      if (token !== renderToken) return;
      const start = performance.now();
      while (renderQueue.length && performance.now() - start < RENDER_TIME_BUDGET) {
        const entry = renderQueue[0];
        let processed = 0;
        while (entry.items.length && processed < RENDER_BATCH_SIZE) {
          entry.grid.appendChild(buildCard(entry.items.shift()!));
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

  categorySelect.value = selectedCategory;
  searchInput.value = searchValue;

  categorySelect.addEventListener('change', () => {
    selectedCategory = categorySelect.value;
    // Auto-select best sort for category
    if (selectedCategory !== 'All') {
      currentSort = getAutoSortForCategory(selectedCategory);
      renderSortChips();
    }
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

  renderSortChips();
  updateList();
}

function buildCard(base: PreparedBase): HTMLElement {
  const card = document.createElement('div');
  card.style.width = '100%';
  card.style.background = 'var(--bg-card)';
  card.style.border = '1px solid var(--border-color)';
  card.style.borderRadius = '8px';
  card.style.padding = '10px';
  card.style.display = 'flex';
  card.style.gap = '12px';
  card.style.alignItems = 'flex-start';

  const imgWrap = document.createElement('div');
  imgWrap.style.flex = '0 0 110px';
  imgWrap.style.display = 'flex';
  imgWrap.style.alignItems = 'flex-start';
  imgWrap.style.justifyContent = 'center';

  const img = document.createElement('img');
  img.className = 'base-img';
  img.src = TRANSPARENT_PLACEHOLDER;
  const imgPath = getImagePath(base);
  if (imgPath) {
    img.setAttribute('data-orig-src', imgPath);
  }
  img.alt = base.name;
  img.style.width = '110px';
  img.style.height = '110px';
  img.style.objectFit = 'contain';
  img.style.imageRendering = 'crisp-edges';

  imgWrap.appendChild(img);
  card.appendChild(imgWrap);

  const body = document.createElement('div');
  body.style.flex = '1';
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '6px';

  const headerLine = document.createElement('div');
  headerLine.style.display = 'flex';
  headerLine.style.alignItems = 'flex-start';
  headerLine.style.justifyContent = 'space-between';
  headerLine.style.gap = '8px';

  const title = document.createElement('div');
  title.style.fontWeight = '600';
  title.style.fontSize = '15px';
  title.textContent = base.name;
  headerLine.appendChild(title);

  if (base.slugCandidates.length) {
    const btn = document.createElement('button');
    btn.className = 'base-modifiers-btn';
    btn.title = `Open modifiers for ${base.name}`;
    btn.setAttribute('aria-label', `Open modifiers for ${base.name}`);
    btn.textContent = '✦';
    btn.dataset.modCat = base.slugCandidates[0];
    btn.dataset.modCandidates = JSON.stringify(base.slugCandidates);
    btn.style.width = '26px';
    btn.style.height = '26px';
    btn.style.borderRadius = '6px';
    btn.style.border = '1px solid var(--border-color)';
    btn.style.background = 'var(--bg-tertiary)';
    btn.style.color = 'var(--text-secondary)';
    btn.style.fontSize = '13px';
    btn.style.cursor = 'pointer';
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.transition = 'background 0.15s ease';
    headerLine.appendChild(btn);
  }

  body.appendChild(headerLine);

  if (base.implicitMods.length) {
    const implicit = document.createElement('div');
    implicit.style.fontSize = '11px';
    implicit.style.lineHeight = '1.35';
    implicit.innerHTML = base.implicitMods
      .map((mod) => highlightNumbers(escapeHtml(mod)))
      .join('<br>');
    body.appendChild(implicit);
  } else {
    const blank = document.createElement('div');
    blank.style.fontSize = '10px';
    blank.style.color = 'var(--text-muted)';
    blank.textContent = 'No implicit modifiers';
    body.appendChild(blank);
  }

  if (base.propertyLines.length) {
    const props = document.createElement('div');
    props.style.display = 'flex';
    props.style.flexWrap = 'wrap';
    props.style.gap = '4px';
    props.style.fontSize = '10px';
    base.propertyLines.forEach((line) => {
      const chip = document.createElement('span');
      chip.style.background = 'var(--bg-tertiary)';
      chip.style.padding = '2px 6px';
      chip.style.borderRadius = '4px';
      chip.innerHTML = highlightNumbers(escapeHtml(line));
      props.appendChild(chip);
    });
    body.appendChild(props);
  }

  if (base.tags.length) {
    const tagRow = document.createElement('div');
    tagRow.style.display = 'flex';
    tagRow.style.flexWrap = 'wrap';
    tagRow.style.gap = '4px';
    tagRow.style.marginTop = '4px';
    base.tags.forEach((tag) => {
      const chip = document.createElement('span');
      chip.textContent = tag;
      chip.dataset.addTag = tag;
      chip.style.background = 'var(--bg-tertiary)';
      chip.style.padding = '2px 6px';
      chip.style.borderRadius = '4px';
      chip.style.fontSize = '10px';
      chip.style.cursor = 'pointer';
      chip.title = `Filter by ${tag}`;
      tagRow.appendChild(chip);
    });
    body.appendChild(tagRow);
  }

  card.appendChild(body);
  return card;
}

function attachModifierButtons(container: HTMLElement): void {
  container.querySelectorAll<HTMLButtonElement>('button.base-modifiers-btn').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();
      const raw = btn.dataset.modCandidates || '[]';
      let slugs: string[] = [];
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          slugs = parsed.map((entry) => String(entry)).filter(Boolean);
        }
      } catch {
        slugs = raw.split('|').map((entry) => entry.trim()).filter(Boolean);
      }
      if (!slugs.length && btn.dataset.modCat) {
        slugs = [btn.dataset.modCat];
      }
      if (!slugs.length) return;

      try {
        (window as any).openModifiersCategory?.(slugs, { bypassDebounce: true });
      } catch (err) {
        console.warn('[PoE1 Bases] Failed to open modifiers via helper', err);
        try {
          const select = document.getElementById('categorySelect') as HTMLSelectElement | null;
          if (select) {
            const options = Array.from(select.options || []);
            for (const candidate of slugs) {
              const match = options.find((opt) => (opt.value || '').toUpperCase() === candidate.toUpperCase());
              if (match) {
                select.value = match.value;
                break;
              }
            }
          }
          (window as any).setView?.('modifiers');
          (window as any).switchCategory?.();
        } catch (fallbackErr) {
          console.warn('[PoE1 Bases] Fallback modifiers navigation failed', fallbackErr);
        }
      }
    });
  });
}

export async function reload(): Promise<void> {
  state.raw = null;
  state.prepared = [];
  await show();
}
