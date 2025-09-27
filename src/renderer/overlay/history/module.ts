// Merchant History module: extracts logic from inline overlay.html into a reusable module
// This module intentionally keeps DOM id references and behavior identical to preserve functionality.

import { escapeHtml, normalizeCurrency } from "../utils";

// --- View gating helpers ----------------------------------------------------
// We aggressively guard all render/update functions so that if the user switches
// away from the History view while async work or deferred timeouts are pending,
// no DOM for history bleeds into other panels. This solves the "leak" issue
// where header / filter elements remained visible after switching tabs.

function historyVisible(): boolean {
  try {
    if (!document.body.classList.contains('view-history')) return false;
    const wrap = document.getElementById('historyContainer');
    if (!wrap) return false;
    if ((wrap as HTMLElement).style.display === 'none') return false;
  } catch { return false; }
  return true;
}

let _viewGeneration = 0; // increments each time we enter view; async tasks check this
let _activeGeneration = 0;

export function onEnterView(): void {
  _viewGeneration += 1;
  _activeGeneration = _viewGeneration;
  // When (re)entering, we can lazily re-render if we already have data.
  try {
    if (historyState.store.entries.length) {
      renderHistoryTotals();
      renderHistoryActiveFilters();
      renderHistoryList();
      renderHistoryDetail(historyState.selectedIndex || 0);
      drawHistoryChart();
      updateHistoryRefreshButton();
    }
  } catch {}
}

export function onLeaveView(): void {
  // Invalidate future async callbacks.
  _activeGeneration = -1;
}

export type Price = { amount?: number; currency?: string } | undefined;

export interface HistoryEntryRaw {
  time?: number | string;
  listedAt?: number | string;
  date?: number | string;
  price?: Price;
  amount?: number;
  currency?: string;
  item?: any;
  data?: { item?: any };
  note?: string;
}

export interface HistoryStore {
  entries: HistoryEntryRaw[];
  totals: Record<string, number>;
  lastSync: number;
}

export interface HistoryState {
  items: HistoryEntryRaw[];
  selectedIndex: number;
  league: string;
  store: HistoryStore;
  filters: { min: number; cur: string; category: string; search: string };
  sort: string;
  lastRefreshAt: number;
  rateLimitUntil: number;
}

export const historyState: HistoryState = {
  items: [],
  selectedIndex: 0,
  league: "Rise of the Abyssal",
  store: { entries: [], totals: {}, lastSync: 0 },
  filters: { min: 0, cur: "exalted", category: "", search: "" },
  sort: "newest",
  lastRefreshAt: 0,
  rateLimitUntil: 0,
};

// On load: hydrate store from local disk so we keep more than the last 100 entries
(async function initHistoryFromLocal(){
  try {
    const saved = await (window as any).electronAPI?.historyLoad?.();
    if (saved && typeof saved === 'object') {
      const entries = Array.isArray((saved as any).entries) ? (saved as any).entries : [];
      const totals = (saved as any).totals && typeof (saved as any).totals === 'object' ? (saved as any).totals : {};
      const lastSync = Number((saved as any).lastSync || 0) || 0;
      historyState.store = { entries, totals, lastSync } as any;
      // Ensure totals are consistent with entries on load
      try { recomputeTotalsFromEntries(); } catch {}
      // Pre-populate UI lists and chart from local store
      const all = (historyState.store.entries || []).slice().reverse();
      historyState.items = applySort(applyFilters(all));
      historyState.selectedIndex = 0;
      try { renderHistoryList(); renderHistoryDetail(0); renderHistoryTotals(); renderHistoryActiveFilters(); } catch {}
      try { recomputeChartSeriesFromStore(); drawHistoryChart(); } catch {}
    }
  } catch {}
})();

export function recomputeTotalsFromEntries(): void {
  const totals: Record<string, number> = {};
  const entries = historyState.store?.entries || [];
  for (const r of entries as any[]) {
    const amt = Number((r?.price?.amount ?? r?.amount ?? 0) || 0);
    const cur = normalizeCurrency(r?.price?.currency ?? r?.currency ?? "");
    if (!cur || !isFinite(amt)) continue;
    totals[cur] = (totals[cur] || 0) + amt;
  }
  historyState.store.totals = totals;
}

