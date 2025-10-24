import { REGEX_MODS, type RegexMod } from './data';

interface UiState {
  root: HTMLElement | null;
  include: Set<number>;
  exclude: Set<number>;
  order: number[];
  search: string;
  filters: Set<TagFilter>;
  // categoryFilters: Set<RegexCategory>; // Removed - categories not used
  utilities: UtilityStateMap;
  qualityTypes: QualityTypesMap;
  anyQuality: boolean;
  rarity: RarityState;
  corrupted: CorruptedState;
}

interface QualityState {
  value: string;
  optimize: boolean;
}

type QualityTypesMap = {
  regular: QualityState;
  packSize: QualityState;
  rarity: QualityState;
  currency: QualityState;
  divination: QualityState;
  scarab: QualityState;
};

interface RarityState {
  normal: boolean;
  magic: boolean;
  rare: boolean;
  include: boolean;
}

interface CorruptedState {
  enabled: boolean;
  include: boolean;
}

type TagFilter = 'core' | 't17';

type UtilityKey = 'quantity' | 'packSize' | 'maps' | 'rarity';

interface UtilityDefinition {
  key: UtilityKey;
  label: string;
  token: string;
  wrapQuantity: boolean;
}

interface UtilityState {
  value: string;
  optimize: boolean;
}

type UtilityStateMap = Record<UtilityKey, UtilityState>;

const CATEGORY_DEFINITIONS = [
  { key: 'quantity', label: 'Item Quantity' },
  { key: 'packSize', label: 'Pack Size' },
  { key: 'moreMaps', label: 'More Maps' },
  { key: 'itemRarity', label: 'Item Rarity' },
  { key: 'quality', label: 'Atlas Quality' },
  { key: 'qualityPackSize', label: 'Quality → Pack Size' },
  { key: 'qualityRarity', label: 'Quality → Item Rarity' },
  { key: 'qualityCurrency', label: 'Quality → Currency' },
  { key: 'qualityDivination', label: 'Quality → Divination' },
  { key: 'qualityScarab', label: 'Quality → Scarab' }
] as const satisfies ReadonlyArray<{ key: string; label: string }>;

// Category system removed - not used anymore
const CATEGORY_LABELS = new Map();
const AVAILABLE_CATEGORIES: ReadonlyArray<{ key: string; label: string }> = [];

const UTILITY_DEFINITIONS: readonly UtilityDefinition[] = [
  { key: 'quantity', label: 'Quantity of at least', token: 'm q', wrapQuantity: true },
  { key: 'packSize', label: 'Pack Size of at least', token: 'iz', wrapQuantity: true },
  { key: 'maps', label: 'More maps of at least', token: 'ps:', wrapQuantity: true },
  { key: 'rarity', label: 'Item rarity of at least', token: 'm r.*y', wrapQuantity: true }
];

const state: UiState = {
  root: null,
  include: new Set<number>(),
  exclude: new Set<number>(),
  order: [],
  search: '',
  filters: new Set<TagFilter>(),
  // categoryFilters: new Set<RegexCategory>(), // Removed - categories not used
  utilities: createDefaultUtilityState(),
  qualityTypes: createDefaultQualityState(),
  anyQuality: true,
  rarity: { normal: true, magic: true, rare: true, include: true },
  corrupted: { enabled: false, include: true }
};

function createDefaultUtilityState(): UtilityStateMap {
  return {
    quantity: { value: '', optimize: true },
    packSize: { value: '', optimize: true },
    maps: { value: '', optimize: true },
    rarity: { value: '', optimize: true }
  } satisfies UtilityStateMap;
}

function createDefaultQualityState(): QualityTypesMap {
  return {
    regular: { value: '', optimize: true },
    packSize: { value: '', optimize: true },
    rarity: { value: '', optimize: true },
    currency: { value: '', optimize: true },
    divination: { value: '', optimize: true },
    scarab: { value: '', optimize: true }
  };
}

function ensurePanel(): HTMLElement {
  if (state.root && document.body.contains(state.root)) {
    return state.root;
  }
  const existing = document.getElementById('craftingPanel');
  if (existing) {
    state.root = existing;
    return existing;
  }
  const made = document.createElement('div');
  made.id = 'craftingPanel';
  made.className = 'content';
  const footer = document.getElementById('footer');
  if (footer?.parentNode) {
    footer.parentNode.insertBefore(made, footer);
  } else {
    document.body.appendChild(made);
  }
  state.root = made;
  return made;
}

function currentFilterAllows(mod: RegexMod): boolean {
  const hasModeFilters = state.filters.size > 0;
  let matchesMode = !hasModeFilters;
  if (state.filters.has('core') && !mod.isT17) matchesMode = true;
  if (state.filters.has('t17') && mod.isT17) matchesMode = true;

  return matchesMode;
}

function getOrderedSelection(predicate: (id: number) => boolean): RegexMod[] {
  return state.order.filter(predicate).map(id => REGEX_MODS.find(mod => mod.id === id)).filter(Boolean) as RegexMod[];
}

