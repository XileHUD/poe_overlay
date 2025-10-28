/**
 * Version-specific configuration for modifier domains, toggles, and categories.
 * Keeps PoE1 and PoE2 differences clean and maintainable.
 */

export type OverlayGameVersion = 'poe1' | 'poe2';

export interface DomainToggle {
  id: string;
  label: string;
  domain: string | string[]; // Single domain or array of domains to match
  description?: string;
}

export interface DomainMetadata {
  name: string;
  color: string; // Hex color for chips/badges
  description?: string;
}

export interface VersionConfig {
  // Primary toggle buttons (shown by default, max 3-4)
  primaryToggles: DomainToggle[];
  
  // Overflow/expandable toggles (shown in "More domains" menu)
  overflowToggles: DomainToggle[];
  
  // Domain display metadata (colors, formatting)
  domainMetadata: Record<string, DomainMetadata>;
  
  // Virtual aggregate categories
  virtualCategories: string[];
  
  // Categories to exclude from category list
  excludedCategories: string[];
  
  // Default league folder name pattern (for data path fallback)
  defaultLeaguePattern: RegExp;
}

// ===== PoE2 Configuration =====
const POE2_CONFIG: VersionConfig = {
  primaryToggles: [
    { id: 'toggleAll', label: 'All', domain: 'all' },
    { id: 'toggleBase', label: 'Base', domain: 'normal', description: 'Normal item modifiers' },
    { id: 'toggleDesecrated', label: 'Desecrated', domain: 'desecrated', description: 'Desecration modifiers' },
    { id: 'toggleEssence', label: 'Essence', domain: 'essence', description: 'Essence modifiers' },
    { id: 'toggleCorrupted', label: 'Corrupted', domain: 'corrupted', description: 'Corruption modifiers' }
  ],
  
  overflowToggles: [],
  
  domainMetadata: {
    normal: { name: 'Normal', color: '#9E9E9E' },
    desecrated: { name: 'Desecrated', color: '#9C27B0' },
    essence: { name: 'Essence', color: '#00BCD4' },
    corrupted: { name: 'Corrupted', color: '#F44336' },
    socketable: { name: 'Socketable', color: '#FF9800' },
    mymods: { name: 'My Mods', color: '#F0AD4E', description: 'Modifiers currently on your clipboard item' }
  },
  
  virtualCategories: ['ALL', 'DESECRATED', 'ESSENCE', 'CORRUPTED', 'SOCKETABLES'],
  
  excludedCategories: ['Bases'],
  
  defaultLeaguePattern: /Rise of the Abyssal/i
};

// ===== PoE1 Configuration =====
const POE1_CONFIG: VersionConfig = {
  primaryToggles: [
    { id: 'toggleAll', label: 'All', domain: 'all' },
    { id: 'toggleNormal', label: 'Normal', domain: 'normal', description: 'Normal item modifiers' },
    { id: 'toggleEldritch', label: 'Eldritch', domain: ['eldritch_eater', 'eldritch_searing'], description: 'Eldritch implicit mods' },
    { id: 'toggleCrafting', label: 'Crafting', domain: 'master', description: 'Master crafted modifiers' }
  ],
  
  overflowToggles: [
    // Influence domains
    { id: 'toggleShaper', label: 'Shaper', domain: 'shaper', description: 'Shaper influence' },
    { id: 'toggleElder', label: 'Elder', domain: 'elder', description: 'Elder influence' },
    { id: 'toggleCrusader', label: 'Crusader', domain: 'crusader', description: 'Crusader influence' },
    { id: 'toggleRedeemer', label: 'Redeemer', domain: 'redeemer', description: 'Redeemer influence' },
    { id: 'toggleHunter', label: 'Hunter', domain: 'hunter', description: 'Hunter influence' },
    { id: 'toggleWarlord', label: 'Warlord', domain: 'warlord', description: 'Warlord influence' },
    
    // Special domains
    { id: 'toggleVeiled', label: 'Veiled', domain: 'veiled', description: 'Veiled modifiers' },
    { id: 'toggleCorrupted', label: 'Corrupted', domain: 'corrupted', description: 'Corruption modifiers' },
    { id: 'toggleSynthesis', label: 'Synthesis', domain: 'synthesis', description: 'Synthesised implicits' },
    { id: 'toggleDelve', label: 'Delve', domain: 'delve', description: 'Delve modifiers' },
    { id: 'toggleIncursion', label: 'Incursion', domain: 'incursion', description: 'Incursion modifiers' },
    { id: 'toggleEssence', label: 'Essence', domain: 'essence', description: 'Essence modifiers' },
    { id: 'toggleScourge', label: 'Scourge', domain: 'scourge', description: 'Scourge modifiers' },
    { id: 'toggleBestiary', label: 'Bestiary', domain: 'bestiary', description: 'Bestiary aspect modifiers' },
    { id: 'toggleSentinel', label: 'Sentinel', domain: 'sentinel', description: 'Sentinel modifiers' },
    { id: 'toggleInfamous', label: 'Infamous', domain: 'infamous', description: 'Infamous modifiers' }
  ],
  
  domainMetadata: {
    normal: { name: 'Normal', color: '#9E9E9E', description: 'Standard item modifiers' },
    
    // Eldritch
    eldritch_eater: { name: 'Eater of Worlds', color: '#9C27B0', description: 'Eater of Worlds implicit' },
    eldritch_searing: { name: 'Searing Exarch', color: '#FF5722', description: 'Searing Exarch implicit' },
    
    // Influence
    shaper: { name: 'Shaper', color: '#2196F3', description: 'Shaper influence' },
    elder: { name: 'Elder', color: '#512DA8', description: 'Elder influence' },
    crusader: { name: 'Crusader', color: '#FFD700', description: 'Crusader influence' },
    redeemer: { name: 'Redeemer', color: '#00BCD4', description: 'Redeemer influence' },
    hunter: { name: 'Hunter', color: '#4CAF50', description: 'Hunter influence' },
    warlord: { name: 'Warlord', color: '#F44336', description: 'Warlord influence' },
    
    // Crafting & Special
    master: { name: 'Master Crafted', color: '#795548', description: 'Crafting bench modifiers' },
    veiled: { name: 'Veiled', color: '#9C27B0', description: 'Veiled modifiers (Betrayal)' },
    corrupted: { name: 'Corrupted', color: '#D32F2F', description: 'Vaal corruption modifiers' },
    synthesis: { name: 'Synthesised', color: '#00ACC1', description: 'Synthesised implicit modifiers' },
    
    // League mechanics
    delve: { name: 'Delve', color: '#FF6F00', description: 'Delve fossil modifiers' },
    incursion: { name: 'Incursion', color: '#FFB300', description: 'Incursion modifiers' },
    essence: { name: 'Essence', color: '#7B1FA2', description: 'Essence modifiers' },
    scourge: { name: 'Scourge', color: '#C62828', description: 'Scourge modifiers' },
    bestiary: { name: 'Bestiary', color: '#689F38', description: 'Bestiary aspect modifiers' },
    sentinel: { name: 'Sentinel', color: '#1976D2', description: 'Sentinel modifiers' },
    infamous: { name: 'Infamous', color: '#D32F2F', description: 'Infamous modifiers' },
    mymods: { name: 'My Mods', color: '#F0AD4E', description: 'Modifiers currently on your clipboard item' },
    unknown: { name: 'Unknown', color: '#616161', description: 'Unknown domain' }
  },
  
  virtualCategories: [
    'ALL',
    'GEAR',
    // Aggregates
    'INFLUENCE',      // All 6 influences combined
    'ELDRITCH',       // Eater + Searing combined
    // Individual influences (loaded from pre-generated files)
    'SHAPER',
    'ELDER',
    'CRUSADER',
    'REDEEMER',
    'HUNTER',
    'WARLORD',
    // Individual eldritch
    'ELDRITCH_EATER',
    'ELDRITCH_SEARING',
    // Other domains
    'MASTER_CRAFTING',
    'CORRUPTED',
    'SYNTHESISED',
    'VEILED',
    'DELVE',
    'INCURSION',
    'ESSENCE',
    'SCOURGE',
    'BESTIARY',
    'SENTINEL',
    'INFAMOUS',
    'UNIQUE_MAPS'
  ],
  
  excludedCategories: ['Bases'],
  
  defaultLeaguePattern: /Secret/i
};

