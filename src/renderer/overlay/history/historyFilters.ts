/**
 * History Filtering and Sorting
 * Complex filtering logic and sort operations
 */

import { normalizeCurrency, escapeHtml } from "../utils";
import type { HistoryEntryRaw, HistoryState } from "./historyData";

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type SearchToken = {
  value: string;
  strict: boolean;
};

const buildSearchWords = (text: string): string[] => text.split(/[^a-z0-9]+/).filter(Boolean);

function evaluateSearchTokens(haystack: string, tokens: SearchToken[], rawTerm: string): boolean {
  if (!tokens.length) return true;
  const words = buildSearchWords(haystack);

  for (const token of tokens) {
    if (!token || !token.value) continue;
    if (token.strict && !haystack.includes(token.value)) return false;
  }

  const fuzzyTokens = tokens.filter(token => token && token.value && !token.strict);
  if (fuzzyTokens.length === 0) return true;

  const matchedFuzzy = fuzzyTokens.filter(token => words.some(word => word.startsWith(token.value))).length;
  if (matchedFuzzy === fuzzyTokens.length) return true;

  if (rawTerm && haystack.includes(rawTerm)) return true;

  return false;
}

function pushSegment(target: string[], val: any): void {
  if (val === null || val === undefined) return;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed) target.push(trimmed);
    return;
  }
  if (typeof val === "number") {
    if (Number.isFinite(val)) target.push(String(val));
    return;
  }
  if (Array.isArray(val)) {
    val.forEach((entry) => pushSegment(target, entry));
    return;
  }
  if (typeof val === "object") {
    const maybeName = (val as any).name;
    const maybeText = (val as any).text;
    if (maybeName) pushSegment(target, maybeName);
    if (maybeText) pushSegment(target, maybeText);
    const values = (val as any).values;
    if (Array.isArray(values)) {
      values.forEach((entry: any) => {
        if (Array.isArray(entry) && entry.length) pushSegment(target, entry[0]);
        else pushSegment(target, entry);
      });
    }
  }
}