function buildQualityFragments(): string | null {
  const qualityTokenMap = {
    regular: 'lity:.*',
    packSize: 'ze\\).*',
    rarity: 'ty\\).*',
    currency: 'urr.*',
    divination: 'div.*',
    scarab: 'sca.*'
  } as const;

  const fragments: string[] = [];
  (Object.keys(qualityTokenMap) as Array<keyof QualityTypesMap>).forEach(key => {
    const qualState = state.qualityTypes[key];
    const token = qualityTokenMap[key];
    const regex = generateMinimumRegex(qualState.value, qualState.optimize, false);
    if (regex !== null && regex !== '') {
      fragments.push(`${token}${regex}%`);
    } else if (regex === '') {
      fragments.push(token);
    }
  });

  if (fragments.length === 0) return null;

  if (state.anyQuality) {
    // Match ANY: join with |
    return `"${fragments.join('|')}"`;
  } else {
    // Match ALL: separate quoted strings
    return fragments.map(f => `"${f}"`).join(' ');
  }
}

function buildRarityFragment(): string | null {
  const { normal, magic, rare, include } = state.rarity;
  if (!normal && !magic && !rare) return null;
  if (normal && magic && rare) {
    return include ? null : `"!y: (n|m|r)"`;
  }

  const rarityChars: string[] = [];
  if (normal) rarityChars.push('n');
  if (magic) rarityChars.push('m');
  if (rare) rarityChars.push('r');

  if (rarityChars.length === 0) return null;
  const pattern = rarityChars.length === 1 ? rarityChars[0] : `(${rarityChars.join('|')})`;
  const prefix = include ? '' : '!';
  return `"${prefix}y: ${pattern}"`;
}

function buildCorruptedFragment(): string | null {
  if (!state.corrupted.enabled) return null;
  const prefix = state.corrupted.include ? '' : '!';
  return `"${prefix}orru"`;
}

function formatFragment(fragment: string, mode: 'include' | 'exclude'): string | null {
  const trimmed = fragment.trim();
  if (!trimmed) return null;
  // Always wrap in quotes and apply negation if needed
  return mode === 'include' ? `"${trimmed}"` : `"!${trimmed}"`;
}

function cycleSelection(mod: RegexMod): void {
  const id = mod.id;
  if (!state.include.has(id) && !state.exclude.has(id)) {
    state.include.add(id);
    if (!state.order.includes(id)) state.order.push(id);
  } else if (state.include.has(id)) {
    state.include.delete(id);
    state.exclude.add(id);
  } else {
    state.exclude.delete(id);
  }
  updateOutput();
  drawMods();
}

/**
 * Get regex patterns for the given mod IDs
 */
function getModRegexPatterns(modIds: number[]): string[] {
  // Special optimization: Both recovery mods together
  const RECOVERY_LIFE_ID = 164309504; // "Players have 60% less Recovery Rate of Life and Energy Shield"
  const RECOVERY_CDR_ID = 729842044;  // "Players have 40% less Cooldown Recovery Rate"
  
  const hasBothRecovery = modIds.includes(RECOVERY_LIFE_ID) && modIds.includes(RECOVERY_CDR_ID);
  
  if (hasBothRecovery) {
    // Use optimized pattern "ry ra" which matches BOTH recovery mods
    const remaining = modIds.filter(id => id !== RECOVERY_LIFE_ID && id !== RECOVERY_CDR_ID);
    const remainingPatterns = remaining.map(id => {
      const mod = REGEX_MODS.find(m => m.id === id);
      return mod ? mod.regex : null;
    }).filter(Boolean) as string[];
    
    return ['ry ra', ...remainingPatterns];
  }
  
  // Default: return individual patterns
  const patterns: string[] = [];
  for (const id of modIds) {
    const mod = REGEX_MODS.find(m => m.id === id);
    if (mod) {
      patterns.push(mod.regex);
    }
  }
  // Remove duplicates
  return [...new Set(patterns)];
}

function buildRegex(): string {
  const includes = getOrderedSelection(id => state.include.has(id));
  const excludes = getOrderedSelection(id => state.exclude.has(id));

  const parts: string[] = [];
  
  // Get regex patterns for selected mods
  const includeIds = includes.map(m => m.id);
  const excludeIds = excludes.map(m => m.id);
  
  const includePatterns = getModRegexPatterns(includeIds);
  const excludePatterns = getModRegexPatterns(excludeIds);
  
  includePatterns.forEach(pattern => {
    const formatted = formatFragment(pattern, 'include');
    if (formatted) parts.push(formatted);
  });
  
  excludePatterns.forEach(pattern => {
    const formatted = formatFragment(pattern, 'exclude');
    if (formatted) parts.push(formatted);
  });
  
  // Utility filters
  const utilities = buildUtilityFragments();
  utilities.forEach(fragment => parts.push(fragment));
  
  // Quality filters
  const quality = buildQualityFragments();
  if (quality) parts.push(quality);
  
  // Rarity filters
  const rarity = buildRarityFragment();
  if (rarity) parts.push(rarity);
  
  // Corrupted filter
  const corrupted = buildCorruptedFragment();
  if (corrupted) parts.push(corrupted);
  
  return parts.join(' ');
}

function updateOutput(): void {
  const output = document.getElementById('poe1RegexOutput') as HTMLInputElement | null;
  const count = document.getElementById('poe1RegexCount');
  if (!output || !count) return;
  const regex = buildRegex();
  output.value = regex;
  count.textContent = `Regex (${regex.length}/250 chars)`;
  count.className = regex.length > 250 ? 'regex-count over-limit' : 'regex-count';
}

