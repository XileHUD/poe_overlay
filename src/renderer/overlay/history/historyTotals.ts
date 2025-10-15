/**
 * History Totals Module
 * Manages and renders currency totals in the history header
 */

import { normalizeCurrency } from "../utils";
import type { HistoryEntryRaw } from "./historyData";

export interface HistoryStore {
  entries: any[];
  totals: Record<string, number>;
  lastSync: number;
  lastFetchAt?: number;
}

export type Price = { amount?: number; currency?: string } | undefined;

const TOTAL_PRIORITY: Record<string, number> = {
  divine: 1,
  exalted: 2,
  annul: 3,
  chaos: 4,
  regal: 5,
};

type TotalsOverflowState = {
  wrap: HTMLElement;
  moreBtn: HTMLButtonElement;
  items: HTMLElement[];
  expanded: boolean;
  observer?: ResizeObserver;
  rafId?: number;
  onWindowResize?: () => void;
};

let totalsOverflowState: TotalsOverflowState | null = null;

function ensureTotalsOverflowState(wrap: HTMLElement): TotalsOverflowState {
  if (totalsOverflowState && totalsOverflowState.wrap === wrap) {
    return totalsOverflowState;
  }

  if (totalsOverflowState) {
    totalsOverflowState.observer?.disconnect();
    if (totalsOverflowState.onWindowResize) {
      window.removeEventListener("resize", totalsOverflowState.onWindowResize);
    }
  }

  const moreBtn = document.createElement("button");
  moreBtn.type = "button";
  moreBtn.className = "price-badge totals-more";
  moreBtn.hidden = true;
  moreBtn.setAttribute("aria-expanded", "false");

  const state: TotalsOverflowState = {
    wrap,
    moreBtn,
    items: [],
    expanded: false,
  };

  state.onWindowResize = () => {
    if (!state.expanded) scheduleTotalsOverflow(state);
  };

  moreBtn.addEventListener("click", () => {
    state.expanded = !state.expanded;
    moreBtn.setAttribute("aria-expanded", state.expanded ? "true" : "false");
    if (state.expanded) {
      state.items.forEach((item) => item.classList.remove("totals-condensed"));
      if (state.items.length) {
        moreBtn.hidden = false;
        moreBtn.textContent = "Show less";
        moreBtn.title = "Hide additional currencies";
      }
    } else {
      scheduleTotalsOverflow(state);
    }
  });

  if (typeof ResizeObserver !== "undefined") {
    state.observer = new ResizeObserver(() => {
      if (!state.expanded) scheduleTotalsOverflow(state);
    });
    state.observer.observe(wrap);
  }

  window.addEventListener("resize", state.onWindowResize);
  totalsOverflowState = state;
  return state;
}

function scheduleTotalsOverflow(state: TotalsOverflowState) {
  if (state.rafId !== undefined) {
    cancelAnimationFrame(state.rafId);
  }
  state.rafId = requestAnimationFrame(() => {
    state.rafId = undefined;
    applyTotalsOverflow(state);
  });
}

function applyTotalsOverflow(state: TotalsOverflowState) {
  const { wrap, items, moreBtn } = state;
  items.forEach((item) => item.classList.remove("totals-condensed"));
  moreBtn.hidden = true;
  moreBtn.title = "";
  delete moreBtn.dataset.tooltip;

  if (state.expanded) {
    if (items.length) {
      moreBtn.hidden = false;
      moreBtn.textContent = "Show less";
      moreBtn.title = "Hide additional currencies";
    } else {
      moreBtn.hidden = true;
    }
    return;
  }

  const baseHidden = items
    .filter((item) => item.dataset.defaultCondensed === "1")
    .sort((a, b) => Number(a.dataset.priority || "999") - Number(b.dataset.priority || "999"));
  baseHidden.forEach((item) => item.classList.add("totals-condensed"));

  let hiddenCount = baseHidden.length;
  const tooltipItems: HTMLElement[] = [...baseHidden];

  let overflow = wrap.scrollWidth > wrap.clientWidth + 1;
  const hideCandidates = items
    .filter((item) => item.dataset.lock !== "1" && !baseHidden.includes(item))
    .sort((a, b) => Number(b.dataset.priority || "999") - Number(a.dataset.priority || "999"));

  for (const item of hideCandidates) {
    if (!overflow) break;
    item.classList.add("totals-condensed");
    tooltipItems.push(item);
    hiddenCount += 1;
    overflow = wrap.scrollWidth > wrap.clientWidth + 1;
  }

  if (overflow) {
    const locked = items
      .filter((item) => item.dataset.lock === "1" && !baseHidden.includes(item))
      .sort((a, b) => Number(b.dataset.priority || "999") - Number(a.dataset.priority || "999"));
    for (const item of locked) {
      if (!overflow) break;
      item.classList.add("totals-condensed");
      tooltipItems.push(item);
      hiddenCount += 1;
      overflow = wrap.scrollWidth > wrap.clientWidth + 1;
    }
  }

  if (!hiddenCount) {
    moreBtn.hidden = true;
    moreBtn.textContent = "";
    return;
  }

  const tooltip = tooltipItems
    .map((item) => `${item.dataset.label || item.dataset.currency || ""}: ${item.dataset.amount || ""}`.trim())
    .filter(Boolean)
    .join("\n");

  moreBtn.hidden = false;
  moreBtn.textContent = `+${hiddenCount} more`;
  moreBtn.title = tooltip;
  moreBtn.dataset.tooltip = tooltip;
}