export async function updateSessionUI(): Promise<boolean> {
  try {
    const session = await (window as any).electronAPI.poeGetSession();
    const loginBtn = document.getElementById("poeLoginBtn");
    if (session?.loggedIn) {
      if (loginBtn) {
        let label = session.accountName ? session.accountName : "Account";
        try {
          const masked = localStorage.getItem('xilehud_mask_account') === '1';
          if (masked && label) {
            label = '***';
          }
        } catch {}
        (loginBtn as HTMLButtonElement).textContent = label;
        (loginBtn as HTMLButtonElement).title = "Logged in to pathofexile.com";
      }
    } else {
      if (loginBtn) {
        (loginBtn as HTMLButtonElement).textContent = "Login";
        (loginBtn as HTMLButtonElement).title = "Login to pathofexile.com";
      }
    }
    return !!session?.loggedIn;
  } catch {
    return false;
  }
}

export function keyForRow(r: HistoryEntryRaw): string {
  const t = (r as any).time || (r as any).listedAt || (r as any).date || "";
  const item = (r as any).item || ((r as any).data && (r as any).data.item) || r;
  const name = item?.name || item?.typeLine || item?.baseType || "";
  return `${name}##${t}`;
}

export function addToTotals(price?: Price): void {
  if (!price || !(price as any).currency) return;
  const cur = normalizeCurrency((price as any).currency || "");
  const amt = Number((price as any).amount || 0);
  if (!historyState.store.totals[cur]) historyState.store.totals[cur] = 0;
  historyState.store.totals[cur] += amt;
}

export function renderHistoryTotals(): void {
  if (!historyVisible() || _activeGeneration !== _viewGeneration) return;
  const wrap = document.getElementById("historyTotals");
  if (!wrap) return;
  const rawTotals = historyState.store?.totals || {};
  const totals: Record<string, number> = {};
  Object.keys(rawTotals).forEach((k) => {
    const nk = normalizeCurrency(k);
    if (!nk) return;
    const v = Number((rawTotals as any)[k] || 0);
    totals[nk] = (totals[nk] || 0) + v;
  });
  const main = ["divine", "exalted", "annul"];
  const chips = main
    .filter((c) => (totals as any)[c])
    .map((c) => `<span class="price-badge currency-${c}"><span class="amount">${(totals as any)[c]}</span> ${c}</span>`)
    .join("");
  const other = Object.keys(totals).filter((k) => !main.includes(k) && (totals as any)[k]);
  const hover = other.length ? other.map((k) => `${k}: ${(totals as any)[k]}`).join("\n") : "";
  (wrap as HTMLElement).innerHTML =
    chips + (hover ? `<span class="price-badge" title="${escapeHtml(hover)}">+ ${other.length} more</span>` : "");
  const cntEl = document.getElementById("historyTradeCount");
  if (cntEl) {
    const totalTrades = (historyState.store?.entries || []).length;
    (cntEl as HTMLElement).textContent = totalTrades ? `${totalTrades} trades` : "";
  }
  try {
    updateHistoryChartFromTotals(totals);
  } catch {}
}