function drawMods(): void {
  const list = document.getElementById('poe1RegexList');
  if (!list) return;
  const search = state.search.toLowerCase();
  list.innerHTML = '';
  
  const selectedMods: typeof REGEX_MODS = [];
  const unselectedMods: typeof REGEX_MODS = [];
  
  // Separate selected and unselected mods
  for (const mod of REGEX_MODS) {
    if (search && !mod.searchText.includes(search)) continue;
    if (!currentFilterAllows(mod)) continue;
    
    if (state.include.has(mod.id) || state.exclude.has(mod.id)) {
      selectedMods.push(mod);
    } else {
      unselectedMods.push(mod);
    }
  }
  
  const fragment = document.createDocumentFragment();
  
  // Render selected mods section if there are any
  if (selectedMods.length > 0) {
    const selectedHeader = document.createElement('div');
    selectedHeader.className = 'poe1-selected-header';
    selectedHeader.textContent = `Selected Mods (${selectedMods.length})`;
    fragment.appendChild(selectedHeader);
    
    for (const mod of selectedMods) {
      fragment.appendChild(createModRow(mod));
    }
    
    // Add separator
    const separator = document.createElement('div');
    separator.className = 'poe1-mods-separator';
    fragment.appendChild(separator);
  }
  
  // Render unselected mods
  for (const mod of unselectedMods) {
    fragment.appendChild(createModRow(mod));
  }
  
  list.appendChild(fragment);
}

function createModRow(mod: RegexMod): HTMLElement {
  const row = document.createElement('div');
  row.className = 'poe1-regex-row';
  if (mod.isT17) row.classList.add('is-t17');
  row.dataset.modId = String(mod.id);

  const status = state.include.has(mod.id) ? 'include' : state.exclude.has(mod.id) ? 'exclude' : 'neutral';
  row.dataset.state = status;

  // Split mod text by pipe to separate main text from bonuses
  const parts = mod.display.split('|');
  const mainText = parts.slice(0, -1).join('|') || parts[0];
  const bonuses = parts.length > 1 && parts[parts.length - 1].includes('+') ? parts[parts.length - 1] : '';

  const title = document.createElement('div');
  title.className = 'poe1-regex-label';
  title.textContent = bonuses ? mainText : mod.display;
  row.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'poe1-regex-meta';
  const tags: string[] = [];
  if (mod.isT17) tags.push('T17');
  if (!mod.isT17) tags.push('Core');
  if (bonuses) tags.push(bonuses.trim());
  meta.textContent = tags.join(' · ');
  row.appendChild(meta);

  row.addEventListener('click', () => cycleSelection(mod));
  return row;
}

// Category filters removed - not used anymore
function toggleCategoryFilter(_key: string): void {
  // No-op
}

function renderCategoryFilters(_panel: HTMLElement): void {
  // No-op - categories not used
}

function renderUtilityControls(panel: HTMLElement): void {
  const container = panel.querySelector<HTMLDivElement>('#poe1UtilityControls');
  if (!container) return;
  container.innerHTML = '';
  UTILITY_DEFINITIONS.forEach(def => {
    const row = document.createElement('div');
    row.className = 'poe1-utility-row';

    const label = document.createElement('label');
    label.className = 'poe1-utility-label';
    label.setAttribute('for', `poe1Utility-${def.key}`);
    label.textContent = def.label;

    const input = document.createElement('input');
    input.type = 'number';
    input.id = `poe1Utility-${def.key}`;
    input.className = 'poe1-utility-input';
    input.min = '0';
    input.value = state.utilities[def.key].value;
    input.addEventListener('input', () => {
      state.utilities[def.key].value = input.value;
      updateOutput();
    });

    const toggleWrapper = document.createElement('div');
    toggleWrapper.className = 'poe1-utility-optimize';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `poe1UtilityOptimize-${def.key}`;
    checkbox.checked = state.utilities[def.key].optimize;
    checkbox.addEventListener('change', () => {
      state.utilities[def.key].optimize = checkbox.checked;
      updateOutput();
    });

    const toggleLabel = document.createElement('label');
    toggleLabel.setAttribute('for', checkbox.id);
    toggleLabel.textContent = 'Optimize value';

    toggleWrapper.appendChild(checkbox);
    toggleWrapper.appendChild(toggleLabel);

    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(toggleWrapper);
    container.appendChild(row);
  });
}

