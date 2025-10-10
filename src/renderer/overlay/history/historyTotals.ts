/**
 * History Totals Module
 * Manages and renders currency totals in the history header
 */

import { normalizeCurrency, escapeHtml } from "../utils";
import type { HistoryEntryRaw } from "./historyData";

export interface HistoryStore {
  entries: any[];
  totals: Record<string, number>;
  lastSync: number;
  lastFetchAt?: number;
}

export type Price = { amount?: number; currency?: string } | undefined;

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
  const chips = main
    .filter((c) => (totals as any)[c])
    .map((c) => `<span class="price-badge currency-${c}"><span class="amount">${(totals as any)[c]}</span> ${c}</span>`)
    .join("");
  
  // Other currencies in tooltip (including regal)
  const other = Object.keys(totals).filter((k) => !main.includes(k) && (totals as any)[k]);
  const hover = other.length ? other.map((k) => `${k}: ${(totals as any)[k]}`).join("\n") : "";
  
  (wrap as HTMLElement).innerHTML =
    chips + (hover ? `<span class="price-badge" title="${escapeHtml(hover)}">+ ${other.length} more</span>` : "");
  
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
