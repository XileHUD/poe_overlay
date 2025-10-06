# History Module Modularization Plan

## Current State
- **Total Lines:** 1,279 lines
- **Main file:** `module.ts` (monolithic, handles everything)
- **Already modularized:**
  - ✅ `autoRefresh.ts` - Auto-refresh timer
  - ✅ `sessionManager.ts` - Login/logout UI
  - ✅ `refreshButton.ts` - Refresh button + confirmation

## Proposed Module Structure

### 📊 **1. Data Management** (`historyData.ts`)
**Lines:** ~150
**Purpose:** State management and data transformation
**Contents:**
- `historyState` - Global state object
- `HistoryEntryRaw` interface
- `HistoryStore` interface
- `HistoryState` interface
- `Price` type
- `canonicalTs()` - Timestamp normalization
- `keyForRow()` - Generate unique key for entry
- `recomputeTotalsFromEntries()` - Recalculate totals
- `addToTotals()` - Add price to totals
- Initial data loading from local storage

**Why:** All state and data models in one place. Clean separation of data from UI.

---

### 🎯 **2. Filtering & Sorting** (`historyFilters.ts`)
**Lines:** ~150
**Purpose:** Filter and sort history entries
**Contents:**
- `applyFilters()` - Apply all active filters
- `applySort()` - Apply current sort mode
- Filter helpers (timeframe, category, rarity, price)
- `renderHistoryActiveFilters()` - Show active filter chips

**Why:** Filtering logic is complex and self-contained. Easy to unit test.

---

### 📈 **3. Chart Rendering** (`historyChart.ts`)
**Lines:** ~300
**Purpose:** Canvas-based cumulative earnings chart
**Contents:**
- `_chartState` object (current currency, points, totals)
- `recomputeChartSeriesFromStore()` - Build chart data
- `updateHistoryChartFromTotals()` - Update with new totals
- `drawHistoryChart()` - Canvas rendering (axes, grid, line, dots)
- `setChartCurrency()` - Switch between divine/exalted/annul
- Chart UI event handlers (button clicks)

**Why:** Chart is 300 lines of canvas rendering. Totally independent feature.

---

### 📝 **4. List Rendering** (`historyList.ts`)
**Lines:** ~100
**Purpose:** Render scrollable list of trades
**Contents:**
- `renderHistoryList()` - Build HTML for trade list
- `toRelativeTime()` - Format timestamps ("5m ago")
- Row click handlers
- Trade count display

**Why:** Simple, focused rendering logic. Can be optimized separately.

---

### 🔍 **5. Detail Panel** (`historyDetail.ts`)
**Lines:** ~400
**Purpose:** Render detailed item view when trade is selected
**Contents:**
- `renderHistoryDetail()` - Full item card rendering
- Helper: `collapseBracketAlternates()` - Parse mod text
- Helper: `normalizeTier()` - Tier formatting (T1, L85)
- Helper: `aggregatedTierForLine()` - Multi-mod tier calculation
- Helper: `renderExplicitLike()` - Render explicit/fractured/desecrated mods
- Socket + rune rendering
- Quality badge
- Image fallback/scaling logic
- Mod tier badges

**Why:** Most complex rendering. 400 lines of HTML generation and data parsing.

---

### 🔄 **6. History Fetching** (`historyFetch.ts`)
**Lines:** ~150
**Purpose:** Fetch and sync merchant history from API
**Contents:**
- `refreshHistory()` - Main fetch function
- `refreshHistoryIfAllowed()` - Check rate limits before fetch
- Response parsing and error handling
- Store updates (merge new entries, save to disk)
- UI updates after fetch (list, detail, chart, totals)
- Rate limit badge updates

**Why:** All network logic in one place. Easier to debug API issues.

---

### 📦 **7. Totals Rendering** (`historyTotals.ts`)
**Lines:** ~50
**Purpose:** Display currency totals in header
**Contents:**
- `renderHistoryTotals()` - Render divine/exalted/annul badges
- Total calculations from state

**Why:** Small, focused responsibility. Clean UI component.

---

### 🪟 **8. Popout Window** (`historyPopout.ts`)
**Lines:** ~100
**Purpose:** Standalone history window functionality
**Contents:**
- `openHistoryPopout()` - Open separate window
- `handlePopoutRefreshRequest()` - Handle refresh from popout
- `sendHistoryToPopout()` - Send data to popout
- Popout state synchronization

**Why:** Isolated feature. No dependencies on main view.

---