function renderQualityControls(panel: HTMLElement): void {
  const container = panel.querySelector<HTMLDivElement>('#poe1QualityControls');
  if (!container) return;
  container.innerHTML = '';
  
  const qualityDefs = [
    { key: 'regular', label: 'Quality of' },
    { key: 'packSize', label: 'Quality (pack size)' },
    { key: 'rarity', label: 'Quality (rarity)' },
    { key: 'currency', label: 'Quality (currency)' },
    { key: 'divination', label: 'Quality (divination)' },
    { key: 'scarab', label: 'Quality (scarab)' }
  ] as const;

  qualityDefs.forEach(def => {
    const row = document.createElement('div');
    row.className = 'poe1-utility-row';

    const label = document.createElement('label');
    label.className = 'poe1-utility-label';
    label.setAttribute('for', `poe1Quality-${def.key}`);
    label.textContent = def.label;

    const input = document.createElement('input');
    input.type = 'number';
    input.id = `poe1Quality-${def.key}`;
    input.className = 'poe1-utility-input';
    input.min = '0';
    input.value = state.qualityTypes[def.key].value;
    input.addEventListener('input', () => {
      state.qualityTypes[def.key].value = input.value;
      updateOutput();
    });

    const toggleWrapper = document.createElement('div');
    toggleWrapper.className = 'poe1-utility-optimize';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `poe1QualityOptimize-${def.key}`;
    checkbox.checked = state.qualityTypes[def.key].optimize;
    checkbox.addEventListener('change', () => {
      state.qualityTypes[def.key].optimize = checkbox.checked;
      updateOutput();
    });

    const toggleLabel = document.createElement('label');
    toggleLabel.setAttribute('for', checkbox.id);
    toggleLabel.textContent = 'Optimize value';

    toggleWrapper.appendChild(checkbox);
    toggleWrapper.appendChild(toggleLabel);

    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(toggleWrapper);
    container.appendChild(row);
  });
}

function attachEvents(panel: HTMLElement): void {
  const searchInput = panel.querySelector<HTMLInputElement>('#poe1RegexSearch');
  searchInput?.addEventListener('input', () => {
    state.search = searchInput.value;
    drawMods();
  });

  panel.querySelectorAll<HTMLInputElement>('input[name="poe1-tag-filter"]').forEach(box => {
    box.addEventListener('change', () => {
      const key = box.value as TagFilter;
      if (box.checked) state.filters.add(key); else state.filters.delete(key);
      drawMods();
    });
  });

  const anyQualityBox = panel.querySelector<HTMLInputElement>('#poe1AnyQuality');
  anyQualityBox?.addEventListener('change', () => {
    state.anyQuality = anyQualityBox.checked;
    updateOutput();
  });

  const normalBox = panel.querySelector<HTMLInputElement>('#poe1RarityNormal');
  normalBox?.addEventListener('change', () => {
    state.rarity.normal = normalBox.checked;
    updateOutput();
  });

  const magicBox = panel.querySelector<HTMLInputElement>('#poe1RarityMagic');
  magicBox?.addEventListener('change', () => {
    state.rarity.magic = magicBox.checked;
    updateOutput();
  });

  const rareBox = panel.querySelector<HTMLInputElement>('#poe1RarityRare');
  rareBox?.addEventListener('change', () => {
    state.rarity.rare = rareBox.checked;
    updateOutput();
  });

  panel.querySelectorAll<HTMLInputElement>('input[name="poe1RarityMode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      state.rarity.include = radio.value === 'include';
      updateOutput();
    });
  });

  const corruptedBox = panel.querySelector<HTMLInputElement>('#poe1CorruptedEnabled');
  const corruptedRadios = panel.querySelector<HTMLElement>('#poe1CorruptedRadios');
  corruptedBox?.addEventListener('change', () => {
    state.corrupted.enabled = corruptedBox.checked;
    if (corruptedRadios) {
      corruptedRadios.style.display = state.corrupted.enabled ? 'flex' : 'none';
    }
    updateOutput();
  });

  panel.querySelectorAll<HTMLInputElement>('input[name="poe1CorruptedMode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      state.corrupted.include = radio.value === 'include';
      updateOutput();
    });
  });

  const copyBtn = panel.querySelector<HTMLButtonElement>('#poe1RegexCopy');
  copyBtn?.addEventListener('click', () => {
    const output = panel.querySelector<HTMLInputElement>('#poe1RegexOutput');
    if (!output) return;
    output.select();
    document.execCommand('copy');
  });

  const resetBtn = panel.querySelector<HTMLButtonElement>('#poe1RegexReset');
  resetBtn?.addEventListener('click', () => {
    state.include.clear();
    state.exclude.clear();
    state.order = [];
    state.utilities = createDefaultUtilityState();
    state.qualityTypes = createDefaultQualityState();
    state.anyQuality = true;
    state.rarity = { normal: true, magic: true, rare: true, include: true };
    state.corrupted = { enabled: true, include: true };
    if (state.root) {
      renderUtilityControls(state.root);
      renderQualityControls(state.root);
      // Update the checkboxes without full re-render
      const anyQualityBox = state.root.querySelector<HTMLInputElement>('#poe1AnyQuality');
      if (anyQualityBox) anyQualityBox.checked = true;
      const normalBox = state.root.querySelector<HTMLInputElement>('#poe1RarityNormal');
      if (normalBox) normalBox.checked = true;
      const magicBox = state.root.querySelector<HTMLInputElement>('#poe1RarityMagic');
      if (magicBox) magicBox.checked = true;
      const rareBox = state.root.querySelector<HTMLInputElement>('#poe1RarityRare');
      if (rareBox) rareBox.checked = true;
      const rarityInclude = state.root.querySelector<HTMLInputElement>('input[name="poe1RarityMode"][value="include"]');
      if (rarityInclude) rarityInclude.checked = true;
      const corruptedBox = state.root.querySelector<HTMLInputElement>('#poe1CorruptedEnabled');
      if (corruptedBox) corruptedBox.checked = true;
      const corruptedRadios = state.root.querySelector<HTMLElement>('#poe1CorruptedRadios');
      if (corruptedRadios) corruptedRadios.style.display = 'flex';
      const corruptedInclude = state.root.querySelector<HTMLInputElement>('input[name="poe1CorruptedMode"][value="include"]');
      if (corruptedInclude) corruptedInclude.checked = true;
    }
    updateOutput();
    drawMods();
  });

  const clearFiltersBtn = panel.querySelector<HTMLButtonElement>('#poe1CategoryFiltersClear');
  clearFiltersBtn?.addEventListener('click', () => {
    // No-op - category filters removed
  });

  // Save/Load functionality
  const saveBtn = panel.querySelector<HTMLButtonElement>('#poe1SaveBtn');
  const loadSelect = panel.querySelector<HTMLSelectElement>('#poe1LoadSelect');
  const deleteBtn = panel.querySelector<HTMLButtonElement>('#poe1DeleteBtn');
  const saveNameInput = panel.querySelector<HTMLInputElement>('#poe1SaveName');

  // Load saved presets into dropdown
  function loadPresetList(): void {
    if (!loadSelect) return;
    const presets = getSavedPresets();
    loadSelect.innerHTML = '<option value="">Load preset...</option>';
    Object.keys(presets).forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      loadSelect.appendChild(option);
    });
  }

  saveBtn?.addEventListener('click', () => {
    const name = saveNameInput?.value.trim();
    if (!name) {
      alert('Please enter a preset name');
      return;
    }
    savePreset(name);
    if (saveNameInput) saveNameInput.value = '';
    loadPresetList();
  });

  loadSelect?.addEventListener('change', () => {
    const name = loadSelect.value;
    if (!name) return;
    if (loadPreset(name)) {
      // Refresh UI after loading
      if (state.root) {
        renderUtilityControls(state.root);
        renderQualityControls(state.root);
        // Update checkboxes
        const anyQualityBox = state.root.querySelector<HTMLInputElement>('#poe1AnyQuality');
        if (anyQualityBox) anyQualityBox.checked = state.anyQuality;
        const normalBox = state.root.querySelector<HTMLInputElement>('#poe1RarityNormal');
        if (normalBox) normalBox.checked = state.rarity.normal;
        const magicBox = state.root.querySelector<HTMLInputElement>('#poe1RarityMagic');
        if (magicBox) magicBox.checked = state.rarity.magic;
        const rareBox = state.root.querySelector<HTMLInputElement>('#poe1RarityRare');
        if (rareBox) rareBox.checked = state.rarity.rare;
        const rarityMode = state.root.querySelector<HTMLInputElement>(`input[name="poe1RarityMode"][value="${state.rarity.include ? 'include' : 'exclude'}"]`);
        if (rarityMode) rarityMode.checked = true;
        const corruptedBox = state.root.querySelector<HTMLInputElement>('#poe1CorruptedEnabled');
        if (corruptedBox) corruptedBox.checked = state.corrupted.enabled;
        const corruptedRadios = state.root.querySelector<HTMLElement>('#poe1CorruptedRadios');
        if (corruptedRadios) corruptedRadios.style.display = state.corrupted.enabled ? 'flex' : 'none';
        const corruptedMode = state.root.querySelector<HTMLInputElement>(`input[name="poe1CorruptedMode"][value="${state.corrupted.include ? 'include' : 'exclude'}"]`);
        if (corruptedMode) corruptedMode.checked = true;
      }
      updateOutput();
      drawMods();
    }
    loadSelect.value = ''; // Reset dropdown
  });

  deleteBtn?.addEventListener('click', () => {
    const name = loadSelect?.value;
    if (!name) {
      alert('Please select a preset to delete');
      return;
    }
    if (confirm(`Delete preset "${name}"?`)) {
      deletePreset(name);
      loadPresetList();
    }
  });

  loadPresetList();
}