/**
 * Recalculate totals from all entries in the store
 */
export function totalsFromEntries(entries?: HistoryEntryRaw[]): Record<string, number> {
  const totals: Record<string, number> = {};
  if (!Array.isArray(entries)) return totals;

  for (const entry of entries) {
    const priceLike: Price | undefined = (entry as any)?.price ?? undefined;
    const rawAmount = priceLike?.amount ?? (entry as any)?.amount ?? 0;
    const rawCurrency = priceLike?.currency ?? (entry as any)?.currency ?? "";
    const amt = Number(rawAmount || 0);
    const cur = normalizeCurrency(rawCurrency || "");
    if (!cur || !isFinite(amt) || amt === 0) continue;
    totals[cur] = (totals[cur] || 0) + amt;
  }

  return totals;
}

export function recomputeTotalsFromEntries(store: HistoryStore): void {
  store.totals = totalsFromEntries(store?.entries || []);
}

/**
 * Add a price to the running totals
 */
export function addToTotals(store: HistoryStore, price?: Price): void {
  if (!price || !(price as any).currency) return;
  const cur = normalizeCurrency((price as any).currency || "");
  const amt = Number((price as any).amount || 0);
  if (!store.totals[cur]) store.totals[cur] = 0;
  store.totals[cur] += amt;
}

/**
 * Render currency totals in the header
 */
export function renderHistoryTotals(
  store: HistoryStore,
  isVisible: () => boolean,
  updateChart: (totals: Record<string, number>) => void,
  options?: { entries?: HistoryEntryRaw[]; totalCount?: number }
): void {
  if (!isVisible()) return;
  
  const wrap = document.getElementById("historyTotals");
  if (!wrap) return;
  
  const sourceEntries = options?.entries;
  const rawTotals = sourceEntries ? totalsFromEntries(sourceEntries) : (store?.totals || {});
  const totals: Record<string, number> = {};
  
  // Normalize currency keys
  Object.keys(rawTotals).forEach((k) => {
    const nk = normalizeCurrency(k);
    if (!nk) return;
    const v = Number((rawTotals as any)[k] || 0);
    totals[nk] = (totals[nk] || 0) + v;
  });
  
  // Render main currencies (divine, exalted, annul, chaos)
  const main = ["divine", "exalted", "annul", "chaos"];
  const state = ensureTotalsOverflowState(wrap as HTMLElement);
  const items: HTMLElement[] = [];

  const sortedCurrencies = Object.keys(totals)
    .filter((key) => (totals as any)[key])
    .map((currency) => {
      const amount = Number((totals as any)[currency] || 0);
      const priority = TOTAL_PRIORITY[currency] ?? 900 + currency.charCodeAt(0);
      return { currency, amount, priority };
    })
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.amount - a.amount;
    });

  for (const entry of sortedCurrencies) {
    const isMain = main.includes(entry.currency);
    const chip = document.createElement("span");
    const classSuffix = entry.currency.replace(/[^a-z0-9-]+/gi, "-");
    chip.className = `price-badge currency-${classSuffix}`;
    chip.dataset.currency = entry.currency;
    chip.dataset.amount = String(entry.amount);
    chip.dataset.priority = String(entry.priority);
    chip.dataset.label = entry.currency;
    if (entry.priority <= 2) {
      chip.dataset.lock = "1";
    }
    if (!isMain) {
      chip.dataset.defaultCondensed = "1";
    }

    const amountEl = document.createElement("span");
    amountEl.className = "amount";
    amountEl.textContent = String(entry.amount);
    chip.appendChild(amountEl);
    const currencyDisplay = entry.currency.charAt(0).toUpperCase() + entry.currency.slice(1);
    chip.appendChild(document.createTextNode(` ${currencyDisplay}`));
    items.push(chip);
  }

  (wrap as HTMLElement).replaceChildren(...items, state.moreBtn);
  state.items = items;
  if (!items.length && state.expanded) {
    state.expanded = false;
    state.moreBtn.setAttribute("aria-expanded", "false");
  }

  if (state.expanded) {
    state.moreBtn.hidden = !state.items.length;
    state.moreBtn.textContent = state.items.length ? "Show less" : "";
    state.moreBtn.title = state.items.length ? "Hide additional currencies" : "";
  } else {
    state.moreBtn.hidden = true;
    state.moreBtn.textContent = "";
    state.moreBtn.title = "";
  }

  scheduleTotalsOverflow(state);
  
  // Update trade count
  const cntEl = document.getElementById("historyTradeCount");
  if (cntEl) {
    const totalTrades = options?.totalCount ?? (sourceEntries ? sourceEntries.length : (store?.entries || []).length);
    (cntEl as HTMLElement).textContent = totalTrades ? `${totalTrades} trades` : "";
  }
  
  // Update chart with new totals
  try {
    updateChart(totals);
  } catch {}
}
