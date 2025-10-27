import { escapeHtml, applyFilterChipChrome, type ChipChrome } from '../utils';
import { buildPoe2ChipChrome, buildPoe2ExcludeChrome } from '../shared/filterChips';
import { getDomainToggles, getPrimaryToggles, getOverflowToggles, domainMatchesToggle, isBaseDomain, type OverlayGameVersion } from './versionConfig';
import { renderModifierVirtualList, cleanupModifierVirtualScroll, type ModSection as VirtualModSection } from './virtualScroll';

// Modifier panel controller + render pipeline extracted from overlay.html
// Exposes a stable API used by overlay.html wrappers. No DOM structure changes.

export type ModifierData = {
  item?: {
    name?: string;
    baseType?: string;
    itemClass?: string;
    category?: string;
    quality?: { percent?: number; group?: string; tags?: string[] } | undefined;
    modifiers?: string[];
    corrupted?: boolean;
    isCorrupted?: boolean;
    sanctified?: boolean;
    isSanctified?: boolean;
    fractured?: boolean;
    isFractured?: boolean;
  };
  modifiers?: Array<any>;
};

// Simple helpers delegated from OverlayUtils if available
function highlightText(s: string){ return (window as any).OverlayUtils?.highlightText?.(s) ?? s; }
function formatJoinedModText(s: string){ return (window as any).OverlayUtils?.formatJoinedModText?.(s) ?? s; }

type SearchToken = {
  value: string;
  strict: boolean;
};

type SearchIndex = {
  haystack: string;
  words: string[];
};

const modSearchCache = new WeakMap<any, SearchIndex>();

type OverlayVersionMode = 'poe1' | 'poe2';
let currentOverlayVersionMode: OverlayVersionMode = 'poe2';

// Cache for item matching to avoid re-computing on every render
let lastItemModifiersHash: string = '';
let lastMatchedSectionsCache: WeakMap<any, boolean> = new WeakMap();

export function setOverlayVersionMode(mode: string | null | undefined): void {
  currentOverlayVersionMode = mode === 'poe1' ? 'poe1' : 'poe2';
}

function isWhittlingFeatureEnabled(): boolean {
  return currentOverlayVersionMode !== 'poe1';
}

type SearchEvaluation = {
  passes: boolean;
  matchedFuzzy: number;
  matchedStrict: number;
};

function normalizeSearchText(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function pushSearchSegment(target: string[], value: any): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    const normalized = normalizeSearchText(value);
    if (normalized) target.push(normalized);
    return;
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) target.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => pushSearchSegment(target, entry));
    return;
  }
  if (typeof value === "object") {
    const obj: any = value;
    if (obj.text_plain) pushSearchSegment(target, obj.text_plain);
    else if (obj.text) pushSearchSegment(target, obj.text);
    else if (obj.name) pushSearchSegment(target, obj.name);
    if (Array.isArray(obj.values)) {
      obj.values.forEach((entry: any) => {
        if (Array.isArray(entry) && entry.length) pushSearchSegment(target, entry[0]);
        else pushSearchSegment(target, entry);
      });
    }
    if (Array.isArray(obj.tags)) pushSearchSegment(target, obj.tags);
    if (Array.isArray(obj.attributes)) pushSearchSegment(target, obj.attributes);
  }
}

function collectModSearchSegments(mod: any, section: any, data: any): string[] {
  const segments: string[] = [];
  pushSearchSegment(segments, mod?.text);
  pushSearchSegment(segments, mod?.text_plain);
  pushSearchSegment(segments, mod?.text_html);
  pushSearchSegment(segments, mod?.name);
  pushSearchSegment(segments, mod?.category);
  pushSearchSegment(segments, mod?.group);
  pushSearchSegment(segments, mod?.type);
  pushSearchSegment(segments, mod?.tags);
  pushSearchSegment(segments, mod?.attributes);
  if (Array.isArray(mod?.tiers)) {
    mod.tiers.forEach((tier: any) => {
      pushSearchSegment(segments, tier?.text_plain);
      pushSearchSegment(segments, tier?.text);
      pushSearchSegment(segments, tier?.tier_name);
      pushSearchSegment(segments, tier?.name);
      pushSearchSegment(segments, tier?.attributes);
    });
  }

  if (section) {
    pushSearchSegment(segments, section.domain);
    pushSearchSegment(segments, section.side ?? section.type);
    pushSearchSegment(segments, section.category);
    pushSearchSegment(segments, section.tags);
    pushSearchSegment(segments, section.attributes);
  }

  return segments;
}

// --- Derived metadata helpers for multimods ---
function deriveTagsFromMod(mod: any): string[] {
  try {
    const out = new Set<string>();
    const base = `${mod?.text_plain || ''} ${(mod?.text || '')}`.toLowerCase();
    const tiersTxt = Array.isArray(mod?.tiers) ? mod.tiers.map((t:any)=>`${t?.text_plain||t?.text||''}`.toLowerCase()).join(' ') : '';
    const hay = `${base} ${tiersTxt}`;
    const add = (t:string)=>{ if(t) out.add(t); };
    if (/\bfire\b/.test(hay)) add('fire');
    if (/\bcold\b/.test(hay)) add('cold');
    if (/\blightning\b/.test(hay)) add('lightning');
    if (/\bchaos\b/.test(hay)) add('chaos');
    if (/\bphysical\b/.test(hay)) add('physical');
    if (/\bspell\b/.test(hay)) add('spell');
    if (/\bbleed|bleeding\b/.test(hay)) add('bleeding');
    if (/\bpoison\b/.test(hay)) add('poison');
    if (/\bignite\b/.test(hay)) add('ignite');
    if (/\belemental\b/.test(hay)) add('elemental');
    if (/\bdamage\b/.test(hay)) add('damage');
    if (/\bailment|ailments?\b/.test(hay)) add('ailment');
    return Array.from(out);
  } catch { return []; }
}

function groupKeyForTierText(text: string): string {
  const s = (text||'').toLowerCase();
  if (/\bfire\b/.test(s)) return 'fire';
  if (/\bcold\b/.test(s)) return 'cold';
  if (/\blightning\b/.test(s)) return 'lightning';
  if (/\bchaos\b/.test(s)) return 'chaos';
  if (/\bbleed|bleeding\b/.test(s)) return 'bleeding';
  if (/\bpoison\b/.test(s)) return 'poison';
  if (/\bignite\b/.test(s)) return 'ignite';
  if (/\bspell\b/.test(s) && /\bphysical\b/.test(s)) return 'spell-physical';
  if (/\bphysical\b/.test(s)) return 'physical';
  return 'default';
}

// Normalize tier plain text for display: remove leading numbering ("iLvl 83 -", "T1 -", etc.),
// drop stray numeric-only lines and standalone labels like "Skills" that sometimes leak from data.
function sanitizeTierPlainText(raw: string): string {
  try {
    const lines = String(raw || '').split(/\r?\n/);
    const cleaned = lines.map(line => {
      // Strip leading markers like "iLvl 83 -" or "T1:"
      let L = line.replace(/^\s*(?:i?l?v?l?\s*\d+|T?\d+)\s*[-:]?\s*/i, '').trim();
      // Remove lines that become empty, numeric only, or just the word "Skills"/"Skill"/"Spells"
      if (!L) return '';
      if (/^[0-9]+$/.test(L)) return '';
      if (/^(skills?|spells?)$/i.test(L)) return '';
      return L;
    }).filter(Boolean);
    return cleaned.join('\n');
  } catch {
    return String(raw||'');
  }
}

function getModSearchIndex(mod: any, section: any, data: any): SearchIndex {
  const cached = modSearchCache.get(mod);
  if (cached) return cached;
  const haystack = collectModSearchSegments(mod, section, data)
    .filter(Boolean)
    .map((segment) => segment.toString().toLowerCase())
    .join(" ");
  const index = {
    haystack,
    words: haystack.split(/[^a-z0-9]+/).filter(Boolean)
  };
  modSearchCache.set(mod, index);
  return index;
}

function buildSearchIndexFromText(text: string): SearchIndex {
  const haystack = text.toLowerCase();
  return {
    haystack,
    words: haystack.split(/[^a-z0-9]+/).filter(Boolean)
  };
}

function evaluateSearchTokens(index: SearchIndex, tokens: SearchToken[], rawTerm: string): SearchEvaluation {
  if (!tokens.length) return { passes: true, matchedFuzzy: 0, matchedStrict: 0 };
  const { haystack, words } = index;
  let matchedFuzzy = 0;
  let matchedStrict = 0;

  // Check raw phrase match first (exact substring)
  const allFuzzy = tokens.every(token => token && !token.strict);
  if (allFuzzy && rawTerm && haystack.includes(rawTerm)) {
    return { passes: true, matchedFuzzy: tokens.length, matchedStrict: 0 };
  }

  // Strict tokens must ALL be present as exact substrings (AND for strict)
  for (const token of tokens) {
    if (!token || !token.value || !token.strict) continue;
    if (!haystack.includes(token.value)) {
      return { passes: false, matchedFuzzy: 0, matchedStrict: 0 };
    }
    matchedStrict += 1;
  }

  // Fuzzy tokens use OR logic - match ANY token (at least one must match)
  const fuzzyTokens = tokens.filter(token => token && token.value && !token.strict);
  if (fuzzyTokens.length === 0) {
    return { passes: true, matchedFuzzy: 0, matchedStrict };
  }

  for (const token of fuzzyTokens) {
    const matched = words.some(word => word.startsWith(token.value));
    if (matched) {
      matchedFuzzy += 1;
    }
  }

  // Pass if ANY fuzzy token matched (OR behavior for modifiers)
  if (matchedFuzzy > 0) {
    return { passes: true, matchedFuzzy, matchedStrict };
  }

  return { passes: false, matchedFuzzy: 0, matchedStrict };
}

// Check if current category is an aggregated view that should show item type tags
function isAggregatedCategory(): boolean {
  const currentCategory = (window as any).currentModifierCategory;
  if (!currentCategory) return false;
  const AGGREGATED_CATEGORIES = ['ALL', 'DESECRATED', 'ESSENCE', 'CORRUPTED', 'SOCKETABLES'];
  return AGGREGATED_CATEGORIES.includes(currentCategory.toUpperCase());
}

function extractTierNumber(value: any): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function renderTierBadge(mod: any): string {
  const headerTier = extractTierNumber(mod?.headerTierNumber);
  const whittlingTier = extractTierNumber(mod?.whittlingTierNumber);
  const dataTier = extractTierNumber(mod?.tier);
  
  // For multi-mods, calculate max tier count from any single group
  let displayTier = headerTier ?? whittlingTier ?? dataTier;
  
  if (mod.tiers && mod.tiers.length > 0) {
    const counts = new Map<string, number>();
    mod.tiers.forEach((t:any)=> { 
      const key = groupKeyForTierText(String(t.text_plain||t.text||'')); 
      counts.set(key, (counts.get(key)||0)+1); 
    });
    
    // If multi-mod (more than one group), use max count from any group
    if (counts.size > 1) {
      const maxGroupCount = Math.max(...Array.from(counts.values()));
      displayTier = maxGroupCount;
    }
  }
  
  if (displayTier == null) return '';
  const mismatch = dataTier != null && dataTier !== displayTier;
  const tooltip = mismatch ? ` title="Clipboard tier T${displayTier}; Database tier T${dataTier}"` : '';
  return `<span class="mod-badge badge-tier"${tooltip}>T${displayTier}</span>`;
}

// --- Helpers for multimod rendering ---

