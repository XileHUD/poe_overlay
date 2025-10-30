interface LevelingStep {
  id: string;
  type: string;
  zone: string;
  zoneId?: string; // Unique zone identifier for grouping
  description: string;
  hint?: string;
  layoutTip?: string; // Detailed zone navigation tips
  quest?: string;
  reward?: string;
  recommendedLevel?: number | null;
  optionalNote?: string;
  checkable: boolean;
  checked?: boolean;
}

interface GroupedStep {
  zone: string;
  zoneId?: string; // Track zone ID for proper grouping
  steps: LevelingStep[];
  allChecked: boolean;
  layoutTip?: string; // Use first step's layout tip
}

interface LevelingAct {
  actNumber: number;
  actName: string;
  recommendedEndLevel?: number;
  steps: LevelingStep[];
}

interface LevelingData {
  acts: LevelingAct[];
  stepTypes: Record<string, {
    icon: string;
    color: string;
    label: string;
  }>;
}

interface LevelingSettings {
  visibleSteps: number;
  clientLogPath: string;
  autoDetectZones: boolean;
  showHints: boolean;
  showOptional: boolean;
}

const DEFAULT_SETTINGS: LevelingSettings = {
  visibleSteps: 3,
  clientLogPath: '',
  autoDetectZones: true,
  showHints: true,
  showOptional: true
};

let levelingData: LevelingData | null = null;
let settings: LevelingSettings = { ...DEFAULT_SETTINGS };
let currentStepIndex = 0;
let showAllSteps = false; // When true, show checked tasks (e.g., when clicking back)
let layoutMode: 'tall' | 'wide' = 'tall'; // Layout mode for the window
let completedSteps: Set<string> = new Set();
let currentZoneId: string | null = null;
let isLocked = false;
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

const elements: {
  root: HTMLElement | null;
  container: HTMLElement | null;
  header: HTMLElement | null;
  headerTitle: HTMLElement | null;
  headerSubtitle: HTMLElement | null;
  stepsContainer: HTMLElement | null;
  controls: HTMLElement | null;
  settingsPanel: HTMLElement | null;
  mapLayoutButton: HTMLElement | null;
  mapLayoutPanel: HTMLElement | null;
  progressBar: HTMLElement | null;
  progressFill: HTMLElement | null;
  progressText: HTMLElement | null;
} = {
  root: null,
  container: null,
  header: null,
  headerTitle: null,
  headerSubtitle: null,
  stepsContainer: null,
  controls: null,
  settingsPanel: null,
  mapLayoutButton: null,
  mapLayoutPanel: null,
  progressBar: null,
  progressFill: null,
  progressText: null
};

const ICON_MAP: Record<string, string> = {
  'arrow-right': '➜',
  'waypoint': '⚑',
  'home': '🏛',
  'chat': '💬',
  'exclamation': '❗',
  'skull': '☠',
  'lab': '⚗',
  'star': '★',
  'info': 'ℹ'
};