export function renderHistoryActiveFilters(): void {
  if (!historyVisible() || _activeGeneration !== _viewGeneration) return;
  const wrap = document.getElementById("historyActiveFilters");
  if (!wrap) return;
  const { min, cur, category, search } = historyState.filters;
  const chips: string[] = [];
  if (min && min > 0) {
    const c = normalizeCurrency(cur || "");
    chips.push(
      `<span class="price-badge" title="Minimum amount in ${c}">Min: <span class="amount">${min}</span> ${c} <button data-act="clear-min" style="margin-left:6px; background:none; border:none; color:var(--text-muted); cursor:pointer;">×</button></span>`
    );
  }
  if (category) {
    chips.push(
      `<span class="price-badge" title="Type filter">${escapeHtml(
        category
      )} <button data-act="clear-cat" style="margin-left:6px; background:none; border:none; color:var(--text-muted); cursor:pointer;">×</button></span>`
    );
  }
  if (search) {
    chips.push(
      `<span class="price-badge" title="Search filter">${escapeHtml(
        search
      )} <button data-act="clear-search" style="margin-left:6px; background:none; border:none; color:var(--text-muted); cursor:pointer;">×</button></span>`
    );
  }
  (wrap as HTMLElement).innerHTML = chips.join(" ");
  wrap.querySelectorAll("button[data-act]")?.forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = (btn as HTMLElement).getAttribute("data-act");
      if (act === "clear-min") {
        historyState.filters.min = 0;
        const el = document.getElementById("histMinValue");
        if (el) (el as HTMLInputElement).value = "0";
      } else if (act === "clear-cat") {
        historyState.filters.category = "";
        const el = document.getElementById("histCategory");
        if (el) (el as HTMLSelectElement).value = "";
      } else if (act === "clear-search") {
        historyState.filters.search = "";
        const el = document.getElementById("histSearch");
        if (el) (el as HTMLInputElement).value = "";
      }
      const all = (historyState.store.entries || []).slice().reverse();
      historyState.items = applySort(applyFilters(all));
      historyState.selectedIndex = 0;
      renderHistoryList();
      renderHistoryDetail(0);
      renderHistoryActiveFilters();
    });
  });
}

export function applyFilters(list: HistoryEntryRaw[]): HistoryEntryRaw[] {
  const { min, search } = historyState.filters;
  const cur = normalizeCurrency(historyState.filters.cur || "");
  const catSel = historyState.filters.category || "";
  return list.filter((it: any) => {
    const amount = Number(it?.price?.amount ?? it?.amount ?? 0);
    const currency = normalizeCurrency(it?.price?.currency ?? it?.currency ?? "");
    if (min > 0) {
      if (currency !== cur) return false;
      if (amount < min) return false;
    }
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
      } else if (catSel && !new RegExp(catSel.replace(/\s+/g, "|"), "i").test(base)) return false;
    }
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

export function applySort(list: HistoryEntryRaw[]): HistoryEntryRaw[] {
  const mode = historyState.sort || "newest";
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
  if (mode === "newest") copy.sort((a, b) => (byTime(b as any) - byTime(a as any)) as number);
  else if (mode === "oldest") copy.sort((a, b) => (byTime(a as any) - byTime(b as any)) as number);
  else if (mode === "divine-desc")
    copy.sort((a, b) => {
      const av = byAmt(a as any, "divine");
      const bv = byAmt(b as any, "divine");
      if (av == null && bv == null) return (byTime(b as any) - byTime(a as any)) as number;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (bv as number) - (av as number);
    });
  else if (mode === "divine-asc")
    copy.sort((a, b) => {
      const av = byAmt(a as any, "divine");
      const bv = byAmt(b as any, "divine");
      if (av == null && bv == null) return (byTime(b as any) - byTime(a as any)) as number;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av as number) - (bv as number);
    });
  else if (mode === "exalted-desc")
    copy.sort((a, b) => {
      const av = byAmt(a as any, "exalted");
      const bv = byAmt(b as any, "exalted");
      if (av == null && bv == null) return (byTime(b as any) - byTime(a as any)) as number;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (bv as number) - (av as number);
    });
  else if (mode === "exalted-asc")
    copy.sort((a, b) => {
      const av = byAmt(a as any, "exalted");
      const bv = byAmt(b as any, "exalted");
      if (av == null && bv == null) return (byTime(b as any) - byTime(a as any)) as number;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av as number) - (bv as number);
    });
  return copy;
}

