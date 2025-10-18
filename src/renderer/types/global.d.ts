export {};

declare global {
  interface Window {
    electronAPI?: {
      hideOverlay: () => void;
      openSettings: () => void;
      openReleasesPage: () => void;
      checkUpdates: () => Promise<{
        available: boolean;
        version?: string | null;
        message?: string;
        url?: string;
        error?: boolean;
      }>;
      onItemData: (callback: (data: any) => void) => void;
      getModifierData: (category: string) => Promise<any>;
      searchModifiers: (query: string, category?: string) => Promise<any>;
      overlayReady: () => void;
      removeAllListeners: (channel: string) => void;
      getPoe1Uniques?: () => Promise<any>;
      getPoe1Bases?: () => Promise<any>;
      getPoe1Essences?: () => Promise<any>;
      getPoe1Embers?: () => Promise<any>;
      getPoe1Fossils?: () => Promise<any>;
      getPoe1Currency?: () => Promise<any>;
      getPoe1Scarabs?: () => Promise<any>;
      getPoe1DivinationCards?: () => Promise<any>;
      getPoe1Tattoos?: () => Promise<any>;
      getPoe1Gems?: () => Promise<any>;
      getPoe1GemDetail?: (gemSlug: string) => Promise<any>;
    };
    OverlayUtils?: {
      escapeHtml: (s: any) => string;
      formatJoinedModText: (raw: any) => string;
      highlightText: (s: string) => string;
      normalizeCurrency: (c: any) => string;
      sanitizeCraftingHtml: (html: any) => string;
    }
    OverlayHistory?: any;
    OverlayLiquid?: {
      show: () => Promise<void>;
      hide: () => void;
      highlight: (name: string) => void;
      reload: () => Promise<void>;
      render: (items: any[]) => void;
    };
    OverlayAnnoints?: {
      show: () => Promise<void>;
      hide: () => void;
      render: () => void;
      scheduleFilter: () => void;
      applyFilter: () => void;
      reload: () => Promise<void>;
    };
    OverlayEssences?: {
      show: () => Promise<void>;
      render: (list: any[]) => void;
      reload: () => Promise<void>;
    };
    OverlayCatalysts?: {
      show: () => Promise<void>;
      render: (list: any[]) => void;
      reload: () => Promise<void>;
    };
    OverlaySocketables?: {
      show: () => Promise<void>;
      render: (list: any[]) => void;
      reload: () => Promise<void>;
    };
    OverlayOmens?: {
      show: () => Promise<void>;
      render: (list: any[]) => void;
      reload: () => Promise<void>;
    };
    OverlayCurrency?: {
      show: () => Promise<void>;
      render: (list: any[]) => void;
      reload: () => Promise<void>;
    };
    OverlayUniques?: {
      show: () => Promise<void>;
      render: (groups: any) => void;
      reload: () => Promise<void>;
      highlight: (name?: string, baseType?: string) => void;
    };
    OverlayBases?: {
      show: () => Promise<void>;
      render: (groups: any) => void;
      reload: () => Promise<void>;
    };
  openModifiersCategory?: (category: string | string[], options?: { bypassDebounce?: boolean }) => void;
    OverlayGlossar?: {
      show: () => Promise<void>;
      render: (list: any[]) => void;
    };
    OverlayPoe1DivinationCards?: {
      show: () => Promise<void>;
      render: (list: any[]) => void;
    };
    OverlayPoe1Tattoos?: {
      show: () => Promise<void>;
      render: (list: any[]) => void;
    };
    OverlayPoe1Gems?: {
      showList: () => Promise<void>;
      showDetail: (gemSlug: string) => Promise<void>;
    };
    OverlayRegex?: {
      show: () => Promise<void>;
      render: () => void;
      reset: () => void;
      saveCurrent: (name: string) => void;
      loadSavedRegex: (name: string) => void;
      listSaved: () => string[];
      // Returns the site-style combined quoted OR regex
      buildSiteRegex?: () => string;
    };
    OverlayRegexPoe1?: {
      show: () => void;
      hide: () => void;
      reset: () => void;
    };
  }
}