function renderSection(section: any, domainId?: string){
  const side = section.side || section.type || 'none';
  const sectionId = `section-${section.domain}-${side}`;
  const arrowId = `arrow-${sectionId}`;
  const mods: any[] = Array.isArray(section.mods) ? section.mods : [];
  const hasItemMatches = mods.some((mod: any) => Boolean(mod?.__isOnItem));
  const sectionClasses = ['section-group', `domain-${section.domain}`];
  if (hasItemMatches) sectionClasses.push('has-my-mod');
  // Prefer an effective precomputed total if provided (post-filter recalculation)
  const totalWeight = typeof section._effectiveTotalWeight === 'number'
    ? section._effectiveTotalWeight
    : mods.reduce((sum: number, mod: any) => sum + (mod.weight || 0), 0);
  const maxIlvl = mods.reduce((max: number, mod: any) => Math.max(max, mod.ilvl || 0), 0);
  return `
  <div class="${sectionClasses.join(' ')}">
    <div class="section-header" ${domainId?`onclick=\"window.OverlayModifiers&&window.OverlayModifiers.toggleDomainFromSection&&window.OverlayModifiers.toggleDomainFromSection('${domainId}', '${arrowId}')\"`:''}>
      <div class="section-title">
        <span class="collapse-arrow" id="${arrowId}">▼</span>
        ${formatDomainName(section.domain)} ${side && side!=='none' ? '- ' + formatSideName(side) : ''}
      </div>
      <div class="section-actions" style="display:flex; align-items:center; gap:6px;">
        <button class="pin-section-btn" title="Pop out this mod group" data-domain="${section.domain}" data-side="${side}" style="background:transparent; border:1px solid var(--border-color); width:18px; height:18px; border-radius:4px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; font-size:11px; color:var(--text-secondary);">📌</button>
        <div class="section-count">${mods.length}</div>
      </div>
    </div>
    <div class="section-content" id="${sectionId}">
      <div class="mod-list">
        ${mods.map((mod: any, modIndex: number) => {
          // Special handling for Eldritch mods with many tiers - show only first tier text
          const isEldritch = section.domain && (section.domain.toLowerCase().includes('eldritch_eater') || section.domain.toLowerCase().includes('eldritch_searing'));
          const hasManyTiers = mod.tiers && mod.tiers.length > 15; // Threshold for "many"
          
          let displayText = mod.text || mod.text_plain;
          let variantBadge = '';
          const onItem = Boolean((mod as any).__isOnItem);
          const matchCanonical = (mod as any).__itemMatchCanonical ? String((mod as any).__itemMatchCanonical) : '';
          const modClasses = ['mod-item'];
          if (onItem) modClasses.push('my-mod');
          const modAttributes: string[] = [
            `class="${modClasses.join(' ')}"`,
            `id="mod-${section.domain}-${side}-${modIndex}"`,
            `onclick="window.OverlayModifiers&&window.OverlayModifiers.toggleTiers&&window.OverlayModifiers.toggleTiers('${section.domain}', '${side}', ${modIndex})"`
          ];
          if (onItem) modAttributes.push('data-on-item="true"');
          if (matchCanonical) modAttributes.push(`data-item-canonical="${escapeHtml(matchCanonical)}"`);
          
          if (isEldritch && hasManyTiers && mod.tiers.length > 0) {
            // Show only first tier's text for Eldritch mods with many variants
            displayText = mod.tiers[0].text_plain || mod.tiers[0].text || displayText;
            variantBadge = `<span class="mod-badge badge-variants" style="background:var(--accent-purple);color:#fff;margin-left:6px;padding:2px 6px;border-radius:3px;font-weight:600;font-size:0.85em;" title="${mod.tiers.length} total variants">${mod.tiers.length} variants</span>`;
          }
          
          return `
          <div ${modAttributes.join(' ')}>
            <div class="mod-text" style="cursor:pointer;">
              ${highlightText(formatJoinedModText(sanitizeTierPlainText(displayText)))}
              ${variantBadge}
              ${mod.tiers && mod.tiers.length > 0 ? '<span class="expand-icon">▼</span>' : ''} 
            </div>
            <div class="mod-meta">
              ${isAggregatedCategory() && mod.category ? `<span class="tag category-tag" data-tag="${mod.category}" style="user-select:none; cursor:pointer;">${mod.category.replace(/_/g, ' ').toUpperCase()}</span>` : ''}
              ${(()=>{ const explicit = Array.isArray(mod.tags)? mod.tags: []; const derived = deriveTagsFromMod(mod); const all = Array.from(new Set([...(explicit||[]), ...derived])); return all.map((t:string)=>`<span class="tag" data-tag="${t}" style="user-select:none; cursor:pointer;">${t}</span>`).join(''); })()}
              ${onItem ? '<span class="mod-badge badge-my-mod" title="Modifier currently on your item">MY MOD</span>' : ''}
              <span class="spacer"></span>
              ${mod.ilvl ? `<span class="mod-badge badge-ilvl">iLvl ${mod.ilvl}</span>` : ''}
              ${renderTierBadge(mod)}
              ${mod.weight > 0 ? `<span class="mod-badge badge-weight" title="${totalWeight>0?((mod.weight/totalWeight)*100).toFixed(1):'0.0'}% of section">${mod.weight}</span>` : ''}
            </div>
            ${mod.tiers && mod.tiers.length > 0 ? `
              <div class="tier-list" id="tiers-${section.domain}-${side}-${modIndex}" style="display:none;">
                ${(()=>{
                  // Use preserved original tier numbers instead of recalculating from filtered array
                  // This ensures that when filters hide some tiers, the remaining ones keep their true tier numbers
                  
                  // Check if this is a multi-mod (has more than one distinct group)
                  const groupKeys = new Set<string>();
                  mod.tiers.forEach((t:any)=>{ groupKeys.add(groupKeyForTierText(String(t.text_plain||t.text||''))); });
                  const isMultiMod = groupKeys.size > 1;
                  
                  let lastKey: string | null = null;
                  let html = '';
                  
                  mod.tiers.forEach((tier:any, index:number)=>{
                    const key = groupKeyForTierText(String(tier.text_plain||tier.text||''));
                    // Use the preserved original tier number, not a recalculated one
                    const tierNum = typeof tier.__originalTierNumber === 'number' ? tier.__originalTierNumber : (mod.tiers.length - index);
                    const label = `T${tierNum}`;
                    
                    // Add divider between different groups for multi-mods
                    if (isMultiMod && lastKey !== null && lastKey !== key) {
                      html += `<div class="tier-group-divider" style="border-top: 2px solid var(--accent-blue); margin: 8px 0; opacity: 0.4;"></div>`;
                    }
                    lastKey = key;
                    
                    // Generate badges HTML (used in both normal and compact modes)
                    const badgesHtml = `
                      ${tier.tier_level ? `<span class="tier-badge tier-ilvl">iLvl ${tier.tier_level}</span>` : ''}
                      <span class="tier-badge tier-number">${label}</span>
                      ${tier.weight > 0 ? `<span class="tier-badge tier-weight" title="${(mod.weight && mod.weight>0 ? ((tier.weight/mod.weight)*100).toFixed(1) : '0.0')}% of mod">${tier.weight}</span>` : ''}
                    `;
                    
                    html += `
                      <div class="tier-item" title="${String(tier.tier_name||'').replace(/^\s*(?:i?l?v?l?\s*\d+|T?\d+)\s*[-:]?\s*/i,'')}">
                        <div class="tier-line">
                          <span class="tier-name">${String(tier.tier_name||'').replace(/^\s*(?:i?l?v?l?\s*\d+|T?\d+)\s*[-:]?\s*/i,'')}</span>
                          <div class="tier-badges tier-badges-normal">${badgesHtml}</div>
                        </div>
                        <div class="tier-text">
                          <span class="tier-text-content">${highlightText(formatJoinedModText(sanitizeTierPlainText(String(tier.text_plain || tier.text || ''))))}</span>
                          <span class="tier-badges-compact" style="display:none;">${badgesHtml}</span>
                        </div>
                      </div>`;
                  });
                  
                  return html;
                })()}
              </div>
            `: ''}
          </div>
        `;
        }).join('')}
        <div class="total-row">
          <div class="total-text">Total</div>
          <div class="total-meta">
            <span class="total-summary-tag" style="background: var(--accent-blue); color: #fff;">${maxIlvl}</span>
            <span class="total-summary-tag weight">${totalWeight}</span>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

export function mechanicsPostProcess(data: ModifierData){
  try{
    const catSlug = (data.item?.category || '').toUpperCase();
    if (catSlug === 'EXPEDITION_LOGBOOK') {
      (data.modifiers||[]).forEach(sec=>{ 
        (sec.mods||[]).forEach((m:any)=>{
          if (m.text_html && !m.text_html.includes('logbook-level')){
            const plainMatch = m.text_plain?.match(/^(\d+):\s*(.*)$/);
            if (plainMatch){
              const lvl = plainMatch[1];
              const restPlain = plainMatch[2];
              m.text_plain = restPlain;
              m.text_html = `<span class="logbook-level">${lvl}</span>${restPlain}`;
            }
          }
        })
      })
    }
    if (catSlug === 'STRONGBOX'){
      (data.modifiers||[]).forEach(sec=>{
        (sec.mods||[]).forEach((m:any)=>{
          if (m.text_html){
            m.text_html = m.text_html
              .replace(/\s+(Casts\s)/g,'<br>$1')
              .replace(/\s+(Guarded by)/gi,'<br>$1')
              .replace(/\s+(Summons\s)/g,'<br>$1')
              .replace(/\s+(Detonates\s)/g,'<br>$1');
          }
        })
      })
    }
    if (catSlug === 'STRONGBOX_UNIQUES'){
      (data.modifiers||[]).forEach(sec=>{
        (sec.mods||[]).forEach((m:any)=>{
          if (m.text_html){
            m.text_html = m.text_html
              .replace(/\s+(Guarded by)/gi,'<br>$1')
              .replace(/\s+(Casts\s)/g,'<br>$1');
            (m as any).isStrongboxUnique = true;
          }
        })
      })
    }
  } catch(e){ console.warn('Mechanics post-process failed', e); }
}

type ParsedItemMod = {
  header?: string | null;
  value: string;
  tierName?: string | null;
  tierNumber?: number | null;
  side?: string | null;
  isFractured?: boolean;
  isRune?: boolean;
  isDesecrated?: boolean;
  isSanctified?: boolean;
};

type TierCandidate = {
  canonical: string;
  tierName: string | null;
  tierNumber?: number | null;
  tierLevel: number | null;
  side: string | null;
  domain: string | null;
  tierText: string;
  modText: string;
};

type TierIndex = {
  byCanonical: Map<string, TierCandidate[]>;
  byTierName: Map<string, TierCandidate[]>;
};

type WhittlingMod = {
  id: string;
  header?: string | null;
  value: string;
  display: string;
  canonical: string;
  tierName: string | null;
  tierNumber: number | null;
  headerTierNumber: number | null;
  ilvl: number | null;
  side: string | null;
  domain: string | null;
  isFractured: boolean;
  isRune: boolean;
  isDesecrated: boolean;
  isSanctified: boolean;
  isLocked: boolean;
};

type WhittlingResult = {
  lowestIlvl: number | null;
  lowestMods: WhittlingMod[];
  allMods: WhittlingMod[];
  blockedReason: 'corrupted' | 'sanctified' | 'fractured' | null;
};

type ItemModCatalog = {
  total: number;
  canonicalCounts: Map<string, number>;
  canonicalSides: Map<string, Array<string | null>>;
};

function pushToMap<T>(map: Map<string, T[]>, key: string | null | undefined, value: T): void {
  const normalized = key ? key : '';
  if (!normalized) return;
  const bucket = map.get(normalized);
  if (bucket) bucket.push(value);
  else map.set(normalized, [value]);
}

function normalizeTierName(name: string | null | undefined): string {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function tierNameTokens(name: string | null | undefined): string[] {
  if (!name) return [];
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function titleCase(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function canonicalizeBaseText(raw: string | null | undefined, removeLeadingLevel = false): string {
  if (!raw) return '';
  let text = String(raw);
  if (removeLeadingLevel) {
    text = text.replace(/^\s*\d+\s+/, '');
  }
  text = text
    .replace(/\(augmented\)/gi, '')
    .replace(/\(crafted\)/gi, '')
    .replace(/\(implicit\)/gi, '')
    .replace(/\(enchant(?:ed)?\)/gi, '')
    .replace(/\(corrupted\)/gi, '')
    .replace(/\(rune\)/gi, '')
    .replace(/\(fractured\)/gi, '')
    .replace(/\(desecrated\)/gi, '')
    .replace(/\(sanctified\)/gi, '')
    .replace(/[–—−]/g, '-')
    .replace(/\s*\+\s*/g, '+')
    .replace(/\s+/g, ' ')
    .trim();
  text = text.replace(/\d+(?:\.\d+)?/g, '#');
  text = text.replace(/#\s*\(/g, '#(');
  text = text.replace(/#(?=\()/g, '');
  text = text.replace(/^\+/, '');
  return text.toLowerCase();
}

function canonicalizeDatabaseText(raw: string | null | undefined): string {
  return canonicalizeBaseText(raw, true);
}

function canonicalizeItemText(raw: string | null | undefined): string {
  return canonicalizeBaseText(raw, false);
}

function canonicalizeClipboardValue(value: any): string {
  if (value == null) return '';
  const normalized = normalizeSearchText(String(value));
  if (!normalized) return '';
  return canonicalizeItemText(normalized);
}

function canonicalizeDatabaseValue(value: any): string {
  if (value == null) return '';
  const normalized = normalizeSearchText(String(value));
  if (!normalized) return '';
  return canonicalizeDatabaseText(normalized);
}

function buildItemModCatalog(lines: string[] | undefined): ItemModCatalog {
  const entries = parseItemModifiers(lines);
  const canonicalCounts = new Map<string, number>();
  const canonicalSides = new Map<string, Array<string | null>>();

  for (const entry of entries) {
    const canonical = canonicalizeClipboardValue(entry?.value);
    if (!canonical) continue;
    const count = canonicalCounts.get(canonical) ?? 0;
    canonicalCounts.set(canonical, count + 1);
    const bucket = canonicalSides.get(canonical);
    const side = entry?.side ? String(entry.side).toLowerCase() : null;
    if (bucket) bucket.push(side);
    else canonicalSides.set(canonical, [side]);
  }

  console.log(`[ItemMatch] Built catalog with ${entries.length} mods, ${canonicalCounts.size} unique canonical forms`);

  return {
    total: entries.length,
    canonicalCounts,
    canonicalSides
  };
}

function collectModCanonicalCandidates(mod: any): string[] {
  const candidates = new Set<string>();
  const push = (value: any) => {
    const canonical = canonicalizeDatabaseValue(value);
    if (canonical) candidates.add(canonical);
  };

  push(mod?.text_plain ?? mod?.text);
  push(mod?.text);
  push(mod?.text_html);

  if (Array.isArray(mod?.tiers)) {
    mod.tiers.forEach((tier: any) => {
      push(tier?.text_plain ?? tier?.text);
      push(tier?.text);
      push(tier?.text_html);
    });
  }

  return Array.from(candidates);
}

function resolveItemMatch(
  candidates: string[],
  sectionSide: string | null,
  catalog: ItemModCatalog | null | undefined,
  usage: Map<string, number>
): string | null {
  if (!catalog || catalog.total === 0 || !candidates.length) {
    return null;
  }

  const normalizedSide = sectionSide ? sectionSide.toLowerCase() : null;
  let fallback: string | null = null;

  for (const candidate of candidates) {
    if (!candidate) continue;
    const total = catalog.canonicalCounts.get(candidate);
    if (!total) continue;
    const consumed = usage.get(candidate) ?? 0;
    if (consumed >= total) continue;

    const sides = catalog.canonicalSides.get(candidate) || [];
    const hasSideMatch = sides.length === 0 || sides.some((side) => {
      if (!side) return true;
      if (!normalizedSide) return true;
      return side === normalizedSide;
    });

    if (hasSideMatch) {
      usage.set(candidate, consumed + 1);
      return candidate;
    }

    if (fallback === null) {
      fallback = candidate;
    }
  }

  if (fallback) {
    const total = catalog.canonicalCounts.get(fallback) ?? 0;
    const consumed = usage.get(fallback) ?? 0;
    if (consumed < total) {
      usage.set(fallback, consumed + 1);
      return fallback;
    }
  }

  return null;
}

function applyItemMatchesToSections(sections: any[] | undefined, catalog: ItemModCatalog | null): number {
  const startTime = performance.now();
  let matchCount = 0;
  if (!Array.isArray(sections)) {
    return matchCount;
  }

  const usage = new Map<string, number>();

  // Early exit: if no items to match, just clear flags
  if (!catalog || catalog.total === 0) {
    sections.forEach(section => {
      if (!section || !Array.isArray(section.mods)) return;
      section.mods.forEach((mod: any) => {
        if (!mod) return;
        if (Object.prototype.hasOwnProperty.call(mod, '__isOnItem')) delete mod.__isOnItem;
        if (Object.prototype.hasOwnProperty.call(mod, '__itemMatchCanonical')) delete mod.__itemMatchCanonical;
      });
    });
    return 0;
  }

  let totalModsChecked = 0;
  sections.forEach(section => {
    if (!section || !Array.isArray(section.mods)) return;
    
    // Early exit: if we've matched all item mods, no need to continue
    if (matchCount >= catalog.total) return;
    
    const side = typeof section.side === 'string'
      ? section.side.toLowerCase()
      : (typeof section.type === 'string' ? section.type.toLowerCase() : null);

    section.mods.forEach((mod: any) => {
      if (!mod) return;

      if (Object.prototype.hasOwnProperty.call(mod, '__isOnItem')) delete mod.__isOnItem;
      if (Object.prototype.hasOwnProperty.call(mod, '__itemMatchCanonical')) delete mod.__itemMatchCanonical;

      // Early exit: if we've matched all item mods, no need to continue
      if (matchCount >= catalog.total) return;

      totalModsChecked++;
      
      const candidates = collectModCanonicalCandidates(mod);
      if (!candidates.length) return;

      const match = resolveItemMatch(candidates, side, catalog, usage);
      if (!match) return;

      mod.__isOnItem = true;
      mod.__itemMatchCanonical = match;
      matchCount += 1;
    });
  });

  const elapsed = performance.now() - startTime;
  console.log(`[ItemMatch] Checked ${totalModsChecked} mods, found ${matchCount}/${catalog.total} matches in ${elapsed.toFixed(2)}ms`);

  return matchCount;
}

function formatWhittlingDisplay(value: string): string {
  return value
    .replace(/\s*\((?:augmented|fractured|desecrated|crafted|rune|corrupted|sanctified)\)\s*/gi, '')
    .replace(/\s*\n\s*/g, ' · ')
    .trim();
}

function parseHeaderInfo(header: string | null | undefined): {
  tierName: string | null;
  tierNumber: number | null;
  side: string | null;
  isFractured: boolean;
  isRune: boolean;
  skip: boolean;
} {
  if (!header) {
    return { tierName: null, tierNumber: null, side: null, isFractured: false, isRune: false, skip: false };
  }
  const tierNameMatch = header.match(/["“”'‘’]([^"“”'‘’]+)["“”'‘’]/);
  const tierName = tierNameMatch ? tierNameMatch[1] : null;
  const tierNumberMatch = header.match(/Tier:\s*(\d+)/i);
  const tierNumber = tierNumberMatch ? Number(tierNumberMatch[1]) : null;
  const lower = header.toLowerCase();
  const side = lower.includes('suffix modifier') ? 'suffix' : (lower.includes('prefix modifier') ? 'prefix' : null);
  const isFractured = lower.includes('fractured');
  const isRune = lower.includes('rune');
  const skip = lower.includes('implicit modifier') || lower.includes(' implicit ') || lower.includes('enchant');
  return { tierName, tierNumber, side, isFractured, isRune, skip };
}

function parseValueMarkers(value: string): {
  isFractured: boolean;
  isRune: boolean;
  isDesecrated: boolean;
  isSanctified: boolean;
  skip: boolean;
} {
  const isFractured = /\(fractured\)/i.test(value);
  const isRune = /\(rune\)/i.test(value);
  const isDesecrated = /\(desecrated\)/i.test(value);
  const isSanctified = /\(sanctified\)/i.test(value) || /\bsanctified\b/i.test(value);
  const skip = /\(crafted\)/i.test(value) || /\(implicit\)/i.test(value) || /\(enchant(?:ed)?\)/i.test(value) || /\(corrupted\)/i.test(value);
  return { isFractured, isRune, isDesecrated, isSanctified, skip };
}

function isLikelyBasePropertyLine(value: string): boolean {
  if (!value) return false;
  const normalized = value.replace(/\(augmented\)/gi, '').trim();
  if (!normalized) return false;
  const colonIndex = normalized.indexOf(':');
  if (colonIndex <= 0) return false;
  const label = normalized.slice(0, colonIndex).trim().toLowerCase();
  if (!label) return false;

  const BASE_PROPERTY_KEYWORDS = [
    'block chance',
    'chance to block',
    'chance to block spell damage',
    'chance to block attack damage',
    'armour',
    'armour and evasion',
    'armour and energy shield',
    'armour, evasion and energy shield',
    'evasion rating',
    'energy shield',
    'ward',
    'physical damage',
    'chaos damage',
    'elemental damage',
    'critical strike chance',
    'attacks per second',
    'weapon range',
    'stack size',
    'quality',
    'item level',
    'level requirement',
    'requires',
    'strength requirement',
    'dexterity requirement',
    'intelligence requirement',
    'base chance',
    'socketed gems',
    'sockets',
    'gem level'
  ];

  if (BASE_PROPERTY_KEYWORDS.some(keyword => label === keyword || label.startsWith(keyword))) {
    return true;
  }

  const simpleWords = label.replace(/[^a-z\s]/g, '').trim();
  if (!simpleWords) return false;
  const wordCount = simpleWords.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 4 && /(armour|evasion|energy shield|ward|block|damage|resistance)/.test(simpleWords)) {
    return true;
  }

  return false;
}

function createParsedMod(header: string | null, value: string): ParsedItemMod | null {
  const headerInfo = parseHeaderInfo(header);
  const markerInfo = parseValueMarkers(value);
  if (headerInfo.skip) return null;
  if (markerInfo.skip) return null;
  if (headerInfo.isRune || markerInfo.isRune) return null;
  if (isLikelyBasePropertyLine(value)) return null;
  return {
    header,
    value,
    tierName: headerInfo.tierName,
    tierNumber: headerInfo.tierNumber,
    side: headerInfo.side,
    isFractured: headerInfo.isFractured || markerInfo.isFractured,
    isRune: headerInfo.isRune || markerInfo.isRune,
    isDesecrated: markerInfo.isDesecrated,
    isSanctified: markerInfo.isSanctified
  };
}

function parseItemModifiers(lines: string[] | undefined): ParsedItemMod[] {
  if (!Array.isArray(lines) || !lines.length) return [];
  const entries: ParsedItemMod[] = [];
  let currentHeader: string | null = null;
  for (const raw of lines) {
    if (raw == null) continue;
    const trimmed = String(raw).trim();
    if (!trimmed) continue;
    if (/^[-=]{2,}$/.test(trimmed)) continue;
    if (/^\{/.test(trimmed)) {
      currentHeader = trimmed;
      continue;
    }
  if (!currentHeader) continue;
    if (/^socketed\s+(?:gems|attacks|spells)\s+are\s+supported/i.test(trimmed)) {
      currentHeader = null;
      continue;
    }
    const entry = createParsedMod(currentHeader, trimmed);
    if (!entry && currentHeader) {
      // Allow non-numeric descriptive lines to clear current header gracefully
      currentHeader = null;
    }
    if (entry) entries.push(entry);
  }
  return mergeHybridEntries(entries);
}

function mergeHybridEntries(entries: ParsedItemMod[]): ParsedItemMod[] {
  if (!entries.length) return entries;
  const merged: ParsedItemMod[] = [];
  for (let i = 0; i < entries.length; i++) {
    const current = entries[i];
    if (!current.header) {
      merged.push(current);
      continue;
    }
    const combined: ParsedItemMod = { ...current };
    while (i + 1 < entries.length && entries[i + 1]?.header === current.header) {
      const next = entries[i + 1];
      combined.value = `${combined.value}\n${next.value}`;
      combined.isFractured = Boolean(combined.isFractured || next.isFractured);
      combined.isRune = Boolean(combined.isRune || next.isRune);
      combined.isDesecrated = Boolean(combined.isDesecrated || next.isDesecrated);
      combined.isSanctified = Boolean(combined.isSanctified || next.isSanctified);
      i++;
    }
    merged.push(combined);
  }
  return merged;
}

function determineBlockedReason(itemMeta: any, lines: string[] | undefined): 'corrupted' | 'sanctified' | 'fractured' | null {
  const reasons: Array<'corrupted' | 'sanctified' | 'fractured'> = ['corrupted', 'sanctified', 'fractured'];
  const boolFields = {
    corrupted: ['corrupted', 'isCorrupted'],
    sanctified: ['sanctified', 'isSanctified'],
    fractured: ['fractured', 'isFractured'],
  } as const;
  const normalizedLines = Array.isArray(lines)
    ? lines
        .map((entry) => (entry == null ? '' : String(entry).trim().toLowerCase()))
        .filter(Boolean)
    : [];
  const matchesLine = (needle: string, exact = false) => {
    if (!needle) return false;
    return normalizedLines.some((line) => (exact ? line === needle : line.includes(needle)));
  };

  for (const reason of reasons) {
    const fields = boolFields[reason];
    if (fields.some((field) => itemMeta && Boolean(itemMeta[field]))) return reason;
    if (reason === 'fractured') {
      if (matchesLine('fractured item', true)) return reason;
      continue;
    }
    if (matchesLine(reason, reason === 'corrupted')) return reason;
  }
  return null;
}

function buildTierIndex(sections: any[] | undefined): TierIndex {
  const byCanonical = new Map<string, TierCandidate[]>();
  const byTierName = new Map<string, TierCandidate[]>();
  if (!Array.isArray(sections)) return { byCanonical, byTierName };
  const allowedDomains = new Set(['normal', 'essence', 'desecrated']);
  for (const section of sections) {
    if (!section) continue;
    const side = typeof section.side === 'string'
      ? section.side.toLowerCase()
      : (typeof section.type === 'string' ? section.type.toLowerCase() : null);
    const domain = typeof section.domain === 'string' ? section.domain.toLowerCase() : null;
    if (domain && !allowedDomains.has(domain)) continue;
    const mods = Array.isArray(section.mods) ? section.mods : [];
    for (const mod of mods) {
      if (!mod) continue;
      const modText = (mod.text_plain || mod.text || mod.text_html || '').toString();
      const modLevel = Number(mod.ilvl ?? mod.level ?? 0) || null;
      if (Array.isArray(mod.tiers) && mod.tiers.length) {
        const tiers = mod.tiers;
        tiers.forEach((tier: any, idx: number) => {
          if (!tier) return;
          const tierText = (tier.text_plain || tier.text || tier.text_html || modText || '').toString();
          const canonical = canonicalizeDatabaseText(tierText);
          if (!canonical) return;
          const tierName = (tier.tier_name || tier.name || '').toString() || null;
          const tierLevel = Number(tier.tier_level ?? tier.ilvl ?? modLevel ?? 0) || null;
          const tierNumber = tiers.length - idx;
          const candidate: TierCandidate = {
            canonical,
            tierName,
            tierNumber,
            tierLevel,
            side,
            domain,
            tierText,
            modText
          };
          pushToMap(byCanonical, canonical, candidate);
          if (tierName) pushToMap(byTierName, normalizeTierName(tierName), candidate);
        });
      } else {
        const canonical = canonicalizeDatabaseText(modText);
        if (!canonical) continue;
        const tierName = (mod.tier_name || mod.name || mod.family_name || '').toString() || null;
        const candidate: TierCandidate = {
          canonical,
          tierName,
          tierNumber: null,
          tierLevel: modLevel,
          side,
          domain,
          tierText: modText,
          modText
        };
        pushToMap(byCanonical, canonical, candidate);
        if (tierName) pushToMap(byTierName, normalizeTierName(tierName), candidate);
      }
    }
  }
  return { byCanonical, byTierName };
}

function selectCandidate(entry: ParsedItemMod, canonical: string, index: TierIndex): TierCandidate | null {
  if (!canonical) return null;
  let candidates = (index.byCanonical.get(canonical) || []).slice();
  if (entry.tierName) {
    const byName = index.byTierName.get(normalizeTierName(entry.tierName)) || [];
    if (byName.length) {
      const nameSet = new Set(byName);
      const overlap = candidates.filter(candidate => nameSet.has(candidate));
      candidates = overlap.length ? overlap.slice() : byName.slice();
    }
    if (!candidates.length) {
      const entryTokens = tierNameTokens(entry.tierName);
      if (entryTokens.length) {
        candidates = (index.byCanonical.get(canonical) || []).filter(candidate => {
          const candTokens = tierNameTokens(candidate.tierName);
          return candTokens.some(token => entryTokens.includes(token));
        });
      }
    }
    if (!candidates.length) {
      const lowered = entry.tierName.toLowerCase();
      if (lowered.includes('essence')) {
        const canonMatches = index.byCanonical.get(canonical) || [];
        const essenceMatches = canonMatches.filter(candidate => candidate.domain === 'essence');
        if (essenceMatches.length) candidates = essenceMatches;
      }
    }
  }
  if (entry.tierNumber != null && candidates.length > 1) {
    const exact = candidates.filter(candidate => candidate.tierNumber === entry.tierNumber);
    if (exact.length) candidates = exact;
  }
  if (entry.side && entry.side !== 'none' && candidates.length > 1) {
    const sideMatches = candidates.filter(candidate => !candidate.side || candidate.side === entry.side);
    if (sideMatches.length) candidates = sideMatches;
  }
  const preferredDomains = new Set(['', 'normal', 'essence', 'desecrated', 'none']);
  const domainFiltered = candidates.filter(candidate => !candidate.domain || preferredDomains.has(candidate.domain));
  if (domainFiltered.length) candidates = domainFiltered;
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  const domainRank = (domain: string | null | undefined) => {
    if (!domain || domain === 'normal' || domain === 'none') return 0;
    if (domain === 'essence') return 1;
    if (domain === 'desecrated') return 2;
    return 99;
  };
  candidates.sort((a, b) => {
    const rankDiff = domainRank(a.domain) - domainRank(b.domain);
    if (rankDiff !== 0) return rankDiff;
    const tierA = typeof a.tierNumber === 'number' ? a.tierNumber : Infinity;
    const tierB = typeof b.tierNumber === 'number' ? b.tierNumber : Infinity;
    if (tierA !== tierB) return tierA - tierB;
    const levelA = typeof a.tierLevel === 'number' ? a.tierLevel : -Infinity;
    const levelB = typeof b.tierLevel === 'number' ? b.tierLevel : -Infinity;
    if (levelA !== levelB) return levelB - levelA;
    return a.modText.localeCompare(b.modText);
  });
  return candidates[0] || null;
}

function buildWhittlingMeta(mod: WhittlingMod): string {
  const meta: string[] = [];
  if (mod.tierName) meta.push(mod.tierName);
  const tierForDisplay = mod.headerTierNumber ?? mod.tierNumber;
  if (tierForDisplay != null) meta.push(`T${tierForDisplay}`);
  if (typeof mod.ilvl === 'number' && Number.isFinite(mod.ilvl)) meta.push(`iLvl ${mod.ilvl}`);
  if (mod.side && mod.side !== 'none') meta.push(titleCase(mod.side));
  if (mod.domain && mod.domain !== 'normal' && mod.domain !== 'none') meta.push(titleCase(mod.domain.replace(/_/g, ' ')));
  if (mod.isDesecrated) meta.push('Desecrated');
  if (mod.isSanctified) meta.push('Sanctified');
  if (mod.isFractured) meta.push('Fractured');
  if (mod.isRune) meta.push('Rune');
  return meta.length ? meta.join(' · ') : 'No tier metadata';
}

function buildWhittlingBadge(result: WhittlingResult): string {
  let summary: string;
  if (result.blockedReason) {
    const reasonText = result.blockedReason === 'fractured' ? 'FRACTURED' : result.blockedReason.toUpperCase();
    if (result.blockedReason === 'corrupted' || result.blockedReason === 'sanctified') {
      summary = reasonText;
    } else {
      const modCount = result.lowestMods.length === 1 ? '1 mod' : `${result.lowestMods.length} mods`;
      summary = `${reasonText} · ${modCount}`;
    }
  } else if (result.lowestMods.length === 1) {
    summary = '1 mod';
  } else {
    summary = `${result.lowestMods.length} mods`;
  }
  const sorted = [...result.allMods].sort((a, b) => {
    const aIlvl = typeof a.ilvl === 'number' ? a.ilvl : -Infinity;
    const bIlvl = typeof b.ilvl === 'number' ? b.ilvl : -Infinity;
    if (aIlvl !== bIlvl) return bIlvl - aIlvl;
    if (a.isLocked !== b.isLocked) return a.isLocked ? 1 : -1;
    return a.display.localeCompare(b.display);
  });
  const highlightIds = new Set(result.lowestMods.map(mod => mod.id));
  const warningNote = (() => {
    if (!result.blockedReason) return '';
    // Fractured items CAN be whittled (just not the fractured mod), so only warn for sanctified/corrupted
    if (result.blockedReason === 'fractured') return '';
    const label = result.blockedReason === 'sanctified'
      ? 'Item is sanctified and cannot be whittled'
      : 'Item is corrupted and cannot be whittled';
    return `<div class="whittling-tooltip-warning">${escapeHtml(label)}</div>`;
  })();
  const rows = sorted.map(mod => {
    const classes = ['whittling-tooltip-row'];
    if (highlightIds.has(mod.id)) classes.push('whittling-remove');
    if (mod.isLocked) classes.push('whittling-locked');
    return `<div class="${classes.join(' ')}">
        <div class="whittling-mod-text">${escapeHtml(mod.display)}</div>
        <div class="whittling-mod-meta">${escapeHtml(buildWhittlingMeta(mod))}</div>
      </div>`;
  }).join('');
  return `<div class="whittling-badge">
    <div class="whittling-label">WHITTLING</div>
      <div class="whittling-value">${escapeHtml(summary)}</div>
      <div class="whittling-tooltip">
        <div class="whittling-tooltip-header">Explicit modifiers</div>
        ${warningNote}
        ${rows || '<div class="whittling-tooltip-row whittling-empty">No explicit modifiers detected</div>'}
      </div>
    </div>`;
}

export function buildWhittlingBadgeForTest(result: WhittlingResult): string {
  return buildWhittlingBadge(result);
}

function applyWhittlingMetadataToOverlayMods(data: ModifierData | null | undefined, result: WhittlingResult | null): void {
  try {
    if (!data || !Array.isArray((data as any).modifiers)) return;
    (data.modifiers as any[]).forEach(section => {
      if (!section || !Array.isArray(section.mods)) return;
      section.mods.forEach((mod: any) => {
        if (!mod) return;
        if (Object.prototype.hasOwnProperty.call(mod, 'headerTierNumber')) mod.headerTierNumber = null;
        if (Object.prototype.hasOwnProperty.call(mod, 'whittlingTierNumber')) mod.whittlingTierNumber = null;
      });
    });
    if (!result || !Array.isArray(result.allMods) || !result.allMods.length) return;
    console.log('[Whittling] Applying metadata from', result.allMods.length, 'clipboard mods to database');
    const buckets = new Map<string, WhittlingMod[]>();
    result.allMods.forEach(mod => {
      if (!mod || !mod.canonical) return;
      const list = buckets.get(mod.canonical) || [];
      list.push(mod);
      buckets.set(mod.canonical, list);
    });
    console.log('[Whittling] Built', buckets.size, 'canonical buckets');
    (data.modifiers as any[]).forEach(section => {
      if (!section || !Array.isArray(section.mods)) return;
      section.mods.forEach((mod: any) => {
        if (!mod) return;
        const rawText = (mod.text_plain ?? mod.text ?? mod.text_html ?? '') as string;
        const canonical = canonicalizeItemText(rawText);
        if (!canonical) return;
        const bucket = buckets.get(canonical);
        if (!bucket || !bucket.length) {
          console.log('[Whittling] No match for database mod:', rawText.substring(0, 50));
          return;
        }
        console.log('[Whittling] Found', bucket.length, 'clipboard match(es) for:', rawText.substring(0, 50));
        console.log('[Whittling] Found', bucket.length, 'clipboard match(es) for:', rawText.substring(0, 50));
        let match: WhittlingMod | undefined;
        if (bucket.length === 1) {
          match = bucket[0];
        } else {
          const tierMatches = bucket.filter(candidate => {
            const candidateTier = extractTierNumber(candidate.tierNumber);
            const modTier = extractTierNumber(mod.tier);
            return candidateTier != null && modTier != null && candidateTier === modTier;
          });
          if (tierMatches.length) {
            match = tierMatches[0];
          } else {
            const headerMatches = bucket.filter(candidate => extractTierNumber(candidate.headerTierNumber) != null);
            match = headerMatches[0] || bucket[0];
          }
        }
        if (!match) return;
        console.log('[Whittling] Match headerTier:', match.headerTierNumber, 'fallbackTier:', match.tierNumber);
        const bucketIndex = bucket.indexOf(match);
        if (bucketIndex >= 0) bucket.splice(bucketIndex, 1);
        if (!bucket.length) buckets.delete(canonical);
        const headerTier = extractTierNumber(match.headerTierNumber);
        const fallbackTier = extractTierNumber(match.tierNumber);
        if (headerTier != null || fallbackTier != null) {
          mod.headerTierNumber = headerTier;
          mod.whittlingTierNumber = fallbackTier;
          console.log('[Whittling] Set metadata on database mod - headerTier:', headerTier, 'fallbackTier:', fallbackTier);
        }
      });
    });
  } catch (error) {
    console.warn('[Whittling] failed to apply metadata to overlay mods', error);
  }
}

function renderWhittlingInfo(result: WhittlingResult | null): void {
  const container = document.getElementById('whittlingInfo');
  if (!container) return;
  if (!result || !result.allMods.length) {
    container.setAttribute('style', 'display:none; margin-right:6px; -webkit-app-region: no-drag;');
    container.innerHTML = '';
    return;
  }
  container.setAttribute('style', 'display:inline-flex; align-items:center; gap:6px; margin-right:6px; -webkit-app-region: no-drag;');
  container.innerHTML = buildWhittlingBadge(result);
}

export function computeWhittling(data: ModifierData): WhittlingResult | null {
  try {
    if (!data || !Array.isArray((data as any).item?.modifiers) || !Array.isArray(data.modifiers)) return null;
    const itemMeta: any = (data as any).item ?? {};
    const rawLines = Array.isArray((data as any).item?.modifiers)
      ? ((data as any).item?.modifiers as string[]).slice()
      : [];
    console.log('[Whittling] Raw clipboard lines:', rawLines);
    const entries = parseItemModifiers(rawLines);
    console.log('[Whittling] Parsed', entries.length, 'entries from clipboard');
    if (!entries.length) return null;
    const tierIndex = buildTierIndex(data.modifiers as any[]);
    const allMods: WhittlingMod[] = [];
    entries.forEach((entry, index) => {
      const headerDetails = entry.header ? parseHeaderInfo(entry.header) : { tierName: null, tierNumber: null, side: null, isFractured: false, isRune: false, skip: false };
      console.log('[Whittling] Entry', index, 'header:', entry.header, '→ tierNumber:', headerDetails.tierNumber);
      const canonical = canonicalizeItemText(entry.value);
      let candidate = selectCandidate(entry, canonical, tierIndex);
      const canonicalBucket = canonical ? (tierIndex.byCanonical.get(canonical) || []).slice() : [];
      if (!candidate && canonicalBucket.length) {
        const desiredTier = headerDetails.tierNumber ?? entry.tierNumber ?? null;
        if (desiredTier != null) {
          const tierMatch = canonicalBucket.find(c => c.tierNumber === desiredTier);
          if (tierMatch) candidate = tierMatch;
        }
        if (!candidate && (headerDetails.tierName || entry.tierName)) {
          const desiredName = normalizeTierName(headerDetails.tierName ?? entry.tierName);
          if (desiredName) {
            const nameMatch = canonicalBucket.find(c => normalizeTierName(c.tierName) === desiredName);
            if (nameMatch) candidate = nameMatch;
          }
        }
        if (!candidate) {
          candidate = canonicalBucket[0] || null;
        }
      }
      const tierName = headerDetails.tierName ?? entry.tierName ?? candidate?.tierName ?? null;
      const tierNumber = headerDetails.tierNumber ?? entry.tierNumber ?? candidate?.tierNumber ?? null;
      const ilvl = candidate?.tierLevel ?? null;
      const side = headerDetails.side ?? entry.side ?? candidate?.side ?? null;
      const domain = candidate?.domain ?? null;
      const mod: WhittlingMod = {
        id: `whittling-${index}`,
        header: entry.header,
        value: entry.value,
        display: formatWhittlingDisplay(entry.value),
        canonical,
        tierName,
        tierNumber: typeof tierNumber === 'number' && Number.isFinite(tierNumber) ? tierNumber : null,
        headerTierNumber: typeof headerDetails.tierNumber === 'number' && Number.isFinite(headerDetails.tierNumber) ? headerDetails.tierNumber : null,
        ilvl: typeof ilvl === 'number' && Number.isFinite(ilvl) ? ilvl : null,
        side,
        domain,
        isFractured: Boolean(headerDetails.isFractured || entry.isFractured),
        isRune: Boolean(headerDetails.isRune || entry.isRune),
        isDesecrated: Boolean(entry.isDesecrated),
        isSanctified: Boolean(entry.isSanctified),
        isLocked: Boolean(entry.isFractured || entry.isRune || entry.isSanctified)
      };
      allMods.push(mod);
    });
    const removable = allMods.filter(mod => !mod.isLocked && typeof mod.ilvl === 'number' && Number.isFinite(mod.ilvl));
    const lowestIlvl = removable.length ? removable.reduce((min, mod) => Math.min(min, mod.ilvl as number), Infinity) : null;
    const lowestMods = removable.length && lowestIlvl != null
      ? removable.filter(mod => (mod.ilvl as number) === lowestIlvl)
      : [];
    let blockedReason = determineBlockedReason(itemMeta, rawLines);
    if (!blockedReason) {
      try {
        const serialized = JSON.stringify(itemMeta ?? {}).toLowerCase();
        const flagMatch = (needle: string) => {
          if (!needle) return false;
          const capitalized = needle.charAt(0).toUpperCase() + needle.slice(1);
          const tokens = [
            `"${needle}":true`,
            `"${needle}":1`,
            `"${needle}":"true"`,
            `"${needle}":"1"`,
            `"is${capitalized}":true`,
            `"is${capitalized}":1`,
            `"is${capitalized}":"true"`,
            `"status":"${needle}"`,
            `"state":"${needle}"`,
            `"flags":["${needle}"`,
            `"tags":["${needle}"`,
            `"keywords":["${needle}"`
          ];
          return tokens.some(token => serialized.includes(token));
        };
        if (flagMatch('sanctified')) blockedReason = 'sanctified';
        else if (flagMatch('corrupted')) blockedReason = 'corrupted';
        else if (flagMatch('fractured')) blockedReason = 'fractured';
      } catch {}
    }
    if (!blockedReason && rawLines.length) {
      const combined = rawLines.join('\n').toLowerCase();
      if (combined.includes('\nsanctified') || combined.includes(' (sanctified)')) blockedReason = 'sanctified';
      else if (combined.includes('\ncorrupted') || combined.includes(' (corrupted)')) blockedReason = 'corrupted';
      else if (combined.includes('fractured item')) blockedReason = 'fractured';
    }
    if (!blockedReason) {
      const hasSanctified = allMods.some(mod => mod.isSanctified);
      const hasFractured = allMods.some(mod => mod.isFractured);
      if (hasSanctified && removable.length === 0) blockedReason = 'sanctified';
      else if (hasFractured && removable.length === 0) blockedReason = 'fractured';
    }
    return {
      lowestIlvl,
      lowestMods,
      allMods,
      blockedReason
    };
  } catch (error) {
    console.warn('[Whittling] compute failed', error);
    return null;
  }
}
// END WHITTLING FEATURE

/**
 * Attach click handlers to inline tags (tags displayed on mods) to make them clickable filters.
 * When clicked, toggles the corresponding filter chip and triggers re-render.
 * Also updates inline tag styling to visually indicate active filter state.
 */
function attachInlineTagClickHandlers(tagModes: Map<string, string>, tagRGB: (tag: string) => number[]): void {
  try {
    const resultsWrapper = document.getElementById('modResultsWrapper');
    if (!resultsWrapper) return;

    // Select all inline tags within mod items (excluding category tags and filter chips)
    const inlineTags = resultsWrapper.querySelectorAll('.mod-meta .tag[data-tag]:not(.category-tag)');
    
    inlineTags.forEach(tagEl => {
      const tagName = tagEl.getAttribute('data-tag') || '';
      if (!tagName) return;

      // Update styling based on filter mode
      const mode = tagModes.get(tagName) || '';
      updateInlineTagStyle(tagEl as HTMLElement, tagName, mode, tagRGB);

      // Remove any existing listeners to prevent duplicates
      const oldHandler = (tagEl as any).__tagClickHandler;
      if (oldHandler) tagEl.removeEventListener('click', oldHandler);
      const oldDown = (tagEl as any).__tagDownHandler;
      if (oldDown) tagEl.removeEventListener('mousedown', oldDown);
      const oldUp = (tagEl as any).__tagUpHandler;
      if (oldUp) tagEl.removeEventListener('mouseup', oldUp);

      // Prevent text selection caret on mousedown
      const downHandler = (e: Event) => { e.preventDefault(); };
      const upHandler = (e: Event) => { e.preventDefault(); };
      (tagEl as any).__tagDownHandler = downHandler;
      (tagEl as any).__tagUpHandler = upHandler;
      tagEl.addEventListener('mousedown', downHandler);
      tagEl.addEventListener('mouseup', upHandler);

      // Create new click handler
      const clickHandler = (e: Event) => {
        e.stopPropagation(); // Prevent triggering tier toggle
        e.preventDefault(); // Avoid text selection
        toggleTagFilter(tagName);
      };

      // Store handler reference for cleanup
      (tagEl as any).__tagClickHandler = clickHandler;
      tagEl.addEventListener('click', clickHandler);
    });
  } catch (err) {
    console.warn('[attachInlineTagClickHandlers] failed:', err);
  }
}

/**
 * Update inline tag styling to reflect filter mode (include/exclude/none).
 */
function updateInlineTagStyle(tagEl: HTMLElement, tagName: string, mode: string, tagRGB: (tag: string) => number[]): void {
  const [r, g, b] = tagRGB(tagName);
  let bg: string, border: string, color: string;
  
  if (mode === 'include') {
    bg = `rgba(${r},${g},${b},0.9)`;
    border = `rgba(${r},${g},${b},0.6)`;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    color = luma > 180 ? '#000' : '#fff';
  } else if (mode === 'exclude') {
    bg = `rgba(200,60,60,0.85)`;
    border = `rgba(180,40,40,0.8)`;
    color = '#fff';
  } else {
    bg = `rgba(${r},${g},${b},0.22)`;
    border = `rgba(${r},${g},${b},0.6)`;
    color = 'var(--text-primary)';
  }
  
  tagEl.style.background = bg;
  tagEl.style.borderColor = border;
  tagEl.style.color = color;
  tagEl.style.cursor = 'pointer';
  tagEl.classList.toggle('active', mode === 'include');
  tagEl.classList.toggle('exclude', mode === 'exclude');
}

/**
 * Toggle a tag filter: finds the corresponding filter chip and simulates a click,
 * which will trigger the existing filter logic and re-render.
 */
function toggleTagFilter(tagName: string): void {
  try {
    const filtersWrapper = document.getElementById('modFiltersWrapper');
    if (!filtersWrapper) return;

    // Find the filter chip with matching data-tag
    const chip = filtersWrapper.querySelector(`.filter-tag[data-tag="${tagName}"]`) as HTMLElement;
    if (chip) {
      // Simulate click on the filter chip to reuse existing filter logic
      chip.click();
    }
  } catch (err) {
    console.warn('[toggleTagFilter] failed:', err);
  }
}

export function renderFilteredContent(data: any){
  const content = document.getElementById('content');
  const searchInputRaw = (document.getElementById('search-input') as HTMLInputElement | null)?.value || '';
  const searchTerm = searchInputRaw.trim().toLowerCase();
  const searchTokens: SearchToken[] = searchTerm
    ? searchTerm
        .split(/\s+/)
        .map((token) => {
          if (!token) return null;
          const strict = token.startsWith('-');
          const valueRaw = strict ? token.slice(1) : token;
          const value = valueRaw.trim().toLowerCase();
          if (!value) return null;
          return { value, strict } as SearchToken;
        })
        .filter((token): token is SearchToken => Boolean(token))
    : [];
  const hasSearch = searchTokens.length > 0;
  const ilvlMin = Number((document.getElementById('ilvl-min') as HTMLInputElement | null)?.value || 0) || 0;
  const ilvlMaxRaw = (document.getElementById('ilvl-max') as HTMLInputElement | null)?.value || '';
  const ilvlMax = ilvlMaxRaw === '' ? null : (Number(ilvlMaxRaw)||0);
  const clipboardLines = Array.isArray((data as any)?.item?.modifiers)
    ? ((data as any).item?.modifiers as string[]).slice()
    : [];
  const itemCatalog = buildItemModCatalog(clipboardLines);
  const catalogForMatching = itemCatalog.total > 0 ? itemCatalog : null;
  const baseSections = Array.isArray(data?.modifiers) ? data.modifiers : [];
  
  // Collect filter tags by mode (include/exclude)
  const includeTags: string[] = [];
  const excludeTags: string[] = [];
  document.querySelectorAll('.filter-tag').forEach(el => {
    const mode = el.getAttribute('data-filter-mode') || '';
    const tag = el.getAttribute('data-tag') || '';
    if (mode === 'include' && tag) includeTags.push(tag);
    if (mode === 'exclude' && tag) excludeTags.push(tag);
  });
  
  // Get tag filter mode (AND/OR)
  const tagFilterMode = document.getElementById('tagFilterModeToggle')?.getAttribute('data-mode') || 'and';
  
  // Legacy: keep activeTags for backward compatibility
  const activeTags = includeTags;

  const canComputeWhittling = isWhittlingFeatureEnabled();
  const whittlingResult = canComputeWhittling ? computeWhittling(data as ModifierData) : null;
  applyWhittlingMetadataToOverlayMods(data as ModifierData, canComputeWhittling ? whittlingResult : null);
  renderWhittlingInfo(canComputeWhittling ? whittlingResult : null);
  
  // Get active domain filter using version-aware config
  const gameVersion = currentOverlayVersionMode;
  const allToggles = getDomainToggles(gameVersion);
  const myModsButton = document.getElementById('toggleMyMods') as HTMLButtonElement | null;
  const hasClipboardMods = itemCatalog.total > 0;
  
  // Check for My Mods toggle first (in filters section)
  const myModsFilterActive = myModsButton?.classList.contains('active') ?? false;
  
  let activeToggle: any = null;
  if (!myModsFilterActive) {
    for (const toggle of allToggles) {
      const btn = document.getElementById(toggle.id);
      if (btn && btn.classList.contains('active')) {
        activeToggle = toggle;
        break;
      }
    }
  }
  
  // Default to 'all' if no button is active
  let activeDomain: any = myModsFilterActive ? 'myMods' : (activeToggle ? activeToggle.domain : 'all');
  if (!hasClipboardMods && activeDomain === 'myMods') {
    activeDomain = 'all';
    if (myModsButton) {
      myModsButton.classList.remove('active');
      myModsButton.style.background = 'var(--bg-tertiary)';
      myModsButton.style.color = 'var(--text-primary)';
    }
  }
  
  console.log('Active domain filter:', activeDomain, '(version:', gameVersion, ')');
  
  const currentAttribute = (document.querySelector('.attribute-btn.active') as HTMLElement | null)?.dataset.attr;
    const attributeMetaAvailable = Array.isArray(baseSections) && baseSections.some((sec:any) =>
      (sec && Array.isArray(sec.attributes)) || (sec && Array.isArray(sec.mods) && sec.mods.some((m:any) => Array.isArray(m.attributes)))
    );

  // attributeMetaAvailable is computed later for the filters bar and reused here
  const cat = data?.item?.category || '';
  const categoryHasAttribute = /_(str_dex|str_int|dex_int|str|dex|int)$/i.test(cat);

  let filteredData = { ...data } as any;
  
  // Debug: log all available domains and their sections
  console.log('=== DOMAIN DEBUG ===');
  (baseSections || []).forEach((section: any, i: number) => {
    const domain = section.domain || 'undefined';
    const side = section.side || section.type || 'none';
    const modCount = (section.mods || []).length;
    console.log(`Section ${i}: domain="${domain}", side="${side}", mods=${modCount}`);
  });
  
  // Determine if ilvl filtering is active
  const ilvlFilteringActive = (ilvlMin > 0) || (ilvlMax != null && ilvlMax > 0);
  // noFilters previously ignored ilvl filters causing them to do nothing when used alone
  const noFilters = (!hasSearch)
    && includeTags.length === 0
    && excludeTags.length === 0
    && (!currentAttribute || categoryHasAttribute || !attributeMetaAvailable)
    && activeDomain === 'all'
    && !ilvlFilteringActive; // ensure ilvl filters trigger pipeline
  
  // PERFORMANCE OPTIMIZATION: Filter by domain FIRST before applying item matches
  // This way we only check mods that will actually be displayed
  let domainFilteredSections: any[];
  if (noFilters) {
    domainFilteredSections = baseSections;
  } else {
    domainFilteredSections = baseSections.filter((section:any) => {
      // Filter by domain if a specific domain is selected
      if (activeDomain === 'all') return true;
      if (myModsFilterActive) return true;
      
      const sectionDomain = String(section.domain || '').toLowerCase();
      
      // Handle 'base'/'normal' toggle - show non-special domains
      if (activeDomain === 'normal' || activeDomain === 'base') {
        return isBaseDomain(gameVersion, sectionDomain);
      }
      
      // Handle multi-domain toggles (e.g., Eldritch = eater + searing)
      if (Array.isArray(activeDomain)) {
        return activeDomain.some(d => d.toLowerCase() === sectionDomain);
      }
      
      // Single domain match
      return activeDomain.toLowerCase() === sectionDomain;
    });
  }
  
  // Apply item matching with caching to avoid re-computation
  let totalItemMatches = 0;
  if (catalogForMatching) {
    // Create hash of current item modifiers to detect changes
    const currentHash = JSON.stringify(clipboardLines.slice().sort());
    const itemChanged = currentHash !== lastItemModifiersHash;
    
    if (itemChanged) {
      console.log('[ItemMatch] Item changed, clearing cache and re-matching');
      lastItemModifiersHash = currentHash;
      lastMatchedSectionsCache = new WeakMap();
      totalItemMatches = applyItemMatchesToSections(domainFilteredSections, catalogForMatching);
    } else {
      // Item hasn't changed - check if we've already matched these sections
      const alreadyMatched = domainFilteredSections.every(section => 
        lastMatchedSectionsCache.has(section)
      );
      
      if (alreadyMatched) {
        console.log('[ItemMatch] Using cached matches (item unchanged)');
        // Count existing matches
        domainFilteredSections.forEach(section => {
          if (section && Array.isArray(section.mods)) {
            section.mods.forEach((mod: any) => {
              if (mod && (mod as any).__isOnItem) {
                totalItemMatches++;
              }
            });
          }
        });
      } else {
        console.log('[ItemMatch] Cache miss - re-matching filtered sections');
        totalItemMatches = applyItemMatchesToSections(domainFilteredSections, catalogForMatching);
        // Mark these sections as matched
        domainFilteredSections.forEach(section => {
          lastMatchedSectionsCache.set(section, true);
        });
      }
    }
  } else {
    // No item to match - clear all flags
    lastItemModifiersHash = '';
    domainFilteredSections.forEach(section => {
      if (!section || !Array.isArray(section.mods)) return;
      section.mods.forEach((mod: any) => {
        if (!mod) return;
        if (Object.prototype.hasOwnProperty.call(mod, '__isOnItem')) delete mod.__isOnItem;
        if (Object.prototype.hasOwnProperty.call(mod, '__itemMatchCanonical')) delete mod.__itemMatchCanonical;
      });
    });
  }
  
  if (noFilters) {
    filteredData.modifiers = domainFilteredSections;
  } else {
    filteredData.modifiers = domainFilteredSections
      .map((section:any) => {
        // Helper to derive tier level consistently
        const getTierLevel = (t:any) => Number(t?.tier_level ?? t?.ilvl ?? t?.level ?? t?.req_ilvl ?? t?.required_level ?? 0) || 0;
        const filteredMods = section.mods.map((orig:any) => {
          // Work on a shallow clone so original dataset isn't mutated across successive filters
          const mod = { ...orig, tiers: Array.isArray(orig.tiers) ? [...orig.tiers] : undefined } as any;
          const searchIndex = hasSearch ? getModSearchIndex(orig, section, data) : null;
          const searchEval = hasSearch && searchIndex
            ? evaluateSearchTokens(searchIndex, searchTokens, searchTerm)
            : { passes: true, matchedFuzzy: 0, matchedStrict: 0 };
          const matchesSearch = !hasSearch || searchEval.passes;
          const expandedTags = (()=>{ const base = Array.isArray(mod.tags) ? mod.tags.slice() : []; const extra = deriveTagsFromMod(mod); return Array.from(new Set([...(base||[]), ...extra])); })();
          
          // Tag filtering with include/exclude and AND/OR logic
          let matchesTags = true;
          if (includeTags.length > 0 || excludeTags.length > 0) {
            // Check included tags (must match based on AND/OR mode)
            let matchesInclude = true;
            if (includeTags.length > 0) {
              if (tagFilterMode === 'and') {
                // AND: all included tags must be present
                matchesInclude = includeTags.every(t => expandedTags.includes(t));
              } else {
                // OR: at least one included tag must be present
                matchesInclude = includeTags.some(t => expandedTags.includes(t));
              }
            }
            
            // Check excluded tags (none should be present)
            const matchesExclude = excludeTags.length === 0 || !excludeTags.some(t => expandedTags.includes(t));
            
            matchesTags = matchesInclude && matchesExclude;
          }
          let matchesAttribute = true;
          if (currentAttribute && attributeMetaAvailable && !categoryHasAttribute) {
            matchesAttribute = (
              (mod.attributes && mod.attributes.includes(currentAttribute)) ||
              (section.attributes && section.attributes.includes(currentAttribute))
            );
          }
          // iLvl filtering logic (non-mutating; clone per mod)
          let matchesIlvl = true;
          let newTiers = Array.isArray(mod.tiers) ? [...mod.tiers] : [];
          
          // Preserve original tier numbers before filtering
          // Calculate tier numbers based on position in FULL array (reverse order: first = highest tier)
          if (newTiers.length > 0) {
            newTiers.forEach((tier: any, idx: number) => {
              if (!tier) return;
              // Only set if not already set (preserve existing calculations)
              if (typeof tier.__originalTierNumber !== 'number') {
                tier.__originalTierNumber = newTiers.length - idx;
              }
            });
          }
          
          if (ilvlFilteringActive) {
            const baseIlvl = Number(mod.ilvl ?? mod.level ?? 0) || 0;
            const maxCap = (ilvlMax == null || ilvlMax <= 0) ? Infinity : ilvlMax;
            const minCap = ilvlMin || 0;
            const hasTiers = newTiers.length > 0;
            if (hasTiers) {
              const kept = newTiers.filter(t => {
                const tl = getTierLevel(t);
                return tl >= minCap && tl <= maxCap;
              });
              if (kept.length > 0) {
                newTiers = kept;
                matchesIlvl = true;
              } else {
                const baseInRange = baseIlvl >= minCap && baseIlvl <= maxCap;
                matchesIlvl = baseInRange;
                newTiers = []; // hide all out-of-range tiers visually
              }
            } else {
              matchesIlvl = (baseIlvl >= minCap && baseIlvl <= maxCap);
            }
          }
          // Additional tier-level pruning by active search term (feature: hide subtiers that don't contain search string when parent mod matches via tag etc.)
          const hadTiersBeforeSearch = Array.isArray(mod.tiers) && mod.tiers.length > 0;
          if (hasSearch && newTiers.length > 0) {
            const tierMatches = (t:any) => {
              const raw = (t?.text_plain || t?.text || '').toString();
              if (!raw) return false;
              const tierIndex = buildSearchIndexFromText(raw);
              return evaluateSearchTokens(tierIndex, searchTokens, searchTerm).passes;
            };
            const filteredBySearch = newTiers.filter(tierMatches);
            // Only prune if at least one tier matches; if zero match we leave handling to overall mod filtering below
            if (filteredBySearch.length > 0 && filteredBySearch.length < newTiers.length) {
              newTiers = filteredBySearch;
            } else if (filteredBySearch.length === 0) {
              // If none of the tiers themselves match, exclude entire mod
              return null;
            }
          }
          
          // If mod originally had tiers but search removed them all, exclude the mod
          if (hasSearch && hadTiersBeforeSearch && newTiers.length === 0) {
            return null;
          }
          
          if (!(matchesSearch && matchesTags && matchesAttribute && matchesIlvl)) return null;
          const copy = { ...mod } as any;
          const onItem = Boolean(mod.__isOnItem);
          const matchCanonical = onItem ? String(mod.__itemMatchCanonical || '') : '';
          if (myModsFilterActive && !onItem) return null;
          if (ilvlFilteringActive || hasSearch) copy.tiers = newTiers; // pruned tiers for ilvl or search
          // Recompute mod weight from remaining tiers if tier weights exist
          if (Array.isArray(copy.tiers) && copy.tiers.length>0) {
            const tw: number[] = copy.tiers.map((t:any)=> Number(t.weight||0)).filter((v:number)=>v>0);
            if (tw.length>0) copy.weight = tw.reduce((a:number,b:number)=>a+b,0);
          }
          if (hasSearch) {
            const score = (searchEval.matchedFuzzy * 10) + searchEval.matchedStrict;
            copy.__searchScore = score;
          }
          if (onItem) {
            copy.__isOnItem = true;
            if (matchCanonical) copy.__itemMatchCanonical = matchCanonical;
          } else {
            if (Object.prototype.hasOwnProperty.call(copy, '__isOnItem')) delete copy.__isOnItem;
            if (Object.prototype.hasOwnProperty.call(copy, '__itemMatchCanonical')) delete copy.__itemMatchCanonical;
          }
          return copy;
        }).filter(Boolean) as any[];

        if (hasSearch && filteredMods.length > 1) {
          filteredMods.sort((a: any, b: any) => {
            const scoreA = typeof a.__searchScore === 'number' ? a.__searchScore : 0;
            const scoreB = typeof b.__searchScore === 'number' ? b.__searchScore : 0;
            if (scoreA !== scoreB) return scoreB - scoreA;
            const textA = (a.text_plain || a.text || '').toString();
            const textB = (b.text_plain || b.text || '').toString();
            return textA.localeCompare(textB);
          });
          filteredMods.forEach(mod => {
            if (mod && Object.prototype.hasOwnProperty.call(mod, '__searchScore')) delete mod.__searchScore;
          });
        }

        const effectiveTotal = filteredMods.reduce((s:number,m:any)=> s + (Number(m.weight||0)||0), 0);
        return { ...section, mods: filteredMods, _effectiveTotalWeight: effectiveTotal };
      }).filter((section:any) => section.mods.length > 0);
  }

  const groupedByDomain: Record<string, any> = {};
  for (const sec of (filteredData.modifiers||[])){
    const d = sec.domain || 'other';
    const side = sec.side || sec.type || 'none';
    if (!groupedByDomain[d]) groupedByDomain[d] = { prefix:null, suffix:null, none:null, list:[] as any[] };
    if (side === 'prefix') groupedByDomain[d].prefix = sec;
    else if (side === 'suffix') groupedByDomain[d].suffix = sec;
    else if (!groupedByDomain[d].none) groupedByDomain[d].none = sec;
    groupedByDomain[d].list.push(sec);
  }
  // Build filters bar (tags + optional attribute buttons)
  const prevActive = new Set(activeTags);
  const prevAttr = currentAttribute || '';
  
  // Build tag modes map for inline tag styling
  const tagModes = new Map<string, string>();
  document.querySelectorAll('.filter-tag').forEach(el => {
    const tag = el.getAttribute('data-tag') || '';
    const mode = el.getAttribute('data-filter-mode') || '';
    if (tag) tagModes.set(tag, mode);
  });
  const tagCounts: Record<string, number> = {};
  (baseSections||[]).forEach((section:any)=>{
    (section.mods||[]).forEach((m:any)=>{
      const explicit = Array.isArray(m.tags) ? m.tags : [];
      const derived = deriveTagsFromMod(m);
      const all = new Set<string>([...explicit, ...derived]);
      all.forEach((t:string)=>{ tagCounts[t] = (tagCounts[t]||0)+1; });
    })
  });
  const sortedTags = Object.keys(tagCounts).sort((a,b)=> a.localeCompare(b));
  // attributeMetaAvailable already computed above
  const attrButtons = attributeMetaAvailable ? ['str','dex','int'] : [];
  // Colored chip helpers similar to other panels
  const tagRGB = (tag: string): [number, number, number] => {
    const t=(tag||'').toLowerCase();
    // Elemental damage types
    if (t==='fire') return [220,68,61];           // Red
    if (t==='cold') return [66,165,245];          // Blue
    if (t==='lightning') return [255,213,79];     // Yellow
    if (t==='chaos') return [156,39,176];         // Purple
    if (t==='physical') return [158,158,158];     // Gray
    if (t==='elemental') return [255,152,0];      // Orange
    
    // Ailments & DoT
    if (t==='bleeding' || t==='bleed') return [183,28,28];      // Dark red
    if (t==='poison') return [76,175,80];                       // Green
    if (t==='ignite') return [255,87,34];                       // Bright orange
    if (t==='freeze' || t==='chill') return [79,195,247];       // Light blue
    if (t==='shock' || t==='electrocute') return [255,235,59];  // Bright yellow
    if (t==='burn' || t==='burning') return [244,67,54];        // Red-orange
    if (t==='ailments') return [96,125,139];                    // Blue-gray
    
    // Resources
    if (t==='life') return [220,68,61];           // Red (same as fire)
    if (t==='mana') return [66,165,245];          // Blue (same as cold)
    if (t==='energy shield' || t==='es') return [38,198,218];  // Cyan
    
    // Defences
    if (t==='defences' || t==='armour' || t==='armor') return [109,76,65];  // Brown
    if (t==='evasion') return [46,125,50];                                   // Dark green
    if (t==='resistances' || t==='resist') return [255,112,67];              // Coral
    if (t==='block') return [141,110,99];                                    // Medium brown
    
    // Damage & Combat
    if (t==='damage') return [244,67,54];         // Red
    if (t==='attack') return [121,85,72];         // Brown
    if (t==='spell') return [92,107,192];         // Indigo
    if (t==='critical' || t==='crit') return [255,193,7];  // Amber
    if (t==='projectile') return [103,58,183];    // Deep purple
    if (t==='area') return [171,71,188];          // Purple
    if (t==='melee') return [139,69,19];          // Saddle brown
    
    // Mechanics
    if (t==='curse') return [123,31,162];         // Dark purple
    if (t==='minion') return [156,39,176];        // Purple (same as chaos)
    if (t==='totem') return [121,134,203];        // Light indigo
    if (t==='trap' || t==='mine') return [255,167,38];  // Deep orange
    if (t==='speed' || t==='movement') return [67,160,71];    // Green
    if (t==='duration') return [63,81,181];       // Indigo
    if (t==='cooldown') return [33,150,243];      // Blue
    if (t==='aura') return [236,64,122];          // Pink
    if (t==='flask') return [0,150,136];          // Teal
    if (t==='charge') return [255,202,40];        // Gold
    if (t==='mechanics') return [96,125,139];     // Blue-gray
    
    // Default fallback
    return [120,144,156];  // Slate gray
  };
  type ChipMode = '' | 'include' | 'exclude';

  const chipChrome = (tag: string, mode: ChipMode): ChipChrome => {
    if (mode === 'exclude') {
      return buildPoe2ExcludeChrome();
    }
    return buildPoe2ChipChrome(tagRGB(tag), mode === 'include');
  };

  const paintFilterChip = (chip: HTMLElement, modeOverride?: ChipMode) => {
    const tag = chip.getAttribute('data-tag') || '';
    const modeAttr = (chip.getAttribute('data-filter-mode') as ChipMode) || '';
    const mode = modeOverride ?? modeAttr;
    const count = Number(chip.getAttribute('data-count') || '0') || 0;
    const chrome = chipChrome(tag, mode);
    applyFilterChipChrome(chip, chrome, { padding: '3px 10px', fontWeight: mode === 'include' ? '600' : '500' });
    chip.style.margin = '0 4px 4px 0';
    chip.setAttribute('data-filter-mode', mode);
    chip.textContent = `${mode === 'exclude' ? 'NOT ' : ''}${tag} (${count})`;
    chip.classList.toggle('active', mode === 'include');
    chip.classList.toggle('exclude', mode === 'exclude');
  };
  const filtersHtml = `
    <div id="filtersBar" style="display:flex; flex-direction:column; gap:0; margin:0 0 6px 0; padding:0; width:100%;">
      ${attrButtons.length? `<div style="display:flex; gap:6px; align-items:center; justify-content:center; width:100%; margin-bottom:2px;"><span style="font-size:11px; color:var(--text-secondary);">Attribute</span>${attrButtons.map(a=>`<button class="attribute-btn${prevAttr===a?' active':''}" data-attr="${a}" style="padding:2px 8px; font-size:11px; border:1px solid var(--border-color); border-radius:999px; background:${prevAttr===a?'var(--accent-blue)':'var(--bg-tertiary)'}; color:${prevAttr===a?'#fff':'var(--text-primary)'}; cursor:pointer;">${a.toUpperCase()}</button>`).join('')}</div>` : ''}<div style="background:var(--bg-secondary); border-radius:4px; padding:5px 6px; display:flex; gap:6px; width:100%; position:relative; top:-6px;">
        <div style="display:flex; flex-direction:column; align-items:center; gap:2px; flex-shrink:0;">
          <span style="font-size:0.625rem; color:var(--text-secondary); white-space:nowrap;">Filter:</span>
          <button id="tagFilterModeToggle" data-mode="and" style="padding:3px 10px; font-size:0.688rem; border:1px solid var(--border-color); border-radius:4px; background:var(--bg-tertiary); color:var(--text-primary); cursor:pointer; font-weight:600;">AND</button>
          <button id="toggleMyMods" data-domain="myMods" style="padding:3px 10px; font-size:0.688rem; border:1px solid var(--border-color); border-radius:4px; background:var(--bg-tertiary); color:var(--text-primary); cursor:pointer; font-weight:600; display:flex; align-items:center; justify-content:center;" title="Show only modifiers currently on your item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </button>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:4px; justify-content:center; align-items:flex-start; flex:1;">
          ${sortedTags.map(t=>{
            const mode = prevActive.has(t) ? 'include' : '';
            const count = tagCounts[t] || 0;
            return `<div class="filter-tag${mode?' active':''}" data-tag="${t}" data-filter-mode="${mode}" data-count="${count}"></div>`;
          }).join('')}
        </div>
      </div>
    </div>`;

  if (!content) return;
  let filtersWrapper = content.querySelector('#modFiltersWrapper') as HTMLElement | null;
  let resultsWrapper = content.querySelector('#modResultsWrapper') as HTMLElement | null;

  const filterSignature = JSON.stringify({
    tags: sortedTags,
    attr: attrButtons,
    counts: sortedTags.map(tag => tagCounts[tag] || 0)
  });

  if (!filtersWrapper || !resultsWrapper) {
    content.innerHTML = `
      <div id="modFiltersWrapper" data-signature=""></div>
      <div id="modResultsWrapper"></div>
    `;
    filtersWrapper = content.querySelector('#modFiltersWrapper') as HTMLElement;
    resultsWrapper = content.querySelector('#modResultsWrapper') as HTMLElement;
  }

  if (!filtersWrapper || !resultsWrapper) return;

  if (filtersWrapper.getAttribute('data-signature') !== filterSignature) {
    filtersWrapper.setAttribute('data-signature', filterSignature);
  filtersWrapper.innerHTML = filtersHtml;
  filtersWrapper.querySelectorAll('.filter-tag').forEach(chip => paintFilterChip(chip as HTMLElement));
    // Pull the entire filters block closer to the toolbar and keep consistent bottom spacing
    try {
      (filtersWrapper as HTMLElement).style.marginTop = '-6px';
      (filtersWrapper as HTMLElement).style.marginBottom = '6px';
    } catch {}
    try {
      // Tag filter mode toggle (AND/OR)
      const modeToggle = document.getElementById('tagFilterModeToggle');
      if (modeToggle) {
        modeToggle.addEventListener('click', () => {
          const currentMode = modeToggle.getAttribute('data-mode') || 'and';
          const nextMode = currentMode === 'and' ? 'or' : 'and';
          modeToggle.setAttribute('data-mode', nextMode);
          modeToggle.textContent = nextMode.toUpperCase();
          modeToggle.style.background = nextMode === 'or' ? 'var(--accent-blue)' : 'var(--bg-tertiary)';
          modeToggle.style.color = nextMode === 'or' ? '#fff' : 'var(--text-primary)';
          if ((window as any).originalData) renderFilteredContent((window as any).originalData);
        });
      }

      // My Mods toggle
      const myModsToggle = document.getElementById('toggleMyMods');
      if (myModsToggle) {
        myModsToggle.addEventListener('click', () => {
          if ((myModsToggle as HTMLButtonElement).disabled) return;
          
          const isActive = myModsToggle.classList.contains('active');
          myModsToggle.classList.toggle('active', !isActive);
          myModsToggle.style.background = !isActive ? 'var(--accent-orange)' : 'var(--bg-tertiary)';
          myModsToggle.style.color = !isActive ? '#1b1b1b' : 'var(--text-primary)';
          
          // Deactivate all domain toggles when My Mods is active
          const gameVersion = currentOverlayVersionMode;
          const allToggles = getDomainToggles(gameVersion);
          allToggles.forEach(toggle => {
            const btn = document.getElementById(toggle.id);
            if (btn) btn.classList.remove('active');
          });
          
          if ((window as any).originalData) renderFilteredContent((window as any).originalData);
        });
      }

      // Always enable compact tiers mode by default
      document.body.classList.add('compact-tiers');
      
      filtersWrapper.querySelectorAll('.filter-tag').forEach(chip => {
        chip.addEventListener('click', () => {
          // Cycle through states: none → include → exclude → none
          const currentMode = chip.getAttribute('data-filter-mode') || '';
          const tag = chip.getAttribute('data-tag') || '';
          let nextMode = '';
          
          if (currentMode === '') {
            nextMode = 'include';
          } else if (currentMode === 'include') {
            nextMode = 'exclude';
          } else {
            nextMode = '';
          }
          
          chip.setAttribute('data-filter-mode', nextMode);
          chip.setAttribute('data-count', String(tagCounts[tag] || 0));
          paintFilterChip(chip as HTMLElement, nextMode as ChipMode);
          
          if ((window as any).originalData) renderFilteredContent((window as any).originalData);
        });
      });
      filtersWrapper.querySelectorAll('.attribute-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const isActive = btn.classList.contains('active');
          filtersWrapper?.querySelectorAll('.attribute-btn').forEach(b => b.classList.remove('active'));
          if (!isActive) btn.classList.add('active');
          if ((window as any).originalData) renderFilteredContent((window as any).originalData);
        });
      });
    } catch {}
  }

  try {
    // Sync chip states without rebuilding DOM to prevent layout shift
    filtersWrapper.querySelectorAll('.filter-tag').forEach(chip => {
      const key = chip.getAttribute('data-tag') || '';
      const mode = (chip.getAttribute('data-filter-mode') as ChipMode) || '';
      const count = tagCounts[key] || 0;
      chip.setAttribute('data-count', String(count));
      paintFilterChip(chip as HTMLElement, mode);
    });
    filtersWrapper.querySelectorAll('.attribute-btn').forEach(btn => {
      const attr = btn.getAttribute('data-attr') || '';
      const isActive = attr && attr === prevAttr;
      btn.classList.toggle('active', !!isActive);
      // Update individual style properties instead of using setAttribute to preserve font-size scaling
      const el = btn as HTMLElement;
      el.style.padding = '2px 8px';
      el.style.border = '1px solid var(--border-color)';
      el.style.borderRadius = '999px';
      el.style.background = isActive ? 'var(--accent-blue)' : 'var(--bg-tertiary)';
      el.style.color = isActive ? '#fff' : 'var(--text-primary)';
      el.style.cursor = 'pointer';
    });
    
    // Update My Mods button state on every render
    const myModsBtn = document.getElementById('toggleMyMods') as HTMLButtonElement | null;
    if (myModsBtn) {
      const isActive = myModsBtn.classList.contains('active');
      myModsBtn.disabled = !hasClipboardMods;
      myModsBtn.style.opacity = hasClipboardMods ? '1' : '0.45';
      myModsBtn.style.cursor = hasClipboardMods ? 'pointer' : 'not-allowed';
      if (!hasClipboardMods && isActive) {
        myModsBtn.classList.remove('active');
        myModsBtn.style.background = 'var(--bg-tertiary)';
        myModsBtn.style.color = 'var(--text-primary)';
      }
    }
  } catch {}

  const domainEntries = Object.entries(groupedByDomain).filter(([, descriptor]) => {
    const list = (descriptor as any)?.list ?? [];
    return list.some((section: any) => Array.isArray(section?.mods) && section.mods.length > 0);
  });

  // Persist filtered sections for pop-out payloads
  (window as any).__lastFilteredSections = (filteredData.modifiers || []).map((section: any) => ({
    ...section,
    mods: Array.isArray(section.mods) ? section.mods.map((mod: any) => ({ ...mod })) : []
  }));

  ensureDomainCollapseStyles();

  if (!domainEntries.length) {
    cleanupModifierVirtualScroll();
    resultsWrapper.innerHTML = '<div class="mod-empty-state" style="padding:16px; text-align:center; color:var(--text-secondary);">No modifiers matched the current filters.</div>';
    return;
  }

  const ensurePinDelegation = () => {
    const marker = '__pinDelegateBound';
    if ((resultsWrapper as any)[marker]) return;
    resultsWrapper.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const button = target.closest('.pin-section-btn') as HTMLElement | null;
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const domainAttr = button.getAttribute('data-domain') || '';
      const sideAttr = button.getAttribute('data-side') || 'none';
      try {
        const payload = buildSectionPopoutPayload(domainAttr, sideAttr);
        if ((window as any).electronAPI?.openModPopout) {
          (window as any).electronAPI.openModPopout(payload);
        } else {
          console.warn('openModPopout API unavailable');
        }
      } catch (error) {
        console.error('Failed to build popout payload', error);
      }
    });
    (resultsWrapper as any)[marker] = true;
  };

  ensurePinDelegation();

  const buildDomainId = (domain: string) => `domain-${String(domain ?? 'other')}`.replace(/[^a-zA-Z0-9_-]+/g, '-');

  type DomainDescriptor = {
    prefix?: any;
    suffix?: any;
    none?: any;
    list: any[];
  };

  type DomainVirtualSection = VirtualModSection & {
    data: {
      domain: string;
      descriptor: DomainDescriptor;
      domainId: string;
    };
  };

  const virtualSections: DomainVirtualSection[] = domainEntries.map(([domain, descriptor]) => {
    const domainId = buildDomainId(domain);
    return {
      key: domainId,
      data: {
        domain,
        descriptor: descriptor as DomainDescriptor,
        domainId
      }
    };
  });

  const renderDomainElement = (section: DomainVirtualSection): HTMLElement => {
    const container = document.createElement('div');
    container.className = 'domain-container';
    const { descriptor, domainId } = section.data;
    const hasPrefix = descriptor.prefix;
    const hasSuffix = descriptor.suffix;
    const fallback = descriptor.none || (descriptor.list && descriptor.list[0]) || { mods: [] };

    if (hasPrefix || hasSuffix) {
      container.innerHTML = `
        <div class="domain-sections open" id="${domainId}">
          ${hasPrefix ? renderSection(descriptor.prefix, domainId) : '<div></div>'}
          ${hasSuffix ? renderSection(descriptor.suffix, domainId) : '<div></div>'}
        </div>`;
    } else {
      container.innerHTML = `
        <div class="domain-sections open" id="${domainId}">
          ${renderSection(fallback, domainId)}
        </div>`;
    }

    return container;
  };

  // Clear existing content before virtualization mounts
  resultsWrapper.innerHTML = '';

  renderModifierVirtualList(
    virtualSections,
    resultsWrapper,
    (section) => renderDomainElement(section as DomainVirtualSection),
    () => {
      attachInlineTagClickHandlers(tagModes, tagRGB);
    }
  );
}

interface PopoutSectionPayloadMod {
  text: string;
  tags?: string[];
  tiers: Array<{ tier: number; text?: string; level?: number; ilvl?: number; weight?: number; }>;
}
interface PopoutSectionPayload {
  title: string;
  domain: string;
  side: string;
  category?: string;
  mods: PopoutSectionPayloadMod[];
}

function buildSectionPopoutPayload(domain: string, side: string): PopoutSectionPayload {
  const sections: any[] = (window as any).__lastFilteredSections || [];
  const catRaw = (window as any).currentModifierCategory || '';
  const catDisplay = catRaw ? String(catRaw).replace(/_/g,' ').replace(/\s+/g,' ').trim() : '';
  // For prefix/suffix grouping we stored each section individually; we just need those matching domain & side
  const matched = sections.filter(s => s.domain === domain && (s.side || s.type || 'none') === side);
  let modsRaw: any[] = [];
  if (matched.length > 0) modsRaw = matched[0].mods || [];
  const mods = modsRaw.map(m => ({
    text: m.text || m.text_plain || '',
    tags: m.tags || [],
    category: (window as any).currentModifierCategory || undefined,
    tiers: (m.tiers||[]).map((t:any, idx:number, arr:any[]) => ({
      tier: (arr.length - idx),
      text: t.text_plain || t.text || '',
      level: t.tier_level || t.level || t.ilvl,
      ilvl: t.ilvl || t.tier_level || t.level,
      weight: t.weight
    }))
  }));
  return {
    title: `${catDisplay ? catDisplay + ' - ' : ''}${formatDomainName(domain)}${side && side !== 'none' ? ' - ' + formatSideName(side) : ''}`,
    domain,
    side,
    category: catRaw || undefined,
    mods
  };
}

export function patchCreateModItem(){
  const _orig: any = (window as any).createModItem;
  if (typeof _orig === 'function'){
    (window as any).createModItem = function(mod:any, section:any){
      const el = _orig(mod, section);
      if ((mod as any).isStrongboxUnique) el.classList.add('strongbox-unique');
      if (/^\d+:/.test(mod.text_plain) && mod.text_html && mod.text_html.indexOf('logbook-level')>-1){
        el.querySelectorAll('.logbook-level').forEach((p:any)=>{
          if (!p.dataset.enhanced){
            p.dataset.enhanced='1';
            if (!/Area Level/i.test(p.textContent)){
              const label = document.createElement('span');
              label.textContent='Area Level';
              label.className='label';
              p.appendChild(label);
            }
          }
        })
      }
      return el;
    }
  }
}

export function clearAllFilters(){
  // Clear search input
  const search = document.getElementById('search-input') as HTMLInputElement | null; 
  if (search) search.value='';
  
  // Clear ilvl filters
  const ilvlMin = document.getElementById('ilvl-min') as HTMLInputElement | null;
  const ilvlMax = document.getElementById('ilvl-max') as HTMLInputElement | null;
  if (ilvlMin) ilvlMin.value = '';
  if (ilvlMax) ilvlMax.value = '';
  
  // Clear all filter chips (both active and exclude states)
  document.querySelectorAll('.filter-tag').forEach(chip=>{
    chip.classList.remove('active', 'exclude');
    chip.setAttribute('data-filter-mode', '');
    const any = chip as any;
    if(any && any.style){ 
      any.style.background='var(--bg-tertiary)'; 
      any.style.color='var(--text-primary)'; 
      any.style.borderColor='var(--border-color)';
    }
  });
  
  // Clear attribute filters
  document.querySelectorAll('.attribute-btn.active').forEach(btn=> btn.classList.remove('active'));
  
  // Reset tag filter mode to AND
  const tagFilterModeToggle = document.getElementById('tagFilterModeToggle');
  if (tagFilterModeToggle) {
    tagFilterModeToggle.setAttribute('data-mode', 'and');
    tagFilterModeToggle.textContent = 'AND';
  }
  
  // Clear domain filters - reset to "All" using version-aware config
  const gameVersion = currentOverlayVersionMode;
  const allToggles = getDomainToggles(gameVersion);
  
  allToggles.forEach(toggle => {
    const btn = document.getElementById(toggle.id);
    if (btn) {
      if (toggle.id === 'toggleAll') {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  });
  
  if((window as any).originalData) renderFilteredContent((window as any).originalData);
}

// Small helpers duplicated from dist to keep UI wiring working
export function formatDomainName(domain: string){
  if(!domain) return 'Other';
  const d = String(domain).toLowerCase();
  if(d==='prefix') return 'Prefix'; if(d==='suffix') return 'Suffix';
  if(d==='local') return 'Local'; if(d==='explicit') return 'Explicit'; if(d==='implicit') return 'Implicit';
  
  // Handle Eldritch domains
  if(d.includes('eldritch')) {
    if(d.includes('eater')) return 'Eater of Worlds';
    if(d.includes('searing')) return 'Searing Exarch';
  }
  
  // Clean up underscores and capitalize
  return d.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}
export function formatSideName(side: string){
  if(!side) return 'None';
  const s = String(side).toLowerCase();
  if(s==='prefix') return 'Prefix'; if(s==='suffix') return 'Suffix'; if(s==='none') return 'Other';
  return s.charAt(0).toUpperCase()+s.slice(1);
}
export function toggleDomainFromSection(domainId: string, arrowId: string){
  const wrap = document.getElementById(domainId); if(!wrap) return;
  const arrow = document.getElementById(arrowId); if(!arrow) return;
  const isOpen = wrap.classList.contains('open');
  if(isOpen){ wrap.classList.remove('open'); (arrow as any).textContent='►'; }
  else { wrap.classList.add('open'); (arrow as any).textContent='▼'; }
  ensureDomainCollapseStyles();
}
export function toggleTiers(domain: string, side: string, modIndex: number){
  const id = `tiers-${domain}-${side}-${modIndex}`;
  const el = document.getElementById(id) as HTMLElement | null; if(!el) return;
  const isHidden = el.style.display==='none';
  el.style.display = isHidden ? '' : 'none';
}

function ensureDomainCollapseStyles(){
  const id = 'modifier-domain-collapse-styles';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
    .domain-sections { transition:height .18s ease, padding .18s ease; }
    .domain-sections:not(.open) .section-content { display:none; }
    .domain-sections:not(.open) .collapse-arrow { transform:rotate(-90deg); display:inline-block; }
    .domain-sections .collapse-arrow { transition:transform .18s ease; }
  `;
  document.head.appendChild(style);
}
