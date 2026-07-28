/**
 * historyDetail.ts
 * 
 * Trade history item detail panel:
 * - Render item details (mods, sockets, runes)
 * - Tier calculation and aggregation
 * - Rarity styling
 * - Image scaling and fallbacks
 */

import { historyState, deleteHistoryEntry } from './historyData';
import { historyVisible } from './historyView';
import { normalizeCurrency, escapeHtml } from '../utils';
import { applyFilters, applySort, renderHistoryActiveFilters } from './historyFilters';
import { recomputeTotalsFromEntries, renderHistoryTotals } from './historyTotals';
import { renderHistoryList } from './historyList';
import { recomputeChartSeriesFromStore, drawHistoryChart, updateHistoryChartFromTotals } from './historyChart';
import { sendHistoryToPopout } from './historyPopout';

function isLikelyItem(value: any): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return !!(
    value.name ||
    value.typeLine ||
    value.baseType ||
    value.ilvl ||
    value.itemLevel ||
    value.icon ||
    value.iconUrl ||
    value.explicitMods ||
    value.implicitMods ||
    value.properties ||
    value.sockets ||
    value.frameType != null ||
    value.rarity ||
    value.flags ||
    value.extended ||
    value.notableProperties ||
    value.corrupted
  );
}

function resolveItemPayload(entry: any): any {
  if (!entry || typeof entry !== 'object') return undefined;

  if (isLikelyItem(entry)) return entry;

  const seen = new Set<any>();
  let current: any = entry;

  for (let depth = 0; depth < 5; depth++) {
    if (!current || typeof current !== 'object' || Array.isArray(current) || seen.has(current)) break;
    seen.add(current);

    const candidates = [
      current.item,
      current.data?.item,
      current.item?.item,
      current.data?.item?.item,
      current.item?.data?.item,
      current.item?.data,
    ];

    for (const candidate of candidates) {
      if (isLikelyItem(candidate)) return candidate;
    }

    if (current.item && typeof current.item === 'object' && !Array.isArray(current.item) && current.item !== current) {
      current = current.item;
      continue;
    }

    if (current.data && typeof current.data === 'object' && current.data.item && current.data.item !== current) {
      current = current.data.item;
      continue;
    }

    break;
  }

  return undefined;
}

/**
 * Normalize mod text from either a string or an object payload.
 * Some trade responses return mods as objects like { description: '...' }.
 */
function normalizeModText(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = normalizeModText(item);
      if (text) return text;
    }
    return '';
  }
  if (typeof value === 'object') {
    const candidates = [
      value.description,
      value.text,
      value.line,
      value.mod,
      value.name,
      value.value,
    ];
    for (const candidate of candidates) {
      const text = normalizeModText(candidate);
      if (text) return text;
    }
  }
  return '';
}

/**
 * Collapse bracketed alternates in mod text.
 * Example: "[10|20|30]" -> "10"
 */
function collapseBracketAlternates(str: any): string {
  const text = normalizeModText(str);
  if (!text) return '';
  return text.replace(/\[([^\]]+?)\]/g, (_m: string, inner: string) => {
    if (!inner) return "";
    const parts = inner.split("|").map((s: string) => s.trim()).filter(Boolean);
    if (!parts.length) return "";
    if (parts.length === 1) return parts[0];
    const ranked = parts.slice().sort((a, b) => {
      const lenDiff = b.length - a.length;
      if (lenDiff !== 0) return lenDiff;
      const spaceDiff = (b.includes(' ') ? 1 : 0) - (a.includes(' ') ? 1 : 0);
      if (spaceDiff !== 0) return spaceDiff;
      return b.localeCompare(a);
    });
    return ranked[0] || parts[0];
  });
}

/**
 * Normalize tier format.
 * Converts "P1", "S1" -> "T1", or uses level "L5" as fallback.
 */
function normalizeTier(rawTier: any, lvl?: number): string {
  const raw = (rawTier || '').toString();
  const m = raw.match(/(\d+)/);
  if (m) return `T${m[1]}`; // Collapse P1/S1 -> T1
  if (!raw && typeof lvl === 'number' && lvl > 0) return `L${lvl}`;
  return '';
}

