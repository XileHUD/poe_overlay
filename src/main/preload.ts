import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Overlay controls
    hideOverlay: () => ipcRenderer.send('hide-overlay'),
    onItemData: (callback: (data: any) => void) => {
        ipcRenderer.on('item-data', (event, data) => callback(data));
    },
    onLiquidEmotionDetected: (callback: (name: string) => void) => {
        ipcRenderer.on('liquid-emotion-detected', (_event, name) => callback(name));
    },
    onSetActiveCategory: (callback: (category: string) => void) => {
        ipcRenderer.on('set-active-category', (event, category) => callback(category));
    },
    onSetActiveTab: (callback: (tab: string) => void) => {
        ipcRenderer.on('set-active-tab', (_event, tab) => callback(tab));
    },
    onModifiersLoaded: (callback: (categories: string[]) => void) => {
        ipcRenderer.on('modifiers-loaded', (_event, cats) => callback(cats));
    },
    onInvokeAction: (callback: (action: string) => void) => {
        ipcRenderer.on('invoke-action', (_event, action) => callback(action));
    },
    onClearFilters: (callback: () => void) => {
        ipcRenderer.on('clear-filters', () => callback());
    },
    
    // Modifier database
    getModifierData: (category: string) => ipcRenderer.invoke('get-modifier-data', category),
    searchModifiers: (query: string, category?: string) => ipcRenderer.invoke('search-modifiers', query, category),
    getAllCategories: () => ipcRenderer.invoke('get-all-categories'),
    getLiquidEmotions: () => ipcRenderer.invoke('get-liquid-emotions'),
    getAnnoints: () => ipcRenderer.invoke('get-annoints'),
    getEssences: () => ipcRenderer.invoke('get-essences'),
    getCatalysts: () => ipcRenderer.invoke('get-catalysts'),
    getSocketables: () => ipcRenderer.invoke('get-socketables'),
    getKeywords: () => ipcRenderer.invoke('get-keywords'),
    getGlossar: () => ipcRenderer.invoke('get-keywords'),
    getUniques: () => ipcRenderer.invoke('get-uniques'),
    getOmens: () => ipcRenderer.invoke('get-omens'),
    getCurrency: () => ipcRenderer.invoke('get-currency'),
    getKeystones: () => ipcRenderer.invoke('get-keystones'),
    getAscendancyPassives: () => ipcRenderer.invoke('get-ascendancy-passives'),
    getAtlasNodes: () => ipcRenderer.invoke('get-atlas-nodes'),
    getGems: () => ipcRenderer.invoke('get-gems'),
    getBases: () => ipcRenderer.invoke('get-bases'),
    // Diagnostics
    getImageLog: () => ipcRenderer.invoke('debug-get-image-log'),
    cacheImage: (url: string) => ipcRenderer.invoke('cache-image', url),
    getCachedImage: (url: string) => ipcRenderer.invoke('get-cached-image', url),
    resolveImage: (url: string) => ipcRenderer.invoke('resolve-image', url),
    resolveImageByName: (name: string) => ipcRenderer.invoke('resolve-image-by-name', name),
    getBundledImagePath: (localPath: string) => ipcRenderer.invoke('get-bundled-image-path', localPath),
    // Data updates
    getDataDir: () => ipcRenderer.invoke('get-data-dir'),
    setDataDir: (dir: string) => ipcRenderer.invoke('set-data-dir', dir),
    reloadData: () => ipcRenderer.invoke('reload-data'),
    openDataDir: () => ipcRenderer.invoke('open-data-dir'),
    checkUpdates: () => ipcRenderer.invoke('check-updates'),
    // Uniques auto-open
    onShowUniqueItem: (callback: (data: { name: string; baseType: string }) => void) => {
        ipcRenderer.on('show-unique-item', (_event, data) => callback(data));
    },
    
    // Notify main process that overlay is ready
    overlayReady: () => ipcRenderer.send('overlay-ready'),
    setPinned: (pinned: boolean) => ipcRenderer.send('set-pinned', pinned),
    onPinnedChanged: (callback: (pinned: boolean) => void) => ipcRenderer.on('pinned-changed', (_e, state) => callback(state)),
    resizeOverlayHeight: (height: number) => ipcRenderer.send('resize-overlay-height', height),
    
    // PoE session & history
    poeGetSession: () => ipcRenderer.invoke('poe-get-session'),
    poeLogin: () => ipcRenderer.invoke('poe-login'),
    poeFetchHistory: (league: string) => ipcRenderer.invoke('poe-fetch-history', league),
    // Fallback scraping removed
    poeOpenHistoryWindow: () => ipcRenderer.invoke('poe-open-history-window'),
    // Fallback scraping removed

    // Local merchant history store
    historyLoad: () => ipcRenderer.invoke('history-load'),
    historySave: (store: any) => ipcRenderer.invoke('history-save', store),
    // Mod section popouts
    openModPopout: (payload: any) => ipcRenderer.invoke('open-mod-popout', payload),
    // History popout
    openHistoryPopout: (payload: any) => ipcRenderer.invoke('open-history-popout', payload),
    refreshHistoryPopout: () => ipcRenderer.invoke('refresh-history-popout'),
    sendHistoryToPopout: (payload: any) => ipcRenderer.invoke('send-history-to-popout', payload),
    onUpdateHistoryPopout: (callback: (data: any) => void) => {
        ipcRenderer.on('update-history-popout', (_event, data) => callback(data));
    },
    onRequestHistoryPopoutRefresh: (callback: () => void) => {
        ipcRenderer.on('request-history-popout-refresh', () => callback());
    },
    
    // Feature configuration
    getEnabledFeatures: () => ipcRenderer.invoke('get-enabled-features'),
    saveFeatureConfig: (config: any) => ipcRenderer.send('save-feature-config', config),
    closeFeatureSplash: () => ipcRenderer.send('feature-splash-close'),
    
    // Font size
    onFontSizeChanged: (callback: (size: number) => void) => {
        ipcRenderer.on('font-size-changed', (_event, size) => callback(size));
    },
    getFontSize: () => ipcRenderer.invoke('get-font-size'),
    
    // Remove listeners
    removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel)
});

// Expose a lightweight helper for immediate (no-IPC) path construction to bundled images.
try {
    const path = require('path');
    // Prefer resourcesPath (packaged). Fallback to directory of preload (dev) without using process.cwd (sandbox-safe).
    const resPath = (process as any).resourcesPath || path.join(__dirname, '..', '..');
    const root = path.join(resPath, 'bundled-images');
    contextBridge.exposeInMainWorld('bundledImages', {
        root: root.replace(/\\/g,'/'),
        toFileUrl: (rel: string) => 'file:///' + path.join(root, rel).replace(/\\/g,'/')
    });
} catch (e) {
    console.warn('[preload] failed to expose bundledImages helper', e);
}