function collectItemSegments(entry: any): string[] {
  const segments: string[] = [];
  const item = entry?.item || {};
  pushSegment(segments, item?.name);
  pushSegment(segments, item?.typeLine);
  pushSegment(segments, item?.baseType);
  pushSegment(segments, item?.descrText);
  pushSegment(segments, item?.flavourText);
  pushSegment(segments, item?.note);
  pushSegment(segments, entry?.note);
  pushSegment(segments, entry?.merchant);
  pushSegment(segments, entry?.account);
  pushSegment(segments, entry?.accountName);
  pushSegment(segments, entry?.character);
  pushSegment(segments, entry?.seller);

  const priceCurrency = normalizeCurrency(item?.price?.currency ?? entry?.price?.currency ?? entry?.currency ?? "");
  if (priceCurrency) pushSegment(segments, priceCurrency);
  pushSegment(segments, entry?.price?.amount ?? entry?.amount);

  const modsToCollect = [
    item?.implicitMods,
    item?.explicitMods,
    item?.fracturedMods,
    item?.desecratedMods,
    item?.enchantMods,
    item?.corruptedMods,
    item?.veiledMods,
    item?.craftedMods,
    item?.runeMods
  ];
  modsToCollect.forEach((mods) => pushSegment(segments, mods));

  if (Array.isArray(item?.properties)) {
    item.properties.forEach((prop: any) => {
      pushSegment(segments, prop?.name);
      const vals: any[] = Array.isArray(prop?.values) ? prop.values : [];
      vals.forEach((v) => {
        if (Array.isArray(v) && v.length) pushSegment(segments, v[0]);
        else pushSegment(segments, v);
      });
    });
  }

  const extended = item?.extended || {};
  ["ar", "armour", "ev", "evasion", "es", "energy_shield", "energyshield", "ward", "foil", "isFoil"]
    .forEach((key) => pushSegment(segments, (extended as any)[key]));

  if (Array.isArray(item?.utilityMods)) pushSegment(segments, item.utilityMods);
  if (Array.isArray(item?.additionalProperties)) pushSegment(segments, item.additionalProperties);

  return segments;
}

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
  
  if (cur) {
    const c = normalizeCurrency(cur);
    const curClass = `currency-${c}`;
    chips.push(
      `<span class="price-badge ${curClass}" title="Currency filter">${c}${min > 0 ? ` ≥ <span class="amount">${min}</span>` : ''} <button data-act="clear-cur" style="margin-left:6px; background:none; border:none; color:inherit; opacity:0.7; cursor:pointer;">×</button></span>`
    );
  } else if (min > 0) {
    chips.push(
      `<span class="price-badge" title="Minimum amount">Min: <span class="amount">${min}</span> <button data-act="clear-min" style="margin-left:6px; background:none; border:none; color:var(--text-muted); cursor:pointer;">×</button></span>`
    );
  }
  
  if (category) {
    chips.push(
      `<span class="price-badge" title="Type filter">${escapeHtml(category)} <button data-act="clear-cat" style="margin-left:6px; background:none; border:none; color:var(--text-muted); cursor:pointer;">×</button></span>`
    );
  }
  
  if (search) {
    chips.push(
      `<span class="price-badge" title="Search filter">${escapeHtml(search)} <button data-act="clear-search" style="margin-left:6px; background:none; border:none; color:var(--text-muted); cursor:pointer;">×</button></span>`
    );
  }
  
  if (rarity) {
    const rarityColors: Record<string, string> = {
      'normal': 'currency-normal',
      'magic': 'currency-magic',
      'rare': 'currency-rare',
      'unique': 'currency-unique',
      'foil': 'currency-foil'
    };
    const rarityKey = rarity.toLowerCase();
    const rarityClass = rarityColors[rarityKey] || '';
    chips.push(
      `<span class="price-badge ${rarityClass}" title="Rarity filter">${escapeHtml(rarity)} <button data-act="clear-rarity" style="margin-left:6px; background:none; border:none; color:inherit; opacity:0.7; cursor:pointer;">×</button></span>`
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
      } else if (act === "clear-cur") {
        state.filters.cur = "";
        state.filters.min = 0;
        const curEl = document.getElementById("histCurrency");
        const minEl = document.getElementById("histMinValue");
        if (curEl) (curEl as HTMLSelectElement).value = "";
        if (minEl) (minEl as HTMLInputElement).value = "0";
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
      try {
        const allEntries = (state.store?.entries || []).slice().reverse();
        state.items = applySort(applyFilters(allEntries, state.filters), state.sort);
        if (!state.items || state.items.length === 0) {
          state.selectedIndex = 0;
        } else if (state.selectedIndex >= state.items.length) {
          state.selectedIndex = Math.max(0, state.items.length - 1);
        }
      } catch (err) {
        console.warn('[History] Failed to recompute filters after chip clear:', err);
      }

      refreshList();
      // Re-render chips so cleared filters disappear immediately
      setTimeout(() => {
        try {
          renderHistoryActiveFilters(state, isVisible, refreshList);
        } catch (err) {
          console.warn('[History] Failed to refresh filter chips:', err);
        }
      }, 0);
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
  const searchTerm = (search || '').trim().toLowerCase();
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
    let segmentCache: string[] | null = null;
    const ensureSegments = (): string[] => {
      if (!segmentCache) segmentCache = collectItemSegments(it);
      return segmentCache;
    };

    // Timeframe filter
    if (earliest || latest !== Infinity) {
      const tRaw = it?.time || it?.listedAt || it?.date || 0;
      const t = typeof tRaw === 'number' ? (tRaw > 1e12 ? tRaw : tRaw * 1000) : Date.parse(tRaw || 0 as any);
      if (t < earliest) return false;
      if (t > latest) return false;
    }
    
    // Currency filter (when currency is selected, filter by currency regardless of min)
    const amount = Number(it?.price?.amount ?? it?.amount ?? 0);
    const currency = normalizeCurrency(it?.price?.currency ?? it?.currency ?? "");
    if (cur) {
      // Currency selected: filter by currency
      if (currency !== cur) return false;
      // If min is set, also filter by amount
      if (min > 0 && amount < min) return false;
    } else {
      // No currency selected ("All"): only filter by min if set
      if (min > 0 && amount < min) return false;
    }
    
    // Category filter
    if (catSel) {
      const item = it?.item || {};
      const base = (item?.baseType || item?.typeLine || "").toString();
      const name = (item?.name || "").toString();
      const typeLine = (item?.typeLine || "").toString();
      const categoryRaw = (item?.category || "").toString();
      const frame = item?.frameType ?? item?.rarity;
      const lowerPieces = [base, name, typeLine, categoryRaw].map((part) => part.toLowerCase());

      const includesAny = (patterns: string[]): boolean => {
        return lowerPieces.some(text => patterns.some(p => p && text.includes(p)));
      };
      const containsWord = (word: string): boolean => {
        const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(word)}s?(?=$|[^a-z0-9])`, 'i');
        return lowerPieces.some(text => pattern.test(text));
      };

      const matchesCategoryLabel = (label: string): boolean => {
        switch (label) {
          case "Jewels": {
            if (includesAny(["jewel"])) return true;
            return includesAny(["cluster", "abyss", "ruby", "emerald", "sapphire", "diamond", "time-lost", "timelost", "time lost"]);
          }
          case "Weapons":
            return includesAny([
              "sword", "axe", "mace", "bow", "sceptre", "scepter", "staff", "spear", "claw", "crossbow", "flail", "wand", "dagger", "polearm",
              "pick", "greatclub", "hammer", "maul"
            ]);
          case "Body Armours":
            return includesAny(["armour", "armor", "robe", "vest", "mail", "plate", "tunic", "garb", "brigandine", "chest", "coat", "jacket", "raiment"]);
          case "Helmets":
            return includesAny(["helmet", "helm", "crown", "mask", "hood", "bascinet", "circlet", "coif", "tiara", "burgonet", "headgear"]);
          case "Boots":
            return includesAny([
              "boot", "greave", "sabat", "slipper", "legwrap", "footwrap", "footwear", "shoe", "sandal", "sandals", "hoof", "hooves"
            ]);
          case "Gloves":
            return includesAny([
              "glove", "gauntlet", "mitt", "handwrap", "grip", "handwraps", "handwrap", "hand", "hands", "paw", "paws", "wraps", "finger", "fingers", "clutch", "clutches"
            ]);
          case "Rings":
            return containsWord("ring") || containsWord("signet");
          case "Offhand":
            return includesAny(["buckler", "kite", "tower shield", "shield", "focus", "foci", "spirit shield"]) || containsWord("quiver");
          case "Amulets":
            return includesAny(["amulet", "talisman", "necklace", "locket"]);
          case "Belts":
            return includesAny(["belt", "girdle", "sash", "strap", "chain belt", "chainbelt", "cord"]);
          default: {
            const normalized = label.toLowerCase();
            return includesAny([normalized.replace(/\s+/g, " ")]) || includesAny(normalized.split(/\s+/g));
          }
        }
      };

      if (catSel === "Other") {
        const knownLabels = [
          "Helmets",
          "Body Armours",
          "Gloves",
          "Boots",
          "Rings",
          "Amulets",
          "Belts",
          "Weapons",
          "Jewels",
          "Offhand"
        ];
        if (knownLabels.some(label => matchesCategoryLabel(label))) {
          return false;
        }
      } else if (!matchesCategoryLabel(catSel)) {
        return false;
      }
    }
    
    // Rarity filter
    if (rarity) {
      if (/^foil$/i.test(rarity)) {
        const segments = ensureSegments();
        const haystack = segments
          .filter(Boolean)
          .map(str => str.toString().toLowerCase())
          .join(' ');
        const item = it?.item || {};
        const extended = item?.extended || {};
        const foilFlags = Boolean((item as any)?.foil || (item as any)?.isFoil || (extended as any)?.foil || (extended as any)?.isFoil);
        const foilPhrase = haystack.includes('foil unique') || haystack.includes('unique foil');
        const hasFoilWord = /(^|\W)foil(\W|$)/i.test(haystack);
        if (!(foilFlags || foilPhrase || (hasFoilWord && /unique/i.test(haystack)))) return false;
      } else {
        const frameMap: Record<number, string> = {0:'Normal',1:'Magic',2:'Rare',3:'Unique'};
        const itemRarity = (it?.item?.rarity ? String(it.item.rarity) : (it?.item?.frameType != null ? frameMap[it.item.frameType] : 'Normal'));
        if (!new RegExp(`^${escapeRegExp(rarity)}$`, 'i').test(itemRarity || '')) return false;
      }
    }

    // Search filter
    if (searchTokens.length > 0) {
      const segments = ensureSegments();
      const haystack = segments
        .filter(Boolean)
        .map(str => str.toString().toLowerCase())
        .join(' ');
      if (!evaluateSearchTokens(haystack, searchTokens, searchTerm)) return false;
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
