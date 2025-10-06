/**
 * History Filtering and Sorting
 * Complex filtering logic and sort operations
 */

import { normalizeCurrency, escapeHtml } from "../utils";
import type { HistoryEntryRaw, HistoryState } from "./historyData";

/**
 * Render active filter chips with remove buttons
 */
export function renderHistoryActiveFilters(
  state: HistoryState,
  isVisible: () => boolean,
  refreshList: () => void
): void {
  if (!isVisible()) return;
  
  const wrap = document.getElementById("historyActiveFilters");
  if (!wrap) return;
  
  const { min, cur, category, search, rarity, timeframe } = state.filters;
  const chips: string[] = [];
  
  if (timeframe && timeframe !== 'all') {
    const labelMap: Record<string,string> = { 
      today:'Today', 
      yesterday:'Yesterday', 
      '7d':'Last 7D', 
      '14d':'Last 14D', 
      '30d':'Last 30D' 
    };
    const lbl = labelMap[timeframe] || timeframe;
    chips.push(`<span class="price-badge" title="Timeframe filter">${escapeHtml(lbl)} <button data-act="clear-timeframe" style="margin-left:6px; background:none; border:none; color:var(--text-muted); cursor:pointer;">×</button></span>`);
  }
  
  if (min && min > 0) {
    const c = normalizeCurrency(cur || "");
    chips.push(
      `<span class="price-badge" title="Minimum amount in ${c}">Min: <span class="amount">${min}</span> ${c} <button data-act="clear-min" style="margin-left:6px; background:none; border:none; color:var(--text-muted); cursor:pointer;">×</button></span>`
    );
  }
  
  if (category) {
    chips.push(
      `<span class="price-badge" title="Type filter">${escapeHtml(category)} <button data-act="clear-cat" style="margin-left:6px; background:none; border:none; color:var(--text-muted; cursor:pointer;">×</button></span>`
    );
  }
  
  if (search) {
    chips.push(
      `<span class="price-badge" title="Search filter">${escapeHtml(search)} <button data-act="clear-search" style="margin-left:6px; background:none; border:none; color:var(--text-muted); cursor:pointer;">×</button></span>`
    );
  }
  
  if (rarity) {
    chips.push(
      `<span class="price-badge" title="Rarity filter">${escapeHtml(rarity)} <button data-act="clear-rarity" style="margin-left:6px; background:none; border:none; color:var(--text-muted); cursor:pointer;">×</button></span>`
    );
  }
  
  (wrap as HTMLElement).innerHTML = chips.join(" ");
  
  // Attach clear button handlers
  wrap.querySelectorAll("button[data-act]")?.forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = (btn as HTMLElement).getAttribute("data-act");
      if (act === "clear-min") {
        state.filters.min = 0;
        const el = document.getElementById("histMinValue");
        if (el) (el as HTMLInputElement).value = "0";
      } else if (act === "clear-cat") {
        state.filters.category = "";
        const el = document.getElementById("histCategory");
        if (el) (el as HTMLSelectElement).value = "";
      } else if (act === "clear-search") {
        state.filters.search = "";
        const el = document.getElementById("histSearch");
        if (el) (el as HTMLInputElement).value = "";
      } else if (act === "clear-rarity") {
        state.filters.rarity = "";
        const el = document.getElementById("histRarity");
        if (el) (el as HTMLSelectElement).value = "";
      } else if (act === 'clear-timeframe') {
        state.filters.timeframe = 'all';
        const el = document.getElementById('histTimeframe');
        if (el) (el as HTMLSelectElement).value = 'all';
      }
      
      refreshList();
    });
  });
}

/**
 * Apply all active filters to history list
 */
