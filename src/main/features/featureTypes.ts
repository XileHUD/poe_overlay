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

export interface Poe1CraftingSubcategories {
  runegrafts: boolean;
  scarabs: boolean;
  currency: boolean;
  essences: boolean;
  fossils: boolean;
  embers: boolean;
  horticrafting: boolean;
  bestiary: boolean;
}

export interface CharacterSubcategories {
  questPassives: boolean;
  keystones: boolean;
  ascendancyPassives: boolean;
  atlasNodes: boolean;
  gems: boolean;
  glossar: boolean;
}

export interface Poe1CharacterSubcategories {
  ascendancyNotables: boolean;
  divinationCards: boolean;
  tattoos: boolean;
  gems: boolean;
}

export interface ItemsSubcategories {
  uniques: boolean;
  bases: boolean;
}

export interface Poe1ItemsSubcategories {
  uniques: boolean;
  bases: boolean;
}

export interface ToolsSubcategories {
  regex: boolean;
  poe1Regex: boolean;
  poe1Vorici: boolean;
}

export interface FeatureConfig {
  modifiers: boolean;
  poe1Modifiers: boolean;
  crafting: {
    enabled: boolean;
    subcategories: CraftingSubcategories;
  };
  poe1Crafting: {
    enabled: boolean;
    subcategories: Poe1CraftingSubcategories;
  };
  character: {
    enabled: boolean;
    subcategories: CharacterSubcategories;
  };
  poe1Character: {
    enabled: boolean;
    subcategories: Poe1CharacterSubcategories;
  };
  items: {
    enabled: boolean;
    subcategories: ItemsSubcategories;
  };
  poe1Items: {
    enabled: boolean;
    subcategories: Poe1ItemsSubcategories;
  };
  tools: {
    enabled: boolean;
    subcategories: ToolsSubcategories;
  };
  merchant: boolean;
}

/**
 * Default recommended feature configuration.
 * Enables all features (was previously called "Recommended", now this is "All Features").
 */
export const DEFAULT_FEATURES: FeatureConfig = {
  modifiers: true,
  poe1Modifiers: true,
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
  poe1Crafting: {
    enabled: true,
    subcategories: {
      runegrafts: true,
      scarabs: true,
      currency: true,
      essences: true,
      fossils: true,
      embers: true,
      horticrafting: true,
      bestiary: true
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
  poe1Character: {
    enabled: true,
    subcategories: {
      ascendancyNotables: true,
      divinationCards: true,
      tattoos: true,
      gems: true
    }
  },
  items: {
    enabled: true,
    subcategories: {
      uniques: true,
      bases: true
    }
  },
  poe1Items: {
    enabled: true,
    subcategories: {
      uniques: true,
      bases: true
    }
  },
  tools: {
    enabled: true,
    subcategories: {
      regex: true,
      poe1Regex: true,
      poe1Vorici: true
    }
  },
  merchant: true
};

/**
 * Minimal feature configuration (modifiers and merchant history only).
 * Note: merchant is true but will be disabled in PoE1 mode until PoE1 merchant is implemented.
 */
export const MINIMAL_FEATURES: FeatureConfig = {
  modifiers: true,
  poe1Modifiers: true,
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
  poe1Crafting: {
    enabled: false,
    subcategories: {
      runegrafts: false,
      scarabs: false,
      currency: false,
      essences: false,
      fossils: false,
      embers: false,
      horticrafting: false,
      bestiary: false
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
  poe1Character: {
    enabled: false,
    subcategories: {
      ascendancyNotables: false,
      divinationCards: false,
      tattoos: false,
      gems: false
    }
  },
  items: {
    enabled: false,
    subcategories: {
      uniques: false,
      bases: false
    }
  },
  poe1Items: {
    enabled: false,
    subcategories: {
      uniques: false,
      bases: false
    }
  },
  tools: {
    enabled: false,
    subcategories: {
      regex: false,
      poe1Regex: false,
      poe1Vorici: false
    }
  },
  merchant: true
};

/**
 * All features enabled configuration.
 */
export const ALL_FEATURES: FeatureConfig = {
  modifiers: true,
  poe1Modifiers: true,
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
  poe1Crafting: {
    enabled: true,
    subcategories: {
      runegrafts: true,
      scarabs: true,
      currency: true,
      essences: true,
      fossils: true,
      embers: true,
      horticrafting: true,
      bestiary: true
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
  poe1Character: {
    enabled: true,
    subcategories: {
      ascendancyNotables: true,
      divinationCards: true,
      tattoos: true,
      gems: true
    }
  },
  items: {
    enabled: true,
    subcategories: {
      uniques: true,
      bases: true
    }
  },
  poe1Items: {
    enabled: true,
    subcategories: {
      uniques: true,
      bases: true
    }
  },
  tools: {
    enabled: true,
    subcategories: {
      regex: true,
      poe1Regex: true,
      poe1Vorici: true
    }
  },
  merchant: true
};
