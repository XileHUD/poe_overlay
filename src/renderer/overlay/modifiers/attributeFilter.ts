/**
 * Attribute filter module for gear modifiers.
 * Handles INT/STR/DEX attribute filtering for armor and shield categories.
 */

export type Attribute = 'str' | 'dex' | 'int';

export interface AttributeFilterState {
  baseCategory: string;
  selectedAttributes: Set<Attribute>;
}

/**
 * Categories that support attribute filtering
 */
const ATTRIBUTE_SUPPORTED_BASES = new Set([
  'Body_Armours',
  'Helmets',
  'Gloves',
  'Boots',
  'Shields'
]);

/**
 * Check if a category supports attribute filtering
 */
export function supportsAttributeFilter(category: string): boolean {
  const base = extractBaseCategory(category);
  return ATTRIBUTE_SUPPORTED_BASES.has(base);
}

/**
 * Extract base category name (without attribute suffix)
 * Examples:
 *   "Body_Armours_str_dex" -> "Body_Armours"
 *   "Gloves_int" -> "Gloves"
 *   "Amulets" -> "Amulets"
 */
export function extractBaseCategory(category: string): string {
  if (!category) return '';
  
  // Check each known base
  for (const base of ATTRIBUTE_SUPPORTED_BASES) {
    if (category === base || category.startsWith(base + '_')) {
      return base;
    }
  }
  
  return category;
}

/**
 * Extract attributes from category name
 * Examples:
 *   "Body_Armours_str_dex" -> ['str', 'dex']
 *   "Gloves_int" -> ['int']
 *   "Helmets" -> []
 */
export function extractAttributes(category: string): Attribute[] {
  const base = extractBaseCategory(category);
  if (base === category) {
    // No attributes in category name
    return [];
  }
  
  const suffix = category.substring(base.length + 1); // +1 for underscore
  const parts = suffix.split('_').filter(p => p === 'str' || p === 'dex' || p === 'int');
  return parts as Attribute[];
}

/**
 * Build category name from base and attributes
 * Follows game convention: str -> dex -> int order
 * Examples:
 *   buildCategoryName("Body_Armours", ['dex', 'str']) -> "Body_Armours_str_dex"
 *   buildCategoryName("Gloves", ['int']) -> "Gloves_int"
 */
export function buildCategoryName(base: string, attributes: Attribute[]): string {
  if (!attributes.length) {
    return base;
  }
  
  // Sort in canonical order: str, dex, int
  const order: Record<Attribute, number> = { str: 1, dex: 2, int: 3 };
  const sorted = [...attributes].sort((a, b) => order[a] - order[b]);
  
  return `${base}_${sorted.join('_')}`;
}

/**
 * Toggle an attribute in the current selection
 * Returns new category name or null if invalid
 */
export function toggleAttribute(
  currentCategory: string,
  attribute: Attribute
): string | null {
  const base = extractBaseCategory(currentCategory);
  const current = new Set(extractAttributes(currentCategory));
  
  if (current.has(attribute)) {
    // Remove attribute
    current.delete(attribute);
    // Don't allow removing all attributes - keep at least one
    if (current.size === 0) {
      return null;
    }
  } else {
    // Add attribute
    current.add(attribute);
    // Don't allow more than 3 attributes
    if (current.size > 3) {
      return null;
    }
  }
  
  return buildCategoryName(base, Array.from(current));
}

/**
 * Get all valid attribute combinations for a base category
 */
export function getValidAttributeCombinations(base: string): string[] {
  if (!ATTRIBUTE_SUPPORTED_BASES.has(base)) {
    return [base];
  }
  
  const combinations: string[] = [];
  const attrs: Attribute[] = ['str', 'dex', 'int'];
  
  // No attributes (base only)
  combinations.push(base);
  
  // Single attributes
  for (const attr of attrs) {
    combinations.push(buildCategoryName(base, [attr]));
  }
  
  // Double attributes
  combinations.push(buildCategoryName(base, ['str', 'dex']));
  combinations.push(buildCategoryName(base, ['str', 'int']));
  combinations.push(buildCategoryName(base, ['dex', 'int']));
  
  // Triple attributes
  combinations.push(buildCategoryName(base, ['str', 'dex', 'int']));
  
  return combinations;
}

/**
 * Create attribute filter UI buttons
 */
export function createAttributeButtons(
  containerId: string,
  currentCategory: string,
  onAttributeToggle: (newCategory: string) => void
): void {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  if (!supportsAttributeFilter(currentCategory)) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }
  
  const selectedAttrs = new Set(extractAttributes(currentCategory));
  container.style.display = 'flex';
  
  const attributes: Attribute[] = ['str', 'dex', 'int'];
  const labels: Record<Attribute, string> = {
    str: 'STR',
    dex: 'DEX',
    int: 'INT'
  };
  
  container.innerHTML = attributes.map(attr => {
    const isActive = selectedAttrs.has(attr);
    const activeClass = isActive ? 'active' : '';
    return `
      <button 
        class="attr-filter-btn ${activeClass}" 
        data-attr="${attr}"
        title="${labels[attr]} requirement gear"
        type="button"
      >
        ${labels[attr]}
      </button>
    `;
  }).join('');
  
  // Add click handlers
  container.querySelectorAll('.attr-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const attr = btn.getAttribute('data-attr') as Attribute;
      const newCategory = toggleAttribute(currentCategory, attr);
      if (newCategory) {
        onAttributeToggle(newCategory);
      }
    });
  });
}

/**
 * Update button states based on current category
 */
export function updateAttributeButtons(
  containerId: string,
  currentCategory: string
): void {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  if (!supportsAttributeFilter(currentCategory)) {
    container.style.display = 'none';
    return;
  }
  
  container.style.display = 'flex';
  const selectedAttrs = new Set(extractAttributes(currentCategory));
  
  container.querySelectorAll('.attr-filter-btn').forEach(btn => {
    const attr = btn.getAttribute('data-attr') as Attribute;
    if (selectedAttrs.has(attr)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}