export function applyFilters(list: HistoryEntryRaw[], filters: HistoryState['filters']): HistoryEntryRaw[] {
  const { min, search, rarity, timeframe } = filters;
  const cur = normalizeCurrency(filters.cur || "");
  const catSel = filters.category || "";
  
  // Timeframe boundaries
  let earliest = 0;
  let latest = Infinity;
  if (timeframe && timeframe !== 'all') {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0,0,0,0);
    const startToday = startOfToday.getTime();
    
    if (timeframe === 'today') {
      earliest = startToday;
    } else if (timeframe === 'yesterday') {
      earliest = startToday - 24*3600*1000;
      latest = startToday - 1;
    } else if (timeframe === '7d') {
      earliest = now - 7*24*3600*1000;
    } else if (timeframe === '14d') {
      earliest = now - 14*24*3600*1000;
    } else if (timeframe === '30d') {
      earliest = now - 30*24*3600*1000;
    }
  }
  
  return list.filter((it: any) => {
    // Timeframe filter
    if (earliest || latest !== Infinity) {
      const tRaw = it?.time || it?.listedAt || it?.date || 0;
      const t = typeof tRaw === 'number' ? (tRaw > 1e12 ? tRaw : tRaw * 1000) : Date.parse(tRaw || 0 as any);
      if (t < earliest) return false;
      if (t > latest) return false;
    }
    
    // Price filter
    const amount = Number(it?.price?.amount ?? it?.amount ?? 0);
    const currency = normalizeCurrency(it?.price?.currency ?? it?.currency ?? "");
    if (min > 0) {
      if (currency !== cur) return false;
      if (amount < min) return false;
    }
    
    // Category filter
    if (catSel) {
      const base = it?.item?.baseType || it?.item?.typeLine || "";
      const name = it?.item?.name || "";
      const typeLine = it?.item?.typeLine || "";
      const category = (it?.item?.category || "").toString();
      const catEq = (want: string) => new RegExp(`^${want}$`, "i").test(category);
      
      if (catSel === "Jewels") {
        if (catEq("Jewels")) {
          // ok
        } else {
          const jewelRe = /(Jewel|Cluster|Abyss|Ruby|Emerald|Sapphire|Diamond|Time[- ]?Lost(?:_[A-Za-z]+)?)/i;
          const isJewel = jewelRe.test(base) || jewelRe.test(name) || jewelRe.test(typeLine) || /jewel/i.test(category);
          if (!isJewel) return false;
        }
      } else if (catSel === "Uniques") {
        const frame = it?.item?.frameType ?? it?.item?.rarity;
        const isUnique = String(frame) === "3" || /Unique/i.test(String(frame)) || /<unique>/i.test(name);
        if (!isUnique) return false;
      } else if (catSel === "Weapons") {
        if (!/(Sword|Axe|Mace|Bow|Sceptre|Staff|Spear|Claw|Crossbow|Flail|Wand|Dagger)/i.test(base)) return false;
      } else if (catSel === "Body Armours") {
        if (!/(Armour|Armor|Robe|Vest|Mail|Plate|Tunic|Garb|Brigandine|Chest)/i.test(base)) return false;
      } else if (catSel === "Helmets") {
        const re = /(Helmet|Helm|Crown|Mask|Hood|Bascinet|Circlet|Coif|Tiara)/i;
        if (!(catEq("Helmets") || re.test(base) || re.test(typeLine) || /helm/i.test(category))) return false;
      } else if (catSel === "Boots") {
        const re = /(Boots|Greaves|Sabatons|Slippers|Legwraps|Footwraps|Footwear|Shoes)/i;
        if (!(catEq("Boots") || re.test(base) || re.test(typeLine) || /boot/i.test(category))) return false;
      } else if (catSel === "Rings") {
        if (!(catEq("Rings") || /Ring/i.test(base) || /Ring/i.test(typeLine))) return false;
      } else if (catSel === "Amulets") {
        if (!(catEq("Amulets") || /Amulet/i.test(base) || /Talisman/i.test(base) || /Amulet|Talisman/i.test(typeLine))) return false;
      } else if (catSel === "Belts") {
        if (!(catEq("Belts") || /Belt/i.test(base) || /Belt/i.test(typeLine))) return false;
      } else if (catSel && !new RegExp(catSel.replace(/\s+/g, "|"), "i").test(base)) {
        return false;
      }
    }
    
    // Rarity filter
    if (rarity) {
      const frameMap: Record<number, string> = {0:'Normal',1:'Magic',2:'Rare',3:'Unique'};
      const itemRarity = (it?.item?.rarity ? String(it.item.rarity) : (it?.item?.frameType != null ? frameMap[it.item.frameType] : 'Normal'));
      if (!new RegExp(`^${rarity}$`, 'i').test(itemRarity || '')) return false;
    }
    
    // Search filter
    if (search && search.length > 0) {
      const blob = [it?.item?.name, it?.item?.typeLine, it?.item?.baseType, it?.note]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!blob.includes(search)) return false;
    }
    
    return true;
  });
}

