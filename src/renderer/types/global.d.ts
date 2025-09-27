export {};

declare global {
  interface Window {
    electronAPI?: {
      hideOverlay: () => void;
      onItemData: (callback: (data: any) => void) => void;
      getModifierData: (category: string) => Promise<any>;
      searchModifiers: (query: string, category?: string) => Promise<any>;
      overlayReady: () => void;
      removeAllListeners: (channel: string) => void;
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
    OverlayGlossar?: {
      show: () => Promise<void>;
      render: (list: any[]) => void;
    };
    OverlayRegex?: {
      show: () => Promise<void>;
      render: () => void;
      buildRegex: () => string;
      reset: () => void;
      saveCurrent: (name: string) => void;
      loadSaved: (name: string) => void;
      listSaved: () => string[];
    };
  }
}