async function loadLevelingData(): Promise<void> {
  try {
    // In Electron, we can use require or read from the app resources
    // For now, embed the data directly since it's not being copied by build
    const response = await fetch('../../data/poe1/Leveling/leveling-data-v2.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    levelingData = await response.json();
    console.log('[Leveling] Data loaded successfully:', levelingData);
  } catch (err) {
    console.error('Failed to load leveling data:', err);
    // Fallback: embed data inline for now
    levelingData = getEmbeddedLevelingData();
  }
}

function getEmbeddedLevelingData(): LevelingData {
  // Temporary: embed Act 1 data inline until we fix the build process
  return {
    acts: [
      {
        actNumber: 1,
        actName: "The Awakening",
        recommendedEndLevel: 12,
        steps: [
          { id: "a1_s1", type: "kill_boss", zone: "The Twilight Strand", description: "Kill Hillock", hint: "Guaranteed Level 2", layoutTip: "Walk East/North-East along the coastline. Hillock is always at the far East end. Ignore all enemies - only grab weapon, skill gem, and support gem.", checkable: true },
          { id: "a1_s2", type: "town", zone: "Lioneye's Watch", description: "Enter Lioneye's Watch", checkable: true },
          { id: "a1_s3", type: "npc_quest", zone: "Lioneye's Watch", description: "Talk to Tarkleigh", quest: "Enemy at the Gate", reward: "Level 1 Skill Gem", checkable: true },
          { id: "a1_s4", type: "navigation", zone: "The Coast", description: "Enter The Coast", layoutTip: "Waypoints and exits must be on water level. Walk East/North-East to identify layout direction. Follow coast and layer down for each layer up (ledge/slope).", checkable: true },
          { id: "a1_s5", type: "waypoint", zone: "The Coast", description: "Activate Waypoint", layoutTip: "Click corpses along your path for loot. Ignore enemies unless blocking progress.", checkable: true },
          { id: "a1_s6", type: "navigation", zone: "The Coast", description: "Rush to Mud Flats", hint: "Skip enemies - Level 4 from later zones", checkable: true },
          { id: "a1_s7", type: "quest", zone: "The Mud Flats", description: "Find 3 Glyphs in water streams", hint: "Streams form triangle or line", checkable: true },
          { id: "a1_s8", type: "navigation", zone: "The Mud Flats", description: "Enter Submerged Passage", checkable: true },
          { id: "a1_s9", type: "optional", zone: "The Coast", description: "[LEAGUE START] Waypoint to Coast", optionalNote: "Skip if not league start", checkable: true },
          { id: "a1_s10", type: "optional", zone: "The Tidal Island", description: "[LEAGUE START] Enter Tidal Island", layoutTip: "Go left. If facing ledge, turn around and go right/East to reach Hailrake.", checkable: true },
          { id: "a1_s11", type: "kill_boss", zone: "The Tidal Island", description: "Kill Hailrake, get Medicine Chest", hint: "Quicksilver Flask reward", recommendedLevel: 4, checkable: true },
          { id: "a1_s12", type: "town", zone: "Lioneye's Watch", description: "[LEAGUE START] Return to town", checkable: true },
          { id: "a1_s13", type: "npc_quest", zone: "Lioneye's Watch", description: "[LEAGUE START] Turn in quests", quest: "Breaking Eggs & Mercy Mission", reward: "Quicksilver Flask + Gems", checkable: true },
          { id: "a1_s14", type: "navigation", zone: "Submerged Passage", description: "Find bridge, place Portal", hint: "Or find Flooded Depths first", layoutTip: "Follow zone. When you see bridge or Flooded Depths entrance on minimap, place portal.", checkable: true },
          { id: "a1_s15", type: "navigation", zone: "The Ledge", description: "Cross bridge to Ledge", checkable: true },
          { id: "a1_s16", type: "navigation", zone: "The Ledge", description: "Navigate to The Climb", hint: "Follow cliff wall", layoutTip: "Stick to mountain wall until past goat passage, then stick to water wall to avoid Kuduku the False God's AoE explosions.", checkable: true },
          { id: "a1_s17", type: "navigation", zone: "The Climb", description: "Enter Lower Prison", layoutTip: "Follow West edge from entrance.", checkable: true },
          { id: "a1_s18", type: "waypoint", zone: "The Lower Prison", description: "Activate Waypoint", checkable: true },
          { id: "a1_s19", type: "town", zone: "Lioneye's Watch", description: "Portal to town", checkable: true },
          { id: "a1_s20", type: "navigation", zone: "Submerged Passage", description: "Take Portal back", checkable: true },
          { id: "a1_s21", type: "navigation", zone: "The Flooded Depths", description: "Enter Flooded Depths", hint: "Usually 6 or 1 o'clock before bridge", checkable: true },
          { id: "a1_s22", type: "kill_boss", zone: "The Flooded Depths", description: "Kill Deep Dweller", hint: "Search diagonally opposite entrance", checkable: true },
          { id: "a1_s23", type: "town", zone: "Lioneye's Watch", description: "Return to town", checkable: true },
          { id: "a1_s24", type: "passive", zone: "Lioneye's Watch", description: "Talk to Tarkleigh", quest: "The Dweller of the Deep", reward: "⭐ PASSIVE POINT", checkable: true },
          { id: "a1_s26", type: "waypoint", zone: "The Lower Prison", description: "Waypoint to Lower Prison", checkable: true },
          { id: "a1_s27", type: "trial", zone: "The Lower Prison", description: "Complete Trial of Ascendancy", hint: "Usually at 1 o'clock", checkable: true },
          { id: "a1_s28", type: "navigation", zone: "The Upper Prison", description: "Enter Upper Prison", layoutTip: "Check North-East first. If dead end, turn around. Follow outer wall - not guaranteed fastest but leads to exit.", checkable: true },
          { id: "a1_s29", type: "optional", zone: "The Upper Prison", description: "Optional: Find Chemist's Strongbox", hint: "Quicksilver Flask chance", checkable: true },
          { id: "a1_s30", type: "kill_boss", zone: "The Upper Prison", description: "Kill Brutus", recommendedLevel: 10, hint: "Aim for Level 8-10", checkable: true },
          { id: "a1_s31", type: "town", zone: "Lioneye's Watch", description: "Return to town", checkable: true },
          // Move Nessa's Level 8 Support Gems hand-in to AFTER Brutus is killed and you return to town
          { id: "a1_s25", type: "npc_quest", zone: "Lioneye's Watch", description: "Talk to Nessa", quest: "The Caged Brute", reward: "Level 8 Support Gems", checkable: true },
          { id: "a1_s32", type: "npc_quest", zone: "Lioneye's Watch", description: "Talk to Tarkleigh", quest: "The Caged Brute", reward: "Movement Skills", checkable: true },
          { id: "a1_s33", type: "waypoint", zone: "Prisoner's Gate", description: "Waypoint to Prisoner's Gate", checkable: true },
          { id: "a1_s34", type: "navigation", zone: "Prisoner's Gate", description: "Navigate to Ship Graveyard", layoutTip: "Exit is always on lower layer than entrance. Correct path has several slopes/ledges down. Find ledge side, follow downward slopes.", checkable: true },
          { id: "a1_s35", type: "navigation", zone: "The Ship Graveyard", description: "Find Ship Graveyard Cave", hint: "Place Portal here", layoutTip: "Follow cliff side. If you find Ship Graveyard Cave first, portal and search for Cavern of Wrath. Vice versa if you find Cavern first.", checkable: true },
          { id: "a1_s36", type: "navigation", zone: "The Ship Graveyard", description: "Find Cavern of Wrath", checkable: true },
          { id: "a1_s37", type: "waypoint", zone: "Cavern of Wrath", description: "Activate Waypoint", checkable: true },
          { id: "a1_s38", type: "town", zone: "Lioneye's Watch", description: "Portal to town", checkable: true },
          { id: "a1_s39", type: "npc_quest", zone: "Lioneye's Watch", description: "Talk to Nessa", quest: "The Siren's Cadence", reward: "Level 12 Skill Gems", checkable: true },
          { id: "a1_s40", type: "navigation", zone: "The Ship Graveyard", description: "Take Portal back", checkable: true },
          { id: "a1_s41", type: "navigation", zone: "Ship Graveyard Cave", description: "Enter Ship Graveyard Cave", layoutTip: "Allflame and Exit to Fairgraves are in diagonal line from entrance. Follow diagonal while navigating zig-zag cave system.", checkable: true },
          { id: "a1_s42", type: "quest", zone: "Ship Graveyard Cave", description: "Find Allflame (NPC)", hint: "Diagonally opposite entrance", checkable: true },
          { id: "a1_s43", type: "navigation", zone: "The Ship Graveyard", description: "Exit to Ship Graveyard", checkable: true },
          { id: "a1_s44", type: "kill_boss", zone: "The Ship Graveyard", description: "Kill Fairgraves", checkable: true },
          { id: "a1_s45", type: "town", zone: "Lioneye's Watch", description: "Return to town", checkable: true },
          { id: "a1_s46", type: "passive", zone: "Lioneye's Watch", description: "Talk to Bestel", quest: "The Marooned Mariner", reward: "⭐ PASSIVE POINT", checkable: true },
          { id: "a1_s47", type: "optional", zone: "Lioneye's Watch", description: "Get remaining Act 1 gems", hint: "Or revisit in Act 2", checkable: true },
          { id: "a1_s48", type: "waypoint", zone: "Cavern of Wrath", description: "Waypoint to Cavern of Wrath", layoutTip: "2 variants - determined by water flow direction. Follow river in direction water flows.", checkable: true },
          { id: "a1_s49", type: "navigation", zone: "Cavern of Anger", description: "Navigate to Cavern of Anger", layoutTip: "2 variants - check upper bridge at start. Dead end = North variant (go NE along river/West edge). Otherwise East variant (go East along river).", checkable: true },
          { id: "a1_s50", type: "navigation", zone: "Cavern of Anger", description: "Find Merveil's Lair", hint: "Exit always North-East corner", checkable: true },
          { id: "a1_s51", type: "kill_boss", zone: "Merveil's Lair", description: "Kill Merveil (Final Boss)", recommendedLevel: 12, hint: "Aim for Level 11.5-12", checkable: true },
          { id: "a1_s52", type: "navigation", zone: "The Southern Forest", description: "Enter Southern Forest (Act 2)", checkable: true }
        ]
      }
    ],
    stepTypes: {
      navigation: { icon: "arrow-right", color: "#E0E0E0", label: "Navigate" },
      waypoint: { icon: "waypoint", color: "#00D4FF", label: "Waypoint" },
      town: { icon: "home", color: "#FEC076", label: "Town" },
      npc_quest: { icon: "chat", color: "#FFB84D", label: "Quest Turn-in" },
      quest: { icon: "exclamation", color: "#FFEB3B", label: "Quest Objective" },
      kill_boss: { icon: "skull", color: "#FF5252", label: "Boss Fight" },
      trial: { icon: "lab", color: "#4ADE80", label: "Labyrinth Trial" },
      passive: { icon: "star", color: "#4ADE80", label: "Passive Point" },
      optional: { icon: "info", color: "#9E9E9E", label: "Optional" }
    }
  };
}

function getAllSteps(): LevelingStep[] {
  if (!levelingData) return [];
  
  const steps: LevelingStep[] = [];
  for (const act of levelingData.acts) {
    for (const step of act.steps) {
      // Filter optional steps based on settings
      if (!settings.showOptional && step.type === 'optional') {
        continue;
      }
      steps.push({
        ...step,
        checked: completedSteps.has(step.id)
      });
    }
  }
  return steps;
}

function groupStepsByZone(steps: LevelingStep[]): GroupedStep[] {
  const grouped: GroupedStep[] = [];
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    
    // Check if this step can be grouped with previous
    if (grouped.length > 0) {
      const lastGroup = grouped[grouped.length - 1];
      
      // Group if same zone ID (or fall back to zone name if no ID)
      const sameZone = step.zoneId && lastGroup.zoneId 
        ? lastGroup.zoneId === step.zoneId
        : lastGroup.zone === step.zone;
      
      if (sameZone) {
        // Add to existing group
        lastGroup.steps.push(step);
        lastGroup.allChecked = lastGroup.steps.every(s => s.checked);
        // Update layoutTip to use the first non-empty one
        if (!lastGroup.layoutTip && step.layoutTip) {
          lastGroup.layoutTip = step.layoutTip;
        }
        continue;
      }
    }
    
    // Create new group
    grouped.push({
      zone: step.zone,
      zoneId: step.zoneId,
      steps: [step],
      allChecked: step.checked || false,
      layoutTip: step.layoutTip
    });
  }
  
  return grouped;
}

function getCurrentSteps(): LevelingStep[] {
  const allSteps = getAllSteps();
  
  if (showAllSteps) {
    // Show all steps around currentStepIndex (including checked)
    const visibleCount = settings.visibleSteps;
    const startIdx = Math.max(0, currentStepIndex);
    const endIdx = Math.min(allSteps.length, startIdx + visibleCount);
    return allSteps.slice(startIdx, endIdx);
  } else {
    // Hide checked steps - only show unchecked steps
    const uncheckedSteps = allSteps.filter(s => !s.checked);
    const visibleCount = settings.visibleSteps;
    
    // Find currentStepIndex in unchecked steps
    const currentUncheckedIdx = Math.max(0, Math.min(uncheckedSteps.length - 1, currentStepIndex));
    const endIdx = Math.min(uncheckedSteps.length, currentUncheckedIdx + visibleCount);
    
    return uncheckedSteps.slice(currentUncheckedIdx, endIdx);
  }
}

