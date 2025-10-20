/**
 * historyDetail.ts
 * 
 * Trade history item detail panel:
 * - Render item details (mods, sockets, runes)
 * - Tier calculation and aggregation
 * - Rarity styling
 * - Image scaling and fallbacks
 */

import { historyState } from './historyData';
import { historyVisible } from './historyView';
import { normalizeCurrency, escapeHtml } from '../utils';

/**
 * Collapse bracketed alternates in mod text.
 * Example: "[10|20|30]" -> "10"
 */
function collapseBracketAlternates(str: string): string {
  if (!str) return str;
  return str.replace(/\[([^\]]+?)\]/g, (_m: string, inner: string) => {
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
  if (!historyVisible()) return;
  
  const det = document.getElementById("historyDetail");
  if (!det) return;
  
  const it: any = historyState.items?.[idx];
  if (!it) {
    (det as HTMLElement).innerHTML = '<div class="no-mods">No selection</div>';
    return;
  }
  
  // ========== Extract Item Data ==========
  const item = it.item || it?.data?.item || {};
  const properties: any[] = Array.isArray(item?.properties) ? item.properties : [];
  
  const explicitDetails: any[] = Array.isArray(item?.extended?.mods?.explicit) ? item.extended.mods.explicit : [];
  const fracturedDetails: any[] = Array.isArray(item?.extended?.mods?.fractured) ? item.extended.mods.fractured : [];
  const desecratedDetails: any[] = Array.isArray(item?.extended?.mods?.desecrated) ? item.extended.mods.desecrated : [];
  
  const icon = item?.icon || item?.iconUrl || "";
  const name = item?.name || item?.typeLine || item?.baseType || "Item";
  const base = item?.baseType || item?.typeLine || "";
  const ilvl = item?.ilvl || item?.itemLevel || "";
  const corrupted = !!(item?.corrupted || (item?.flags && item.flags.corrupted));
  
  // Check if this is an incomplete "ITEM" entry
  const isIncompleteItem = name === "Item" || name === "ITEM";
  
  // Rarity (prefer explicit rarity field, fallback via frameType mapping)
  const frameMap: Record<number, string> = { 0: 'Normal', 1: 'Magic', 2: 'Rare', 3: 'Unique' };
  const rarityRaw: string | undefined = (item?.rarity && String(item.rarity)) || (item?.frameType != null ? frameMap[item.frameType] : undefined);
  const rarity = rarityRaw ? String(rarityRaw) : 'Normal';
  const rarityClass = `rarity-${rarity.toLowerCase()}`;
  
  const note = it?.note || it?.price?.raw || (it?.price ? `~b/o ${it.price.amount} ${it.price.currency}` : "");
  
  // Mods
  const explicits = Array.isArray(item?.explicitMods)
    ? item.explicitMods
    : Array.isArray(item?.mods?.explicit)
    ? item.mods.explicit
    : [];
  const fractured = Array.isArray(item?.fracturedMods) ? item.fracturedMods : [];
  const desecrated = Array.isArray(item?.desecratedMods) ? item.desecratedMods : [];
  const implicits = Array.isArray(item?.implicitMods)
    ? item.implicitMods
    : Array.isArray(item?.mods?.implicit)
    ? item.mods.implicit
    : [];
  const enchantMods = Array.isArray(item?.enchantMods) ? item.enchantMods : [];
  const corruptedMods = Array.isArray(item?.corruptedMods) ? item.corruptedMods : [];
  
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
  const runeMods = Array.isArray(item?.runeMods) ? item.runeMods : [];

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
      if (!candidates.some(c => name.includes(c))) continue;
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
    if (sockets.length) {
      const groups: Record<number, any[]> = {};
      sockets.forEach(s => { groups[s.group] = groups[s.group] || []; groups[s.group].push(s); });
      const byIdx: Record<number, any> = {};
      socketed.forEach(si => { if (si && typeof si.socket === 'number') byIdx[si.socket] = si; });
      const groupHtml = Object.keys(groups).sort((a,b)=>Number(a)-Number(b)).map(gk => {
        const arr = groups[Number(gk)] || [];
        const cells = arr.map((s, idx) => {
          const rune = byIdx[s.group];
          const rItem = rune || socketed.find(r => r.socket === s.group || r.socket === idx) || null;
          if (rItem) {
            const rIcon = rItem.icon || '';
            const title = (rItem.name || rItem.typeLine || '').trim();
            return `<div class=\"socket rune\" title=\"${escapeHtml(title)}\">${rIcon ? `<img src='${rIcon}' loading='lazy'/>` : '<span class=\"rune-placeholder\">R</span>'}</div>`;
          }
          return `<div class=\"socket empty\"></div>`;
        }).join('');
        return `<div class=\"socket-group\">${cells}</div>`;
      }).join('<div class=\"socket-link\"></div>');
      socketsHtml = `<div class=\"sockets-row\" title=\"Sockets & Runes\">${groupHtml}</div>`;
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
          <div>
            <span class="price-badge large ${curClass}" title="Sold price"><span class="amount">${amt}x</span> ${curDisplay}</span>
          </div>
        </div>
        <div class="grid">
          <div>
            ${icon ? `<img src="${icon}" alt="icon" class="history-item-icon" loading="lazy" decoding="async"/>` : ""}
          </div>
          <div>
            <div class="card-sub">${escapeHtml(base)}${ilvl ? ` • iLvl ${ilvl}` : ""}${rarity ? ` • <span class="rarity-label ${rarityClass}">${escapeHtml(rarity)}</span>` : ""}${
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
              (explicits.length + fractured.length + desecrated.length) > 0
? `<div class=\"mod-section\"><div class=\"mod-section-title\">Explicit</div><div class=\"mod-lines explicit-mods\">${renderExplicitLike(fractured,'fractured')}${renderExplicitLike(explicits,'explicit')}${renderExplicitLike(desecrated,'desecrated')}</div></div>`
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
}
