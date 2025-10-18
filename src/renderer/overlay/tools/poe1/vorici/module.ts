interface VoriciState {
  sockets: number;
  str: number;
  dex: number;
  int: number;
  quality: number;
  red: number;
  green: number;
  blue: number;
  hasSocketedItems: boolean;
  lastHeaderSubtitle: string;
}

interface ColorProbabilities {
  red: number;
  green: number;
  blue: number;
}

interface CraftMethod {
  name: string;
  avgCost: number;
  chance: number;
  avgAttempts: number;
  costPerTry: number;
  stdDev: number;
}

const MAX_SOCKETS = 6;
// Constants from Siveran's original calculator
const X = 5; // Off-color weight constant
const C = 5; // On-color weight constant  
const MAX_ON_COLOR_CHANCE = 0.9; // Maximum on-color chance

const DEFAULT_STATE: VoriciState = {
  sockets: 0,
  str: 0,
  dex: 0,
  int: 0,
  quality: 0,
  red: 0,
  green: 0,
  blue: 0,
  hasSocketedItems: false,
  lastHeaderSubtitle: ''
};

const state: VoriciState = { ...DEFAULT_STATE };

const elements: {
  root: HTMLElement | null;
  socketsInput: HTMLInputElement | null;
  strInput: HTMLInputElement | null;
  dexInput: HTMLInputElement | null;
  intInput: HTMLInputElement | null;
  qualityInput: HTMLInputElement | null;
  redInput: HTMLInputElement | null;
  greenInput: HTMLInputElement | null;
  blueInput: HTMLInputElement | null;
  probSummary: HTMLElement | null;
  probDetails: HTMLElement | null;
  craftTable: HTMLElement | null;
  gemWarning: HTMLElement | null;
  errorBanner: HTMLElement | null;
  subtitle: HTMLElement | null;
} = {
  root: null,
  socketsInput: null,
  strInput: null,
  dexInput: null,
  intInput: null,
  qualityInput: null,
  redInput: null,
  greenInput: null,
  blueInput: null,
  probSummary: null,
  probDetails: null,
  craftTable: null,
  gemWarning: null,
  errorBanner: null,
  subtitle: null
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function toPositiveInt(value: unknown): number {
  const parsed = typeof value === 'number' ? value : parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function factorial(n: number): number {
  let result = 1;
  for (let i = 2; i <= n; i += 1) {
    result *= i;
  }
  return result;
}

function colorProbabilities(): ColorProbabilities {
  // Original Vorici calculator algorithm from Siveran
  const str = state.str;
  const dex = state.dex;
  const int = state.int;
  
  const totalRequirements = str + dex + int;
  if (totalRequirements === 0) {
    return { red: 1/3, green: 1/3, blue: 1/3 };
  }
  
  // Count how many requirements are non-zero
  const numRequirements = (str > 0 ? 1 : 0) + (dex > 0 ? 1 : 0) + (int > 0 ? 1 : 0);
  
  let redChance = 0;
  let greenChance = 0;
  let blueChance = 0;
  
  if (numRequirements === 1) {
    // Single requirement items (e.g., Vaal Regalia, ES shields)
    // On-color: maxOnColorChance * (X + C + requirement) / (totalRequirements + 3 * X + C)
    // Off-color: ((1 - maxOnColorChance) / 2) + maxOnColorChance * (X / (totalRequirements + 3 * X + C))
    const denominator = totalRequirements + 3 * X + C;
    
    if (str > 0) {
      redChance = MAX_ON_COLOR_CHANCE * (X + C + str) / denominator;
      greenChance = ((1 - MAX_ON_COLOR_CHANCE) / 2) + MAX_ON_COLOR_CHANCE * (X / denominator);
      blueChance = ((1 - MAX_ON_COLOR_CHANCE) / 2) + MAX_ON_COLOR_CHANCE * (X / denominator);
    } else if (dex > 0) {
      redChance = ((1 - MAX_ON_COLOR_CHANCE) / 2) + MAX_ON_COLOR_CHANCE * (X / denominator);
      greenChance = MAX_ON_COLOR_CHANCE * (X + C + dex) / denominator;
      blueChance = ((1 - MAX_ON_COLOR_CHANCE) / 2) + MAX_ON_COLOR_CHANCE * (X / denominator);
    } else { // int > 0
      redChance = ((1 - MAX_ON_COLOR_CHANCE) / 2) + MAX_ON_COLOR_CHANCE * (X / denominator);
      greenChance = ((1 - MAX_ON_COLOR_CHANCE) / 2) + MAX_ON_COLOR_CHANCE * (X / denominator);
      blueChance = MAX_ON_COLOR_CHANCE * (X + C + int) / denominator;
    }
  } else if (numRequirements === 2) {
    // Dual requirement items (e.g., daggers, evasion/ES gear)
    // On-color: maxOnColorChance * requirement / totalRequirements
    // Off-color: 1 - maxOnColorChance (flat 10%)
    if (str > 0) {
      redChance = MAX_ON_COLOR_CHANCE * str / totalRequirements;
    } else {
      redChance = 1 - MAX_ON_COLOR_CHANCE;
    }
    
    if (dex > 0) {
      greenChance = MAX_ON_COLOR_CHANCE * dex / totalRequirements;
    } else {
      greenChance = 1 - MAX_ON_COLOR_CHANCE;
    }
    
    if (int > 0) {
      blueChance = MAX_ON_COLOR_CHANCE * int / totalRequirements;
    } else {
      blueChance = 1 - MAX_ON_COLOR_CHANCE;
    }
  } else { // numRequirements === 3
    // Tri-requirement items (e.g., Atziri's Splendour)
    // Each color gets requirement / totalRequirements
    redChance = str / totalRequirements;
    greenChance = dex / totalRequirements;
    blueChance = int / totalRequirements;
  }
  
  return {
    red: redChance,
    green: greenChance,
    blue: blueChance
  };
}

// Multinomial probability calculation for desired colors with free sockets
// Based on Siveran's original recursive algorithm
function multinomial(colorChances: ColorProbabilities, desired: { red: number, green: number, blue: number }, free: number, pos: number = 1): number {
  if (free > 0) {
    // Recursive case: distribute free sockets across colors
    // pos prevents calculating duplicate permutations (e.g., RGGB and RGBG)
    return (
      (pos <= 1 ? multinomial(colorChances, { red: desired.red + 1, green: desired.green, blue: desired.blue }, free - 1, 1) : 0) +
      (pos <= 2 ? multinomial(colorChances, { red: desired.red, green: desired.green + 1, blue: desired.blue }, free - 1, 2) : 0) +
      multinomial(colorChances, { red: desired.red, green: desired.green, blue: desired.blue + 1 }, free - 1, 3)
    );
  } else {
    // Base case: calculate probability for this specific combination
    const total = desired.red + desired.green + desired.blue;
    const combinations = factorial(total) / (factorial(desired.red) * factorial(desired.green) * factorial(desired.blue));
    const probability = Math.pow(colorChances.red, desired.red) * Math.pow(colorChances.green, desired.green) * Math.pow(colorChances.blue, desired.blue);
    return combinations * probability;
  }
}

// Calculate chromatic bonus (chromatics can't reroll same permutation twice)
function calcChromaticBonus(colorChances: ColorProbabilities, desired: { red: number, green: number, blue: number }, free: number, rolled: { red: number, green: number, blue: number } = { red: 0, green: 0, blue: 0 }, pos: number = 1): number {
  if (rolled.red >= desired.red && rolled.green >= desired.green && rolled.blue >= desired.blue) {
    // Success - we don't reroll, so no chromatic bonus
    return 0;
  } else if (free > 0) {
    // Distribute remaining sockets
    return (
      (pos <= 1 ? calcChromaticBonus(colorChances, desired, free - 1, { red: rolled.red + 1, green: rolled.green, blue: rolled.blue }, 1) : 0) +
      (pos <= 2 ? calcChromaticBonus(colorChances, desired, free - 1, { red: rolled.red, green: rolled.green + 1, blue: rolled.blue }, 2) : 0) +
      calcChromaticBonus(colorChances, desired, free - 1, { red: rolled.red, green: rolled.green, blue: rolled.blue + 1 }, 3)
    );
  } else {
    // Calculate probability of rolling this permutation twice in a row
    const total = rolled.red + rolled.green + rolled.blue;
    const combinations = factorial(total) / (factorial(rolled.red) * factorial(rolled.green) * factorial(rolled.blue));
    // Note: *2 in exponents because we need to roll same permutation twice
    const probability = Math.pow(colorChances.red, rolled.red * 2) * Math.pow(colorChances.green, rolled.green * 2) * Math.pow(colorChances.blue, rolled.blue * 2);
    return combinations * probability;
  }
}

function combinationProbability(red: number, green: number, blue: number, probs: ColorProbabilities, socketCount: number): number {
  const totalDesired = red + green + blue;
  if (totalDesired > socketCount) return 0;
  
  const freeSocketsWeDoNotCareAbout = socketCount - totalDesired;
  return multinomial(probs, { red, green, blue }, freeSocketsWeDoNotCareAbout);
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value) || value < 0) return 'N/A';
  if (value >= 1000000) return value.toFixed(1);
  if (value >= 1000) return value.toFixed(1);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function formatPercent(prob: number): string {
  if (!Number.isFinite(prob) || prob <= 0) return '0%';
  const pct = prob * 100;
  if (pct >= 100) return '100%';
  if (pct >= 10) return pct.toFixed(2) + '%';
  if (pct >= 1) return pct.toFixed(3) + '%';
  if (pct >= 0.1) return pct.toFixed(4) + '%';
  return pct.toFixed(5) + '%';
}

// Socket bench costs for add/remove
const SOCKET_COSTS: { [key: number]: number } = {
  2: 1,
  3: 3,
  4: 10,
  5: 70,
  6: 350
};

// Bench craft costs for coloring sockets
// Format: "XR" = at least X red sockets
interface BenchCraft {
  red: number;
  green: number;
  blue: number;
  cost: number;
  name: string;
}

const BENCH_CRAFTS: BenchCraft[] = [
  // Single color
  { red: 1, green: 0, blue: 0, cost: 4, name: '1R' },
  { red: 0, green: 1, blue: 0, cost: 4, name: '1G' },
  { red: 0, green: 0, blue: 1, cost: 4, name: '1B' },
  { red: 2, green: 0, blue: 0, cost: 25, name: '2R' },
  { red: 0, green: 2, blue: 0, cost: 25, name: '2G' },
  { red: 0, green: 0, blue: 2, cost: 25, name: '2B' },
  { red: 3, green: 0, blue: 0, cost: 120, name: '3R' },
  { red: 0, green: 3, blue: 0, cost: 120, name: '3G' },
  { red: 0, green: 0, blue: 3, cost: 120, name: '3B' },
  // Hybrid 1+1
  { red: 1, green: 1, blue: 0, cost: 15, name: '1R1G' },
  { red: 1, green: 0, blue: 1, cost: 15, name: '1R1B' },
  { red: 0, green: 1, blue: 1, cost: 15, name: '1G1B' },
  // Hybrid 2+1
  { red: 2, green: 1, blue: 0, cost: 100, name: '2R1G' },
  { red: 2, green: 0, blue: 1, cost: 100, name: '2R1B' },
  { red: 1, green: 2, blue: 0, cost: 100, name: '1R2G' },
  { red: 0, green: 2, blue: 1, cost: 100, name: '2G1B' },
  { red: 1, green: 0, blue: 2, cost: 100, name: '1R2B' },
  { red: 0, green: 1, blue: 2, cost: 100, name: '1G2B' },
];

// Find cheapest bench craft that guarantees the needed colors
// Returns null if no bench craft covers the requirement
function findCheapestBenchCraft(neededRed: number, neededGreen: number, neededBlue: number): BenchCraft | null {
  let cheapest: BenchCraft | null = null;
  
  for (const craft of BENCH_CRAFTS) {
    // Check if this craft guarantees at least the needed colors
    if (craft.red >= neededRed && craft.green >= neededGreen && craft.blue >= neededBlue) {
      if (!cheapest || craft.cost < cheapest.cost) {
        cheapest = craft;
      }
    }
  }
  
  return cheapest;
}

// Calculate Jeweller's Method costs (socket add/remove technique)
// Returns starting chromatic cost + jeweller steps + total
function calculateJewellerMethod(
  desiredSockets: number,
  red: number,
  green: number,
  blue: number,
  probs: ColorProbabilities
): Array<{ 
  startSockets: number; 
  chromaticCost: number;
  jewellerCost: number;
  totalCostDescription: string;
  description: string;
}> {
  const results: Array<{ 
    startSockets: number; 
    chromaticCost: number;
    jewellerCost: number;
    totalCostDescription: string;
    description: string;
  }> = [];
  
  // Can't use this method for less than 3 sockets (need minimum 2 to start)
  if (desiredSockets < 3 || desiredSockets > 6) return results;
  
  // Calculate for each valid starting point (2 to desiredSockets-1)
  for (let startSockets = 2; startSockets < desiredSockets; startSockets++) {
    // First, calculate chromatic cost to get the starting sockets with correct colors
    let startRed = 0, startGreen = 0, startBlue = 0;
    
    // Distribute colors for starting sockets (best case scenario)
    let remaining = startSockets;
    if (red > 0 && remaining > 0) { startRed = Math.min(red, remaining); remaining -= startRed; }
    if (green > 0 && remaining > 0) { startGreen = Math.min(green, remaining); remaining -= startGreen; }
    if (blue > 0 && remaining > 0) { startBlue = Math.min(blue, remaining); remaining -= startBlue; }
    
    // Calculate chromatic cost for getting starting sockets
    const startChance = combinationProbability(startRed, startGreen, startBlue, probs, startSockets);
    const chromaticCost = startChance > 0 ? (1 / startChance) : 0;
    
    // Check if bench craft is cheaper than chromatics
    const benchCraft = findCheapestBenchCraft(startRed, startGreen, startBlue);
    const finalChromaticCost = (benchCraft && benchCraft.cost < chromaticCost) ? benchCraft.cost : chromaticCost;
    const usedBench = (benchCraft && benchCraft.cost < chromaticCost);
    
    // Now calculate jeweller cost for remaining sockets
    let jewellerCost = 0;
    let remainingRed = red - startRed;
    let remainingGreen = green - startGreen;
    let remainingBlue = blue - startBlue;
    
    // Calculate cost for each socket we need to add
    for (let currentSockets = startSockets; currentSockets < desiredSockets; currentSockets++) {
      const nextSocketCount = currentSockets + 1;
      const addCost = SOCKET_COSTS[nextSocketCount] || 0;
      const removeCost = SOCKET_COSTS[currentSockets] || 0;
      
      // Calculate probability of getting a needed color
      let pSuccess = 0;
      if (remainingRed > 0) pSuccess += probs.red;
      if (remainingGreen > 0) pSuccess += probs.green;
      if (remainingBlue > 0) pSuccess += probs.blue;
      
      if (pSuccess <= 0) pSuccess = 0.01; // Safety fallback
      if (pSuccess > 1) pSuccess = 1;
      
      // Expected cost for this socket
      const expectedAttempts = 1 / pSuccess;
      const failedAttempts = expectedAttempts - 1;
      const stepCost = addCost + failedAttempts * (addCost + removeCost);
      
      jewellerCost += stepCost;
      
      // Update remaining colors
      if (remainingRed > 0) remainingRed--;
      else if (remainingGreen > 0) remainingGreen--;
      else if (remainingBlue > 0) remainingBlue--;
    }
    
    results.push({
      startSockets,
      chromaticCost: finalChromaticCost,
      jewellerCost,
      totalCostDescription: `${formatNumber(finalChromaticCost)} chr + ${formatNumber(jewellerCost)} jew`,
      description: `Start ${startSockets} sockets (${[startRed > 0 ? `${startRed}R` : '', startGreen > 0 ? `${startGreen}G` : '', startBlue > 0 ? `${startBlue}B` : ''].filter(Boolean).join(' ')})${usedBench ? ' [bench]' : ''} → ${desiredSockets}`
    });
  }
  
  return results;
}

// Calculate Vorici bench costs based on socket count and desired colors
function calculateVoriciCosts(sockets: number, red: number, green: number, blue: number, probs: ColorProbabilities): CraftMethod[] {
  const methods: CraftMethod[] = [];
  
  // Chromatic Orb (basic spam) with chromatic bonus
  let chromaticChance = combinationProbability(red, green, blue, probs, sockets);
  if (chromaticChance > 0) {
    // Apply chromatic bonus - chromatics can't reroll the same permutation twice
    const chromaticCollisionChance = calcChromaticBonus(probs, { red, green, blue }, sockets);
    chromaticChance = chromaticChance / (1 - chromaticCollisionChance);
    
    const avgAttempts = 1 / chromaticChance;
    methods.push({
      name: 'Chromatic',
      avgCost: avgAttempts,
      chance: chromaticChance,
      avgAttempts,
      costPerTry: 1,
      stdDev: Math.sqrt((1 - chromaticChance) / (chromaticChance * chromaticChance))
    });
  }
  
  // Vorici bench options (1R, 1G, 2R, 3R, etc.)
  const voriciOptions = [
    { name: 'Vorici 1R', cost: 4, r: 1, g: 0, b: 0 },
    { name: 'Vorici 1G', cost: 4, r: 0, g: 1, b: 0 },
    { name: 'Vorici 1B', cost: 4, r: 0, g: 0, b: 1 },
    { name: 'Vorici 2R', cost: 25, r: 2, g: 0, b: 0 },
    { name: 'Vorici 2G', cost: 25, r: 0, g: 2, b: 0 },
    { name: 'Vorici 2B', cost: 25, r: 0, g: 0, b: 2 },
    { name: 'Vorici 3R', cost: 120, r: 3, g: 0, b: 0 },
    { name: 'Vorici 3G', cost: 120, r: 0, g: 3, b: 0 },
    { name: 'Vorici 3B', cost: 120, r: 0, g: 0, b: 3 },
    { name: 'Vorici 1R1G', cost: 15, r: 1, g: 1, b: 0 },
    { name: 'Vorici 1R1B', cost: 15, r: 1, g: 0, b: 1 },
    { name: 'Vorici 1G1B', cost: 15, r: 0, g: 1, b: 1 },
    { name: 'Vorici 2R1G', cost: 100, r: 2, g: 1, b: 0 },
    { name: 'Vorici 2R1B', cost: 100, r: 2, g: 0, b: 1 },
    { name: 'Vorici 2G1R', cost: 100, r: 1, g: 2, b: 0 },
    { name: 'Vorici 2G1B', cost: 100, r: 0, g: 2, b: 1 },
    { name: 'Vorici 2B1R', cost: 100, r: 1, g: 0, b: 2 },
    { name: 'Vorici 2B1G', cost: 100, r: 0, g: 1, b: 2 },
    { name: 'Vorici 1R2G', cost: 100, r: 1, g: 2, b: 0 },
    { name: 'Vorici 1R2B', cost: 100, r: 1, g: 0, b: 2 },
  ];
  
  for (const option of voriciOptions) {
    if (option.r > sockets || option.g > sockets || option.b > sockets) continue;
    if (option.r > red || option.g > green || option.b > blue) continue;
    
    const remaining = sockets - option.r - option.g - option.b;
    const remainingRed = red - option.r;
    const remainingGreen = green - option.g;
    const remainingBlue = blue - option.b;
    
    if (remaining === 0 && remainingRed === 0 && remainingGreen === 0 && remainingBlue === 0) {
      // Exact match - no RNG needed
      methods.push({
        name: option.name,
        avgCost: option.cost,
        chance: 1,
        avgAttempts: 1,
        costPerTry: option.cost,
        stdDev: 0
      });
    } else if (remaining > 0) {
      // Need to fill remaining sockets with chromatics
      const remainingChance = combinationProbability(remainingRed, remainingGreen, remainingBlue, probs, remaining);
      if (remainingChance > 0) {
        const avgAttempts = 1 / remainingChance;
        methods.push({
          name: option.name,
          avgCost: option.cost * avgAttempts,
          chance: remainingChance,
          avgAttempts,
          costPerTry: option.cost,
          stdDev: Math.sqrt((1 - remainingChance) / (remainingChance * remainingChance))
        });
      }
    }
  }
  
  return methods;
}

function ensurePanel(): HTMLElement {
  if (elements.root && document.body.contains(elements.root)) {
    return elements.root;
  }
  const existing = document.getElementById('craftingPanel');
  if (existing) {
    elements.root = existing;
    return existing;
  }
  const made = document.createElement('div');
  made.id = 'craftingPanel';
  made.className = 'content';
  const footer = document.getElementById('footer');
  if (footer?.parentNode) {
    footer.parentNode.insertBefore(made, footer);
  } else {
    document.body.appendChild(made);
  }
  elements.root = made;
  return made;
}

function renderPanel(): void {
  const panel = ensurePanel();
  panel.style.display = 'block';
  panel.style.overflow = 'auto';
  panel.innerHTML = `
    <div id="voriciToolRoot" class="vorici-root" style="display:flex; flex-direction:column; gap:12px; padding-bottom:8px;">
      <div style="display:flex; flex-direction:column; gap:6px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
          <div id="voriciError" style="display:none; color:var(--accent-red); font-size:12px;"></div>
        </div>
        <div id="voriciSubtitle" style="font-size:12px; color:var(--text-secondary);"></div>
        <div id="voriciGemWarning" style="display:none; font-size:12px; color:var(--accent-orange);">Socketed gems detected. Remove gems before recoloring or you may brick them.</div>
      </div>
      
      <div class="vorici-section" style="display:flex; flex-direction:column; gap:8px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:6px; padding:12px;">
        <div style="display:grid; grid-template-columns:1fr; gap:10px;">
          <label style="display:flex; flex-direction:column; gap:4px; font-size:12px;">
            <span>Total sockets</span>
            <input id="voriciSockets" type="number" min="1" max="6" step="1" style="padding:6px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary);" />
          </label>
        </div>
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px;">
          <label style="display:flex; flex-direction:column; gap:4px; font-size:12px;">
            <span>Strength requirement</span>
            <input id="voriciStr" type="number" min="0" step="1" style="padding:6px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary);" />
          </label>
          <label style="display:flex; flex-direction:column; gap:4px; font-size:12px;">
            <span>Dexterity requirement</span>
            <input id="voriciDex" type="number" min="0" step="1" style="padding:6px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary);" />
          </label>
          <label style="display:flex; flex-direction:column; gap:4px; font-size:12px;">
            <span>Intelligence requirement</span>
            <input id="voriciInt" type="number" min="0" step="1" style="padding:6px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary);" />
          </label>
        </div>
        
        <div style="background:rgba(255,193,7,0.1); border:1px solid rgba(255,193,7,0.3); border-radius:4px; padding:8px; margin-top:8px;">
          <div style="font-size:11px; color:var(--accent-orange); font-weight:500;">
            ⚠ Warning: Items with socketed gems will have altered attribute requirements and calculations will be incorrect!
          </div>
        </div>
        
        <div style="font-size:13px; font-weight:600; margin-top:8px;">Desired Colors</div>
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px;">
          <label style="display:flex; flex-direction:column; gap:4px; font-size:12px;">
            <span style="color:#dc443d;">Red sockets</span>
            <input id="voriciRed" type="number" min="0" max="6" step="1" style="padding:6px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary);" />
          </label>
          <label style="display:flex; flex-direction:column; gap:4px; font-size:12px;">
            <span style="color:#4caf50;">Green sockets</span>
            <input id="voriciGreen" type="number" min="0" max="6" step="1" style="padding:6px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary);" />
          </label>
          <label style="display:flex; flex-direction:column; gap:4px; font-size:12px;">
            <span style="color:#42a5f5;">Blue sockets</span>
            <input id="voriciBlue" type="number" min="0" max="6" step="1" style="padding:6px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; color:var(--text-primary);" />
          </label>
        </div>
      </div>
      
      <div class="vorici-section" style="display:flex; flex-direction:column; gap:10px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:6px; padding:12px;">
        <div id="voriciProbSummary" style="font-size:14px; font-weight:600;">Chance: N/A</div>
        <div id="voriciProbDetails" style="font-size:12px; color:var(--text-secondary);">Probabilities pending input.</div>
        <div id="voriciCraftTable" style="margin-top:8px;"></div>
      </div>
    </div>
  `;

  elements.root = panel;
  elements.socketsInput = panel.querySelector('#voriciSockets') as HTMLInputElement | null;
  elements.strInput = panel.querySelector('#voriciStr') as HTMLInputElement | null;
  elements.dexInput = panel.querySelector('#voriciDex') as HTMLInputElement | null;
  elements.intInput = panel.querySelector('#voriciInt') as HTMLInputElement | null;
  elements.qualityInput = null; // Quality removed
  elements.redInput = panel.querySelector('#voriciRed') as HTMLInputElement | null;
  elements.greenInput = panel.querySelector('#voriciGreen') as HTMLInputElement | null;
  elements.blueInput = panel.querySelector('#voriciBlue') as HTMLInputElement | null;
  elements.probSummary = panel.querySelector('#voriciProbSummary');
  elements.probDetails = panel.querySelector('#voriciProbDetails');
  elements.craftTable = panel.querySelector('#voriciCraftTable');
  elements.gemWarning = panel.querySelector('#voriciGemWarning');
  elements.errorBanner = panel.querySelector('#voriciError');
  elements.subtitle = panel.querySelector('#voriciSubtitle');

  attachHandlers();
  syncInputs();
  updateOutputs();
}

function attachHandlers(): void {
  const inputs = [
    elements.socketsInput,
    elements.strInput,
    elements.dexInput,
    elements.intInput,
    elements.redInput,
    elements.greenInput,
    elements.blueInput
  ] as Array<HTMLInputElement | null>;

  inputs.forEach(input => {
    input?.addEventListener('input', () => {
      readInputs();
      updateOutputs();
    });
  });
}

function readInputs(): void {
  const socketValue = elements.socketsInput?.value ?? '';
  const parsedSockets = socketValue.trim() === '' ? state.sockets : toPositiveInt(socketValue);
  state.sockets = clamp(parsedSockets, 0, MAX_SOCKETS);
  state.str = toPositiveInt(elements.strInput?.value);
  state.dex = toPositiveInt(elements.dexInput?.value);
  state.int = toPositiveInt(elements.intInput?.value);
  state.quality = 0; // Quality not used in original calculator
  state.red = clamp(toPositiveInt(elements.redInput?.value), 0, MAX_SOCKETS);
  state.green = clamp(toPositiveInt(elements.greenInput?.value), 0, MAX_SOCKETS);
  state.blue = clamp(toPositiveInt(elements.blueInput?.value), 0, MAX_SOCKETS);
}

function syncInputs(): void {
  if (elements.socketsInput) elements.socketsInput.value = state.sockets ? String(state.sockets) : '';
  if (elements.strInput) elements.strInput.value = state.str ? String(state.str) : '';
  if (elements.dexInput) elements.dexInput.value = state.dex ? String(state.dex) : '';
  if (elements.intInput) elements.intInput.value = state.int ? String(state.int) : '';
  if (elements.redInput) elements.redInput.value = state.red ? String(state.red) : '';
  if (elements.greenInput) elements.greenInput.value = state.green ? String(state.green) : '';
  if (elements.blueInput) elements.blueInput.value = state.blue ? String(state.blue) : '';
}

function updateGemWarning(): void {
  if (!elements.gemWarning) return;
  elements.gemWarning.style.display = state.hasSocketedItems ? 'block' : 'none';
}

function updateSubtitle(): void {
  if (!elements.subtitle) return;
  const text = state.lastHeaderSubtitle?.trim();
  elements.subtitle.textContent = text ? `Last item: ${text}` : '';
}

function showError(message: string | null): void {
  if (!elements.errorBanner) return;
  if (!message) {
    elements.errorBanner.style.display = 'none';
    elements.errorBanner.textContent = '';
    return;
  }
  elements.errorBanner.style.display = 'block';
  elements.errorBanner.textContent = message;
}

function updateOutputs(): void {
  updateGemWarning();
  updateSubtitle();

  const totalColors = state.red + state.green + state.blue;
  
  if (state.sockets === 0 || totalColors === 0) {
    showError(null);
    if (elements.probSummary) elements.probSummary.textContent = 'Chance: N/A';
    if (elements.probDetails) elements.probDetails.textContent = 'Enter socket count and desired colors.';
    if (elements.craftTable) elements.craftTable.innerHTML = '';
    return;
  }
  
  if (totalColors !== state.sockets) {
    showError(`Color sum (${totalColors}) must match total sockets (${state.sockets}).`);
    if (elements.probSummary) elements.probSummary.textContent = 'Chance: N/A';
    if (elements.craftTable) elements.craftTable.innerHTML = '';
    return;
  }

  showError(null);
  
  const probs = colorProbabilities();
  const chance = combinationProbability(state.red, state.green, state.blue, probs, state.sockets);
  
  if (elements.probDetails) {
    elements.probDetails.textContent = `Per-socket weights → R ${formatPercent(probs.red)}, G ${formatPercent(probs.green)}, B ${formatPercent(probs.blue)}`;
  }
  
  if (elements.probSummary) {
    if (chance > 0) {
      elements.probSummary.textContent = `Success Chance: ${formatPercent(chance)}`;
    } else {
      elements.probSummary.textContent = 'Chance: 0% (Impossible)';
    }
  }
  
  // Calculate and display craft methods
  const methods = calculateVoriciCosts(state.sockets, state.red, state.green, state.blue, probs);
  methods.sort((a, b) => a.avgCost - b.avgCost);
  
  // Calculate Jeweller's Method
  const jewellerMethods = calculateJewellerMethod(state.sockets, state.red, state.green, state.blue, probs);
  
  if (elements.craftTable) {
    let html = '';
    
    // Vorici/Chromatic methods table
    if (methods.length > 0) {
      html += `
        <div>
          <div style="font-size:12px; font-weight:600; margin-bottom:6px;">Vorici Bench & Chromatic Methods</div>
          <table style="width:100%; border-collapse:collapse; font-size:11px;">
            <thead>
              <tr style="background:var(--bg-tertiary); text-align:left;">
                <th style="padding:4px 6px; border:1px solid var(--border-color);">Craft Type</th>
                <th style="padding:4px 6px; border:1px solid var(--border-color); text-align:right;">Avg Cost<br><span style="font-size:9px; font-weight:normal;">(in chromatics)</span></th>
                <th style="padding:4px 6px; border:1px solid var(--border-color); text-align:right;">Success<br>Chance</th>
                <th style="padding:4px 6px; border:1px solid var(--border-color); text-align:right;">Avg Attempts<br><span style="font-size:9px; font-weight:normal;">(mean)</span></th>
                <th style="padding:4px 6px; border:1px solid var(--border-color); text-align:right;">Cost per<br>Try</th>
                <th style="padding:4px 6px; border:1px solid var(--border-color); text-align:right;">Std.<br>Deviation</th>
              </tr>
            </thead>
            <tbody>
              ${methods.map((method, idx) => `
                <tr style="background:${idx === 0 ? 'rgba(76,175,80,0.15)' : 'transparent'}; ${idx === 0 ? 'font-weight:600;' : ''}">
                  <td style="padding:4px 6px; border:1px solid var(--border-color);">${method.name}</td>
                  <td style="padding:4px 6px; border:1px solid var(--border-color); text-align:right;">${formatNumber(method.avgCost)}</td>
                  <td style="padding:4px 6px; border:1px solid var(--border-color); text-align:right;">${formatPercent(method.chance)}</td>
                  <td style="padding:4px 6px; border:1px solid var(--border-color); text-align:right;">${formatNumber(method.avgAttempts)}</td>
                  <td style="padding:4px 6px; border:1px solid var(--border-color); text-align:right;">${method.costPerTry}</td>
                  <td style="padding:4px 6px; border:1px solid var(--border-color); text-align:right;">${formatNumber(method.stdDev)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div style="font-size:10px; color:var(--text-muted); margin-top:6px;">
            Note: Chromatic orbs cannot reroll the same color permutation twice, so the chromatic success chance is always higher than the drop rate.
          </div>
        </div>
      `;
    }
    
    // Jeweller's Method table (if applicable)
    if (jewellerMethods.length > 0) {
      html += `
        <div style="margin-top:16px;">
          <div style="font-size:12px; font-weight:600; margin-bottom:6px;">Jeweller's Method (Socket Add/Remove)</div>
          <table style="width:100%; border-collapse:collapse; font-size:11px;">
            <thead>
              <tr style="background:var(--bg-tertiary); text-align:left;">
                <th style="padding:4px 6px; border:1px solid var(--border-color);">Method</th>
                <th style="padding:4px 6px; border:1px solid var(--border-color); text-align:right;">Chromatic Cost<br><span style="font-size:9px; font-weight:normal;">(starting sockets)</span></th>
                <th style="padding:4px 6px; border:1px solid var(--border-color); text-align:right;">Jeweller Cost<br><span style="font-size:9px; font-weight:normal;">(add/remove)</span></th>
                <th style="padding:4px 6px; border:1px solid var(--border-color); text-align:right;">Total Cost</th>
              </tr>
            </thead>
            <tbody>
              ${jewellerMethods.map((method, idx) => `
                <tr style="background:${idx === 0 ? 'rgba(255,193,7,0.15)' : 'transparent'}; ${idx === 0 ? 'font-weight:600;' : ''}">
                  <td style="padding:4px 6px; border:1px solid var(--border-color);">${method.description}</td>
                  <td style="padding:4px 6px; border:1px solid var(--border-color); text-align:right;">${formatNumber(method.chromaticCost)}</td>
                  <td style="padding:4px 6px; border:1px solid var(--border-color); text-align:right;">${formatNumber(method.jewellerCost)}</td>
                  <td style="padding:4px 6px; border:1px solid var(--border-color); text-align:right;">${method.totalCostDescription}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div style="font-size:10px; color:var(--text-muted); margin-top:6px;">
            Start with correct colors on sockets (via chromatics), then use bench to add/remove one socket at a time.
          </div>
          <div style="font-size:10px; color:var(--accent-orange); margin-top:4px; font-style:italic;">
            ⚠ Jeweller's Method calculations are still being refined and may not be fully accurate yet.
          </div>
        </div>
      `;
    }
    
    // Credit footer
    html += `
      <div style="font-size:11px; color:var(--text-secondary); margin-top:12px; padding-top:8px; border-top:1px solid var(--border-color); text-align:center;">
        All Vorici calculations by <a href="#" onclick="window.electronAPI?.openExternal?.('https://siveran.github.io/calc.html'); return false;" style="color:var(--accent-blue); text-decoration:underline; cursor:pointer;">Siveran</a>
      </div>
    `;
    
    elements.craftTable.innerHTML = html;
  }
}

function normalizeRequirements(raw: any): { str: number; dex: number; int: number } {
  if (!raw) return { str: 0, dex: 0, int: 0 };
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return {
      str: toPositiveInt(raw.str ?? raw.Str ?? raw.strength),
      dex: toPositiveInt(raw.dex ?? raw.Dex ?? raw.dexterity),
      int: toPositiveInt(raw.int ?? raw.Int ?? raw.intelligence)
    };
  }

  if (Array.isArray(raw)) {
    const result = { str: 0, dex: 0, int: 0 };
    raw.forEach((entry) => {
      if (!entry) return;
      const name = String(entry.name || entry.stat || entry.label || '').toLowerCase();
      let valueRaw: unknown = entry.value;
      if (valueRaw == null && Array.isArray(entry.values) && entry.values.length > 0) {
        valueRaw = entry.values[0]?.[0];
      }
      const numeric = toPositiveInt(valueRaw);
      if (name.includes('str')) result.str = numeric;
      if (name.includes('dex')) result.dex = numeric;
      if (name.includes('int')) result.int = numeric;
    });
    return result;
  }

  return { str: 0, dex: 0, int: 0 };
}

function extractSockets(payload: any, item: any): { red: number; green: number; blue: number } {
  const counts = { red: 0, green: 0, blue: 0 };
  
  const fromPayload = payload?.socketsPoe1 ?? item?.socketsPoe1;
  if (Array.isArray(fromPayload) && fromPayload.length > 0) {
    fromPayload.forEach((group) => {
      if (typeof group === 'string') {
        const color = group.charAt(0).toUpperCase();
        if (color === 'R') counts.red++;
        else if (color === 'G') counts.green++;
        else if (color === 'B') counts.blue++;
      } else if (Array.isArray(group)) {
        group.forEach((socket) => {
          if (typeof socket === 'string') {
            const color = socket.charAt(0).toUpperCase();
            if (color === 'R') counts.red++;
            else if (color === 'G') counts.green++;
            else if (color === 'B') counts.blue++;
          }
        });
      }
    });
    return counts;
  }

  const sockets = payload?.sockets ?? item?.sockets;
  if (Array.isArray(sockets) && sockets.length > 0) {
    sockets.forEach((socket) => {
      let color = '';
      if (typeof socket === 'string') {
        color = socket.charAt(0).toUpperCase();
      } else {
        const colorRaw = socket?.sColour ?? socket?.colour ?? socket?.color ?? socket?.attr;
        color = typeof colorRaw === 'string' ? colorRaw.charAt(0).toUpperCase() : '';
      }
      if (color === 'R') counts.red++;
      else if (color === 'G') counts.green++;
      else if (color === 'B') counts.blue++;
    });
  }

  return counts;
}

function extractQuality(payload: any, item: any): number {
  const rawQuality = payload?.quality ?? item?.quality;
  if (rawQuality == null) return 0;
  if (typeof rawQuality === 'object') {
    const value = rawQuality.value ?? rawQuality.normal ?? rawQuality.base ?? rawQuality.total ?? rawQuality.augmented;
    return clamp(toPositiveInt(value), 0, 300);
  }
  return clamp(toPositiveInt(rawQuality), 0, 300);
}

function extractSocketedItems(payload: any, item: any): any[] {
  const direct = Array.isArray(payload?.socketedItems) ? payload.socketedItems : undefined;
  if (direct) return direct;
  const fromItem = Array.isArray(item?.socketedItems) ? item.socketedItems : undefined;
  if (fromItem) return fromItem;
  const fromSockets = Array.isArray(item?.sockets) ? item.sockets.flatMap((socket: any) => socket?.socketedItem ? [socket.socketedItem] : []) : [];
  return fromSockets;
}

function extractItemLabel(item: any): string {
  const name = typeof item?.name === 'string' ? item.name.trim() : '';
  const baseType = typeof item?.baseType === 'string' ? item.baseType.trim() : '';
  if (name && name !== '<<set:MS>><<set:M>><<set:S>>') return name;
  if (baseType) return baseType;
  return '';
}

function show(): Promise<void> {
  renderPanel();
  return Promise.resolve();
}

function hide(): void {
  if (elements.root) {
    elements.root.style.display = 'none';
  }
}

function reset(): void {
  Object.assign(state, DEFAULT_STATE);
  syncInputs();
  updateOutputs();
}

function applyItem(payload: any): void {
  const item = payload?.item ?? payload;
  if (!item || typeof item !== 'object') return;

  const requirements = normalizeRequirements(payload?.requirements ?? item.requirements);
  const quality = extractQuality(payload, item);
  const socketedItems = extractSocketedItems(payload, item);
  const socketCounts = extractSockets(payload, item);

  state.str = requirements.str;
  state.dex = requirements.dex;
  state.int = requirements.int;
  state.quality = quality;
  state.hasSocketedItems = socketedItems.length > 0;
  state.lastHeaderSubtitle = extractItemLabel(item);

  state.red = socketCounts.red;
  state.green = socketCounts.green;
  state.blue = socketCounts.blue;
  state.sockets = socketCounts.red + socketCounts.green + socketCounts.blue;

  syncInputs();
  updateOutputs();
}

export {
  show,
  hide,
  reset,
  applyItem};