function createStepElement(step: LevelingStep, index: number): HTMLElement {
  const stepEl = document.createElement('div');
  const isCurrent = index === 0;
  const isHighPriority = ['passive', 'trial', 'kill_boss'].includes(step.type);
  
  // Determine background and border based on type
  let bgColor = 'rgba(255, 255, 255, 0.03)';
  let borderColor = getStepColor(step.type);
  
  if (isCurrent) {
    bgColor = isHighPriority 
      ? 'rgba(254, 192, 118, 0.12)' 
      : 'rgba(255, 255, 255, 0.08)';
  }
  
  const opacity = isCurrent ? 1 : Math.max(0.4, 1 - (index * 0.2));
  
  stepEl.className = 'leveling-step';
  stepEl.style.cssText = `
    display: flex;
    gap: 10px;
    padding: ${isCurrent ? '14px 12px' : '10px 12px'};
    margin-bottom: 6px;
    background: ${bgColor};
    border-left: ${isHighPriority ? '4px' : '3px'} solid ${borderColor};
    border-radius: 6px;
    opacity: ${opacity};
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    font-size: ${isCurrent ? '13px' : '12px'};
    position: relative;
    overflow: hidden;
  `;
  
  // Add glow effect for high priority current steps
  if (isCurrent && isHighPriority) {
    stepEl.style.boxShadow = `0 0 20px rgba(${step.type === 'passive' ? '74, 222, 128' : '254, 192, 118'}, 0.3)`;
  }
  
  // Checkbox
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = step.checked || false;
  checkbox.style.cssText = `
    margin-top: 2px;
    cursor: pointer;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    accent-color: ${borderColor};
  `;
  checkbox.addEventListener('change', () => {
    toggleStepCompletion(step.id);
  });
  
  // Content wrapper
  const content = document.createElement('div');
  content.style.cssText = 'flex: 1; display: flex; flex-direction: column; gap: 6px;';
  
  // Main row: icon + description
  const mainRow = document.createElement('div');
  mainRow.style.cssText = 'display: flex; align-items: flex-start; gap: 8px;';
  
  // Icon with background
  const iconWrapper = document.createElement('div');
  iconWrapper.style.cssText = `
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: ${borderColor}22;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border: 1px solid ${borderColor}44;
  `;
  
  const icon = document.createElement('span');
  icon.textContent = getStepIcon(step.type);
  icon.style.cssText = `
    color: ${borderColor};
    font-size: 16px;
    line-height: 1;
  `;
  iconWrapper.appendChild(icon);
  
  // Description
  const descWrapper = document.createElement('div');
  descWrapper.style.cssText = 'flex: 1;';
  
  // Zone label (small, above description)
  if (step.zone && isCurrent) {
    const zoneLabel = document.createElement('div');
    zoneLabel.textContent = step.zone;
    zoneLabel.style.cssText = `
      font-size: 10px;
      color: rgba(254, 192, 118, 0.7);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    `;
    descWrapper.appendChild(zoneLabel);
  }
  
  const desc = document.createElement('div');
  desc.textContent = step.description;
  desc.style.cssText = `
    color: ${step.checked ? '#888' : (isCurrent ? '#fff' : '#ddd')};
    text-decoration: ${step.checked ? 'line-through' : 'none'};
    font-weight: ${isCurrent ? '600' : '500'};
    line-height: 1.4;
  `;
  
  descWrapper.appendChild(desc);
  mainRow.appendChild(iconWrapper);
  mainRow.appendChild(descWrapper);
  content.appendChild(mainRow);
  
  // Meta information row
  const hasMetaInfo = step.quest || step.reward || step.recommendedLevel;
  if (hasMetaInfo) {
    const metaRow = document.createElement('div');
    metaRow.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding-left: 36px;
      font-size: 11px;
    `;
    
    if (step.quest) {
      const questBadge = createBadge('📜', step.quest, '#FEC076');
      metaRow.appendChild(questBadge);
    }
    
    if (step.reward) {
      const rewardBadge = createBadge('🎁', step.reward, '#4ADE80');
      metaRow.appendChild(rewardBadge);
    }
    
    if (step.recommendedLevel) {
      const levelBadge = createBadge('Lv', String(step.recommendedLevel), '#FFD700');
      metaRow.appendChild(levelBadge);
    }
    
    content.appendChild(metaRow);
  }
  
  // Hint - show short hints inline, long hints as tooltip
  if (settings.showHints && step.hint && isCurrent) {
    const isShortHint = step.hint.length <= 40; // Short hints: 40 chars or less
    
    if (isShortHint) {
      // Show inline in italic
      const hintEl = document.createElement('div');
      hintEl.style.cssText = `
        padding: 4px 10px 4px 36px;
        font-size: 11px;
        color: #B8B8B8;
        line-height: 1.4;
        font-style: italic;
      `;
      hintEl.textContent = `💡 ${step.hint}`;
      content.appendChild(hintEl);
    } else {
      // Show as tooltip on hover
      const hintIcon = document.createElement('span');
      hintIcon.innerHTML = '💡';
      hintIcon.style.cssText = `
        position: absolute;
        top: 12px;
        right: ${step.layoutTip ? '44px' : '12px'};
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: help;
        font-size: 14px;
        opacity: 0.6;
        transition: opacity 0.2s;
        z-index: 10;
      `;
      
      const hintTooltip = document.createElement('div');
      hintTooltip.textContent = step.hint;
      hintTooltip.style.cssText = `
        position: absolute;
        top: -8px;
        right: ${step.layoutTip ? '72px' : '40px'};
        background: linear-gradient(135deg, rgba(30, 30, 40, 0.98) 0%, rgba(20, 20, 30, 0.98) 100%);
        border: 1px solid rgba(180, 180, 180, 0.5);
        border-radius: 8px;
        padding: 12px 14px;
        max-width: 280px;
        font-size: 11px;
        color: #E0E0E0;
        line-height: 1.5;
        pointer-events: none;
        opacity: 0;
        transform: translateX(10px);
        transition: opacity 0.2s, transform 0.2s;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.8);
        z-index: 1000;
        white-space: normal;
        backdrop-filter: blur(8px);
      `;
      
      hintIcon.addEventListener('mouseenter', () => {
        hintIcon.style.opacity = '1';
        hintTooltip.style.opacity = '1';
        hintTooltip.style.transform = 'translateX(0)';
      });
      
      hintIcon.addEventListener('mouseleave', () => {
        hintIcon.style.opacity = '0.6';
        hintTooltip.style.opacity = '0';
        hintTooltip.style.transform = 'translateX(10px)';
      });
      
      stepEl.appendChild(hintIcon);
      stepEl.appendChild(hintTooltip);
    }
  }
  
  // Layout tip - shows as tooltip on hover
  if (step.layoutTip) {
    const tooltipIcon = document.createElement('div');
    tooltipIcon.innerHTML = '🗺️';
    tooltipIcon.style.cssText = `
      position: absolute;
      top: 12px;
      right: 12px;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: help;
      font-size: 14px;
      opacity: 0.6;
      transition: opacity 0.2s;
      z-index: 10;
    `;
    
    // Tooltip element
    const tooltip = document.createElement('div');
    tooltip.textContent = step.layoutTip;
    tooltip.style.cssText = `
      position: absolute;
      top: -8px;
      right: 40px;
      background: linear-gradient(135deg, rgba(30, 30, 40, 0.98) 0%, rgba(20, 20, 30, 0.98) 100%);
      border: 1px solid rgba(254, 192, 118, 0.5);
      border-radius: 8px;
      padding: 12px 14px;
      max-width: 280px;
      font-size: 11px;
      color: #E0E0E0;
      line-height: 1.5;
      pointer-events: none;
      opacity: 0;
      transform: translateX(10px);
      transition: opacity 0.2s, transform 0.2s;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.8);
      z-index: 1000;
      white-space: normal;
      backdrop-filter: blur(8px);
    `;
    
    tooltipIcon.addEventListener('mouseenter', () => {
      tooltipIcon.style.opacity = '1';
      tooltip.style.opacity = '1';
      tooltip.style.transform = 'translateX(0)';
    });
    
    tooltipIcon.addEventListener('mouseleave', () => {
      tooltipIcon.style.opacity = '0.6';
      tooltip.style.opacity = '0';
      tooltip.style.transform = 'translateX(10px)';
    });
    
    stepEl.appendChild(tooltipIcon);
    stepEl.appendChild(tooltip);
  }
  
  // Optional note
  if (step.optionalNote) {
    const noteEl = document.createElement('div');
    noteEl.style.cssText = `
      padding-left: 36px;
      font-size: 10px;
      color: #888;
      font-style: italic;
    `;
    noteEl.textContent = `Note: ${step.optionalNote}`;
    content.appendChild(noteEl);
  }
  
  stepEl.appendChild(checkbox);
  stepEl.appendChild(content);
  
  return stepEl;
}

function createSingleStepWithZone(step: LevelingStep, zoneName: string, index: number): HTMLElement {
  console.log('[Leveling] Creating single step with zone:', zoneName, 'for step:', step.description);
  const stepEl = document.createElement('div');
  const isCurrent = index === 0;
  const isHighPriority = ['passive', 'trial', 'kill_boss'].includes(step.type);
  
  // Determine background and border based on type
  let bgColor = 'rgba(255, 255, 255, 0.03)';
  let borderColor = getStepColor(step.type);
  
  if (isCurrent) {
    bgColor = isHighPriority 
      ? 'rgba(254, 192, 118, 0.12)' 
      : 'rgba(255, 255, 255, 0.08)';
  }
  
  const opacity = isCurrent ? 1 : Math.max(0.4, 1 - (index * 0.2));
  
  stepEl.className = 'leveling-step';
  stepEl.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: ${isCurrent ? '12px' : '10px'};
    margin-bottom: 6px;
    background: ${bgColor};
    border-left: ${isHighPriority ? '4px' : '3px'} solid ${borderColor};
    border-radius: 6px;
    opacity: ${opacity};
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    font-size: ${isCurrent ? '13px' : '12px'};
    position: relative;
    overflow: hidden;
  `;
  
  // Add glow effect for high priority current steps
  if (isCurrent && isHighPriority) {
    stepEl.style.boxShadow = `0 0 20px rgba(${step.type === 'passive' ? '74, 222, 128' : '254, 192, 118'}, 0.3)`;
  }
  
  // Zone name header (prominent and visible)
  const zoneHeader = document.createElement('div');
  zoneHeader.style.cssText = `
    font-size: 12px;
    color: #4ADE80;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    padding: 6px 8px;
    margin-bottom: 8px;
    background: rgba(74, 222, 128, 0.12);
    border-radius: 4px;
    border-left: 3px solid #4ADE80;
  `;
  zoneHeader.textContent = `📍 ${zoneName}`;
  stepEl.appendChild(zoneHeader);
  
  // Main content row
  const contentRow = document.createElement('div');
  contentRow.style.cssText = 'display: flex; gap: 10px; align-items: flex-start;';
  
  // Checkbox
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = step.checked || false;
  checkbox.style.cssText = `
    margin-top: 2px;
    cursor: pointer;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    accent-color: ${borderColor};
  `;
  checkbox.addEventListener('change', () => {
    toggleStepCompletion(step.id);
  });
  
  // Content wrapper
  const content = document.createElement('div');
  content.style.cssText = 'flex: 1; display: flex; flex-direction: column; gap: 6px;';
  
  // Main row: icon + description
  const mainRow = document.createElement('div');
  mainRow.style.cssText = 'display: flex; align-items: flex-start; gap: 8px;';
  
  // Icon with background
  const iconWrapper = document.createElement('div');
  iconWrapper.style.cssText = `
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: ${borderColor}22;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border: 1px solid ${borderColor}44;
  `;
  
  const icon = document.createElement('span');
  icon.textContent = getStepIcon(step.type);
  icon.style.cssText = `
    color: ${borderColor};
    font-size: 16px;
    line-height: 1;
  `;
  iconWrapper.appendChild(icon);
  
  // Description
  const desc = document.createElement('div');
  desc.textContent = step.description;
  desc.style.cssText = `
    color: ${step.checked ? '#888' : (isCurrent ? '#fff' : '#ddd')};
    text-decoration: ${step.checked ? 'line-through' : 'none'};
    font-weight: ${isCurrent ? '600' : '500'};
    line-height: 1.4;
    flex: 1;
  `;
  
  mainRow.appendChild(iconWrapper);
  mainRow.appendChild(desc);
  content.appendChild(mainRow);
  
  // Meta information row
  const hasMetaInfo = step.quest || step.reward || step.recommendedLevel;
  if (hasMetaInfo) {
    const metaRow = document.createElement('div');
    metaRow.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding-left: 36px;
      font-size: 11px;
    `;
    
    if (step.quest) {
      const questBadge = createBadge('📜', step.quest, '#FEC076');
      metaRow.appendChild(questBadge);
    }
    
    if (step.reward) {
      const rewardBadge = createBadge('🎁', step.reward, '#4ADE80');
      metaRow.appendChild(rewardBadge);
    }
    
    if (step.recommendedLevel) {
      const levelBadge = createBadge('Lv', String(step.recommendedLevel), '#FFD700');
      metaRow.appendChild(levelBadge);
    }
    
    content.appendChild(metaRow);
  }
  
  // Hint - show short hints inline, long hints as tooltip
  if (settings.showHints && step.hint && isCurrent) {
    const isShortHint = step.hint.length <= 40;
    
    if (isShortHint) {
      const hintEl = document.createElement('div');
      hintEl.style.cssText = `
        padding: 4px 10px 4px 36px;
        font-size: 11px;
        color: #B8B8B8;
        line-height: 1.4;
        font-style: italic;
      `;
      hintEl.textContent = `💡 ${step.hint}`;
      content.appendChild(hintEl);
    } else {
      const hintIcon = document.createElement('span');
      hintIcon.innerHTML = '💡';
      hintIcon.style.cssText = `
        position: absolute;
        top: 12px;
        right: ${step.layoutTip ? '44px' : '12px'};
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: help;
        font-size: 14px;
        opacity: 0.6;
        transition: opacity 0.2s;
        z-index: 10;
      `;
      
      const hintTooltip = document.createElement('div');
      hintTooltip.textContent = step.hint;
      hintTooltip.style.cssText = `
        position: absolute;
        top: -8px;
        right: ${step.layoutTip ? '72px' : '40px'};
        background: linear-gradient(135deg, rgba(30, 30, 40, 0.98) 0%, rgba(20, 20, 30, 0.98) 100%);
        border: 1px solid rgba(180, 180, 180, 0.5);
        border-radius: 8px;
        padding: 12px 14px;
        max-width: 280px;
        font-size: 11px;
        color: #E0E0E0;
        line-height: 1.5;
        pointer-events: none;
        opacity: 0;
        transform: translateX(10px);
        transition: opacity 0.2s, transform 0.2s;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.8);
        z-index: 1000;
        white-space: normal;
        backdrop-filter: blur(8px);
      `;
      
      hintIcon.addEventListener('mouseenter', () => {
        hintIcon.style.opacity = '1';
        hintTooltip.style.opacity = '1';
        hintTooltip.style.transform = 'translateX(0)';
      });
      
      hintIcon.addEventListener('mouseleave', () => {
        hintIcon.style.opacity = '0.6';
        hintTooltip.style.opacity = '0';
        hintTooltip.style.transform = 'translateX(10px)';
      });
      
      stepEl.appendChild(hintIcon);
      stepEl.appendChild(hintTooltip);
    }
  }
  
  // Layout tip
  if (step.layoutTip) {
    const tooltipIcon = document.createElement('div');
    tooltipIcon.innerHTML = '🗺️';
    tooltipIcon.style.cssText = `
      position: absolute;
      top: 12px;
      right: 12px;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: help;
      font-size: 14px;
      opacity: 0.6;
      transition: opacity 0.2s;
      z-index: 10;
    `;
    
    const tooltip = document.createElement('div');
    tooltip.textContent = step.layoutTip;
    tooltip.style.cssText = `
      position: absolute;
      top: -8px;
      right: 40px;
      background: linear-gradient(135deg, rgba(30, 30, 40, 0.98) 0%, rgba(20, 20, 30, 0.98) 100%);
      border: 1px solid rgba(254, 192, 118, 0.5);
      border-radius: 8px;
      padding: 12px 14px;
      max-width: 280px;
      font-size: 11px;
      color: #E0E0E0;
      line-height: 1.5;
      pointer-events: none;
      opacity: 0;
      transform: translateX(10px);
      transition: opacity 0.2s, transform 0.2s;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.8);
      z-index: 1000;
      white-space: normal;
      backdrop-filter: blur(8px);
    `;
    
    tooltipIcon.addEventListener('mouseenter', () => {
      tooltipIcon.style.opacity = '1';
      tooltip.style.opacity = '1';
      tooltip.style.transform = 'translateX(0)';
    });
    
    tooltipIcon.addEventListener('mouseleave', () => {
      tooltipIcon.style.opacity = '0.6';
      tooltip.style.opacity = '0';
      tooltip.style.transform = 'translateX(10px)';
    });
    
    stepEl.appendChild(tooltipIcon);
    stepEl.appendChild(tooltip);
  }
  
  // Optional note
  if (step.optionalNote) {
    const noteEl = document.createElement('div');
    noteEl.style.cssText = `
      padding-left: 36px;
      font-size: 10px;
      color: #888;
      font-style: italic;
    `;
    noteEl.textContent = `Note: ${step.optionalNote}`;
    content.appendChild(noteEl);
  }
  
  contentRow.appendChild(checkbox);
  contentRow.appendChild(content);
  stepEl.appendChild(contentRow);
  
  return stepEl;
}

function createGroupedStepElement(group: GroupedStep, index: number): HTMLElement {
  const isCurrent = index === 0;
  const borderColor = '#4ADE80'; // Green for zone groups
  
  const groupEl = document.createElement('div');
  groupEl.className = 'leveling-group';
  groupEl.style.cssText = `
    display: flex;
    flex-direction: column;
    padding: ${isCurrent ? '14px 12px' : '10px 12px'};
    margin-bottom: 6px;
    background: ${isCurrent ? 'rgba(74, 222, 128, 0.08)' : 'rgba(255, 255, 255, 0.03)'};
    border-left: 3px solid ${borderColor};
    border-radius: 6px;
    opacity: ${isCurrent ? 1 : Math.max(0.4, 1 - (index * 0.2))};
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    font-size: ${isCurrent ? '13px' : '12px'};
    position: relative;
    overflow: hidden;
  `;
  
  // Zone header
  const zoneHeader = document.createElement('div');
  zoneHeader.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(74, 222, 128, 0.2);
  `;
  
  // Master checkbox for entire zone
  const masterCheckbox = document.createElement('input');
  masterCheckbox.type = 'checkbox';
  masterCheckbox.checked = group.allChecked;
  masterCheckbox.style.cssText = `
    cursor: pointer;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    accent-color: ${borderColor};
  `;
  masterCheckbox.addEventListener('change', () => {
    // Toggle all steps in group
    group.steps.forEach(step => {
      if (masterCheckbox.checked) {
        completedSteps.add(step.id);
      } else {
        completedSteps.delete(step.id);
      }
    });
    saveProgress();
    renderSteps();
    updateProgressBar();
  });
  
  const zoneName = document.createElement('div');
  zoneName.style.cssText = `
    font-weight: 700;
    color: ${borderColor};
    font-size: 14px;
    flex: 1;
  `;
  // Show task count for multi-step zones, just zone name for single-step
  zoneName.textContent = group.steps.length > 1 
    ? `📍 ${group.zone} (${group.steps.length} tasks)` 
    : `📍 ${group.zone}`;
  
  zoneHeader.appendChild(masterCheckbox);
  zoneHeader.appendChild(zoneName);
  
  // Layout tip icon if available
  if (group.layoutTip) {
    const tooltipIcon = document.createElement('div');
    tooltipIcon.innerHTML = '🗺️';
    tooltipIcon.style.cssText = `
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: help;
      font-size: 14px;
      opacity: 0.6;
      transition: opacity 0.2s;
    `;
    
    const tooltip = document.createElement('div');
    tooltip.textContent = group.layoutTip;
    tooltip.style.cssText = `
      position: absolute;
      top: 8px;
      right: 40px;
      background: linear-gradient(135deg, rgba(30, 30, 40, 0.98) 0%, rgba(20, 20, 30, 0.98) 100%);
      border: 1px solid rgba(254, 192, 118, 0.5);
      border-radius: 8px;
      padding: 12px 14px;
      max-width: 280px;
      font-size: 11px;
      color: #E0E0E0;
      line-height: 1.5;
      pointer-events: none;
      opacity: 0;
      transform: translateX(10px);
      transition: opacity 0.2s, transform 0.2s;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.8);
      z-index: 1000;
      white-space: normal;
      backdrop-filter: blur(8px);
    `;
    
    tooltipIcon.addEventListener('mouseenter', () => {
      tooltipIcon.style.opacity = '1';
      tooltip.style.opacity = '1';
      tooltip.style.transform = 'translateX(0)';
    });
    
    tooltipIcon.addEventListener('mouseleave', () => {
      tooltipIcon.style.opacity = '0.6';
      tooltip.style.opacity = '0';
      tooltip.style.transform = 'translateX(10px)';
    });
    
    zoneHeader.appendChild(tooltipIcon);
    groupEl.appendChild(tooltip);
  }
  
  groupEl.appendChild(zoneHeader);
  
  // Individual tasks as a checklist
  const taskList = document.createElement('div');
  taskList.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-left: 28px;
  `;
  
  group.steps.forEach((step, stepIdx) => {
    const taskItem = document.createElement('div');
    taskItem.style.cssText = `
      display: flex;
      align-items: flex-start;
      gap: 8px;
      font-size: 12px;
    `;
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = step.checked || false;
    checkbox.style.cssText = `
      margin-top: 2px;
      cursor: pointer;
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      accent-color: ${getStepColor(step.type)};
    `;
    checkbox.addEventListener('change', () => {
      toggleStepCompletion(step.id);
    });
    
    const taskContent = document.createElement('div');
    taskContent.style.cssText = 'flex: 1;';
    
    const taskDesc = document.createElement('div');
    taskDesc.style.cssText = `
      color: ${step.checked ? '#888' : '#ddd'};
      text-decoration: ${step.checked ? 'line-through' : 'none'};
      line-height: 1.4;
    `;
    taskDesc.textContent = `${getStepIcon(step.type)} ${step.description}`;
    
    taskContent.appendChild(taskDesc);
    
    // Show hints/rewards for individual tasks
    if (step.hint && step.hint.length <= 40) {
      const hint = document.createElement('div');
      hint.style.cssText = `
        font-size: 10px;
        color: #999;
        font-style: italic;
        margin-top: 2px;
      `;
      hint.textContent = `💡 ${step.hint}`;
      taskContent.appendChild(hint);
    }
    
    if (step.reward) {
      const reward = document.createElement('div');
      reward.style.cssText = `
        font-size: 10px;
        color: #4ADE80;
        margin-top: 2px;
      `;
      reward.textContent = `🎁 ${step.reward}`;
      taskContent.appendChild(reward);
    }
    
    taskItem.appendChild(checkbox);
    taskItem.appendChild(taskContent);
    taskList.appendChild(taskItem);
  });
  
  groupEl.appendChild(taskList);
  
  return groupEl;
}

function createBadge(icon: string, text: string, color: string): HTMLElement {
  const badge = document.createElement('div');
  badge.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: ${color}15;
    border: 1px solid ${color}40;
    border-radius: 4px;
    color: ${color};
    font-weight: 600;
    white-space: nowrap;
  `;
  badge.textContent = `${icon} ${text}`;
  return badge;
}