export async function refreshHistory(): Promise<boolean | void> {
  const histList = document.getElementById("historyList");
  const histDet = document.getElementById("historyDetail");
  if (!histList || !histDet) return;
  if (!historyState.items || historyState.items.length === 0) {
    (histList as HTMLElement).innerHTML = '<div class="no-mods" style="padding:8px;">Loading…</div>';
  }
  try {
    let rows: any[] = [];
    const res = await (window as any).electronAPI.poeFetchHistory(historyState.league);
    try {
      const headers = (res as any)?.headers || {};
      const until = parseRateLimitHeaders(headers, (res as any)?.status);
      if (until) historyState.rateLimitUntil = Math.max(historyState.rateLimitUntil || 0, until);
    } catch {}
    if (!(res as any)?.ok) {
      historyState.lastRefreshAt = Date.now();
      const loggedIn = await updateSessionUI();
      const is429 = (res as any)?.status === 429;
      if (!loggedIn && (!historyState.items || historyState.items.length === 0)) {
        (histList as HTMLElement).innerHTML = '<div class="no-mods" style="padding:8px;">Please log in to pathofexile.com to view history.</div>';
      }
      const info = document.getElementById("historyInfoBadge");
      if (info) {
        if (is429) {
          (info as HTMLElement).style.display = "";
          const until = nextAllowedRefreshAt();
          const tick = () => {
            const ms = Math.max(0, until - Date.now());
            const s = Math.ceil(ms / 1000);
            (info as HTMLElement).textContent = `Rate limited • ${s}s`;
            if (ms > 0) setTimeout(tick, 1000);
            else (info as HTMLElement).style.display = "none";
          };
          tick();
        } else {
          (info as HTMLElement).style.display = "";
          (info as HTMLElement).textContent = "Fetch failed";
          setTimeout(() => {
            if (info) (info as HTMLElement).style.display = "none";
          }, 4000);
        }
      }
      try {
        updateHistoryRefreshButton();
      } catch {}
      return;
    }
    const json = (res as any).data || {};
    if (Array.isArray((json as any)?.result)) rows = (json as any).result;
    else if (Array.isArray((json as any)?.entries)) rows = (json as any).entries;
    else if (Array.isArray(json)) rows = json as any[];
    else rows = [];
    if (!rows || rows.length === 0) {
      (histList as HTMLElement).innerHTML =
        '<div class="no-mods" style="padding:8px;">No history returned by API. Open the page in browser and try again.</div>';
      return;
    }
    const normalized = rows.map((r: any) => ({
      time: r.time || r.listedAt || r.date,
      price: r.price || (r.amount ? { amount: r.amount, currency: r.currency } : undefined),
      item: r.item || (r.data && r.data.item) || r,
      note: r.note || (r.price && r.price.raw),
    }));
    const existingKeys = new Set((historyState.store.entries || []).map(keyForRow));
    const newOnes = normalized.filter((r: any) => !existingKeys.has(keyForRow(r)));
    if (newOnes.length) {
      newOnes.forEach((r: any) => addToTotals((r as any).price));
      historyState.store.entries = (historyState.store.entries || []).concat(newOnes);
      historyState.store.lastSync = Date.now();
      // Reconcile totals with entries to avoid drift
      try { recomputeTotalsFromEntries(); } catch {}
      try {
        await (window as any).electronAPI.historySave(historyState.store);
      } catch {}
    }
    historyState.items = (historyState.store.entries || []).slice().reverse();
    historyState.items = applySort(applyFilters(historyState.items));
    historyState.selectedIndex = 0;
    renderHistoryList();
    renderHistoryDetail(0);
    renderHistoryTotals();
    renderHistoryActiveFilters();
    try {
      recomputeChartSeriesFromStore();
      drawHistoryChart();
    } catch {}
    historyState.lastRefreshAt = Date.now();
    try {
      updateHistoryRefreshButton();
    } catch {}
    return true;
  } catch (e) {
    (histList as HTMLElement).innerHTML =
      '<div class="no-mods" style="padding:8px;">Error loading history (timeout or network).<br/><br/>Tip: Click "View in browser", verify the page shows, then Refresh.</div>';
    try {
      updateHistoryRefreshButton();
    } catch {}
  }
}

// Fallback scraping removed