### 🎨 **9. View Lifecycle** (`historyView.ts`)
**Lines:** ~50
**Purpose:** View visibility and generation tracking
**Contents:**
- `historyVisible()` - Check if view is active
- `onEnterView()` - Initialize when switching to history
- `onLeaveView()` - Cleanup when leaving
- `_viewGeneration` / `_activeGeneration` tracking

**Why:** Simple coordination logic. Prevents memory leaks.

---

### ⚙️ **10. Rate Limiting** (`historyRateLimit.ts`)
**Lines:** ~80
**Purpose:** Client-side rate limit tracking
**Contents:**
- `parseRateLimitHeaders()` - Parse x-rate-limit headers
- `nextAllowedRefreshAt()` - Calculate next allowed fetch time
- `updateHistoryRefreshButton()` - Update button state with countdown

**Why:** Rate limiting logic should be centralized and testable.

---

## Implementation Priority

### Phase 1: Low-Hanging Fruit (Easy wins)
1. ✅ **autoRefresh.ts** - Already done
2. ✅ **sessionManager.ts** - Already done
3. ✅ **refreshButton.ts** - Already done
4. **historyTotals.ts** - 50 lines, no dependencies
5. **historyView.ts** - 50 lines, simple logic
6. **historyPopout.ts** - 100 lines, isolated feature

### Phase 2: Data & Logic (Medium complexity)
7. **historyData.ts** - Core state management
8. **historyFilters.ts** - Complex but self-contained
9. **historyRateLimit.ts** - Utility functions
10. **historyList.ts** - Simple rendering

### Phase 3: Heavy Rendering (Most complex)
11. **historyChart.ts** - 300 lines of canvas code
12. **historyDetail.ts** - 400 lines of HTML generation
13. **historyFetch.ts** - Network + orchestration

## Benefits

### Code Quality
- **Single Responsibility:** Each module has one job
- **Testability:** Small modules are easier to unit test
- **Readability:** 100-line files instead of 1,279-line file
- **Maintainability:** Find bugs faster with focused modules

### Performance
- **Tree Shaking:** Unused modules can be excluded from bundle
- **Code Splitting:** Load chart rendering only when needed
- **Lazy Loading:** Defer heavy modules until first use

### Developer Experience
- **Import Clarity:** `import { renderChart } from './historyChart'`
- **Quick Navigation:** Jump to `historyChart.ts` instead of line 622
- **Merge Conflicts:** Fewer conflicts when multiple devs work on history
- **IDE Performance:** Smaller files = faster IntelliSense

## File Structure (After)

```
src/renderer/overlay/history/
├── module.ts (100 lines - just exports + initialization)
├── autoRefresh.ts ✅
├── sessionManager.ts ✅
├── refreshButton.ts ✅
├── historyData.ts (state + interfaces)
├── historyView.ts (lifecycle)
├── historyTotals.ts (header badges)
├── historyFilters.ts (filtering + sorting)
├── historyList.ts (trade list)
├── historyDetail.ts (item detail panel)
├── historyChart.ts (canvas chart)
├── historyFetch.ts (API calls)
├── historyRateLimit.ts (rate limit utils)
└── historyPopout.ts (popout window)
```

## Risks & Mitigation

### Risk 1: Breaking Existing Functionality
**Mitigation:** 
- Extract one module at a time
- Test after each extraction
- Keep git commits small and atomic

### Risk 2: Circular Dependencies
**Mitigation:**
- Clear dependency hierarchy (Data → Logic → UI)
- Use dependency injection for complex relationships
- Shared types go in `historyData.ts`

### Risk 3: Too Many Small Files
**Mitigation:**
- Only split when module has clear responsibility
- Keep related functions together
- Use barrel exports in `module.ts` for clean API

## Next Steps

1. **Pick Phase 1 modules** (totals, view, popout)
2. **Extract into new files** one at a time
3. **Update imports** in `module.ts`
4. **Build and test** after each extraction
5. **Commit each module** separately
6. **Move to Phase 2** when Phase 1 is stable

## Estimated Time

- **Phase 1:** 30 minutes (3 simple modules)
- **Phase 2:** 1 hour (4 medium modules)
- **Phase 3:** 2 hours (3 complex modules)
- **Total:** ~3.5 hours for complete modularization

## Success Criteria

✅ `module.ts` reduced from 1,279 → ~100 lines
✅ Each module < 400 lines
✅ No functionality broken
✅ All imports working
✅ Build succeeds
✅ Code easier to navigate and understand