/**
 * Apply current sort mode to history list
 */
export function applySort(list: HistoryEntryRaw[], sortMode: string): HistoryEntryRaw[] {
  const mode = sortMode || "newest";
  
  const byTime = (r: any) => {
    const t = r?.time || r?.listedAt || r?.date || 0;
    try {
      return typeof t === "number" ? (t > 1e12 ? t : t * 1000) : Date.parse(t);
    } catch {
      return 0;
    }
  };
  
  const byAmt = (r: any, wantCur: string) => {
    const cur = normalizeCurrency(r?.price?.currency ?? r?.currency ?? "");
    if (cur !== wantCur) return null;
    const a = Number(r?.price?.amount ?? r?.amount ?? NaN);
    return isFinite(a) ? a : null;
  };
  
  const copy = list.slice();
  
  if (mode === "newest") {
    copy.sort((a, b) => (byTime(b as any) - byTime(a as any)) as number);
  } else if (mode === "oldest") {
    copy.sort((a, b) => (byTime(a as any) - byTime(b as any)) as number);
  } else if (mode === "divine-desc") {
    copy.sort((a, b) => {
      const av = byAmt(a as any, "divine");
      const bv = byAmt(b as any, "divine");
      if (av == null && bv == null) return (byTime(b as any) - byTime(a as any)) as number;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (bv as number) - (av as number);
    });
  } else if (mode === "divine-asc") {
    copy.sort((a, b) => {
      const av = byAmt(a as any, "divine");
      const bv = byAmt(b as any, "divine");
      if (av == null && bv == null) return (byTime(b as any) - byTime(a as any)) as number;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av as number) - (bv as number);
    });
  } else if (mode === "exalted-desc") {
    copy.sort((a, b) => {
      const av = byAmt(a as any, "exalted");
      const bv = byAmt(b as any, "exalted");
      if (av == null && bv == null) return (byTime(b as any) - byTime(a as any)) as number;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (bv as number) - (av as number);
    });
  } else if (mode === "exalted-asc") {
    copy.sort((a, b) => {
      const av = byAmt(a as any, "exalted");
      const bv = byAmt(b as any, "exalted");
      if (av == null && bv == null) return (byTime(b as any) - byTime(a as any)) as number;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av as number) - (bv as number);
    });
  } else if (mode === "annul-desc") {
    copy.sort((a, b) => {
      const av = byAmt(a as any, "annul");
      const bv = byAmt(b as any, "annul");
      if (av == null && bv == null) return (byTime(b as any) - byTime(a as any)) as number;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (bv as number) - (av as number);
    });
  } else if (mode === "annul-asc") {
    copy.sort((a, b) => {
      const av = byAmt(a as any, "annul");
      const bv = byAmt(b as any, "annul");
      if (av == null && bv == null) return (byTime(b as any) - byTime(a as any)) as number;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av as number) - (bv as number);
    });
  }
  
  return copy;
}