// Chart state and helpers
const _chartState: { points: Array<{ t: number; d: number; e: number; a: number }>; lastTotals: { divine: number; exalted: number; annul: number }; current: "divine" | "exalted" | "annul" } = {
  points: [],
  lastTotals: { divine: 0, exalted: 0, annul: 0 },
  current: "divine",
};

export function recomputeChartSeriesFromStore(): void {
  const entries = (historyState.store?.entries || []).slice();
  if (!entries.length) {
    _chartState.points = [];
    return;
  }
  entries.sort((a: any, b: any) => {
    const ta = (a as any).time || (a as any).listedAt || (a as any).date || 0;
    const tb = (b as any).time || (b as any).listedAt || (b as any).date || 0;
    const pa = typeof ta === "number" ? (ta > 1e12 ? ta : ta * 1000) : Date.parse(ta || 0 as any);
    const pb = typeof tb === "number" ? (tb > 1e12 ? tb : tb * 1000) : Date.parse(tb || 0 as any);
    return pa - pb;
  });
  let d = 0,
    e = 0,
    a = 0;
  const pts: Array<{ t: number; d: number; e: number; a: number }> = [];
  const first = entries[0] as any;
  const tFirstRaw = first.time || first.listedAt || first.date || 0;
  const tFirst = typeof tFirstRaw === "number" ? (tFirstRaw > 1e12 ? tFirstRaw : tFirstRaw * 1000) : Date.parse((tFirstRaw as any) || 0);
  pts.push({ t: tFirst - 60_000, d: 0, e: 0, a: 0 });
  for (const it of entries as any[]) {
    const tRaw = (it as any).time || (it as any).listedAt || (it as any).date || 0;
    const t = typeof tRaw === "number" ? (tRaw > 1e12 ? tRaw : tRaw * 1000) : Date.parse((tRaw as any) || 0);
    const cur = normalizeCurrency((it as any)?.price?.currency ?? (it as any)?.currency ?? "");
    const amt = Number((it as any)?.price?.amount ?? (it as any)?.amount ?? 0) || 0;
    if (cur === "divine") d += amt;
    else if (cur === "exalted") e += amt;
    else if (cur === "annul") a += amt;
    pts.push({ t, d, e, a });
  }
  // Append a final point at 'now' that matches normalized header totals so chart and header align
  try {
    const totals: any = historyState.store?.totals || {};
    const nd = Number(totals.divine || 0), ne = Number(totals.exalted || 0), na = Number(totals.annul || 0);
    // Only append if totals are non-zero or differ from computed sums
    if (nd || ne || na) {
      const now = Date.now();
      pts.push({ t: now, d: nd, e: ne, a: na });
      d = nd; e = ne; a = na;
    }
  } catch {}
  _chartState.points = pts;
  _chartState.lastTotals = { divine: d, exalted: e, annul: a };
}

export function updateHistoryChartFromTotals(totals: Record<string, number>): void {
  if (!historyVisible() || _activeGeneration !== _viewGeneration) return;
  const t = Date.now();
  const d = Number((totals as any).divine || 0),
    e = Number((totals as any).exalted || 0),
    a = Number((totals as any).annul || 0);
  const last = _chartState.lastTotals;
  if (!_chartState.points.length || d !== last.divine || e !== last.exalted || a !== last.annul) {
    _chartState.points.push({ t, d, e, a });
    if (_chartState.points.length > 200) _chartState.points.shift();
    _chartState.lastTotals = { divine: d, exalted: e, annul: a };
  }
  drawHistoryChart();
}

