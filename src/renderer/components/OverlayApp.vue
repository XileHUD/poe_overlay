<template>
  <div class="overlay-container" v-if="isVisible">
    <div class="overlay-header">
      <div class="header-controls">
        <select v-model="selectedCategory" @change="onCategoryChange" class="category-select">
          <option value="">Select Category</option>
          <option v-for="category in availableCategories" :key="category" :value="category">
            {{ formatCategoryName(category) }}
          </option>
        </select>
        
        <div class="attribute-selectors" v-if="hasAttributeVariants">
          <button 
            v-for="attr in ['str', 'dex', 'int', 'str_dex', 'str_int', 'dex_int']" 
            :key="attr"
            :class="['attr-btn', { active: selectedAttribute === attr }]"
            @click="selectAttribute(attr)"
          >
            {{ attr.toUpperCase().replace('_', '/') }}
          </button>
        </div>
        
        <input 
          v-model="searchQuery" 
          @input="onSearchChange"
          placeholder="Search modifiers..." 
          class="search-input"
        />
        
        <button @click="hideOverlay" class="close-btn">×</button>
      </div>
      
      <div class="quick-filters">
        <button 
          v-for="filter in quickFilters" 
          :key="filter.tag"
          :class="['filter-btn', filter.class, { active: activeFilters.includes(filter.tag) }]"
          @click="toggleFilter(filter.tag)"
        >
          {{ filter.icon }} {{ filter.label }}
        </button>
      </div>
    </div>

    <div class="overlay-content">
      <div class="item-info" v-if="currentItem">
        <div class="item-header">
          <span class="item-name">{{ currentItem.name }}</span>
          <span class="item-base">{{ currentItem.baseType }}</span>
          <span class="item-level">iLvl {{ currentItem.itemLevel }}</span>
        </div>
      </div>

      <div class="modifier-sections">
        <div v-if="filteredModifiers.length === 0" class="no-results">
          <p>No modifiers found</p>
          <p class="hint">Try adjusting your search or filters</p>
        </div>
        
        <div v-for="section in filteredModifiers" :key="`${section.domain}-${section.side}`" class="section">
          <div class="section-header" @click="toggleSection(`${section.domain}-${section.side}`)">
            <span class="collapse-arrow">{{ collapsedSections.has(`${section.domain}-${section.side}`) ? '▶' : '▼' }}</span>
            <span class="section-title">{{ formatDomainName(section.domain) }} {{ formatSideName(section.side) }}</span>
            <span class="section-count">{{ section.mods.length }}</span>
          </div>
          
          <div v-if="!collapsedSections.has(`${section.domain}-${section.side}`)" class="section-content">
            <div v-for="(mod, index) in section.mods" :key="index" class="mod-item">
              <div class="mod-main" @click="toggleModTiers(section.domain, section.side, index)">
                <span class="mod-text">{{ mod.text_plain }}</span>
                <div class="mod-badges">
                  <span v-if="mod.weight > 0" class="badge weight">{{ mod.weight }}</span>
                  <span v-if="mod.ilvl" class="badge ilvl">iLvl {{ mod.ilvl }}</span>
                  <span v-if="mod.tier" class="badge tier">T{{ mod.tier }}</span>
                  <span v-if="mod.tiers && mod.tiers.length > 0" class="expand-icon">{{ 
                    expandedMods.has(`${section.domain}-${section.side}-${index}`) ? '▲' : '▼'
                  }}</span>
                </div>
              </div>
              
              <div v-if="mod.tiers && mod.tiers.length > 0 && expandedMods.has(`${section.domain}-${section.side}-${index}`)" 
                   class="tier-list">
                <div v-for="(tier, tierIndex) in mod.tiers" :key="tierIndex" class="tier-item">
                  <div class="tier-line">
                    <span class="tier-name">{{ tier.tier_name }}</span>
                    <div class="tier-badges">
                      <span v-if="tier.weight > 0" class="badge weight">{{ tier.weight }}</span>
                      <span v-if="tier.tier_level" class="badge ilvl">iLvl {{ tier.tier_level }}</span>
                      <span class="badge tier">T{{ mod.tiers.length - tierIndex }}</span>
                    </div>
                  </div>
                  <div class="tier-text">{{ tier.text_plain }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

// Define types
interface ParsedItem {
  itemClass: string;
  rarity: string;
  name: string;
  baseType: string;
  requirements: any;
  itemLevel: number;
  category: string;
  attributeType: string;
  modifiers: string[];
}

interface ModifierData {
  domain: string;
  side: string;
  mods: Array<{
    text: string;
    text_plain: string;
    tier: number;
    weight: number;
    weight_pct: number;
    ilvl: number;
    tags: string[];
    tiers?: Array<{
      tier_name: string;
      text_plain: string;
      weight: number;
      weight_pct: number;
      tier_level: number;
    }>;
  }>;
}

// Reactive state
const isVisible = ref(true);
const currentItem = ref<ParsedItem | null>(null);
const selectedCategory = ref('');
const selectedAttribute = ref('');
const searchQuery = ref('');
const activeFilters = ref<string[]>([]);
const collapsedSections = ref(new Set<string>());
const expandedMods = ref(new Set<string>());
const modifierData = ref<ModifierData[]>([]);

// Available categories (will be loaded dynamically)
const availableCategories = ref<string[]>([
  'Body_Armours', 'Helmets', 'Gloves', 'Boots', 'Rings', 'Amulets', 'Belts',
  'Bows', 'Crossbows', 'Wands', 'One_Hand_Swords', 'Two_Hand_Swords'
]);

// Quick filter definitions
const quickFilters = [
  { tag: 'lightning', label: 'Lightning', icon: '⚡', class: 'filter-lightning' },
  { tag: 'fire', label: 'Fire', icon: '🔥', class: 'filter-fire' },
  { tag: 'cold', label: 'Cold', icon: '❄️', class: 'filter-cold' },
  { tag: 'chaos', label: 'Chaos', icon: '☠️', class: 'filter-chaos' },
  { tag: 'life', label: 'Life', icon: '❤️', class: 'filter-life' },
  { tag: 'defences', label: 'Defense', icon: '🛡️', class: 'filter-defense' },
  { tag: 'gems', label: 'Gems', icon: '💎', class: 'filter-gems' }
];

// Computed properties
const hasAttributeVariants = computed(() => {
  return selectedCategory.value && ['Body_Armours', 'Helmets', 'Gloves', 'Boots', 'Shields'].some(cat => 
    selectedCategory.value.startsWith(cat)
  );
});

const currentCategoryWithAttribute = computed(() => {
  if (!selectedCategory.value) return '';
  
  if (hasAttributeVariants.value && selectedAttribute.value) {
    const baseCategory = selectedCategory.value.split('_')[0] + '_' + selectedCategory.value.split('_')[1];
    return `${baseCategory}_${selectedAttribute.value}`;
  }
  
  return selectedCategory.value;
});

const filteredModifiers = computed(() => {
  let filtered = [...modifierData.value];
  
  // Apply search filter
  if (searchQuery.value) {
    const search = searchQuery.value.toLowerCase();
    filtered = filtered.map(section => ({
      ...section,
      mods: section.mods.filter(mod => 
        mod.text_plain.toLowerCase().includes(search) ||
        mod.tags.some(tag => tag.toLowerCase().includes(search))
      )
    })).filter(section => section.mods.length > 0);
  }
  
  // Apply tag filters
  if (activeFilters.value.length > 0) {
    filtered = filtered.map(section => ({
      ...section,
      mods: section.mods.filter(mod => 
        activeFilters.value.some(filter => mod.tags.includes(filter))
      )
    })).filter(section => section.mods.length > 0);
  }
  
  return filtered;
});

// Methods
const hideOverlay = () => {
  isVisible.value = false;
  window.electronAPI?.hideOverlay();
};

const onCategoryChange = async () => {
  if (selectedCategory.value) {
    await loadModifierData(currentCategoryWithAttribute.value);
  }
};

const selectAttribute = async (attr: string) => {
  selectedAttribute.value = attr;
  if (selectedCategory.value) {
    await loadModifierData(currentCategoryWithAttribute.value);
  }
};

const toggleFilter = (tag: string) => {
  const index = activeFilters.value.indexOf(tag);
  if (index >= 0) {
    activeFilters.value.splice(index, 1);
  } else {
    activeFilters.value.push(tag);
  }
};

const toggleSection = (sectionId: string) => {
  if (collapsedSections.value.has(sectionId)) {
    collapsedSections.value.delete(sectionId);
  } else {
    collapsedSections.value.add(sectionId);
  }
};

const toggleModTiers = (domain: string, side: string, index: number) => {
  const modId = `${domain}-${side}-${index}`;
  if (expandedMods.value.has(modId)) {
    expandedMods.value.delete(modId);
  } else {
    expandedMods.value.add(modId);
  }
};

const onSearchChange = () => {
  // Search is reactive, no need for additional logic
};

const loadModifierData = async (category: string) => {
  try {
    if (window.electronAPI) {
      const data = await window.electronAPI.getModifierData(category);
      modifierData.value = data || [];
    }
  } catch (error) {
    console.error('Error loading modifier data:', error);
  }
};

const formatCategoryName = (category: string) => {
  return category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const formatDomainName = (domain: string) => {
  return domain.charAt(0).toUpperCase() + domain.slice(1);
};

const formatSideName = (side: string) => {
  if (side === 'none') return '';
  return `- ${side.charAt(0).toUpperCase() + side.slice(1)}`;
};

// Lifecycle
onMounted(() => {
  // Listen for item data from main process
  if (window.electronAPI) {
    window.electronAPI.onItemData((data: { item: ParsedItem; modifiers: ModifierData[] }) => {
      currentItem.value = data.item;
      selectedCategory.value = data.item.category.split('_').slice(0, 2).join('_');
      selectedAttribute.value = data.item.attributeType;
      modifierData.value = data.modifiers;
      isVisible.value = true;
    });
    
    window.electronAPI.overlayReady();
  }
});

onUnmounted(() => {
  if (window.electronAPI) {
    window.electronAPI.removeAllListeners('item-data');
  }
});
</script>

<style scoped>
.overlay-container {
  width: 800px;
  height: 600px;
  background: rgba(13, 17, 23, 0.95);
  border: 1px solid #30363d;
  border-radius: 8px;
  color: #f0f6fc;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  overflow: hidden;
  backdrop-filter: blur(10px);
}

.overlay-header {
  background: rgba(22, 27, 34, 0.8);
  padding: 12px;
  border-bottom: 1px solid #30363d;
}

.header-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.category-select {
  background: #21262d;
  border: 1px solid #30363d;
  color: #f0f6fc;
  padding: 6px 10px;
  border-radius: 4px;
  min-width: 150px;
}

.attribute-selectors {
  display: flex;
  gap: 2px;
}

.attr-btn {
  background: #21262d;
  border: 1px solid #30363d;
  color: #f0f6fc;
  padding: 4px 8px;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.attr-btn:hover {
  background: #30363d;
}

.attr-btn.active {
  background: #0969da;
  border-color: #0969da;
}

.search-input {
  background: #21262d;
  border: 1px solid #30363d;
  color: #f0f6fc;
  padding: 6px 10px;
  border-radius: 4px;
  flex: 1;
}

.close-btn {
  background: #da3633;
  border: none;
  color: white;
  width: 24px;
  height: 24px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}

.quick-filters {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.filter-btn {
  background: #21262d;
  border: 1px solid #30363d;
  color: #f0f6fc;
  padding: 4px 8px;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-btn:hover {
  background: #30363d;
}

.filter-btn.active {
  background: #0969da;
  border-color: #0969da;
}

.overlay-content {
  height: calc(100% - 100px);
  overflow-y: auto;
  padding: 8px;
}

.item-info {
  background: rgba(22, 27, 34, 0.6);
  padding: 8px 12px;
  border-radius: 4px;
  margin-bottom: 8px;
}

.item-header {
  display: flex;
  gap: 12px;
  align-items: center;
}

.item-name {
  color: #58a6ff;
  font-weight: 600;
}

.item-base {
  color: #8b949e;
}

.item-level {
  color: #f85149;
  font-size: 11px;
}

.modifier-sections {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.section {
  background: rgba(22, 27, 34, 0.4);
  border: 1px solid #30363d;
  border-radius: 4px;
  overflow: hidden;
}

.section-header {
  background: rgba(13, 17, 23, 0.8);
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid #30363d;
}

.section-title {
  flex: 1;
  font-weight: 600;
  font-size: 13px;
}

.section-count {
  background: #0969da;
  color: white;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 10px;
}

.section-content {
  padding: 4px;
}

.mod-item {
  margin-bottom: 4px;
}

.mod-main {
  background: rgba(22, 27, 34, 0.6);
  border: 1px solid #30363d;
  border-radius: 3px;
  padding: 6px 8px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mod-main:hover {
  background: rgba(30, 36, 44, 0.8);
}

.mod-text {
  font-size: 12px;
  flex: 1;
}

.mod-badges {
  display: flex;
  gap: 3px;
  align-items: center;
}

.badge {
  padding: 1px 4px;
  border-radius: 2px;
  font-size: 9px;
  font-weight: 500;
}

.badge.weight {
  background: #f85149;
  color: white;
}

.badge.ilvl {
  background: #8b949e;
  color: white;
}

.badge.tier {
  background: #0969da;
  color: white;
}

.tier-list {
  margin-top: 2px;
  padding-left: 8px;
  border-left: 2px solid #30363d;
}

.tier-item {
  background: rgba(13, 17, 23, 0.8);
  border: 1px solid #30363d;
  border-radius: 3px;
  padding: 4px 6px;
  margin-bottom: 2px;
}

.tier-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2px;
}

.tier-name {
  font-size: 11px;
  font-weight: 600;
}

.tier-badges {
  display: flex;
  gap: 2px;
}

.tier-text {
  font-size: 11px;
  color: #8b949e;
}

.no-results {
  grid-column: 1 / -1;
  text-align: center;
  color: #8b949e;
  padding: 40px 20px;
}

.hint {
  font-size: 12px;
  margin-top: 4px;
}

.expand-icon {
  font-size: 10px;
  color: #58a6ff;
}

.collapse-arrow {
  font-size: 12px;
  color: #58a6ff;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #30363d;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #484f58;
}
</style>

<style>
/* Global styles for the overlay window */
body {
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: transparent;
}

/* Electron specific styles */
.overlay-container {
  user-select: none;
  -webkit-user-select: none;
  -webkit-app-region: drag;
}

.overlay-header, .overlay-content {
  -webkit-app-region: no-drag;
}

button, input, select {
  -webkit-app-region: no-drag;
}
</style>