function getSavedPresets(): Record<string, any> {
  const saved = localStorage.getItem('poe1RegexPresets');
  return saved ? JSON.parse(saved) : {};
}

function savePreset(name: string): void {
  const presets = getSavedPresets();
  presets[name] = {
    include: Array.from(state.include),
    exclude: Array.from(state.exclude),
    order: state.order,
    utilities: state.utilities,
    qualityTypes: state.qualityTypes,
    anyQuality: state.anyQuality,
    rarity: state.rarity,
    corrupted: state.corrupted
  };
  localStorage.setItem('poe1RegexPresets', JSON.stringify(presets));
}

function loadPreset(name: string): boolean {
  const presets = getSavedPresets();
  const preset = presets[name];
  if (!preset) return false;
  
  state.include = new Set(preset.include || []);
  state.exclude = new Set(preset.exclude || []);
  state.order = preset.order || [];
  state.utilities = preset.utilities || createDefaultUtilityState();
  state.qualityTypes = preset.qualityTypes || createDefaultQualityState();
  state.anyQuality = preset.anyQuality ?? true;
  state.rarity = preset.rarity || { normal: true, magic: true, rare: true, include: true };
  state.corrupted = preset.corrupted || { enabled: true, include: true };
  
  return true;
}

function deletePreset(name: string): void {
  const presets = getSavedPresets();
  delete presets[name];
  localStorage.setItem('poe1RegexPresets', JSON.stringify(presets));
}

