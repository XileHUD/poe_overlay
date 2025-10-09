/**
 * Feature configuration types for the overlay.
 * Defines which features are enabled and their subcategories.
 */

export interface CraftingSubcategories {
  liquidEmotions: boolean;
  annoints: boolean;
  essences: boolean;
  omens: boolean;
  currency: boolean;
  catalysts: boolean;
  socketables: boolean;
}

export interface CharacterSubcategories {
  questPassives: boolean;
  keystones: boolean;
  ascendancyPassives: boolean;
  atlasNodes: boolean;
  gems: boolean;
  glossar: boolean;
}

export interface ItemsSubcategories {
  uniques: boolean;
  bases: boolean;
}

export interface ToolsSubcategories {
  regex: boolean;
}

export interface FeatureConfig {
  modifiers: boolean;
  crafting: {
    enabled: boolean;
    subcategories: CraftingSubcategories;
  };
  character: {
    enabled: boolean;
    subcategories: CharacterSubcategories;
  };
  items: {
    enabled: boolean;
    subcategories: ItemsSubcategories;
  };
  tools: {
    enabled: boolean;
    subcategories: ToolsSubcategories;
  };
  merchant: boolean;
}

/**
 * Default recommended feature configuration.
 * Enables modifiers, some crafting features, and merchant history.
 */
export const DEFAULT_FEATURES: FeatureConfig = {
  modifiers: true,
  crafting: {
    enabled: true,
    subcategories: {
      liquidEmotions: true,
      annoints: true,
      essences: true,
      omens: false,
      currency: false,
      catalysts: false,
      socketables: true
    }
  },
  character: {
    enabled: false,
    subcategories: {
      questPassives: false,
      keystones: false,
      ascendancyPassives: false,
      atlasNodes: false,
      gems: false,
      glossar: false
    }
  },
  items: {
    enabled: false,
    subcategories: {
      uniques: false,
      bases: false
    }
  },
  tools: {
    enabled: false,
    subcategories: {
      regex: false
    }
  },
  merchant: true
};

/**
 * Minimal feature configuration (merchant history only).
 */
export const MINIMAL_FEATURES: FeatureConfig = {
  modifiers: false,
  crafting: {
    enabled: false,
    subcategories: {
      liquidEmotions: false,
      annoints: false,
      essences: false,
      omens: false,
      currency: false,
      catalysts: false,
      socketables: false
    }
  },
  character: {
    enabled: false,
    subcategories: {
      questPassives: false,
      keystones: false,
      ascendancyPassives: false,
      atlasNodes: false,
      gems: false,
      glossar: false
    }
  },
  items: {
    enabled: false,
    subcategories: {
      uniques: false,
      bases: false
    }
  },
  tools: {
    enabled: false,
    subcategories: {
      regex: false
    }
  },
  merchant: true
};

/**
 * All features enabled configuration.
 */
export const ALL_FEATURES: FeatureConfig = {
  modifiers: true,
  crafting: {
    enabled: true,
    subcategories: {
      liquidEmotions: true,
      annoints: true,
      essences: true,
      omens: true,
      currency: true,
      catalysts: true,
      socketables: true
    }
  },
  character: {
    enabled: true,
    subcategories: {
      questPassives: true,
      keystones: true,
      ascendancyPassives: true,
      atlasNodes: true,
      gems: true,
      glossar: true
    }
  },
  items: {
    enabled: true,
    subcategories: {
      uniques: true,
      bases: true
    }
  },
  tools: {
    enabled: true,
    subcategories: {
      regex: true
    }
  },
  merchant: true
};