export function drawHistoryChart(): void {
  if (!historyVisible() || _activeGeneration !== _viewGeneration) return;
  const canvas = document.getElementById("historyChart") as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  
  // Force canvas to be visible and get proper dimensions
  const chartWrap = document.getElementById("historyChartWrap");
  if (chartWrap && chartWrap.offsetHeight === 0) {
    // Chart wrapper not visible yet, retry
    const retries = (canvas as any)._drawRetries || 0;
    if (retries < 20) {
      (canvas as any)._drawRetries = retries + 1;
      setTimeout(() => drawHistoryChart(), 50);
    }
    return;
  }
  
  // Get dimensions from wrapper or fallback
  let W = chartWrap ? chartWrap.clientWidth - 16 : 400; // subtract padding
  // Dynamic height: if wrapper is flex-sized give it up to 260px, minimum 140
  let H = chartWrap ? Math.max(140, Math.min(chartWrap.clientHeight - 16, 260)) : 180;
  
  if (W <= 0 || H <= 0) {
    // Still not ready, retry
    const retries = (canvas as any)._drawRetries || 0;
    if (retries < 20) {
      (canvas as any)._drawRetries = retries + 1;
      setTimeout(() => drawHistoryChart(), 50);
    }
    return;
  }
  (canvas as any)._drawRetries = 0;
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  ctx.clearRect(0, 0, W, H);
  let pts = _chartState.points.slice();
  if (!pts.length) return;
  if (pts.length === 1) {
    const p = pts[0];
    pts = [{ t: p.t - 60_000, d: p.d, e: p.e, a: p.a }, p];
  }
  const t0 = pts[0].t,
    t1 = pts[pts.length - 1].t || t0 + 1;
  const minVal = 0;
  const key = _chartState.current === "exalted" ? "e" : _chartState.current === "annul" ? "a" : "d";
  const maxVal = Math.max(1, ...pts.map((p) => (p as any)[key] as number));
  const padL = 30,
    padR = 6,
    padT = 6,
    padB = 16;
  ctx.strokeStyle = "#444";
  (ctx as any).lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, H - padB);
  ctx.lineTo(W - padR, H - padB);
  ctx.stroke();
  const X = (t: number) => padL + ((W - padL - padR) * (t - t0)) / Math.max(1, t1 - t0);
  const Y = (v: number) => (H - padB) - ((H - padT - padB) * (v - minVal)) / Math.max(1, maxVal - minVal);
  ctx.strokeStyle = "#2d2d2d";
  (ctx as any).lineWidth = 1;
  (ctx as any).setLineDash?.([3, 3]);
  for (let i = 1; i <= 3; i++) {
    const y = padT + ((H - padT - padB) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
  }
  (ctx as any).setLineDash?.([]);
  const color = _chartState.current === "exalted" ? "#3f6aa1" : _chartState.current === "annul" ? "#7b40b3" : "#d4af37";
  ctx.strokeStyle = color as any;
  (ctx as any).lineWidth = 2;
  ctx.beginPath();
  (pts as any[]).forEach((p, i) => {
    const x = X(p.t),
      y = Y(p[key]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = color as any;
  const n = Math.min(pts.length, 6);
  for (let i = pts.length - n; i < pts.length; i++) {
    const p = pts[i] as any;
    const x = X(p.t),
      y = Y(p[key]);
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#999" as any;
  (ctx as any).font = "10px Segoe UI, sans-serif";
  (ctx as any).textAlign = "right";
  ctx.fillText(String(Math.round(maxVal)), padL - 4, padT + 8);
  ctx.fillText("0", padL - 4, H - padB);
}

export function setChartCurrency(cur: "divine" | "exalted" | "annul"): void {
  _chartState.current = cur;
  drawHistoryChart();
}

export function toRelativeTime(ts: number | string): string {
  try {
    const t = typeof ts === "number" ? (ts > 1e12 ? ts : (ts as number) * 1000) : Date.parse(ts as string);
    const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  } catch {
    return "";
  }
}

export function renderHistoryList(): void {
  if (!historyVisible() || _activeGeneration !== _viewGeneration) return;
  const histList = document.getElementById("historyList");
  if (!histList) return;
  if (!historyState.items || historyState.items.length === 0) {
    (histList as HTMLElement).innerHTML = '<div class="no-mods" style="padding:8px;">No history found.</div>';
    const cntEl = document.getElementById("historyTradeCount");
    if (cntEl) (cntEl as HTMLElement).textContent = (historyState.store?.entries || []).length ? `${(historyState.store?.entries || []).length} trades` : "";
    return;
  }
  const cntEl = document.getElementById("historyTradeCount");
  if (cntEl) (cntEl as HTMLElement).textContent = (historyState.store?.entries || []).length ? `${(historyState.store?.entries || []).length} trades` : "";
  const rows = historyState.items
    .map((it: any, idx: number) => {
      const rel = toRelativeTime(it?.time || it?.listedAt || it?.date || 0);
      const time = rel || (it?.timeText || "");
      const amount = it?.price?.amount ?? it?.amount ?? "?";
      const currency = normalizeCurrency(it?.price?.currency ?? it?.currency ?? "");
      const curClass = currency ? `currency-${currency}` : "";
      const name = it?.item?.name || it?.item?.typeLine || it?.item?.baseType || "Item";
      return `<div data-idx="${idx}" class="history-row" style="padding:8px; border-bottom:1px solid var(--border-color); cursor:pointer; ${
        idx === historyState.selectedIndex ? "background: var(--bg-secondary);" : ""
      }">
                    <div style="display:flex; justify-content:space-between; gap:6px; align-items:center;">
                        <div style="font-weight:600; color:var(--text-primary);">Sold: ${escapeHtml(name)}</div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="price-badge ${curClass}"><span class="amount">${amount}</span> ${currency}</span>
                            <div style="color:var(--text-muted); font-size:11px;">${time}</div>
                        </div>
                    </div>
                    <div style="color:var(--text-secondary);"></div>
                </div>`;
    })
    .join("");
  (histList as HTMLElement).innerHTML = rows;
  histList.querySelectorAll(".history-row").forEach((el) => {
    el.addEventListener("click", (ev: any) => {
      const target: any = ev.currentTarget || ev.target;
      const idxAttr = target && target.dataset ? target.dataset.idx : undefined;
      const idx = Number(idxAttr || 0);
      historyState.selectedIndex = idx;
      renderHistoryList();
      renderHistoryDetail(idx);
      // Chart shows overall totals; do not redraw on selection
    });
  });
}

export function renderHistoryDetail(idx: number): void {
  if (!historyVisible() || _activeGeneration !== _viewGeneration) return;
  const det = document.getElementById("historyDetail");
  if (!det) return;
  const it: any = historyState.items?.[idx];
  if (!it) {
    (det as HTMLElement).innerHTML = '<div class="no-mods">No selection</div>';
    return;
  }
  const item = it.item || it?.data?.item || {};
  const icon = item?.icon || item?.iconUrl || "";
  const name = item?.name || item?.typeLine || item?.baseType || "Item";
  const base = item?.baseType || item?.typeLine || "";
  const ilvl = item?.ilvl || item?.itemLevel || "";
  const corrupted = !!(item?.corrupted || (item?.flags && item.flags.corrupted));
  const note = it?.note || it?.price?.raw || (it?.price ? `~b/o ${it.price.amount} ${it.price.currency}` : "");
  const explicits = Array.isArray(item?.explicitMods)
    ? item.explicitMods
    : Array.isArray(item?.mods?.explicit)
    ? item.mods.explicit
    : [];
  const cur = normalizeCurrency(it?.price?.currency ?? it?.currency ?? "");
  const amt = it?.price?.amount ?? it?.amount ?? "";
  const curClass = cur ? `currency-${cur}` : "";
  (det as HTMLElement).innerHTML = `
                <div style="width:100%; max-width:820px;">
                <div class="history-detail-card">
                    <div class="card-header">
                        <div class="card-title">${escapeHtml(name)}</div>
                        <div>
                            <span class="price-badge large ${curClass}" title="Sold price"><span class="amount">${amt}x</span> ${cur || ""}</span>
                        </div>
                    </div>
                    <div class="grid">
                        <div>
                            ${icon ? `<img src="${icon}" alt="icon" class="history-item-icon"/>` : ""}
                        </div>
                        <div>
                            <div class="card-sub">${escapeHtml(base)}${ilvl ? ` • iLvl ${ilvl}` : ""}${
    corrupted ? ` <span class="badge-corrupted">Corrupted</span>` : ""
  }</div>
                            ${note ? `<div style="margin-top:6px;">${escapeHtml(note)}</div>` : ""}
                            <div class="mod-lines">
                                ${
                                  Array.isArray(explicits) && explicits.length > 0
                                    ? (explicits as any[])
                                        .map((m: any) => `<div class="mod-line" data-field="explicit">${escapeHtml(m)}</div>`)
                                        .join("")
                                    : '<div class="no-mods">No explicit mods</div>'
                                }
                            </div>
                        </div>
                    </div>
                </div>
                </div>
            `;
}

export function nextAllowedRefreshAt(): number {
  const minInterval = 30_000; // 30s throttle
  return Math.max((historyState.lastRefreshAt || 0) + minInterval, historyState.rateLimitUntil || 0);
}

let _refreshBtnTimer: any = null;
export function updateHistoryRefreshButton(): void {
  if (!historyVisible() || _activeGeneration !== _viewGeneration) return;
  const btn = document.getElementById("historyRefreshBtn") as HTMLButtonElement | null;
  if (!btn) return;
  const now = Date.now();
  const nextAt = nextAllowedRefreshAt();
  const waitMs = Math.max(0, nextAt - now);
  const titleDefault = "Refresh merchant history";
  if (waitMs > 0) {
    const secs = Math.ceil(waitMs / 1000);
    btn.setAttribute("disabled", "true");
    btn.style.opacity = "0.6";
    btn.title = `Wait ${secs}s to refresh (throttle/rate limit)`;
    if (_refreshBtnTimer) clearTimeout(_refreshBtnTimer);
    _refreshBtnTimer = setTimeout(() => {
      _refreshBtnTimer = null;
      updateHistoryRefreshButton();
    }, Math.min(waitMs, 1000));
  } else {
    if (_refreshBtnTimer) {
      clearTimeout(_refreshBtnTimer);
      _refreshBtnTimer = null;
    }
    btn.removeAttribute("disabled");
    btn.style.opacity = "";
    btn.title = titleDefault;
  }
}

export async function refreshHistoryIfAllowed(origin?: string): Promise<boolean | void> {
  if (!historyVisible()) return;
  const now = Date.now();
  const nextAt = nextAllowedRefreshAt();
  if (now < nextAt) {
    const all = (historyState.store.entries || []).slice().reverse();
    historyState.items = applySort(applyFilters(all));
    historyState.selectedIndex = 0;
    renderHistoryList();
    renderHistoryDetail(0);
    updateHistoryRefreshButton();
    return false;
  }
  return await refreshHistory();
}

export function parseRateLimitHeaders(headers: any, status?: number): number {
  try {
    const now = Date.now();
    const retryAfter = Number(((headers?.["retry-after"] || "") as string).split(",")[0]) || 0;
    let until = retryAfter ? now + retryAfter * 1000 : 0;
    const lim = (headers?.["x-rate-limit-account"] || headers?.["x-rate-limit-ip"] || "").toString();
    const st = (headers?.["x-rate-limit-account-state"] || headers?.["x-rate-limit-ip-state"] || "").toString();
    const limits = lim
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean)
      .map((s: string) => {
        const [limit, period] = s.split(":").map((x) => Number(x || 0));
        return { limit, period } as any;
      });
    const states = st
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean)
      .map((s: string) => {
        const [used, period, reset] = s.split(":").map((x) => Number(x || 0));
        return { used, period, reset } as any;
      });
    for (let i = 0; i < Math.min(limits.length, states.length); i++) {
      const L = limits[i];
      const S = states[i];
      if (!L || !S) continue;
      if ((S as any).used >= (L as any).limit) {
        until = Math.max(until, now + ((S as any).reset || 1) * 1000 + 500);
      } else if ((L as any).limit > 0) {
        if ((L as any).limit - (S as any).used <= 1) {
          until = Math.max(until, now + ((S as any).reset || 1) * 1000 + 500);
        }
      }
    }
    if (status === 429) until = Math.max(until, now + 30_000);
    return until || 0;
  } catch {
    return 0;
  }
}