function renderLayout(panel: HTMLElement): void {
  const coreChecked = state.filters.has('core') ? 'checked' : '';
  const t17Checked = state.filters.has('t17') ? 'checked' : '';
  const anyQualityChecked = state.anyQuality ? 'checked' : '';
  const corruptedChecked = state.corrupted.enabled ? 'checked' : '';
  panel.style.display = '';
  panel.classList.add('regex-mode');
  panel.innerHTML = `
    <div class="poe1-regex-root">
      <div class="poe1-main-layout">
        <div class="poe1-left-panel">
          <div class="poe1-save-controls">
            <input type="text" id="poe1SaveName" class="poe1-save-input" placeholder="Preset name..." />
            <button id="poe1SaveBtn" class="poe1-save-btn" title="Save preset">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
            </button>
            <select id="poe1LoadSelect" class="poe1-load-select">
              <option value="">Load preset...</option>
            </select>
            <button id="poe1DeleteBtn" class="poe1-save-btn poe1-delete-btn" title="Delete preset">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
          </div>
          
          <div class="poe1-utility-section">
            <div class="poe1-utility-note">Optimization rounds down to the nearest ten before building the regex.</div>
            <div id="poe1UtilityControls" class="poe1-utility-grid"></div>
          </div>
          
          <div class="poe1-utility-section">
            <div id="poe1QualityControls" class="poe1-utility-grid"></div>
            <div class="poe1-utility-row">
              <label class="poe1-checkbox-label">
                <input type="checkbox" id="poe1AnyQuality" ${anyQualityChecked} />
                Match any quality type (unchecked = Match all)
              </label>
            </div>
          </div>
          
          <div class="poe1-utility-section">
            <div class="poe1-section-title">Map Rarity</div>
            <div class="poe1-rarity-row">
              <label class="poe1-checkbox-label"><input type="checkbox" id="poe1RarityNormal" ${state.rarity.normal ? 'checked' : ''} /> Normal Maps</label>
              <label class="poe1-checkbox-label"><input type="checkbox" id="poe1RarityMagic" ${state.rarity.magic ? 'checked' : ''} /> Magic Maps</label>
              <label class="poe1-checkbox-label"><input type="checkbox" id="poe1RarityRare" ${state.rarity.rare ? 'checked' : ''} /> Rare Maps</label>
            </div>
            <div class="poe1-radio-group">
              <label class="poe1-radio-label"><input type="radio" name="poe1RarityMode" value="include" ${state.rarity.include ? 'checked' : ''} /> Include</label>
              <label class="poe1-radio-label"><input type="radio" name="poe1RarityMode" value="exclude" ${!state.rarity.include ? 'checked' : ''} /> Exclude</label>
            </div>
          </div>
          
          <div class="poe1-utility-section">
            <div class="poe1-section-title">Corrupted Map</div>
            <label class="poe1-checkbox-label"><input type="checkbox" id="poe1CorruptedEnabled" ${corruptedChecked} /> Corrupted Map</label>
            <div class="poe1-radio-group" id="poe1CorruptedRadios" style="display:${state.corrupted.enabled ? 'flex' : 'none'}">
              <label class="poe1-radio-label"><input type="radio" name="poe1CorruptedMode" value="include" ${state.corrupted.include ? 'checked' : ''} /> Include</label>
              <label class="poe1-radio-label"><input type="radio" name="poe1CorruptedMode" value="exclude" ${!state.corrupted.include ? 'checked' : ''} /> Exclude</label>
            </div>
          </div>
        </div>
        
        <div class="poe1-right-panel">
          <div class="poe1-search-bar">
            <input id="poe1RegexSearch" class="poe1-regex-input" type="text" placeholder="Search mods..." value="${state.search}" />
            <label class="poe1-checkbox-label"><input type="checkbox" name="poe1-tag-filter" value="core" ${coreChecked} /> Core</label>
            <label class="poe1-checkbox-label"><input type="checkbox" name="poe1-tag-filter" value="t17" ${t17Checked} /> T17</label>
          </div>
          
          <div id="poe1RegexList" class="poe1-regex-list"></div>
          
          <div class="poe1-regex-footer">
            <div id="poe1RegexCount" class="regex-count">Regex (0/250 chars)</div>
            <div class="poe1-regex-actions">
              <button id="poe1RegexCopy" class="regex-btn">Copy</button>
              <button id="poe1RegexReset" class="regex-btn regex-btn-danger">Reset</button>
            </div>
          </div>
          <input id="poe1RegexOutput" class="poe1-regex-output" type="text" readonly />
        </div>
      </div>
    </div>
  `;
}

