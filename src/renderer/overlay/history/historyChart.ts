/**
 * historyChart.ts
 * 
 * Trade history chart visualization:
 * - Cumulative earnings chart (canvas-based)
 * - Currency switching (divine/exalted/annul)
 * - Adaptive axis scaling
 * - Responsive sizing
 */

import { historyState } from './historyData';
import { historyVisible } from './historyView';
import { normalizeCurrency } from '../utils';

interface ChartPoint {
  t: number;  // timestamp (ms)
  d: number;  // divine cumulative
  e: number;  // exalted cumulative
  a: number;  // annul cumulative
  c: number;  // chaos cumulative
  r: number;  // regal cumulative
}

interface ChartState {
  points: ChartPoint[];
  current: "divine" | "exalted" | "annul" | "chaos" | "regal";
  lastTotals: { divine: number; exalted: number; annul: number; chaos: number; regal: number };
}

const _chartState: ChartState = {
  points: [],
  current: "divine",
  lastTotals: { divine: 0, exalted: 0, annul: 0, chaos: 0, regal: 0 }
};

/**
 * Recompute the chart series from stored trade history.
 * Creates cumulative data points sorted by time.
 * Adds a synthetic first point (1 minute before first trade at 0)
 * and a final point at current time matching header totals.
 */
export function recomputeChartSeriesFromStore(): void {
  const entries = (historyState.store?.entries || []).slice();
  if (!entries.length) {
    _chartState.points = [];
    return;
  }
  
  // Sort by timestamp
  entries.sort((a: any, b: any) => {
    const ta = (a as any).time || (a as any).listedAt || (a as any).date || 0;
    const tb = (b as any).time || (b as any).listedAt || (b as any).date || 0;
    const pa = typeof ta === "number" ? (ta > 1e12 ? ta : ta * 1000) : Date.parse(ta || 0 as any);
    const pb = typeof tb === "number" ? (tb > 1e12 ? tb : tb * 1000) : Date.parse(tb || 0 as any);
    return pa - pb;
  });
  
  // Build cumulative points
  let d = 0, e = 0, a = 0, c = 0, r = 0;
  const pts: ChartPoint[] = [];
  
  // Add synthetic first point (1 minute before first trade)
  const first = entries[0] as any;
  const tFirstRaw = first.time || first.listedAt || first.date || 0;
  const tFirst = typeof tFirstRaw === "number" ? (tFirstRaw > 1e12 ? tFirstRaw : tFirstRaw * 1000) : Date.parse((tFirstRaw as any) || 0);
  pts.push({ t: tFirst - 60_000, d: 0, e: 0, a: 0, c: 0, r: 0 });
  
  // Accumulate trades
  for (const it of entries as any[]) {
    const tRaw = (it as any).time || (it as any).listedAt || (it as any).date || 0;
    const t = typeof tRaw === "number" ? (tRaw > 1e12 ? tRaw : tRaw * 1000) : Date.parse((tRaw as any) || 0);
    const cur = normalizeCurrency((it as any)?.price?.currency ?? (it as any)?.currency ?? "");
    const amt = Number((it as any)?.price?.amount ?? (it as any)?.amount ?? 0) || 0;
    
    if (cur === "divine") d += amt;
    else if (cur === "exalted") e += amt;
    else if (cur === "annul") a += amt;
    else if (cur === "chaos") c += amt;
    else if (cur === "regal") r += amt;
    
    pts.push({ t, d, e, a, c, r });
  }
  
  // Append final point at 'now' matching normalized header totals (chart and header alignment)
  try {
    const totals: any = historyState.store?.totals || {};
    const nd = Number(totals.divine || 0), ne = Number(totals.exalted || 0), na = Number(totals.annul || 0),
          nc = Number(totals.chaos || 0), nr = Number(totals.regal || 0);
    if (nd || ne || na || nc || nr) {
      const now = Date.now();
      pts.push({ t: now, d: nd, e: ne, a: na, c: nc, r: nr });
      d = nd; e = ne; a = na; c = nc; r = nr;
    }
  } catch {}
  
  _chartState.points = pts;
  _chartState.lastTotals = { divine: d, exalted: e, annul: a, chaos: c, regal: r };
}

/**
 * Update chart with new totals from header.
 * Adds a new data point if totals have changed.
 * Limits chart to last 200 points.
 */