function getStepIcon(type: string): string {
  if (!levelingData) return '•';
  const stepType = levelingData.stepTypes[type];
  if (!stepType) return '•';
  return ICON_MAP[stepType.icon] || '•';
}

function getStepColor(type: string): string {
  if (!levelingData) return '#FFFFFF';
  const stepType = levelingData.stepTypes[type];
  return stepType?.color || '#FFFFFF';
}

function toggleStepCompletion(stepId: string): void {
  if (completedSteps.has(stepId)) {
    completedSteps.delete(stepId);
  } else {
    completedSteps.add(stepId);
  }
  saveProgress();
  renderSteps();
}

function renderSteps(): void {
  console.log('[Leveling] renderSteps called');
  if (!elements.stepsContainer) {
    console.log('[Leveling] No stepsContainer element!');
    return;
  }
  
  elements.stepsContainer.innerHTML = '';
  
  const steps = getCurrentSteps();
  console.log('[Leveling] Steps to render:', steps.length);
  
  if (steps.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.style.cssText = `
      padding: 20px;
      text-align: center;
      color: rgba(255, 255, 255, 0.5);
      font-style: italic;
    `;
    emptyMsg.textContent = '🎉 All tasks completed!';
    elements.stepsContainer.appendChild(emptyMsg);
    updateProgressBar();
    return;
  }
  
  // Group steps by zone
  const grouped = groupStepsByZone(steps);
  console.log('[Leveling] Grouped into', grouped.length, 'zones');
  
  grouped.forEach((group, index) => {
    let stepEl: HTMLElement;
    
    console.log(`[Leveling] Group ${index}: ${group.zone} with ${group.steps.length} step(s)`);
    
    if (group.steps.length > 1) {
      // Multiple steps in same zone - use grouped view with zone header
      console.log('[Leveling] Creating GROUPED element for', group.zone);
      stepEl = createGroupedStepElement(group, index);
    } else {
      // Single step - use simpler card view with zone name shown
      console.log('[Leveling] Creating SINGLE element for', group.zone);
      stepEl = createSingleStepWithZone(group.steps[0], group.zone, index);
    }
    
    if (elements.stepsContainer) {
      elements.stepsContainer.appendChild(stepEl);
    }
  });
  
  updateProgressBar();
  updateHeader();
}