function ensureStyle(): void {
  if (document.getElementById('poe1RegexStyles')) return;
  const style = document.createElement('style');
  style.id = 'poe1RegexStyles';
  style.textContent = `
  .poe1-regex-root { display:flex; flex-direction:column; height:100%; min-height:600px; width:100%; min-width:920px; flex:1 1 auto; }
  .poe1-main-layout { display:grid; grid-template-columns:350px minmax(540px, 1fr); gap:12px; height:100%; overflow:hidden; width:100%; }
  .poe1-left-panel { display:flex; flex-direction:column; gap:8px; overflow-y:auto; padding-right:4px; min-width:350px; }
  .poe1-right-panel { display:flex; flex-direction:column; gap:8px; overflow:hidden; min-width:540px; }
    .poe1-search-bar { display:flex; gap:8px; align-items:center; padding:8px; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-tertiary); }
    .poe1-regex-input { flex:1; padding:6px 8px; font-size:12px; border:1px solid var(--border-color); border-radius:4px; background:var(--bg-secondary); color:var(--text-primary); min-width:0; }
    .poe1-regex-input::placeholder { color:var(--text-secondary); opacity:0.6; }
    .poe1-save-controls { display:grid; grid-template-columns:1fr auto 1fr auto; gap:6px; align-items:center; padding:8px; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-tertiary); }
    .poe1-save-input { padding:4px 6px; font-size:11px; border:1px solid var(--border-color); border-radius:4px; background:var(--bg-secondary); color:var(--text-primary); min-width:0; }
    .poe1-load-select { padding:4px 6px; font-size:11px; border:1px solid var(--border-color); border-radius:4px; background:var(--bg-secondary); color:var(--text-primary); cursor:pointer; min-width:0; }
    .poe1-save-btn { padding:6px 8px; font-size:11px; border-radius:4px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); cursor:pointer; display:flex; align-items:center; justify-content:center; }
    .poe1-save-btn svg { display:block; }
    .poe1-save-btn:hover { background:var(--accent-blue); border-color:var(--accent-blue); color:#fff; }
    .poe1-delete-btn:hover { background:var(--accent-red); border-color:var(--accent-red); color:#fff; }
    .poe1-regex-filter { font-size:11px; color:var(--text-secondary); display:flex; gap:4px; align-items:center; }
    .poe1-regex-category-bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:8px; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-tertiary); }
    .poe1-filter-label { font-size:11px; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em; }
    .poe1-filter-chip-row { display:flex; flex-wrap:wrap; gap:6px; flex:1; }
    .poe1-filter-chip { padding:3px 8px; font-size:11px; border-radius:9999px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-secondary); cursor:pointer; transition:all 0.15s ease; }
    .poe1-filter-chip:hover { color:var(--text-primary); border-color:var(--text-secondary); }
    .poe1-filter-chip.active { background:var(--accent-blue); color:#0b1c2d; border-color:var(--accent-blue); }
    .poe1-filter-clear { padding:3px 8px; font-size:11px; border:1px solid var(--border-color); background:transparent; color:var(--text-secondary); border-radius:4px; cursor:pointer; }
    .poe1-filter-clear:disabled { opacity:0.4; cursor:not-allowed; }
    .poe1-utility-section { display:flex; flex-direction:column; gap:6px; border:1px solid var(--border-color); border-radius:6px; padding:8px; background:var(--bg-tertiary); }
    .poe1-section-title { font-size:12px; font-weight:600; color:var(--text-primary); margin-bottom:4px; }
    .poe1-utility-note { font-size:10px; color:var(--text-secondary); }
    .poe1-utility-grid { display:flex; flex-direction:column; gap:6px; }
    .poe1-utility-row { display:flex; align-items:center; gap:8px; }
    .poe1-utility-label { min-width:150px; font-size:11px; color:var(--text-primary); }
    .poe1-utility-input { width:70px; padding:4px 6px; font-size:11px; border:1px solid var(--border-color); border-radius:4px; background:var(--bg-secondary); color:var(--text-primary); }
    .poe1-utility-optimize { display:flex; align-items:center; gap:4px; font-size:10px; color:var(--text-secondary); }
    .poe1-checkbox-label { font-size:11px; color:var(--text-primary); display:flex; align-items:center; gap:6px; cursor:pointer; white-space:nowrap; }
    .poe1-rarity-row { display:flex; gap:12px; flex-wrap:wrap; }
    .poe1-radio-group { display:flex; gap:12px; margin-top:4px; }
    .poe1-radio-label { font-size:11px; color:var(--text-primary); display:flex; align-items:center; gap:4px; cursor:pointer; }
    .tier17-color { color:var(--accent-purple,#9d4edd); }
    .poe1-regex-list { flex:1; overflow-y:auto; border:1px solid var(--border-color); border-radius:6px; padding:6px; background:var(--bg-tertiary); min-height:0; }
    .poe1-selected-header { font-size:12px; font-weight:600; color:var(--text-primary); padding:8px 6px 6px 6px; margin-bottom:4px; border-bottom:1px solid var(--border-color); }
    .poe1-mods-separator { height:1px; background:var(--border-color); margin:12px 0; }
    .poe1-regex-row { border:1px solid rgba(255,255,255,0.15); border-radius:4px; padding:6px; margin-bottom:6px; cursor:pointer; user-select:none; background:rgba(255,255,255,0.05); }
    .poe1-regex-row.is-t17 { border-color:rgba(157,78,221,0.3); background:rgba(157,78,221,0.08); }
    .poe1-regex-row[data-state="include"] { border-color:var(--accent-blue); background:rgba(0,123,255,0.18); }
    .poe1-regex-row[data-state="exclude"] { border-color:var(--accent-red); background:rgba(220,53,69,0.18); }
    .poe1-regex-label { font-size:11px; line-height:1.3; color:var(--text-primary); }
    .poe1-regex-meta { font-size:10px; color:var(--text-secondary); margin-top:4px; }
    .poe1-regex-footer { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-tertiary); }
    .poe1-regex-actions { display:flex; gap:6px; }
    .regex-count { font-size:10px; color:var(--text-secondary); }
    .regex-count.over-limit { color:var(--accent-red); }
    .regex-btn { padding:4px 10px; font-size:11px; border-radius:4px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); cursor:pointer; }
    .regex-btn.regex-btn-danger { border-color:var(--accent-red); color:var(--accent-red); }
    .poe1-regex-output { width:100%; padding:6px 8px; font-size:11px; border:1px solid var(--border-color); border-radius:4px; background:var(--bg-secondary); color:var(--text-primary); }
  `;
  document.head.appendChild(style);
}

