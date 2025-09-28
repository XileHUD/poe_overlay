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
    getAtlasNodes: () => ipcRenderer.invoke('get-atlas-nodes'),
    getGems: () => ipcRenderer.invoke('get-gems'),
    getBases: () => ipcRenderer.invoke('get-bases'),
    // Diagnostics
    getImageLog: () => ipcRenderer.invoke('debug-get-image-log'),
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
    
    // Remove listeners
    removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel)
});