// ===== Public API =====

export function getVersionConfig(version: OverlayGameVersion): VersionConfig {
  return version === 'poe1' ? POE1_CONFIG : POE2_CONFIG;
}

export function getDomainMetadata(version: OverlayGameVersion, domain: string): DomainMetadata {
  const config = getVersionConfig(version);
  return config.domainMetadata[domain.toLowerCase()] || {
    name: domain,
    color: '#616161'
  };
}

export function getVirtualCategories(version: OverlayGameVersion): string[] {
  return getVersionConfig(version).virtualCategories;
}

export function getPrimaryToggles(version: OverlayGameVersion): DomainToggle[] {
  return getVersionConfig(version).primaryToggles;
}

export function getOverflowToggles(version: OverlayGameVersion): DomainToggle[] {
  return getVersionConfig(version).overflowToggles;
}

/**
 * Check if a domain matches a toggle's domain filter.
 * Handles both single domain strings and arrays of domains.
 */
export function domainMatchesToggle(domain: string, toggle: DomainToggle): boolean {
  const normalizedDomain = domain.toLowerCase();
  
  if (toggle.domain === 'all') return true;
  
  if (Array.isArray(toggle.domain)) {
    return toggle.domain.some(d => d.toLowerCase() === normalizedDomain);
  }
  
  return toggle.domain.toLowerCase() === normalizedDomain;
}

/**
 * Get the appropriate toggle ID for a given domain.
 * Returns the first matching toggle ID, or null if no match.
 */
export function getToggleIdForDomain(version: OverlayGameVersion, domain: string): string | null {
  const config = getVersionConfig(version);
  const allToggles = [...config.primaryToggles, ...config.overflowToggles];
  
  for (const toggle of allToggles) {
    if (domainMatchesToggle(domain, toggle)) {
      return toggle.id;
    }
  }
  
  return null;
}

/**
 * Check if a domain should be shown for "base" filter (non-special domains).
 * For PoE1: excludes influence, eldritch, veiled, corrupted, synthesis, etc.
 * For PoE2: excludes desecrated, essence, corrupted, socketable.
 */
export function isBaseDomain(version: OverlayGameVersion, domain: string): boolean {
  const normalizedDomain = domain.toLowerCase();
  const config = getVersionConfig(version);
  
  // Get all special domains from toggles (excluding 'all' and 'base'/'normal')
  const specialDomains = new Set<string>();
  const allToggles = [...config.primaryToggles, ...config.overflowToggles];
  
  for (const toggle of allToggles) {
    if (toggle.id === 'toggleAll' || toggle.id === 'toggleBase' || toggle.id === 'toggleNormal' || toggle.id === 'toggleMyMods') {
      continue;
    }
    
    if (Array.isArray(toggle.domain)) {
      toggle.domain.forEach(d => specialDomains.add(d.toLowerCase()));
    } else if (toggle.domain !== 'all') {
      specialDomains.add(toggle.domain.toLowerCase());
    }
  }
  
  return !specialDomains.has(normalizedDomain);
}