export function show(): void {
  const panel = ensurePanel();
  ensureStyle();
  // default filters: show everything
  state.filters.clear();
  state.filters.add('core');
  state.filters.add('t17');
  // state.categoryFilters.clear(); // Category filters removed
  renderLayout(panel);
  attachEvents(panel);
  renderUtilityControls(panel);
  renderQualityControls(panel);
  renderCategoryFilters(panel);
  drawMods();
  updateOutput();
}

export function hide(): void {
  if (!state.root) return;
  state.root.style.display = 'none';
}

export function reset(): void {
  state.include.clear();
  state.exclude.clear();
  state.order = [];
  state.utilities = createDefaultUtilityState();
  state.qualityTypes = createDefaultQualityState();
  state.anyQuality = true;
  state.rarity = { normal: true, magic: true, rare: true, include: true };
  state.corrupted = { enabled: true, include: true };
  if (state.root) {
    renderUtilityControls(state.root);
    renderQualityControls(state.root);
  }
  updateOutput();
  drawMods();
}

function buildUtilityFragments(): string[] {
  const fragments: string[] = [];
  UTILITY_DEFINITIONS.forEach(def => {
    const stateEntry = state.utilities[def.key];
    const fragment = buildUtilityFragment(def, stateEntry);
    if (fragment) fragments.push(fragment);
  });
  return fragments;
}

function buildUtilityFragment(def: UtilityDefinition, utility: UtilityState): string | null {
  const regex = generateMinimumRegex(utility.value, utility.optimize, def.wrapQuantity);
  if (regex === null) return null;
  if (regex === '') {
    return `"${def.token}"`;
  }
  return `"${def.token}.*${regex}%"`;
}

function generateMinimumRegex(inputValue: string, optimize: boolean, wrapQuantity: boolean): string | null {
  const numbers = inputValue.match(/\d/g);
  if (numbers === null) {
    return null;
  }
  
  const quant = optimize
    ? Math.floor(Number(numbers.join('')) / 10) * 10
    : Number(numbers.join(''));
    
  if (isNaN(quant) || quant === 0) {
    if (optimize && numbers.length === 1) {
      return '.';
    }
    return '';
  }

  // Match veiset's generateNumberRegex exactly
  if (quant >= 200) {
    const v = Math.floor(quant / 100);
    return `[${v}-9]..`;
  }

  if (quant >= 150) {
    const str = quant.toString();
    const d0 = str[0];
    const d1 = str[1];
    const d2 = str[2];
    
    if (d1 === '0' && d2 === '0') {
      return `([2-9]..|${d0}..)`;
    } else if (d2 === '0') {
      return `([2-9]..|1[${d1}-9].)`;
    } else if (d1 === '0') {
      return `([2-9]..|\\d0[${d2}-9]|\\d[1-9].)`;
    } else if (d1 === '9' && d2 === '9') {
      return `([2-9]..|199)`;
    } else {
      if (d1 === '9') {
        return `([2-9]..|19[${d2}-9])`;
      }
      return `[12]([${d1}-9][${d2}-9]|[${Number(d1) + 1}-9].)`;
    }
  }

  if (quant > 100) {
    const str = quant.toString();
    const d0 = str[0];
    const d1 = str[1];
    const d2 = str[2];
    
    if (d1 === '0' && d2 === '0') {
      return `${d0}..`;
    } else if (d2 === '0') {
      return `(1[${d1}-9].|[2-9]..)`;
    } else if (d1 === '0') {
      return `(\\d0[${d2}-9]|\\d[1-9].)`;
    } else if (d1 === '9' && d2 === '9') {
      return `(199|[2-9]..)`;
    } else {
      if (d1 === '9') {
        return `19[${d2}-9]`;
      }
      return `(1([${d1}-9][${d2}-9]|[${Number(d1) + 1}-9].)|[2-9]..)`;
    }
  }

  if (quant === 100) {
    return `\\d..`;
  }

  if (quant > 9) {
    const str = quant.toString();
    const d0 = str[0];
    const d1 = str[1];
    
    if (d1 === '0') {
      return `([${d0}-9].|\\d..)`;
    } else if (d0 === '9') {
      return `(${d0}[${d1}-9]|\\d..)`;
    } else {
      return `(${d0}[${d1}-9]|[${Number(d0) + 1}-9].|\\d..)`;
    }
  }

  if (quant <= 9) {
    return `([${quant}-9]|\\d..?)`;
  }

  return inputValue;
}