export function updateHistoryChartFromTotals(totals: Record<string, number>): void {
  if (!historyVisible()) return;
  
  const t = Date.now();
  const d = Number((totals as any).divine || 0),
    e = Number((totals as any).exalted || 0),
    a = Number((totals as any).annul || 0),
    c = Number((totals as any).chaos || 0),
    r = Number((totals as any).regal || 0);
  
  const last = _chartState.lastTotals;
  if (!_chartState.points.length || d !== last.divine || e !== last.exalted || a !== last.annul || c !== last.chaos || r !== last.regal) {
    _chartState.points.push({ t, d, e, a, c, r });
    if (_chartState.points.length > 200) _chartState.points.shift();
    _chartState.lastTotals = { divine: d, exalted: e, annul: a, chaos: c, regal: r };
  }
  
  drawHistoryChart();
}

/**
 * Draw the cumulative earnings chart on canvas.
 * Features:
 * - Adaptive Y-axis scaling (nice tick values)
 * - X-axis shows trade count (not time)
 * - Responsive sizing based on container
 * - Color-coded by currency (divine=gold, exalted=blue, annul=purple)
 * - Shows recent data points as dots
 * - Grid lines for readability
 */
export function drawHistoryChart(): void {
  if (!historyVisible()) return;
  
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
  // Dynamic height: use available space in flex container, with reasonable bounds
  let H = chartWrap ? Math.max(120, Math.min(chartWrap.clientHeight - 50, 300)) : 180;
  
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
  
  // Need at least 2 points for a line
  if (pts.length === 1) {
    const p = pts[0];
    pts = [{ t: p.t - 60_000, d: p.d, e: p.e, a: p.a, c: p.c, r: p.r }, p];
  }
  
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1;
  const minVal = 0;
  const key = _chartState.current === "exalted" ? "e" 
    : _chartState.current === "annul" ? "a" 
    : _chartState.current === "chaos" ? "c"
    : _chartState.current === "regal" ? "r"
    : "d";
  const maxVal = Math.max(1, ...pts.map((p) => (p as any)[key] as number));
  
  const padL = 36, padR = 8, padT = 8, padB = 22;
  
  // Draw axes
  ctx.strokeStyle = "#444";
  (ctx as any).lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, H - padB);
  ctx.lineTo(W - padR, H - padB);
  ctx.stroke();

  const X = (t: number) => padL + ((W - padL - padR) * (t - t0)) / Math.max(1, t1 - t0);
  const Y = (v: number) => (H - padB) - ((H - padT - padB) * (v - minVal)) / Math.max(1, maxVal - minVal);

  // --- Y Axis Ticks (Adaptive) ---------------------------------------------
  const desiredTicks = 4; // excluding 0
  let yTicks: number[] = [];
  if (maxVal <= 1) {
    yTicks = [1];
  } else {
    // Determine a 'nice' step size (1,2,5 * 10^n)
    const rawStep = maxVal / desiredTicks;
    const pow10 = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const candidates = [1, 2, 2.5, 5, 10].map(c => c * pow10);
    let step = candidates[0];
    for (const c of candidates) { if (rawStep <= c) { step = c; break; } }
    const maxTick = Math.ceil(maxVal / step) * step;
    for (let v = step; v < maxTick; v += step) {
      if (v >= maxVal) break;
      yTicks.push(v);
    }
    if (yTicks.length === 0 && maxVal > 0) yTicks = [maxVal];
  }
  
  // Draw horizontal grid lines
  ctx.strokeStyle = "#2d2d2d";
  (ctx as any).lineWidth = 1;
  (ctx as any).setLineDash?.([3, 3]);
  yTicks.forEach(v => {
    const y = Y(v);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
  });
  (ctx as any).setLineDash?.([]);

  // Y tick labels with de-overlap logic
  ctx.fillStyle = "#999" as any;
  (ctx as any).font = "10px Segoe UI, sans-serif";
  (ctx as any).textAlign = "right";
  const minGap = 14; // minimum pixel gap between baselines
  const topY = padT + 10; // baseline used for top value label
  const bottomLabel = { v: 0, y: H - padB + 10 };
  const interiorTicks: { v: number; y: number }[] = [];
  // Pre-compute and filter out ticks too close to top
  yTicks.forEach(v => {
    const yPix = Y(v) + 3; // baseline adjustment
    if (Math.abs(yPix - topY) < minGap) return; // skip ticks colliding with top label
    interiorTicks.push({ v, y: yPix });
  });
  // Sort by y descending (bottom to top) to enforce spacing
  interiorTicks.sort((a,b)=> b.y - a.y);
  const kept: { v: number; y: number }[] = [];
  let lastYPix = Infinity; // last baseline used (starting from bottom -> large y)
  for (const t of interiorTicks) {
    if (lastYPix === Infinity || Math.abs(lastYPix - t.y) >= minGap) {
      kept.push(t);
      lastYPix = t.y;
    }
  }
  // Draw bottom label (0)
  ctx.fillText(String(bottomLabel.v), padL - 4, bottomLabel.y);
  // Draw kept interior ticks
  kept.forEach(t => ctx.fillText(String(t.v), padL - 4, t.y));
  // Draw top label (max)
  ctx.fillText(String(Math.round(maxVal)), padL - 4, topY);
  
  // --- X Axis ticks (trade index) ------------------------------------------
  // Count only trades relevant to current currency (when value increases)
  let totalTrades = 0;
  for (let i = 1; i < pts.length; i++) { // skip synthetic first
    const prev = pts[i - 1] as any; 
    const curP = pts[i] as any;
    if (curP[key] > prev[key]) totalTrades++; // only count when cumulative value increases for that currency
  }
  
  if (totalTrades > 0) {
    const desiredXTicks = 4; // interior target
    let xStep = Math.ceil(totalTrades / (desiredXTicks + 1));
    const pow10x = Math.pow(10, Math.floor(Math.log10(xStep)));
    const candX = [1, 2, 5, 10].map(c => c * pow10x);
    for (const c of candX) { if (xStep <= c) { xStep = c; break; } }

    ctx.fillStyle = "#777" as any;
    (ctx as any).font = "9px Segoe UI, sans-serif";
    const minXGap = 24; // minimum horizontal gap in pixels between label centers

    // Draw start label first and track last label position
    (ctx as any).textAlign = "left";
    const startX = padL + 2;
    ctx.fillText("1", startX, H - padB + 12);
    let lastLabelX = startX;

    // Interior ticks filtering by gap
    const interior: { i: number; x: number; p:any }[] = [];
    for (let i = xStep; i < totalTrades; i += xStep) {
      const p = pts[Math.min(i, pts.length - 1)];
      interior.push({ i, x: X(p.t), p });
    }
    // Sort by x just in case (should already be ascending)
    interior.sort((a,b)=> a.x - b.x);

    (ctx as any).textAlign = "center";
    interior.forEach(t => {
      if (t.x - lastLabelX < minXGap) return; // skip overlapping
      // Draw grid line
      ctx.beginPath();
      ctx.strokeStyle = "#2d2d2d";
      (ctx as any).setLineDash?.([2, 3]);
      ctx.moveTo(t.x, padT);
      ctx.lineTo(t.x, H - padB);
      ctx.stroke();
      (ctx as any).setLineDash?.([]);
      ctx.fillText(String(t.i), t.x, H - padB + 12);
      lastLabelX = t.x;
    });

    // End label (ensure spacing from last interior)
    const endX = W - padR - 2;
    (ctx as any).textAlign = "right";
    if (endX - lastLabelX >= minXGap * 0.6) { // allow a little tighter for final
      ctx.fillText(String(totalTrades), endX, H - padB + 12);
    }
  }
  
  // Draw line chart
  const color = _chartState.current === "exalted" ? "#3f6aa1" 
    : _chartState.current === "annul" ? "#7b40b3" 
    : _chartState.current === "chaos" ? "#4a6a35"
    : _chartState.current === "regal" ? "#6b4a28"
    : "#d4af37";
  ctx.strokeStyle = color as any;
  (ctx as any).lineWidth = 2;
  ctx.beginPath();
  (pts as any[]).forEach((p, i) => {
    const x = X(p.t), y = Y(p[key]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  
  // Draw recent data points as dots
  ctx.fillStyle = color as any;
  const n = Math.min(pts.length, 6);
  for (let i = pts.length - n; i < pts.length; i++) {
    const p = pts[i] as any;
    const x = X(p.t), y = Y(p[key]);
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Switch the chart to display a different currency.
 * 
 * @param cur - Currency to display ("divine" | "exalted" | "annul" | "chaos" | "regal")
 */
export function setChartCurrency(cur: "divine" | "exalted" | "annul" | "chaos" | "regal"): void {
  _chartState.current = cur;
  drawHistoryChart();
}
