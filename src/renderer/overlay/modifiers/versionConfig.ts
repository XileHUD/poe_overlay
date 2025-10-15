/**
 * Renderer-side version configuration for modifier domains and toggles.
 * Lightweight copy of main process config for use in overlay UI.
 */

export type OverlayGameVersion = 'poe1' | 'poe2';

export interface DomainToggle {
  id: string;
  label: string;
  domain: string | string[];
  description?: string;
  isPrimary?: boolean; // True for main toggles, false for overflow menu
}

// ===== PoE2 Configuration =====
const POE2_TOGGLES: DomainToggle[] = [
  { id: 'toggleAll', label: 'All', domain: 'all', isPrimary: true },
  { id: 'toggleBase', label: 'Base', domain: 'normal', isPrimary: true },
  { id: 'toggleDesecrated', label: 'Desecrated', domain: 'desecrated', isPrimary: true },
  { id: 'toggleEssence', label: 'Essence', domain: 'essence', isPrimary: true },
  { id: 'toggleCorrupted', label: 'Corrupted', domain: 'corrupted', isPrimary: true }
];

// ===== PoE1 Configuration =====
const POE1_TOGGLES: DomainToggle[] = [
  // Primary toggles (always visible)
  { id: 'toggleAll', label: 'All', domain: 'all', isPrimary: true },
  { id: 'toggleNormal', label: 'Normal', domain: 'normal', isPrimary: true },
  { id: 'toggleEldritch', label: 'Eldritch', domain: ['eldritch_eater', 'eldritch_searing'], isPrimary: true },
  { id: 'toggleCrafting', label: 'Crafting', domain: 'master', isPrimary: true },
  
  // Overflow toggles (in "More" menu)
  { id: 'toggleShaper', label: 'Shaper', domain: 'shaper', isPrimary: false },
  { id: 'toggleElder', label: 'Elder', domain: 'elder', isPrimary: false },
  { id: 'toggleCrusader', label: 'Crusader', domain: 'crusader', isPrimary: false },
  { id: 'toggleRedeemer', label: 'Redeemer', domain: 'redeemer', isPrimary: false },
  { id: 'toggleHunter', label: 'Hunter', domain: 'hunter', isPrimary: false },
  { id: 'toggleWarlord', label: 'Warlord', domain: 'warlord', isPrimary: false },
  { id: 'toggleVeiled', label: 'Veiled', domain: 'veiled', isPrimary: false },
  { id: 'toggleCorrupted', label: 'Corrupted', domain: 'corrupted', isPrimary: false },
  { id: 'toggleSynthesis', label: 'Synthesis', domain: 'synthesis', isPrimary: false },
  { id: 'toggleDelve', label: 'Delve', domain: 'delve', isPrimary: false },
  { id: 'toggleIncursion', label: 'Incursion', domain: 'incursion', isPrimary: false },
  { id: 'toggleEssence', label: 'Essence', domain: 'essence', isPrimary: false },
  { id: 'toggleScourge', label: 'Scourge', domain: 'scourge', isPrimary: false },
  { id: 'toggleBestiary', label: 'Bestiary', domain: 'bestiary', isPrimary: false },
  { id: 'toggleSentinel', label: 'Sentinel', domain: 'sentinel', isPrimary: false },
  { id: 'toggleInfamous', label: 'Infamous', domain: 'infamous', isPrimary: false }
];

export function getDomainToggles(version: OverlayGameVersion): DomainToggle[] {
  return version === 'poe1' ? POE1_TOGGLES : POE2_TOGGLES;
}

export function getPrimaryToggles(version: OverlayGameVersion): DomainToggle[] {
  return getDomainToggles(version).filter(t => t.isPrimary !== false);
}

export function getOverflowToggles(version: OverlayGameVersion): DomainToggle[] {
  return getDomainToggles(version).filter(t => t.isPrimary === false);
}

/**
 * Check if a domain matches a toggle's domain filter.
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
 * Check if a domain should be shown for "base"/"normal" filter.
 */
export function isBaseDomain(version: OverlayGameVersion, domain: string): boolean {
  const normalizedDomain = domain.toLowerCase();
  const allToggles = getDomainToggles(version);
  
  // Get all special domains from toggles (excluding 'all' and 'base'/'normal')
  const specialDomains = new Set<string>();
  
  for (const toggle of allToggles) {
    if (toggle.id === 'toggleAll' || toggle.id === 'toggleBase' || toggle.id === 'toggleNormal') {
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
