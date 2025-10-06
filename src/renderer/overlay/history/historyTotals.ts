/**
 * History Totals Module
 * Manages and renders currency totals in the history header
 */

import { normalizeCurrency } from "../utils";
import { escapeHtml } from "../utils";

export interface HistoryStore {
  entries: any[];
  totals: Record<string, number>;
  lastSync: number;
}

export type Price = { amount?: number; currency?: string } | undefined;

/**
 * Recalculate totals from all entries in the store
 */
export function recomputeTotalsFromEntries(store: HistoryStore): void {
  const totals: Record<string, number> = {};
  const entries = store?.entries || [];
  for (const r of entries as any[]) {
    const amt = Number((r?.price?.amount ?? r?.amount ?? 0) || 0);
    const cur = normalizeCurrency(r?.price?.currency ?? r?.currency ?? "");
    if (!cur || !isFinite(amt)) continue;
    totals[cur] = (totals[cur] || 0) + amt;
  }
  store.totals = totals;
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
  updateChart: (totals: Record<string, number>) => void
): void {
  if (!isVisible()) return;
  
  const wrap = document.getElementById("historyTotals");
  if (!wrap) return;
  
  const rawTotals = store?.totals || {};
  const totals: Record<string, number> = {};
  
  // Normalize currency keys
  Object.keys(rawTotals).forEach((k) => {
    const nk = normalizeCurrency(k);
    if (!nk) return;
    const v = Number((rawTotals as any)[k] || 0);
    totals[nk] = (totals[nk] || 0) + v;
  });
  
  // Render main currencies (divine, exalted, annul)
  const main = ["divine", "exalted", "annul"];
  const chips = main
    .filter((c) => (totals as any)[c])
    .map((c) => `<span class="price-badge currency-${c}"><span class="amount">${(totals as any)[c]}</span> ${c}</span>`)
    .join("");
  
  // Other currencies in tooltip
  const other = Object.keys(totals).filter((k) => !main.includes(k) && (totals as any)[k]);
  const hover = other.length ? other.map((k) => `${k}: ${(totals as any)[k]}`).join("\n") : "";
  
  (wrap as HTMLElement).innerHTML =
    chips + (hover ? `<span class="price-badge" title="${escapeHtml(hover)}">+ ${other.length} more</span>` : "");
  
  // Update trade count
  const cntEl = document.getElementById("historyTradeCount");
  if (cntEl) {
    const totalTrades = (store?.entries || []).length;
    (cntEl as HTMLElement).textContent = totalTrades ? `${totalTrades} trades` : "";
  }
  
  // Update chart with new totals
  try {
    updateChart(totals);
  } catch {}
}