function updateHeader(): void {
  if (!elements.headerTitle || !elements.headerSubtitle) return;
  
  const allSteps = getAllSteps();
  const currentStep = allSteps[currentStepIndex];
  
  if (currentStep && currentStep.zone) {
    // Show zone name in title
    elements.headerTitle.textContent = `⚡ ${currentStep.zone}`;
    // Show Act info in subtitle
    elements.headerSubtitle.textContent = 'Act 1: The Awakening';
  } else {
    elements.headerTitle.textContent = '⚡ LEVELING GUIDE';
    elements.headerSubtitle.textContent = 'Act 1: The Awakening';
  }
}

function updateProgressBar(): void {
  if (!elements.progressFill || !elements.progressText) return;
  
  const allSteps = getAllSteps();
  const completedCount = allSteps.filter(s => s.checked).length;
  const totalCount = allSteps.length;
  const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  
  elements.progressFill.style.width = `${percentage}%`;
  elements.progressText.textContent = `${completedCount}/${totalCount} (${percentage}%)`;
}

function createUI(): void {
  // Remove existing if any
  const existing = document.getElementById('leveling-overlay');
  if (existing) existing.remove();
  
  // Main container - positioned outside overlay bounds
  const container = document.createElement('div');
  container.id = 'leveling-overlay';
  container.style.cssText = `
    position: fixed !important;
    top: 20px;
    right: 20px;
    width: 380px;
    background: linear-gradient(135deg, rgba(20, 20, 28, 0.96) 0%, rgba(15, 15, 22, 0.98) 100%);
    border: 1px solid rgba(254, 192, 118, 0.4);
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
    color: #fff;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    z-index: 2147483647 !important;
    display: none;
    backdrop-filter: blur(12px);
    user-select: none;
    pointer-events: auto !important;
    isolation: isolate;
  `;
  
  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 14px 18px;
    background: linear-gradient(135deg, rgba(254, 192, 118, 0.15) 0%, rgba(254, 192, 118, 0.05) 100%);
    border-bottom: 2px solid rgba(254, 192, 118, 0.4);
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: move;
    border-radius: 10px 10px 0 0;
    user-select: none;
  `;
  
  const titleSection = document.createElement('div');
  titleSection.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';
  
  const title = document.createElement('div');
  title.style.cssText = `
    font-size: 16px; 
    font-weight: 700; 
    color: #FEC076;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    letter-spacing: 0.5px;
  `;
  title.textContent = '⚡ LEVELING GUIDE';
  
  const subtitle = document.createElement('div');
  subtitle.style.cssText = 'font-size: 11px; color: rgba(255, 255, 255, 0.6); font-weight: 500;';
  subtitle.textContent = 'Act 1: The Awakening';
  
  titleSection.appendChild(title);
  titleSection.appendChild(subtitle);
  
  elements.headerTitle = title;
  elements.headerSubtitle = subtitle;
  
  const headerButtons = document.createElement('div');
  headerButtons.style.cssText = 'display: flex; gap: 6px; align-items: center;';
  
  // Settings button
  const settingsBtn = createHeaderButton('⚙', 'Settings');
  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSettings();
  });
  
  // Lock button
  const lockBtn = createHeaderButton('🔓', 'Lock/Unlock');
  lockBtn.id = 'leveling-lock-btn';
  lockBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleLock();
  });
  
  // Layout toggle button
  const layoutBtn = createHeaderButton('⇄', 'Toggle Wide/Tall Layout');
  layoutBtn.id = 'leveling-layout-btn';
  layoutBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await toggleLayoutMode();
  });
  
  // Close button
  const closeBtn = createHeaderButton('✕', 'Close');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hide();
  });
  
  headerButtons.appendChild(settingsBtn);
  headerButtons.appendChild(layoutBtn);
  headerButtons.appendChild(lockBtn);
  headerButtons.appendChild(closeBtn);
  
  header.appendChild(titleSection);
  header.appendChild(headerButtons);
  
  // Steps container
  const stepsContainer = document.createElement('div');
  stepsContainer.style.cssText = `
    padding: 12px 14px;
    max-height: 520px;
    overflow-y: auto;
    overflow-x: hidden;
  `;
  
  // Custom scrollbar
  const style = document.createElement('style');
  style.textContent = `
    #leveling-overlay::-webkit-scrollbar,
    #leveling-overlay *::-webkit-scrollbar {
      width: 6px;
    }
    #leveling-overlay::-webkit-scrollbar-track,
    #leveling-overlay *::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.2);
      border-radius: 3px;
    }
    #leveling-overlay::-webkit-scrollbar-thumb,
    #leveling-overlay *::-webkit-scrollbar-thumb {
      background: rgba(254, 192, 118, 0.4);
      border-radius: 3px;
    }
    #leveling-overlay::-webkit-scrollbar-thumb:hover,
    #leveling-overlay *::-webkit-scrollbar-thumb:hover {
      background: rgba(254, 192, 118, 0.6);
    }
  `;
  document.head.appendChild(style);
  
  // Progress Bar
  const progressBarContainer = document.createElement('div');
  progressBarContainer.style.cssText = `
    padding: 8px 14px 10px 14px;
    background: rgba(0, 0, 0, 0.2);
    border-top: 1px solid rgba(254, 192, 118, 0.15);
  `;
  
  const progressLabel = document.createElement('div');
  progressLabel.style.cssText = `
    font-size: 10px;
    color: rgba(255, 255, 255, 0.5);
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
  `;
  progressLabel.textContent = 'Progress';
  
  const progressBarOuter = document.createElement('div');
  progressBarOuter.style.cssText = `
    width: 100%;
    height: 6px;
    background: rgba(0, 0, 0, 0.4);
    border-radius: 3px;
    overflow: hidden;
    position: relative;
  `;
  
  const progressBarFill = document.createElement('div');
  progressBarFill.style.cssText = `
    height: 100%;
    width: 0%;
    background: linear-gradient(90deg, #4ADE80 0%, #FEC076 100%);
    border-radius: 3px;
    transition: width 0.3s ease;
    box-shadow: 0 0 10px rgba(74, 222, 128, 0.5);
  `;
  
  const progressText = document.createElement('div');
  progressText.style.cssText = `
    font-size: 10px;
    color: rgba(255, 255, 255, 0.7);
    margin-top: 4px;
    text-align: right;
    font-weight: 600;
  `;
  progressText.textContent = '0/52 (0%)';
  
  progressBarOuter.appendChild(progressBarFill);
  progressBarContainer.appendChild(progressLabel);
  progressBarContainer.appendChild(progressBarOuter);
  progressBarContainer.appendChild(progressText);
  
  elements.progressBar = progressBarContainer;
  elements.progressFill = progressBarFill;
  elements.progressText = progressText;
  
  // Controls
  const controls = document.createElement('div');
  controls.style.cssText = `
    padding: 10px 14px;
    background: rgba(0, 0, 0, 0.25);
    border-top: 1px solid rgba(254, 192, 118, 0.2);
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-radius: 0 0 10px 10px;
  `;
  
  const navButtons = document.createElement('div');
  navButtons.style.cssText = 'display: flex; gap: 6px;';
  
  const prevBtn = createControlButton('◀', () => navigateSteps(-1));
  prevBtn.title = 'Previous Step';
  const nextBtn = createControlButton('▶', () => navigateSteps(1));
  nextBtn.title = 'Next Step';
  
  navButtons.appendChild(prevBtn);
  navButtons.appendChild(nextBtn);
  
  // Map layout button
  const mapLayoutBtn = createControlButton('🗺', () => toggleMapLayouts());
  mapLayoutBtn.id = 'leveling-map-btn';
  mapLayoutBtn.title = 'View Map Layouts';
  mapLayoutBtn.style.cssText = `
    padding: 6px 10px;
    background: rgba(100, 150, 255, 0.15);
    border: 1px solid rgba(100, 150, 255, 0.3);
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    color: #fff;
    transition: all 0.2s ease;
  `;
  
  controls.appendChild(navButtons);
  controls.appendChild(mapLayoutBtn);
  
  // Settings panel (hidden by default)
  const settingsPanel = createSettingsPanel();
  
  // Map layout panel (hidden by default)
  const mapLayoutPanel = createMapLayoutPanel();
  
  container.appendChild(header);
  container.appendChild(stepsContainer);
  container.appendChild(progressBarContainer);
  container.appendChild(controls);
  container.appendChild(settingsPanel);
  container.appendChild(mapLayoutPanel);
  
  document.body.appendChild(container);
  
  elements.root = container;
  elements.container = container;
  elements.header = header;
  elements.stepsContainer = stepsContainer;
  elements.controls = controls;
  elements.settingsPanel = settingsPanel;
  elements.mapLayoutButton = mapLayoutBtn;
  elements.mapLayoutPanel = mapLayoutPanel;
  
  // Setup dragging
  setupDragging();
}

function createHeaderButton(text: string, title: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.title = title;
  btn.style.cssText = `
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #fff;
    font-size: 14px;
    cursor: pointer;
    padding: 6px 10px;
    border-radius: 6px;
    transition: all 0.2s ease;
    font-weight: 600;
  `;
  btn.addEventListener('mouseenter', () => {
    btn.style.background = 'rgba(254, 192, 118, 0.2)';
    btn.style.borderColor = 'rgba(254, 192, 118, 0.4)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'rgba(255, 255, 255, 0.08)';
    btn.style.borderColor = 'rgba(255, 255, 255, 0.15)';
  });
  return btn;
}

function createControlButton(text: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.style.cssText = `
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    transition: all 0.2s ease;
  `;
  btn.addEventListener('mouseenter', () => {
    btn.style.background = 'rgba(255, 255, 255, 0.15)';
    btn.style.transform = 'translateY(-1px)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'rgba(255, 255, 255, 0.08)';
    btn.style.transform = 'translateY(0)';
  });
  btn.addEventListener('click', onClick);
  return btn;
}

function createSettingsPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'leveling-settings';
  panel.style.cssText = `
    display: none;
    padding: 16px;
    background: rgba(0, 0, 0, 0.4);
    border-top: 1px solid #555;
  `;
  
  const title = document.createElement('div');
  title.textContent = 'Settings';
  title.style.cssText = 'font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #FEC076;';
  panel.appendChild(title);
  
  // Visible steps
  const stepsLabel = document.createElement('label');
  stepsLabel.textContent = 'Steps to show:';
  stepsLabel.style.cssText = 'display: block; font-size: 12px; margin-bottom: 4px;';
  
  const stepsInput = document.createElement('input');
  stepsInput.type = 'number';
  stepsInput.min = '1';
  stepsInput.max = '10';
  stepsInput.value = String(settings.visibleSteps);
  stepsInput.style.cssText = `
    width: 100%;
    padding: 6px;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid #666;
    border-radius: 4px;
    color: #fff;
    font-size: 12px;
    margin-bottom: 12px;
  `;
  stepsInput.addEventListener('change', () => {
    settings.visibleSteps = Math.max(1, Math.min(10, parseInt(stepsInput.value) || 3));
    saveSettings();
    renderSteps();
  });
  
  panel.appendChild(stepsLabel);
  panel.appendChild(stepsInput);
  
  // Client.txt path
  const pathLabel = document.createElement('label');
  pathLabel.textContent = 'Client.txt path (for auto-detection):';
  pathLabel.style.cssText = 'display: block; font-size: 12px; margin-bottom: 4px;';
  
  const pathInput = document.createElement('input');
  pathInput.type = 'text';
  pathInput.placeholder = 'C:/Path/To/PoE/logs/Client.txt';
  pathInput.value = settings.clientLogPath;
  pathInput.style.cssText = `
    width: 100%;
    padding: 6px;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid #666;
    border-radius: 4px;
    color: #fff;
    font-size: 12px;
    margin-bottom: 12px;
  `;
  pathInput.addEventListener('change', () => {
    settings.clientLogPath = pathInput.value;
    saveSettings();
  });
  
  panel.appendChild(pathLabel);
  panel.appendChild(pathInput);
  
  // Checkboxes
  const checkboxes = [
    { key: 'showHints', label: 'Show hints' },
    { key: 'showOptional', label: 'Show optional steps' },
    { key: 'autoDetectZones', label: 'Auto-detect zones (requires Client.txt)' }
  ];
  
  checkboxes.forEach(({ key, label }) => {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 8px;';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = settings[key as keyof LevelingSettings] as boolean;
    checkbox.addEventListener('change', () => {
      (settings[key as keyof LevelingSettings] as boolean) = checkbox.checked;
      saveSettings();
      renderSteps();
    });
    
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.cssText = 'font-size: 12px; cursor: pointer;';
    labelEl.addEventListener('click', () => checkbox.click());
    
    wrapper.appendChild(checkbox);
    wrapper.appendChild(labelEl);
    panel.appendChild(wrapper);
  });
  
  return panel;
}

function createMapLayoutPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'leveling-map-layouts';
  panel.style.cssText = `
    display: none;
    padding: 16px;
    background: rgba(0, 0, 0, 0.4);
    border-top: 1px solid #555;
    max-height: 300px;
    overflow-y: auto;
  `;
  
  const title = document.createElement('div');
  title.textContent = 'Map Layouts';
  title.style.cssText = 'font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #4ADE80;';
  panel.appendChild(title);
  
  const placeholder = document.createElement('div');
  placeholder.textContent = 'Map layouts for current zone will appear here.';
  placeholder.style.cssText = 'color: #A0A0A0; font-size: 12px; font-style: italic;';
  panel.appendChild(placeholder);
  
  return panel;
}

function toggleSettings(): void {
  if (!elements.settingsPanel) return;
  
  const isVisible = elements.settingsPanel.style.display !== 'none';
  elements.settingsPanel.style.display = isVisible ? 'none' : 'block';
  
  // Hide map layouts if open
  if (!isVisible && elements.mapLayoutPanel) {
    elements.mapLayoutPanel.style.display = 'none';
  }
}

function toggleMapLayouts(): void {
  if (!elements.mapLayoutPanel) return;
  
  const isVisible = elements.mapLayoutPanel.style.display !== 'none';
  elements.mapLayoutPanel.style.display = isVisible ? 'none' : 'block';
  
  // Hide settings if open
  if (!isVisible && elements.settingsPanel) {
    elements.settingsPanel.style.display = 'none';
  }
  
  // Update content
  if (!isVisible) {
    updateMapLayoutPanel();
  }
}

function updateMapLayoutPanel(): void {
  if (!elements.mapLayoutPanel || !levelingData) return;
  
  const allSteps = getAllSteps();
  const currentStep = allSteps[currentStepIndex];
  
  elements.mapLayoutPanel.innerHTML = '';
  
  const title = document.createElement('div');
  title.textContent = 'Map Layouts';
  title.style.cssText = 'font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #4ADE80;';
  elements.mapLayoutPanel.appendChild(title);
  
  if (currentStep && currentStep.zone) {
    const zoneName = document.createElement('div');
    zoneName.textContent = `Current Zone: ${currentStep.zone}`;
    zoneName.style.cssText = 'color: #FEC076; font-size: 13px; margin-bottom: 8px;';
    elements.mapLayoutPanel.appendChild(zoneName);
    
    // Placeholder for actual map images
    const placeholder = document.createElement('div');
    placeholder.textContent = 'Map layout images will be displayed here in future updates.';
    placeholder.style.cssText = 'color: #A0A0A0; font-size: 11px; font-style: italic; padding: 12px; background: rgba(0, 0, 0, 0.3); border-radius: 4px;';
    elements.mapLayoutPanel.appendChild(placeholder);
  } else {
    const noLayouts = document.createElement('div');
    noLayouts.textContent = 'No map layouts available for current step.';
    noLayouts.style.cssText = 'color: #A0A0A0; font-size: 12px; font-style: italic;';
    elements.mapLayoutPanel.appendChild(noLayouts);
  }
}

function toggleLock(): void {
  isLocked = !isLocked;
  const lockBtn = document.getElementById('leveling-lock-btn');
  if (lockBtn) {
    lockBtn.textContent = isLocked ? '🔒' : '🔓';
  }
  if (elements.header) {
    elements.header.style.cursor = isLocked ? 'default' : 'move';
  }
}

function setupDragging(): void {
  if (!elements.header || !elements.container) return;
  
  elements.header.addEventListener('mousedown', (e: MouseEvent) => {
    if (isLocked) return;
    
    isDragging = true;
    dragOffsetX = e.clientX - elements.container!.offsetLeft;
    dragOffsetY = e.clientY - elements.container!.offsetTop;
    
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isDragging || !elements.container) return;
    
    const x = e.clientX - dragOffsetX;
    const y = e.clientY - dragOffsetY;
    
    elements.container.style.left = `${x}px`;
    elements.container.style.top = `${y}px`;
  });
  
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      savePosition();
    }
  });
}

function navigateSteps(direction: number): void {
  const allSteps = getAllSteps();
  
  // When clicking back, enable showAllSteps mode
  if (direction < 0) {
    showAllSteps = true;
  }
  
  const targetIndex = currentStepIndex + direction;
  
  if (targetIndex >= 0 && targetIndex < allSteps.length) {
    currentStepIndex = targetIndex;
    renderSteps();
    updateHeader();
  } else if (direction > 0 && showAllSteps) {
    // If at the end while in showAll mode, switch back to hide checked mode
    showAllSteps = false;
    currentStepIndex = 0; // Reset to first unchecked
    renderSteps();
    updateHeader();
  }
}

async function toggleLayoutMode(): Promise<void> {
  layoutMode = layoutMode === 'tall' ? 'wide' : 'tall';
  
  // Call IPC to toggle window mode
  try {
    const { ipcRenderer } = require('electron');
    await ipcRenderer.invoke('leveling-toggle-wide');
  } catch (err) {
    console.error('Failed to toggle layout mode:', err);
  }
  
  // Update container layout
  updateContainerLayout();
  renderSteps();
}

function updateContainerLayout(): void {
  if (!elements.container || !elements.stepsContainer) return;
  
  if (layoutMode === 'wide') {
    // Wide mode: horizontal layout with grid
    elements.stepsContainer.style.cssText = `
      padding: 12px 14px;
      max-height: none;
      height: calc(100% - 250px);
      overflow-y: auto;
      overflow-x: hidden;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 12px;
      align-items: start;
    `;
  } else {
    // Tall mode: vertical list
    elements.stepsContainer.style.cssText = `
      padding: 12px 14px;
      max-height: 520px;
      overflow-y: auto;
      overflow-x: hidden;
    `;
  }
}

function saveSettings(): void {
  localStorage.setItem('poe1-leveling-settings', JSON.stringify(settings));
}

function loadSettings(): void {
  const saved = localStorage.getItem('poe1-leveling-settings');
  if (saved) {
    try {
      settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }
}

function saveProgress(): void {
  localStorage.setItem('poe1-leveling-progress', JSON.stringify(Array.from(completedSteps)));
}

function loadProgress(): void {
  const saved = localStorage.getItem('poe1-leveling-progress');
  if (saved) {
    try {
      completedSteps = new Set(JSON.parse(saved));
    } catch (err) {
      console.error('Failed to load progress:', err);
    }
  }
}

function savePosition(): void {
  if (!elements.container) return;
  const pos = {
    left: elements.container.style.left,
    top: elements.container.style.top
  };
  localStorage.setItem('poe1-leveling-position', JSON.stringify(pos));
}

function loadPosition(): void {
  const saved = localStorage.getItem('poe1-leveling-position');
  if (saved && elements.container) {
    try {
      const pos = JSON.parse(saved);
      elements.container.style.left = pos.left;
      elements.container.style.top = pos.top;
    } catch (err) {
      console.error('Failed to load position:', err);
    }
  }
}

export async function show(): Promise<void> {
  console.log('[Leveling] Show called');
  
  if (!levelingData) {
    console.log('[Leveling] Loading data...');
    await loadLevelingData();
    console.log('[Leveling] Data loaded:', levelingData);
  }
  
  if (!elements.root) {
    console.log('[Leveling] Creating UI...');
    createUI();
  }
  
  loadSettings();
  loadProgress();
  loadPosition();
  
  if (elements.root) {
    elements.root.style.display = 'block';
    console.log('[Leveling] Made visible');
  }
  
  console.log('[Leveling] Rendering steps...');
  renderSteps();
  
  const steps = getAllSteps();
  console.log('[Leveling] Total steps:', steps.length);
}

export function hide(): void {
  if (elements.root) {
    elements.root.style.display = 'none';
  }
}

export function reset(): void {
  completedSteps.clear();
  currentStepIndex = 0;
  saveProgress();
  renderSteps();
}

export function isVisible(): boolean {
  return elements.root?.style.display === 'block';
}

// Standalone mode - initialize and show immediately
export async function showStandalone(): Promise<void> {
  await loadLevelingData();
  loadProgress();
  createUI();
  show();
}

// Zone detection (to be implemented with Client.txt monitoring)
export function detectZone(zoneId: string): void {
  if (!settings.autoDetectZones) return;
  
  currentZoneId = zoneId;
  
  // Auto-advance to first step in new zone
  if (levelingData) {
    const allSteps = getAllSteps();
    for (let i = 0; i < allSteps.length; i++) {
      const step = allSteps[i];
      // Check if this step matches the zone
      if (step.zone === zoneId && !step.checked) {
        currentStepIndex = i;
        renderSteps();
        return;
      }
    }
  }
}

// Set layout mode (called from IPC)
export function setLayoutMode(mode: 'tall' | 'wide'): void {
  layoutMode = mode;
  updateContainerLayout();
  renderSteps();
}