/**
 * Render item detail panel for selected history entry.
 * 
 * Features:
 * - Rarity-based styling (normal/magic/rare/unique)
 * - Mod categorization (implicit/explicit/fractured/desecrated)
 * - Tier display for mods (aggregated for multi-line mods)
 * - Socket and rune visualization
 * - Quality badges
 * - Corrupted status
 * - Notable properties (Megalomaniac-style jewels)
 * - Responsive image scaling
 * - Fallback placeholder for missing images
 * 
 * @param idx - Index in filtered/sorted items array
 */
export function renderHistoryDetail(idx: number): void {
  const det = document.getElementById("historyDetail");
  if (!det) return;

  const maxIndex = Math.max(0, (historyState.items?.length || 1) - 1);
  const safeIdx = Number.isFinite(idx) ? Math.max(0, Math.min(Math.floor(idx), maxIndex)) : Math.max(0, Math.min(historyState.selectedOriginalIndex || 0, maxIndex));
  const displayItem = historyState.displayItems?.[historyState.selectedIndex] || historyState.displayItems?.[safeIdx] || null;
  const fallbackEntry = displayItem?.entry || displayItem || null;
  const it: any = historyState.items?.[safeIdx] || fallbackEntry || historyState.items?.[0] || null;
  if (!it) {
    (det as HTMLElement).innerHTML = '<div class="no-mods">No selection</div>';
    return;
  }

  const fallbackName = it?.item?.name || it?.item?.typeLine || it?.item?.baseType || it?.name || it?.typeLine || it?.baseType || 'Item';
  const fallbackBase = it?.item?.baseType || it?.item?.typeLine || it?.baseType || it?.typeLine || '';
  const fallbackAmount = it?.price?.amount ?? it?.amount ?? '';
  const fallbackCurrency = normalizeCurrency(it?.price?.currency ?? it?.currency ?? '');
  const renderFallbackCard = () => {
    const currencyLabel = fallbackCurrency ? fallbackCurrency.charAt(0).toUpperCase() + fallbackCurrency.slice(1) : '';
    (det as HTMLElement).innerHTML = `
      <div style="width:100%; max-width:820px;">
        <div class="history-detail-card">
          <div class="card-header">
            <div class="card-title">${escapeHtml(fallbackName)}</div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="price-badge large" title="Sold price"><span class="amount">${fallbackAmount}</span> ${currencyLabel}</span>
            </div>
          </div>
          <div class="grid">
            <div>
              <div class="no-mods" style="padding:8px 0;">Unable to parse item details for this trade. The entry is still available in history.</div>
            </div>
            <div>
              <div class="card-sub">${escapeHtml(fallbackBase || fallbackName)}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  };
  
  try {
  // ========== Extract Item Data ==========
  const item = resolveItemPayload(it) || {};
  const properties: any[] = Array.isArray(item?.properties) ? item.properties : [];
  
  const explicitDetails: any[] = Array.isArray(item?.extended?.mods?.explicit) ? item.extended.mods.explicit : [];
  const fracturedDetails: any[] = Array.isArray(item?.extended?.mods?.fractured) ? item.extended.mods.fractured : [];
  const desecratedDetails: any[] = Array.isArray(item?.extended?.mods?.desecrated) ? item.extended.mods.desecrated : [];
  
  const icon = item?.icon || item?.iconUrl || "";
  const name = item?.name || item?.typeLine || item?.baseType || it?.name || it?.typeLine || it?.baseType || "Item";
  const base = item?.baseType || item?.typeLine || it?.baseType || it?.typeLine || "";
  const ilvl = item?.ilvl || item?.itemLevel || it?.ilvl || it?.itemLevel || "";
  const corrupted = !!(item?.corrupted || (item?.flags && item.flags.corrupted) || (it?.flags && it.flags.corrupted));
  
  // Check if this is an incomplete "ITEM" entry
  const isIncompleteItem = name === "Item" || name === "ITEM";
  
  // Rarity (prefer explicit rarity field, fallback via frameType mapping)
  const frameMap: Record<number, string> = { 0: 'Normal', 1: 'Magic', 2: 'Rare', 3: 'Unique' };
  const rarityRaw: string | undefined = (item?.rarity && String(item.rarity)) || (item?.frameType != null ? frameMap[item.frameType] : undefined);
  const rarity = rarityRaw ? String(rarityRaw) : 'Normal';
  const rarityClass = `rarity-${rarity.toLowerCase()}`;
  
  const note = it?.note || it?.price?.raw || (it?.price ? `~b/o ${it.price.amount} ${it.price.currency}` : "");
  const fallbackSummary = [
    item?.baseType,
    item?.typeLine,
    it?.baseType,
    it?.typeLine,
    item?.name,
    it?.name,
  ].filter(Boolean).join(' • ');
  
  // Mods
  const explicits = Array.isArray(item?.explicitMods)
    ? item.explicitMods.map((entry: any) => normalizeModText(entry)).filter(Boolean)
    : Array.isArray(item?.mods?.explicit)
    ? item.mods.explicit.map((entry: any) => normalizeModText(entry)).filter(Boolean)
    : [];
  const fractured = Array.isArray(item?.fracturedMods)
    ? item.fracturedMods.map((entry: any) => normalizeModText(entry)).filter(Boolean)
    : [];
  const desecrated = Array.isArray(item?.desecratedMods)
    ? item.desecratedMods.map((entry: any) => normalizeModText(entry)).filter(Boolean)
    : [];
  const mutated = Array.isArray(item?.mutatedMods)
    ? item.mutatedMods.map((entry: any) => normalizeModText(entry)).filter(Boolean)
    : [];
  const implicits = Array.isArray(item?.implicitMods)
    ? item.implicitMods.map((entry: any) => normalizeModText(entry)).filter(Boolean)
    : Array.isArray(item?.mods?.implicit)
    ? item.mods.implicit.map((entry: any) => normalizeModText(entry)).filter(Boolean)
    : [];
  const enchantMods = Array.isArray(item?.enchantMods)
    ? item.enchantMods.map((entry: any) => normalizeModText(entry)).filter(Boolean)
    : [];
  const corruptedMods = Array.isArray(item?.corruptedMods)
    ? item.corruptedMods.map((entry: any) => normalizeModText(entry)).filter(Boolean)
    : [];
  
  // Notable properties (e.g. Megalomaniac style jewels)
  const notablePropsRaw: any[] = Array.isArray(item?.notableProperties) ? item.notableProperties : [];
  const notableLines: string[] = [];
  try {
    notablePropsRaw.forEach(np => {
      const nName = (np?.name || '').toString();
      const vals: any[] = Array.isArray(np?.values) ? np.values : [];
      const mods = vals.map(v => Array.isArray(v) ? (v[0]||'') : '').filter(Boolean).map(s=>collapseBracketAlternates(s));
      if(nName && mods.length){
        mods.forEach(m => notableLines.push(`${nName}: ${m}`));
      } else if(nName){
        notableLines.push(nName);
      }
    });
  } catch {}
  
  // Rune mods (from socketed runes / talismans / tablets)
  const runeMods = Array.isArray(item?.runeMods)
    ? item.runeMods.map((entry: any) => normalizeModText(entry)).filter(Boolean)
    : [];

  const defenseTags: string[] = [];
  const parseNumeric = (val: any): number | undefined => {
    if (val === null || val === undefined) return undefined;
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    if (typeof val === 'string') {
      const cleaned = val.replace(/[^0-9.+-]/g, '');
      if (!cleaned) return undefined;
      const num = Number(cleaned);
      return Number.isFinite(num) ? num : undefined;
    }
    return undefined;
  };
  const findPropertyValue = (candidates: string[]): number | undefined => {
    for (const prop of properties) {
      const name = (prop?.name || '').toString().toLowerCase();
      if (!name) continue;
      // Use exact word matching to avoid false positives (e.g., 'ar' matching 'rarity')
      // Check if the property name matches any candidate exactly or starts with it followed by a space
      const matches = candidates.some(c => {
        const lowerC = c.toLowerCase();
        return name === lowerC || 
               name.startsWith(lowerC + ' ') || 
               name.endsWith(' ' + lowerC) ||
               name.includes(' ' + lowerC + ' ');
      });
      if (!matches) continue;
      const vals: any[] = Array.isArray(prop?.values) ? prop.values : [];
      if (!vals.length) continue;
      const first = vals[0];
      const raw = Array.isArray(first) ? first[0] : first;
      const parsed = parseNumeric(raw);
      if (parsed !== undefined) return parsed;
    }
    return undefined;
  };
  try {
    const ext = item?.extended || {};
    const defs = [
      { keys: ['ar', 'armour'], label: 'Armour', cls: 'meta-armour' },
      { keys: ['ev', 'evasion'], label: 'Evasion', cls: 'meta-evasion' },
      { keys: ['es', 'energyshield', 'energy shield', 'energy_shield'], label: 'Energy Shield', cls: 'meta-energy' }
    ];
    defs.forEach(def => {
      let val: number | undefined;
      for (const key of def.keys) {
        const candidate = parseNumeric((ext as any)[key]);
        if (candidate !== undefined) { val = candidate; break; }
      }
      if (val === undefined) {
        const fallback = findPropertyValue(def.keys.map(k => k.replace(/_/g, ' ')));
        if (fallback !== undefined) val = fallback;
      }
      if (val !== undefined && val > 0) {
        const display = val.toLocaleString();
        defenseTags.push(`<span class="meta-tag ${def.cls}" title="${escapeHtml(def.label)}">${escapeHtml(def.label)}: ${escapeHtml(display)}</span>`);
      }
    });
  } catch {}
  
  // Waystone and map-specific stats (Monster Pack Size, Waystone Drop Chance, Item Rarity, etc.)
  try {
    const mapStats = [
      { name: 'Monster Pack Size', cls: 'meta-pack-size' },
      { name: 'Waystone Drop Chance', cls: 'meta-waystone-rarity' },
      { name: 'Item Rarity', cls: 'meta-item-rarity' },
      { name: 'Rare Monsters', cls: 'meta-rare-monsters' },
      { name: 'Magic Monsters', cls: 'meta-magic-monsters' },
      { name: 'Experience', cls: 'meta-experience' },
      { name: 'Gold', cls: 'meta-gold' }
    ];
    mapStats.forEach(stat => {
      for (const prop of properties) {
        const propName = (prop?.name || '').toString();
        if (propName === stat.name) {
          const vals: any[] = Array.isArray(prop?.values) ? prop.values : [];
          if (vals.length) {
            const first = vals[0];
            const raw = Array.isArray(first) ? first[0] : first;
            if (raw) {
              const displayValue = raw.toString();
              defenseTags.push(`<span class="meta-tag ${stat.cls}" title="${escapeHtml(stat.name)}">${escapeHtml(stat.name)}: ${escapeHtml(displayValue)}</span>`);
            }
          }
          break;
        }
      }
    });
  } catch {}
  
  // Price
  const cur = normalizeCurrency(it?.price?.currency ?? it?.currency ?? "");
  const curDisplay = cur ? cur.charAt(0).toUpperCase() + cur.slice(1) : "";
  const amt = it?.price?.amount ?? it?.amount ?? "";
  const curClass = cur ? `currency-${cur}` : "";
  
  // Quality (look for property named/containing Quality or type 6)
  let qualityValue = '';
  try {
    for (const p of properties) {
      const n = (p?.name||'').toString().toLowerCase();
      if (n.includes('quality') || p?.type === 6) {
        // Values shape: [["+20%",1]] or similar
        if (Array.isArray(p?.values) && p.values.length) {
          const first = p.values[0];
          if (Array.isArray(first) && first[0]) {
            qualityValue = first[0].toString();
          } else if (typeof first === 'string') {
            qualityValue = first;
          }
        }
        if (qualityValue) break;
      }
    }
  } catch {}
  
  // ========== Tier Calculation ==========
  // Build hash groups for aggregated tier calculation
  const hashGroups: { hash:string; indices:number[]; minSum:number; maxSum:number; bestTier:string }[] = [];
  try {
    const hashes: any[] = (item?.extended?.hashes?.explicit) || [];
    const details: any[] = explicitDetails;
    for (const entry of hashes) {
      const hash = entry?.[0];
      const idxs: number[] = Array.isArray(entry?.[1]) ? entry[1].map((n:any)=>Number(n)).filter(n=>!isNaN(n)) : [];
      if (!hash || !idxs.length) continue;
      let minSum=0, maxSum=0; const tiers:string[]=[];
      idxs.forEach(iDet => {
        const det = details[iDet]; if (!det) return;
        const t = normalizeTier(det.tier, det.level); if (t) tiers.push(t);
        const mags: any[] = Array.isArray(det?.magnitudes) ? det.magnitudes : [];
        mags.filter(mg=>mg?.hash===hash).forEach(mg => {
          const mn=Number(mg.min); const mx=Number(mg.max);
            if(!isNaN(mn)) minSum += mn; if(!isNaN(mx)) maxSum += mx;
        });
      });
      if (minSum || maxSum) {
        let best=''; let bestNum=Infinity;
        tiers.forEach(t=>{ const mm=t.match(/T(\d+)/); if(mm){ const v=Number(mm[1]); if(v<bestNum){bestNum=v;best=`T${v}`;}}});
        hashGroups.push({ hash, indices: idxs, minSum, maxSum, bestTier: best });
      }
    }
  } catch {}
  
  /**
   * Get aggregated tier for a mod line.
   * Matches numeric values against hash group ranges to find best tier.
   */
  function aggregatedTierForLine(line: string, idx: number): string {
    const nums = Array.from(line.matchAll(/\d+(?:\.\d+)?/g)).map(m=>Number(m[0])).filter(n=>!isNaN(n));
    if (!nums.length) return normalizeTier(explicitDetails[idx]?.tier, explicitDetails[idx]?.level);
    for (const g of hashGroups) {
      if (!g.bestTier) continue;
      for (const n of nums) {
        if (n >= g.minSum - 0.0001 && n <= g.maxSum + 0.0001) return g.bestTier;
      }
    }
    const det = explicitDetails[idx];
    return det ? normalizeTier(det.tier, det.level) : '';
  }
  
  /**
   * Render explicit/fractured/desecrated mods with tier badges.
   */
  function renderExplicitLike(mods: string[], kind: 'explicit' | 'fractured' | 'desecrated'): string {
    if (!mods.length) return '';
    const isUnique = rarity.toLowerCase() === 'unique';
    return mods.map((raw: string, i:number) => {
      const clean = collapseBracketAlternates(raw);
      const tierBadges: string[] = [];
      if (!isUnique) {
        if (kind === 'explicit') {
          const t = aggregatedTierForLine(clean, i);
          if (t) tierBadges.push(t);
        } else if (kind === 'fractured') {
          const det = fracturedDetails[i]; const t = det ? normalizeTier(det.tier, det.level) : '';
          if (t) tierBadges.push(t);
        } else if (kind === 'desecrated') {
          const det = desecratedDetails[i]; const t = det ? normalizeTier(det.tier, det.level) : '';
          if (t) tierBadges.push(t);
        }
      }
      const extraCls = kind !== 'explicit' ? ` ${kind}` : '';
      const tiersHtml = tierBadges.map(tb => `<span class=\"mod-tier\" title=\"Mod tier\">${escapeHtml(tb)}</span>`).join('');
      return `<div class=\"mod-line${extraCls}\" data-field=\"${kind}\"><span class=\"mod-text\">${escapeHtml(clean)}</span>${tiersHtml}</div>`;
    }).join('');
  }

  /**
   * Render mutated mods with inline "mutated" label.
   */
  function renderMutated(mods: string[]): string {
    if (!mods.length) return '';
    return mods.map((raw: string) => {
      const clean = collapseBracketAlternates(raw);
      return `<div class=\"mod-line mutated\" data-field=\"mutated\"><span class=\"mod-text\">${escapeHtml(clean)}</span><span class=\"mod-label-mutated\">mutated</span></div>`;
    }).join('');
  }

  function renderSimpleSection(mods: string[], title: string, lineClass: string, field: string): string {
    if (!mods.length) return '';
    const lines = mods.map((raw: string) => {
      const clean = collapseBracketAlternates(raw);
      return `<div class="mod-line ${lineClass}" data-field="${field}"><span class="mod-text">${escapeHtml(clean)}</span></div>`;
    }).join('');
    return `<div class="mod-section"><div class="mod-section-title">${escapeHtml(title)}</div><div class="mod-lines ${lineClass}-mods">${lines}</div></div>`;
  }

  // ========== Sockets, Runes & Defenses ==========
  let socketsHtml = '';
  try {
    const sockets: any[] = Array.isArray(item?.sockets) ? item.sockets : [];
    const socketed: any[] = Array.isArray(item?.socketedItems) ? item.socketedItems : [];
    // Check if PoE1 mode for colored sockets
    const isPoe1 = ((window as any).__overlayVersionMode || 'poe2') === 'poe1';
    
    if (sockets.length) {
      const groups: Record<number, any[]> = {};
      sockets.forEach(s => { groups[s.group] = groups[s.group] || []; groups[s.group].push(s); });
      const byIdx: Record<number, any> = {};
      socketed.forEach(si => { if (si && typeof si.socket === 'number') byIdx[si.socket] = si; });
      
      // Calculate largest link group for badge
      const largestLinkGroup = Math.max(...Object.values(groups).map(g => g.length), 0);
      let linkBadge = '';
      if (isPoe1 && largestLinkGroup >= 2) {
        linkBadge = `<span class=\"socket-link-badge\">${largestLinkGroup}-Link</span>`;
      }
      
      const groupHtml = Object.keys(groups).sort((a,b)=>Number(a)-Number(b)).map((gk, groupIdx) => {
        const arr = groups[Number(gk)] || [];
        const cells = arr.map((s, idx) => {
          const rune = byIdx[s.group];
          const rItem = rune || socketed.find(r => r.socket === s.group || r.socket === idx) || null;
          
          // Get socket color for PoE1
          let colorClass = '';
          if (isPoe1 && !rItem) {
            const sColour = s.sColour || s.colour || s.color || '';
            if (sColour) {
              const c = sColour.charAt(0).toUpperCase();
              if (c === 'R') colorClass = ' red';
              else if (c === 'G') colorClass = ' green';
              else if (c === 'B') colorClass = ' blue';
              else if (c === 'W') colorClass = ' white';
            }
          }
          
          if (rItem) {
            const rIcon = rItem.icon || '';
            const title = (rItem.name || rItem.typeLine || '').trim();
            return `<div class=\"socket rune\" title=\"${escapeHtml(title)}\">${rIcon ? `<img src='${rIcon}' loading='lazy'/>` : '<span class=\"rune-placeholder\">R</span>'}</div>`;
          }
          return `<div class=\"socket empty${colorClass}\"></div>`;
        }).join(arr.length > 1 ? '<div class=\"socket-link socket-link-connected\"></div>' : '');
        return `<div class=\"socket-group\">${cells}</div>`;
      }).join('<div class=\"socket-link socket-link-gap\"></div>');
      
      socketsHtml = `<div class=\"sockets-row\" title=\"Sockets & Runes\">${groupHtml}${linkBadge}</div>`;
    }
  } catch {}

  const runeModsHtml = runeMods.length ? `<div class=\"rune-mods\">${runeMods.map((m: string) => `<div class=\"rune-mod\">${escapeHtml(collapseBracketAlternates(m))}</div>`).join('')}</div>` : '';
  const defenseTagsHtml = defenseTags.length ? `<div class=\"item-meta-tags\">${defenseTags.join('')}</div>` : '';
  const metaStackPieces = [defenseTagsHtml, socketsHtml, runeModsHtml].filter(Boolean);
  const metaStackHtml = metaStackPieces.length ? `<div class=\"item-meta-stack\">${metaStackPieces.join('')}</div>` : '';
  const enchantSectionHtml = renderSimpleSection(enchantMods, 'Enchant', 'enchant', 'enchant');
  const corruptedSectionHtml = renderSimpleSection(corruptedMods, 'Corrupted', 'corrupted', 'corrupted');

  // ========== Render HTML ==========
  (det as HTMLElement).innerHTML = `
    <div style="width:100%; max-width:820px;">
      <div class="history-detail-card ${rarityClass}">
        <div class="card-header">
          <div class="card-title">${escapeHtml(name)}${qualityValue ? ` <span class=\"quality-badge\" title=\"Quality\">${escapeHtml(qualityValue.replace(/^\+/, ''))}</span>` : ''}</div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="price-badge large ${curClass}" title="Sold price"><span class="amount">${amt}x</span> ${curDisplay}</span>
            <button class="history-delete-btn" data-idx="${safeIdx}" title="Delete this entry" aria-label="Delete entry">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
        <div class="grid">
          <div>
            ${icon ? `<img src="${icon}" alt="icon" class="history-item-icon" loading="lazy" decoding="async"/>` : ""}
          </div>
          <div>
            <div class="card-sub">${escapeHtml(base || fallbackSummary)}${ilvl ? ` • iLvl ${ilvl}` : ""}${rarity ? ` • <span class="rarity-label ${rarityClass}">${escapeHtml(rarity)}</span>` : ""}${
    corrupted ? ` <span class="badge-corrupted">Corrupted</span>` : ""
  }</div>
            ${metaStackHtml}
            ${notableLines.length ? `<div class=\"mod-section\"><div class=\"mod-section-title\">Notables</div><div class=\"mod-lines explicit-mods\">${notableLines.map(l=>`<div class=\"mod-line explicit\" data-field=\"notable\">${escapeHtml(l)}</div>`).join('')}</div></div>` : ''}
            ${corruptedSectionHtml}
            ${enchantSectionHtml}
            ${
              Array.isArray(implicits) && implicits.length > 0
                ? `<div class="mod-section"><div class="mod-section-title">Implicit</div><div class="mod-lines implicit-mods">${(implicits as any[])
                    .map((m: any) => `<div class=\"mod-line implicit\" data-field=\"implicit\">${escapeHtml(collapseBracketAlternates(m))}</div>`)
                    .join("")}</div></div>`
                : ""
            }
            ${
              (explicits.length + fractured.length + desecrated.length + mutated.length) > 0
? `<div class=\"mod-section\"><div class=\"mod-section-title\">Explicit</div><div class=\"mod-lines explicit-mods\">${renderExplicitLike(fractured,'fractured')}${renderExplicitLike(explicits,'explicit')}${renderExplicitLike(desecrated,'desecrated')}${renderMutated(mutated)}</div></div>`
                : '<div class="no-mods">No explicit / fractured / desecrated mods</div>'
            }
          </div>
        </div>
      </div>
      ${isIncompleteItem ? `
      <div style="margin-top: 16px; padding: 12px 14px; background: rgba(33, 150, 243, 0.08); border-left: 3px solid rgba(33, 150, 243, 0.5); border-radius: 4px; font-size: 12px; line-height: 1.65; color: var(--text-secondary);">
        <div style="display: flex; align-items: flex-start; gap: 10px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 2px; color: rgba(33, 150, 243, 0.9);">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <div>
            <strong style="color: var(--text-primary); font-size: 12px;">About Incomplete Item Data</strong><br>
            <span style="margin-top: 4px; display: block;">When items appear as "ITEM" without images or statistics, the trade API is returning incomplete data. This limitation also affects the official trade site. XileHUD automatically tracks these placeholder entries and updates them with complete information once the API provides proper data. These entries are preserved to maintain accurate profit totals and chart continuity.</span>
          </div>
        </div>
      </div>
      ` : ''}
    </div>
  `;
            
  // ========== Image Fallback & Scaling ==========
  const placeholder = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'><rect width='60' height='60' rx='8' fill='#222'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#555' font-size='10' font-family='sans-serif'>?</text></svg>`)}`;
  
  det.querySelectorAll('img.history-item-icon').forEach((element) => {
    const img = element as HTMLImageElement;
    if ((img as any)._fb) return;
    (img as any)._fb = true;
    
    // Fallback on error
    img.addEventListener('error', () => {
      img.src = placeholder;
      img.style.opacity = '0.5';
      img.style.filter = 'grayscale(1)';
    }, { once: true });
    
    // Scale image to fit panel
    const applyScale = () => {
      try {
        const host = document.getElementById('historyDetail');
        if (!host) return;
        const hostH = host.clientHeight || 0;
        if (!hostH) return;
        // Account for header + padding within card (~160px worst case); clamp min
        const maxAvail = Math.max(140, hostH - 190);
        const naturalH = img.naturalHeight || maxAvail;
        if (naturalH > maxAvail) {
            img.style.height = maxAvail + 'px';
            img.style.width = 'auto';
        } else {
            img.style.height = '';
            img.style.width = '';
        }
      } catch {}
    };
    
    if (img.complete) applyScale(); 
    else img.addEventListener('load', applyScale, { once: true });
    
    // Attach global resize handler (once)
    if (!(window as any)._histImgResizeAttach2) {
      (window as any)._histImgResizeAttach2 = true;
      let raf:number|null=null;
      window.addEventListener('resize', () => { 
        if(raf) cancelAnimationFrame(raf); 
        raf=requestAnimationFrame(()=>{
          document.querySelectorAll('#historyDetail img.history-item-icon').forEach(imEl => {
            const im = imEl as HTMLImageElement;
            try {
              const host = document.getElementById('historyDetail');
              if (!host) return;
              const hostH = host.clientHeight || 0;
              const maxAvail = Math.max(140, hostH - 190);
              const naturalH = im.naturalHeight || maxAvail;
              if (naturalH > maxAvail) { im.style.height = maxAvail + 'px'; im.style.width = 'auto'; }
              else { im.style.height = ''; im.style.width = ''; }
            } catch {}
          });
          raf=null;
        });
      });
    }
  });
  
  } catch (error) {
    console.warn('[HistoryDetail] Detail render failed, showing fallback card', error);
    renderFallbackCard();
  }
  
  // ========== Delete Button Handler ==========
  const deleteBtn = det.querySelector('.history-delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      // Get the idx from the button's data attribute
      const btnIdx = parseInt((deleteBtn as HTMLElement).dataset.idx || '0', 10);
      
      // Show confirmation dialog
      const item = historyState.items?.[btnIdx];
      const itemName = item?.item?.name || item?.item?.typeLine || item?.item?.baseType || "this item";
      
      // Use a simple confirm dialog (can be enhanced with custom modal later)
      const confirmed = window.confirm(`Are you sure you want to delete "${itemName}" from your merchant history?\n\nThis action cannot be undone.`);
      
      if (!confirmed) return;
      
      // Delete the entry
      const success = await deleteHistoryEntry(btnIdx);
      
      if (success) {
        // Recompute totals
        recomputeTotalsFromEntries(historyState.store);
        
        // Update filtered/sorted items
        const all = (historyState.store.entries || []).slice().reverse();
        historyState.items = applySort(applyFilters(all, historyState.filters), historyState.sort);
        
        // Adjust selected index if needed
        if (historyState.selectedIndex >= historyState.items.length) {
          historyState.selectedIndex = Math.max(0, historyState.items.length - 1);
        }
        
        // Re-render everything
        renderHistoryList((idx: number) => renderHistoryDetail(idx));
        renderHistoryDetail(historyState.selectedIndex);
        renderHistoryTotals(historyState.store, () => historyVisible(), (totals: any) => {
          try { 
            updateHistoryChartFromTotals(totals); 
          } catch {}
        }, { entries: historyState.items });
        renderHistoryActiveFilters(historyState, () => historyVisible(), () => {
          renderHistoryList((idx: number) => renderHistoryDetail(idx));
          renderHistoryTotals(historyState.store, () => historyVisible(), (totals: any) => {
            try { 
              updateHistoryChartFromTotals(totals); 
            } catch {}
          }, { entries: historyState.items });
        });
        
        // Update chart
        try {
          recomputeChartSeriesFromStore();
          drawHistoryChart();
        } catch {}
        
        // Send update to popout
        try {
          sendHistoryToPopout(historyState);
        } catch {}
        
        console.log('[HistoryDetail] Entry deleted successfully');
      } else {
        alert('Failed to delete entry. Please try again.');
      }
    });
  }
}
