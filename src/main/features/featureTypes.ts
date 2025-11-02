/**
 * Feature configuration types for the overlay.
 * Defines which features are enabled and their subcategories.
 */

export interface CraftingSubcategories {
  liquidEmotions: boolean;
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
  annoints: boolean;
  keystones: boolean;
  ascendancyPassives: boolean;
  atlasNodes: boolean;
  gems: boolean;
  glossar: boolean;
}

export interface Poe1CharacterSubcategories {
  ascendancyNotables: boolean;
  divinationCards: boolean;
  anointments: boolean;
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
  keepers: boolean;
}

export interface ToolsSubcategories {
  regex: boolean;
  poe1Regex: boolean;
  poe1Vorici: boolean;
  poe1Leveling: boolean;
  poe2Leveling: boolean;
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
      annoints: true,
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
      anointments: true,
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
      bases: true,
      keepers: true
    }
  },
  tools: {
    enabled: true,
    subcategories: {
      regex: true,
      poe1Regex: true,
      poe1Vorici: true,
      poe1Leveling: true,
      poe2Leveling: true
    }
  },
  merchant: true
};

/**
 * Minimal feature configuration (modifiers and merchant history only).
 * Merchant history is now enabled for both PoE1 and PoE2.
 */
export const MINIMAL_FEATURES: FeatureConfig = {
  modifiers: true,
  poe1Modifiers: true,
  crafting: {
    enabled: false,
    subcategories: {
      liquidEmotions: false,
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
      annoints: false,
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
      anointments: false,
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
      bases: false,
      keepers: false
    }
  },
  tools: {
    enabled: false,
    subcategories: {
      regex: false,
      poe1Regex: false,
      poe1Vorici: false,
      poe1Leveling: false,
      poe2Leveling: false
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
      annoints: true,
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
      anointments: true,
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
      bases: true,
      keepers: true
    }
  },
  tools: {
    enabled: true,
    subcategories: {
      regex: true,
      poe1Regex: true,
      poe1Vorici: true,
      poe1Leveling: true,
      poe2Leveling: true
    }
  },
  merchant: true
};
