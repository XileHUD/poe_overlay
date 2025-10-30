// Import JSON data to inject into template
import gemsData from '../../data/leveling-data/gems.json';
import questsData from '../../data/leveling-data/quests.json';
import gemColoursData from '../../data/leveling-data/gem-colours.json';
import type { OverlayVersion } from '../../types/overlayVersion.js';

// Leveling popout HTML with all logic embedded inline
export function buildLevelingPopoutHtml(overlayVersion: OverlayVersion = 'poe1'): string {
  // Inject JSON data into the template
  const gemsJSON = JSON.stringify(gemsData);
  const questsJSON = JSON.stringify(questsData);
  const gemColoursJSON = JSON.stringify(gemColoursData);
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset='utf-8'/>
  <title>PoE1 Leveling Guide</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    :root{--font-size:12px;}
  html,body{font-family:'Segoe UI',Arial,sans-serif;font-size:var(--font-size);color:#ddd;background:transparent;-webkit-user-select:none;user-select:none;overflow:hidden;width:100%;height:100%;}
    
    /* Disable all transitions when applying settings */
    .no-transitions,
    .no-transitions * {
      transition: none !important;
    }
    
    /* Unscaled outer frame to preserve border/shadow at any zoom */
    .window-frame{display:flex;flex-direction:column;height:100vh;border:2px solid rgba(254,192,118,0.4);border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,0.9);background:transparent;overflow:visible;}
    .window-frame.frame-minimal,.window-frame.frame-ultra{border:none!important;border-radius:0!important;box-shadow:none!important;}
    /* Inner content gets zoom applied; remove its own border/shadow */
    .window{display:flex;flex-direction:column;height:100%;border:none;border-radius:12px;box-shadow:none;}
    
    /* Minimal Mode - slim drag header */
    .window.minimal-mode{pointer-events:none!important;border:none!important;border-radius:0!important;box-shadow:none!important;background:transparent!important;}
    .window.minimal-mode .header{-webkit-app-region:no-drag;pointer-events:none!important;padding:0!important;background:transparent!important;border:none!important;min-height:0!important;height:0!important;overflow:visible!important;}
    .window.minimal-mode .drag-handle{display:flex!important;flex-direction:column;position:absolute;top:0;left:0;right:0;height:24px;background:rgba(32,36,44,0.85);backdrop-filter:blur(4px);border-bottom:1px solid rgba(74,222,128,0.2);padding:4px 6px;gap:0px;z-index:100;pointer-events:auto!important;-webkit-app-region:drag;}
    .window.minimal-mode .drag-handle-row{display:flex;align-items:center;gap:4px;width:100%;-webkit-app-region:drag;}
    .window.minimal-mode .drag-handle-icon{font-size:10px;color:rgba(255,255,255,0.3);cursor:move;-webkit-app-region:drag;}
    .window.minimal-mode .drag-handle .minimal-nav{display:flex!important;gap:4px;margin-right:auto;-webkit-app-region:no-drag;}
    .window.minimal-mode .drag-handle .minimal-btn{width:auto!important;height:16px!important;font-size:9px!important;padding:0 6px!important;display:flex!important;align-items:center;justify-content:center;pointer-events:auto!important;-webkit-app-region:no-drag;opacity:0.7;transition:opacity 0.2s;background:rgba(74,222,128,0.2);border:1px solid rgba(74,222,128,0.3);color:rgba(255,255,255,0.9);border-radius:3px;}
    .window.minimal-mode .drag-handle .minimal-btn:hover{opacity:1!important;background:rgba(74,222,128,0.3);}
    .window.minimal-mode .drag-handle .header-btn{width:20px!important;height:16px!important;font-size:10px!important;display:flex!important;align-items:center;justify-content:center;pointer-events:auto!important;-webkit-app-region:no-drag;opacity:0.5;transition:opacity 0.2s;}
    .window.minimal-mode .drag-handle .header-btn:hover{opacity:1!important;}
    .window.minimal-mode .drag-handle{height:auto!important;gap:2px!important;}
    .window.minimal-mode .drag-handle-info{display:flex!important;flex-direction:row;gap:6px;align-items:center;padding:4px 14px;-webkit-app-region:no-drag;pointer-events:auto!important;}
    .window.minimal-mode .drag-handle-timer{font-size:9px;color:rgba(255,255,255,0.8);font-weight:600;white-space:nowrap;cursor:default;font-family:monospace;}
    .window.minimal-mode .drag-handle-progress{display:flex;align-items:center;gap:4px;flex:1;min-width:0;}
    .window.minimal-mode .drag-handle-progress-bar{flex:1;height:4px;background:rgba(0,0,0,0.4);border-radius:2px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);}
    .window.minimal-mode .drag-handle-progress-fill{height:100%;background:linear-gradient(90deg,#4ade80,#22c55e);transition:width 0.3s;box-shadow:0 0 6px rgba(74,222,128,0.5);}
    .window.minimal-mode .drag-handle-progress-text{font-size:8px;color:rgba(255,255,255,0.7);font-weight:600;min-width:28px;text-align:right;}
    .window.minimal-mode .timer-btn{width:auto!important;height:14px!important;font-size:8px!important;padding:0 4px!important;background:rgba(74,222,128,0.2)!important;border:1px solid rgba(74,222,128,0.3)!important;color:rgba(255,255,255,0.8)!important;border-radius:3px!important;cursor:pointer!important;pointer-events:auto!important;-webkit-app-region:no-drag;opacity:0.7;transition:opacity 0.2s;}
    .window.minimal-mode .timer-btn:hover{opacity:1!important;background:rgba(74,222,128,0.4)!important;}
    .window.minimal-mode #backToNormalBtn{display:none!important;}
    .window.minimal-mode #goToUltraBtn{display:flex!important;}
    .window.minimal-mode .header-content,
    .window.minimal-mode .header-buttons,
    .window.minimal-mode .zone-icon,
    .window.minimal-mode .close,
    .window.minimal-mode .controls,
    .window.minimal-mode .timer-row,
    .window.minimal-mode .minimal-controls{display:none!important;}
    .window.minimal-mode .footer{display:none!important;}
    .window.minimal-mode .list{padding:76px 4px 4px 4px!important;pointer-events:auto!important;}
    .window.minimal-mode .list::-webkit-scrollbar{display:none!important;}
    .window.minimal-mode .list{scrollbar-width:none!important;-ms-overflow-style:none!important;}
    .window.minimal-mode .leveling-step,
    .window.minimal-mode .leveling-group{pointer-events:auto!important;}
    
    /* Ultra Minimal Mode - click-through with no interactivity */
    .window.ultra-minimal-mode{border:none!important;border-radius:0!important;box-shadow:none!important;background:transparent!important;}
    .window.ultra-minimal-mode .header{-webkit-app-region:no-drag;pointer-events:none!important;padding:0!important;background:transparent!important;border:none!important;min-height:0!important;height:0!important;overflow:visible!important;}
  .window.ultra-minimal-mode .drag-handle{display:flex!important;flex-direction:column;position:absolute;top:0;left:0;right:0;height:auto;background:rgba(32,36,44,0.85);backdrop-filter:blur(4px);border-bottom:1px solid rgba(74,158,255,0.2);padding:4px 6px;gap:2px;z-index:100;pointer-events:auto!important;-webkit-app-region:drag;}
    .window.ultra-minimal-mode .ultra-drag-overlay{display:block!important;}
    .window.ultra-minimal-mode #minimalCharacterInfo{pointer-events:none!important;}
    .window.ultra-minimal-mode .drag-handle-row{display:flex;align-items:center;gap:4px;width:100%;position:relative;z-index:10;}
    .window.ultra-minimal-mode .drag-handle-icon{font-size:10px;color:rgba(255,255,255,0.3);cursor:move;pointer-events:none!important;}
    .window.ultra-minimal-mode .drag-handle .minimal-nav{display:flex!important;gap:4px;margin-right:auto;-webkit-app-region:no-drag;}
    .window.ultra-minimal-mode .drag-handle .minimal-btn{width:auto!important;height:16px!important;font-size:9px!important;padding:0 6px!important;display:flex!important;align-items:center;justify-content:center;pointer-events:auto!important;-webkit-app-region:no-drag;opacity:0.7;transition:opacity 0.2s;background:rgba(74,158,255,0.2);border:1px solid rgba(74,158,255,0.3);color:rgba(255,255,255,0.9);border-radius:3px;position:relative;z-index:10;}
    .window.ultra-minimal-mode .drag-handle .minimal-btn:hover{opacity:1!important;background:rgba(74,158,255,0.3);}
    .window.ultra-minimal-mode .drag-handle .header-btn{width:20px!important;height:16px!important;font-size:10px!important;display:flex!important;align-items:center;justify-content:center;pointer-events:auto!important;-webkit-app-region:no-drag;opacity:0.5;transition:opacity 0.2s;position:relative;z-index:10;}
    .window.ultra-minimal-mode .drag-handle .header-btn:hover{opacity:1!important;}
    .window.ultra-minimal-mode .drag-handle-info{display:flex!important;flex-direction:row;gap:6px;align-items:center;padding:4px 14px;-webkit-app-region:no-drag;pointer-events:auto!important;position:relative;z-index:10;}
    .window.ultra-minimal-mode .drag-handle-timer{font-size:9px;color:rgba(255,255,255,0.8);font-weight:600;white-space:nowrap;cursor:default;font-family:monospace;}
    .window.ultra-minimal-mode .drag-handle-progress{display:flex;align-items:center;gap:4px;flex:1;min-width:0;}
    .window.ultra-minimal-mode .drag-handle-progress-bar{flex:1;height:4px;background:rgba(0,0,0,0.4);border-radius:2px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);}
    .window.ultra-minimal-mode .drag-handle-progress-fill{height:100%;background:linear-gradient(90deg,#4ade80,#22c55e);transition:width 0.3s;box-shadow:0 0 6px rgba(74,222,128,0.5);}
    .window.ultra-minimal-mode .drag-handle-progress-text{font-size:8px;color:rgba(255,255,255,0.7);font-weight:600;min-width:28px;text-align:right;}
    .window.ultra-minimal-mode .timer-controls{display:flex!important;gap:3px;-webkit-app-region:no-drag;}
    .window.ultra-minimal-mode .timer-btn{width:auto!important;height:14px!important;font-size:8px!important;padding:0 4px!important;background:rgba(74,158,255,0.2)!important;border:1px solid rgba(74,158,255,0.3)!important;color:rgba(255,255,255,0.8)!important;border-radius:3px!important;cursor:pointer!important;pointer-events:auto!important;-webkit-app-region:no-drag;opacity:0.7;transition:opacity 0.2s;}
    .window.ultra-minimal-mode .timer-btn:hover{opacity:1!important;background:rgba(74,158,255,0.4)!important;}
    .window.ultra-minimal-mode #goToUltraBtn{display:none!important;}
    .window.ultra-minimal-mode #backToNormalBtn{display:flex!important;}
    .window.ultra-minimal-mode .header-content,
    .window.ultra-minimal-mode .header-buttons,
    .window.ultra-minimal-mode .zone-icon,
    .window.ultra-minimal-mode .close,
    .window.ultra-minimal-mode .controls,
    .window.ultra-minimal-mode .timer-row,
    .window.ultra-minimal-mode .footer,
    .window.ultra-minimal-mode .minimal-controls{display:none!important;}
    .window.ultra-minimal-mode .step-checkbox,
    .window.ultra-minimal-mode .zone-checkbox,
    .window.ultra-minimal-mode .task-checkbox{display:none!important;}
    .window.ultra-minimal-mode .leveling-step{background:rgba(32,36,44,0.85)!important;border:1px solid rgba(74,158,255,0.15)!important;}
    .window.ultra-minimal-mode .leveling-step.current{background:rgba(50,54,64,0.9)!important;border-color:rgba(74,158,255,0.3)!important;}
    .window.ultra-minimal-mode .leveling-group{background:rgba(32,36,44,0.85)!important;border:1px solid rgba(74,222,128,0.15)!important;}
    .window.ultra-minimal-mode .leveling-group.current{background:rgba(40,50,44,0.9)!important;border-color:rgba(74,222,128,0.3)!important;}
    .window.ultra-minimal-mode .list{padding:72px 4px 4px 4px!important;pointer-events:none!important;}
    .window.ultra-minimal-mode .list::-webkit-scrollbar{display:none!important;}
    .window.ultra-minimal-mode .list{scrollbar-width:none!important;-ms-overflow-style:none!important;}
    .drag-handle{display:none;}
    .drag-handle-row{display:none;}
    .drag-handle-info{display:none;}
    .ultra-drag-overlay{display:none;}
    
    /* Timer row in normal mode - below controls */
    .timer-row{display:flex;flex-direction:row;gap:8px;align-items:center;padding:8px 12px;background:rgba(40,44,52,0.6);border-bottom:1px solid rgba(255,255,255,0.08);-webkit-app-region:no-drag;}
    .timer-display{font-size:13px;color:rgba(255,255,255,0.9);font-weight:600;font-family:monospace;flex:1;}
    .timer-controls{display:flex;gap:6px;}
    .timer-btn{padding:5px 10px;background:rgba(50,54,62,0.75);border:1px solid rgba(255,255,255,0.18);border-radius:4px;cursor:pointer;font-size:11px;color:rgba(255,255,255,0.85);transition:all 0.12s;font-weight:500;white-space:nowrap;}
    .timer-btn:hover{background:rgba(74,158,255,0.6);border-color:rgba(74,158,255,0.9);color:#fff;}
    
    #goToUltraBtn{display:none;}
    #backToNormalBtn{display:none;}
    #minimalBtn.active{background:rgba(138,43,226,0.5);border-color:rgba(138,43,226,0.9);color:#fff;}
    #minimalBtn.ultra{background:rgba(255,0,255,0.6);border-color:rgba(255,0,255,1);color:#fff;}
    .minimal-controls{display:none;gap:4px;margin-bottom:4px;align-items:stretch;}
    .window.minimal-mode .minimal-controls{display:flex;}
    .minimal-nav{display:flex;gap:4px;flex:1;}
    .minimal-btn{flex:1;padding:8px 12px;background:rgba(30,34,40,0.95);border:1px solid rgba(255,255,255,0.2);border-radius:6px;cursor:pointer;font-size:11px;color:rgba(255,255,255,0.9);transition:all 0.15s;font-weight:600;}
    .minimal-btn:hover{background:rgba(74,158,255,0.8);border-color:rgba(74,158,255,1);color:#fff;}
    .minimal-restore{padding:8px 14px;background:rgba(138,43,226,0.5);border:1px solid rgba(138,43,226,0.9);border-radius:6px;cursor:pointer;font-size:11px;color:#fff;transition:all 0.15s;font-weight:600;flex-shrink:0;}
    .minimal-restore:hover{background:rgba(138,43,226,0.7);border-color:rgba(138,43,226,1);}
  .task-bullet{width:26px;height:20px;display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1;margin-top:2px;flex-shrink:0;}
  /* Opaque cards in minimal mode - always fully readable */
  .window.minimal-mode .leveling-step{background:rgba(32,36,44,0.98)!important;}
  .window.minimal-mode .leveling-step.current{background:rgba(50,54,64,1)!important;}
  .window.minimal-mode .leveling-group{background:rgba(32,36,44,0.98)!important;border-color:rgba(74,222,128,0.4)!important;}
  .window.minimal-mode .leveling-group.current{background:rgba(40,50,44,1)!important;}
    .header{padding:6px 10px;background:rgba(26,26,26,0.92);cursor:default;-webkit-app-region:drag;display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(254,192,118,0.25);border-radius:8px 8px 0 0;}
    .zone-icon{font-size:14px;line-height:1;text-shadow:0 1px 2px rgba(0,0,0,0.5);}
    .header-content{flex:1;display:flex;flex-direction:column;gap:4px;}
    .act-selector-wrapper{position:relative;-webkit-app-region:no-drag;}
    .act-selector-btn{display:flex;align-items:center;gap:6px;padding:4px 10px;background:rgba(50,54,62,0.85);border:1px solid rgba(254,192,118,0.3);border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;color:#FEC076;transition:all 0.12s;min-width:160px;box-shadow:0 1px 4px rgba(0,0,0,0.2);}
    .act-selector-btn:hover{background:rgba(60,64,72,0.95);border-color:rgba(254,192,118,0.5);box-shadow:0 2px 6px rgba(0,0,0,0.3);}
    .act-selector-btn.open{border-color:rgba(254,192,118,0.7);box-shadow:0 0 8px rgba(254,192,118,0.25);}
    .act-selector-label{flex:1;display:flex;flex-direction:column;gap:1px;}
    .act-selector-title{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:#FEC076;}
    .act-selector-name{font-size:9px;color:rgba(255,255,255,0.55);font-weight:500;font-style:italic;}
    .act-progress-mini{font-size:8px;color:rgba(255,255,255,0.45);font-weight:600;margin-left:auto;}
    .act-dropdown-arrow{font-size:9px;color:rgba(255,255,255,0.55);transition:transform 0.2s;}
    .act-selector-btn.open .act-dropdown-arrow{transform:rotate(180deg);}
    .act-dropdown{position:absolute;top:calc(100% + 4px);left:0;right:0;background:rgba(25,28,35,0.98);border:1px solid rgba(254,192,118,0.4);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.6);max-height:400px;overflow-y:auto;z-index:1000;display:none;}
    .act-dropdown.open{display:block;animation:dropdownFadeIn 0.15s ease-out;}
    @keyframes dropdownFadeIn{from{opacity:0;transform:translateY(-8px);}to{opacity:1;transform:translateY(0);}}
    .act-dropdown-item{display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;transition:all 0.15s;border-bottom:1px solid rgba(255,255,255,0.05);}
    .act-dropdown-item:last-child{border-bottom:none;}
    .act-dropdown-item:hover{background:rgba(74,158,255,0.15);}
    .act-dropdown-item.active{background:linear-gradient(90deg,rgba(254,192,118,0.2),rgba(254,192,118,0.1));border-left:3px solid rgba(254,192,118,0.8);}
    .act-dropdown-item.active:hover{background:linear-gradient(90deg,rgba(254,192,118,0.25),rgba(254,192,118,0.15));}
    .act-dropdown-num{font-size:13px;font-weight:700;color:#FEC076;min-width:50px;}
    .act-dropdown-info{flex:1;display:flex;flex-direction:column;gap:3px;}
    .act-dropdown-name{font-size:11px;font-weight:600;color:rgba(255,255,255,0.9);}
    .act-dropdown-progress{display:flex;align-items:center;gap:6px;}
    .act-progress-bar{flex:1;height:4px;background:rgba(0,0,0,0.4);border-radius:2px;overflow:hidden;}
    .act-progress-fill{height:100%;background:linear-gradient(90deg,#4ade80,#22c55e);transition:width 0.3s;}
    .act-progress-text{font-size:9px;color:rgba(255,255,255,0.6);font-weight:600;min-width:45px;text-align:right;}
    .act-complete-badge{font-size:10px;color:#4ade80;font-weight:700;}
    .title{font-size:12px;font-weight:600;color:#FEC076;text-shadow:0 1px 2px rgba(0,0,0,0.4);}
    .subtitle{font-size:9px;color:rgba(255,255,255,0.55);font-weight:500;}
    .header-buttons{display:flex;gap:4px;-webkit-app-region:no-drag;}
    .header-btn{width:22px;height:22px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(50,54,62,0.7);cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;transition:all 0.12s;color:rgba(255,255,255,0.75);padding:0;line-height:1;}
    .header-btn:hover{background:rgba(74,158,255,0.7);border-color:rgba(74,158,255,0.9);color:#fff;}
    .header-btn.active{background:rgba(74,222,128,0.25);border-color:rgba(74,222,128,0.7);color:#4ade80;}
    .close{background:rgba(192,57,43,0.7);width:22px;height:22px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:all 0.12s;-webkit-app-region:no-drag;}
    .close:hover{background:rgba(231,76,60,0.85);border-color:rgba(231,76,60,0.9);color:#fff;}
    .controls{padding:6px 10px;background:rgba(26,26,26,0.85);border-bottom:1px solid rgba(255,255,255,0.08);display:flex;gap:6px;align-items:center;-webkit-app-region:no-drag;}
    .control-btn{padding:4px 10px;background:rgba(50,54,62,0.75);border:1px solid rgba(255,255,255,0.18);border-radius:4px;cursor:pointer;font-size:10px;color:rgba(255,255,255,0.85);transition:all 0.12s;font-weight:500;}
    .control-btn:hover{background:rgba(74,158,255,0.6);border-color:rgba(74,158,255,0.9);color:#fff;}
    .progress-bar{flex:1;height:8px;background:rgba(0,0,0,0.4);border-radius:4px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);}
    .progress-fill{height:100%;background:linear-gradient(90deg,#4ade80,#22c55e);transition:width 0.3s;box-shadow:0 0 10px rgba(74,222,128,0.5);}
    .progress-text{font-size:10px;color:rgba(255,255,255,0.7);font-weight:600;min-width:60px;text-align:right;}
    .list{flex:1;overflow-y:auto;overflow-x:hidden;padding:12px;display:flex;flex-direction:column;box-sizing:border-box;}
    .list.wide{flex-direction:row;overflow-x:auto;overflow-y:hidden;gap:12px;align-items:flex-start;}
    .list.wide .leveling-group{margin-bottom:0;min-width:320px;max-width:320px;flex-shrink:0;display:flex;flex-direction:column;height:fit-content;}
    .list.wide .leveling-step{margin-bottom:0;min-width:320px;max-width:320px;flex-shrink:0;height:fit-content;}
  /* Footer bar (visible in normal mode; hidden in minimal/ultra via mode rules) */
  .footer{display:flex;align-items:center;justify-content:space-between;padding:4px 8px;background:rgba(26,26,26,0.85);border-top:1px solid rgba(255,255,255,0.08);-webkit-app-region:drag;gap:8px;}
  .footer-actions{-webkit-app-region:no-drag;display:flex;align-items:center;gap:6px;}
  #updateBadge{display:none;background:rgba(254,192,118,0.9);border:1px solid rgba(254,192,118,1);color:#111;border-radius:4px;padding:3px 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2px;cursor:pointer;}
  #updateBadge:hover{filter:brightness(1.08);}
  .leveling-group{margin-bottom:12px;background:rgba(74,222,128,0.03);border:1px solid rgba(74,222,128,0.15);border-left:3px solid rgba(74,222,128,0.4);border-radius:8px;padding:12px;transition:all 0.2s;overflow:visible;box-sizing:border-box;position:relative;}
    .leveling-group.current{background:rgba(74,222,128,0.08);border-color:rgba(74,222,128,0.3);border-left-color:rgba(74,222,128,0.8);}
    .leveling-group:hover{background:rgba(74,222,128,0.05);border-color:rgba(74,222,128,0.2);}
    /* PoB Import Task Card - Blue Variant */
    .pob-import-card{margin-bottom:12px;background:rgba(74,158,255,0.08);border:1px solid rgba(74,158,255,0.25);border-left:3px solid rgba(74,158,255,0.6);border-radius:8px;padding:14px 12px;transition:all 0.25s;overflow:visible;position:relative;display:flex;gap:10px;}
    .pob-import-card:hover{background:rgba(74,158,255,0.12);border-color:rgba(74,158,255,0.35);}
    .pob-import-card .step-checkbox{width:18px;height:18px;min-width:18px;margin-top:2px;cursor:pointer;flex-shrink:0;accent-color:#4a9eff;}
    .pob-import-card .step-content{flex:1 1 auto;display:grid;grid-template-columns:1fr;gap:8px;position:relative;}
    .pob-import-card .step-main{display:grid;grid-template-columns:28px 1fr;align-items:flex-start;gap:8px;}
    .pob-import-card .step-icon-wrap{width:28px;height:28px;min-width:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1px solid rgba(74,158,255,0.5);background:rgba(74,158,255,0.15);grid-column:1;}
    .pob-import-card .step-icon{font-size:16px;line-height:1;color:#4a9eff;}
    .pob-import-card .step-desc-wrap{grid-column:2;display:flex;flex-direction:column;gap:6px;min-width:0;position:relative;}
    .pob-import-card .step-desc{color:#e0f2fe;font-weight:600;line-height:1.4;font-size:calc(var(--font-size) + 1px);}
    .pob-import-card .step-hint{padding:6px 0 0 0;font-size:calc(var(--font-size) - 1px);color:#bae6fd;line-height:1.4;font-style:italic;}
    .pob-import-card .pob-import-btn{margin-top:8px;padding:8px 16px;background:rgba(74,158,255,0.3);border:1px solid rgba(74,158,255,0.6);border-radius:6px;color:#e0f2fe;font-weight:600;cursor:pointer;transition:all 0.2s;font-size:calc(var(--font-size));display:inline-flex;align-items:center;gap:6px;}
    .pob-import-card .pob-import-btn:hover{background:rgba(74,158,255,0.5);border-color:rgba(74,158,255,0.8);transform:translateY(-1px);}
    .pob-import-card.checked{opacity:0.6;}
    .pob-import-card.checked .step-desc{color:#888;text-decoration:line-through;}
    .zone-header{display:flex;align-items:center;gap:10px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid rgba(74,222,128,0.2);cursor:pointer;}
    .zone-checkbox{width:18px;height:18px;cursor:pointer;accent-color:#4ade80;}
    .skip-to-btn{margin-left:auto;background:transparent;border:none;color:#888;padding:2px 4px;cursor:pointer;font-size:calc(var(--font-size) - 1px);opacity:0.5;transition:opacity 0.2s;}
    .skip-to-btn:hover{opacity:1;color:#aaa;}
    .leveling-step .skip-to-btn{position:absolute;top:8px;right:8px;z-index:10;}
    .zone-name{flex:1;font-weight:700;color:#4ade80;font-size:calc(var(--font-size) + 1px);}
    .task-list{display:flex;flex-direction:column;gap:6px;padding:0;margin:0;}
  .task-item{display:table;width:100%;table-layout:fixed;border-collapse:collapse;font-size:var(--font-size);}
    .task-checkbox{display:table-cell;width:24px;vertical-align:top;padding:2px 4px 0 0;}
    .task-checkbox input{width:20px;height:20px;cursor:pointer;}
  .task-bullet{display:table-cell;width:30px;text-align:center;vertical-align:top;font-size:calc(var(--font-size) + 2px);padding:2px 4px 0 0;}
  .task-content{display:table-cell;width:auto;vertical-align:top;padding:0;position:relative;}
  .task-desc{color:#ddd;line-height:1.4;word-wrap:break-word;overflow-wrap:break-word;word-break:break-word;padding-left:2px;font-size:var(--font-size);}
  .task-desc-text{display:inline-block;word-break:break-word;}
  .task-desc.checked{color:#888;text-decoration:line-through;opacity:0.6;}
    .task-hint{font-size:calc(var(--font-size) - 2px);color:#999;font-style:italic;margin-top:2px;}
    .task-reward{font-size:calc(var(--font-size) - 2px);color:#4ade80;margin-top:2px;}
  .leveling-step{display:flex;gap:10px;padding:14px 12px;margin-bottom:8px;background:rgba(255,255,255,0.03);border-left:3px solid rgba(255,255,255,0.3);border-radius:8px;transition:all 0.25s;overflow:visible;position:relative;}
    .leveling-step.current{background:rgba(255,255,255,0.15);padding:16px 14px;box-shadow:0 2px 8px rgba(0,0,0,0.3);border-left-color:rgba(254,192,118,0.8);}
    .leveling-step.priority{border-left-width:4px;}
    .leveling-step.priority.current{box-shadow:0 0 20px rgba(254,192,118,0.3);}
    .step-checkbox{width:18px;height:18px;min-width:18px;margin-top:2px;cursor:pointer;flex-shrink:0;}
  .step-content{flex:1 1 auto;display:grid;grid-template-columns:1fr;gap:6px;position:relative;}
  .step-main{display:grid;grid-template-columns:28px 1fr;align-items:flex-start;gap:8px;}
    .step-icon-wrap{width:28px;height:28px;min-width:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1px solid rgba(255,255,255,0.2);grid-column:1;}
    .step-icon{font-size:16px;line-height:1;}
  .step-desc-wrap{grid-column:2;display:flex;flex-direction:column;gap:4px;min-width:0;position:relative;}
    .zone-label{font-size:calc(var(--font-size) - 2px);color:rgba(254,192,118,0.7);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;}
  .step-desc{color:#fff;font-weight:600;line-height:1.4;font-size:calc(var(--font-size) + 1px);word-wrap:break-word;overflow-wrap:break-word;display:block;word-break:break-word;padding-left:0;margin-left:0;text-indent:0;position:relative;}
  .step-desc-text{display:block;word-break:break-word;padding-left:0;margin-left:0;text-indent:0;-webkit-font-smoothing:antialiased;}
    .step-desc.checked{color:#888;text-decoration:line-through;opacity:0.6;}
    .step-meta{display:flex;flex-wrap:wrap;gap:8px;padding-left:36px;font-size:calc(var(--font-size) - 1px);}
    .badge{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:4px;border:1px solid;font-size:calc(var(--font-size) - 2px);font-weight:600;}
    .step-hint{padding:4px 10px 4px 36px;font-size:calc(var(--font-size) - 1px);color:#b8b8b8;line-height:1.4;font-style:italic;}
    .league-icon{display:inline-flex;font-size:12px;cursor:help;position:relative;margin-left:4px;opacity:0.7;}
    .league-icon:hover{opacity:1;}
    .league-icon .tooltip{position:absolute;bottom:100%;left:50%;transform:translateX(-50%);background:rgba(20,20,28,0.98);border:1px solid rgba(254,192,118,0.5);padding:6px 10px;border-radius:6px;font-size:10px;color:#ddd;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity 0.2s;margin-bottom:4px;z-index:1000;box-shadow:0 4px 12px rgba(0,0,0,0.5);}
    .league-icon:hover .tooltip{opacity:1;}
    .layout-tip-icon{display:inline-flex;cursor:help;position:relative;margin-left:6px;}
    .layout-tip-icon .more-pill{display:inline-block;padding:2px 8px;background:rgba(74,158,255,0.2);border:1px solid rgba(74,158,255,0.5);border-radius:10px;font-size:10px;color:#4a9eff;font-weight:600;opacity:0.8;transition:all 0.2s;}
    .layout-tip-icon:hover .more-pill{opacity:1;background:rgba(74,158,255,0.3);border-color:rgba(74,158,255,0.7);}
    .layout-tip-icon .tooltip{position:fixed;background:rgba(20,20,28,0.98);border:2px solid rgba(74,158,255,0.8);color:#e0e0e0;white-space:normal;word-wrap:break-word;overflow-wrap:break-word;width:320px;max-width:90vw;font-weight:400;font-size:11px;line-height:1.5;padding:12px 14px;box-shadow:0 8px 24px rgba(0,0,0,0.9), 0 0 40px rgba(74,158,255,0.3);pointer-events:none;opacity:0;transition:opacity 0.2s;z-index:99999;border-radius:8px;}
    .layout-tip-icon:hover .tooltip{opacity:1;}
    
    /* Timer Tooltip Styles */
    .timer-tooltip{position:fixed;bottom:auto;left:auto;background:linear-gradient(135deg, rgba(30,30,40,0.98) 0%, rgba(20,20,30,0.98) 100%);border:2px solid rgba(254,192,118,0.6);padding:12px 16px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.7), 0 0 20px rgba(254,192,118,0.2);pointer-events:none;opacity:0;transition:opacity 0.3s ease, transform 0.3s ease;z-index:99999;min-width:220px;}
    .timer-display:hover .timer-tooltip{opacity:1;}
    .timer-tooltip-header{font-size:13px;font-weight:700;color:#fec076;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(254,192,118,0.3);text-align:center;letter-spacing:0.5px;text-transform:uppercase;}
    .timer-tooltip-row{display:flex;justify-content:space-between;align-items:center;padding:5px 0;font-size:12px;color:#e0e0e0;}
    .timer-tooltip-row.current{background:rgba(254,192,118,0.1);margin:0 -8px;padding:6px 8px;border-radius:5px;border-left:3px solid #fec076;}
    .timer-tooltip-row.total{margin-top:8px;padding-top:10px;border-top:1px solid rgba(254,192,118,0.3);font-weight:700;font-size:13px;color:#fec076;}
    .timer-tooltip-label{font-weight:600;color:#b8b8b8;display:flex;align-items:center;gap:6px;}
    .timer-tooltip-row.current .timer-tooltip-label{color:#fec076;}
    .timer-tooltip-value{font-family:monospace;font-size:13px;font-weight:700;color:#fff;letter-spacing:0.5px;}
    .timer-tooltip-row.total .timer-tooltip-value{color:#fec076;font-size:14px;}
    .timer-display{position:relative;cursor:help;}
    
    /* PoB Gem Compact Display Styles */
    .pob-gems-wrapper{margin-left:-36px;margin-right:-14px;padding:4px 14px 4px 36px;}
    .pob-gem-compact{display:flex;align-items:center;gap:4px;padding:1px 0;font-size:calc(var(--font-size) - 1px);line-height:1.3;width:100%;}
    .pob-gem-pill{display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:3px;transition:all 0.12s;border:none;font-size:calc(var(--font-size) - 1px);flex-wrap:nowrap;flex:1;min-width:0;overflow:hidden;}
    .pob-gem-pill:hover{background:rgba(255,255,255,0.05);transform:translateY(-1px);}
    .pob-gem-icon{font-size:9px;line-height:1;}
    .pob-gem-image{width:20px;height:20px;object-fit:contain;flex-shrink:0;}
    .pob-gem-image.poe2{border-radius:3px;border:1px solid rgba(74,158,255,0.3);background:rgba(0,0,0,0.3);padding:2px;}
    .pob-gem-verb{font-weight:500;color:rgba(255,255,255,0.85);font-size:calc(var(--font-size) - 2px);text-transform:uppercase;letter-spacing:0.3px;flex:0 0 auto;white-space:nowrap;margin-right:2px;}
    .pob-gem-name-inline{font-weight:500;flex:1 1 auto;font-size:calc(var(--font-size) - 1px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:60px;margin-right:8px;}
    .pob-gem-vendor{font-size:calc(var(--font-size) - 2px);color:rgba(255,255,255,0.4);font-style:italic;flex:0 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:30px;max-width:80px;text-align:right;}
    .pob-gem-cost{font-size:10px;opacity:0.6;margin-left:4px;flex-shrink:0;}
    .pob-gem-set-tag{font-size:8px;padding:1px 4px;background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.15);border-radius:2px;color:rgba(255,255,255,0.45);font-weight:500;white-space:nowrap;cursor:default;flex:0 1 auto;overflow:hidden;text-overflow:ellipsis;min-width:30px;max-width:80px;text-align:center;margin-left:4px;}
    .pob-gem-set-tooltip{cursor:help;position:relative;}
    .pob-gem-set-tooltip:hover{background:rgba(74,222,128,0.15);color:rgba(255,255,255,0.65);}
    
    /* History Modal Styles */
    .history-modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);display:none;align-items:center;justify-content:center;z-index:999999;backdrop-filter:blur(8px);animation:fadeIn 0.2s;}
    .history-modal-overlay.visible{display:flex;}
    @keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
    .history-modal{background:linear-gradient(135deg, rgba(25,28,35,0.98) 0%, rgba(20,23,30,0.98) 100%);border:2px solid rgba(254,192,118,0.6);border-radius:12px;max-width:720px;width:90vw;max-height:85vh;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.9), 0 0 40px rgba(254,192,118,0.3);animation:slideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);}
    @keyframes slideIn{from{transform:scale(0.8) translateY(-20px);opacity:0;}to{transform:scale(1) translateY(0);opacity:1;}}
    .history-modal-header{padding:14px 18px;background:linear-gradient(135deg, rgba(254,192,118,0.15) 0%, rgba(254,192,118,0.05) 100%);border-bottom:2px solid rgba(254,192,118,0.3);display:flex;align-items:center;justify-content:space-between;}
    .history-modal-title{font-size:16px;font-weight:700;color:#fec076;display:flex;align-items:center;gap:8px;letter-spacing:0.5px;}
    .history-modal-close{background:rgba(192,57,43,0.7);border:1px solid rgba(192,57,43,0.9);color:#fff;font-size:16px;width:26px;height:26px;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;}
    .history-modal-close:hover{background:rgba(231,76,60,0.9);transform:scale(1.1);}
    .history-modal-content{padding:12px 16px;overflow-y:auto;max-height:calc(85vh - 100px);}
    .history-acts-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;}
    .history-act-section{padding:12px;background:rgba(40,44,52,0.5);border-left:3px solid rgba(74,158,255,0.6);border-radius:6px;cursor:pointer;transition:all 0.2s;}
    .history-act-section:hover{background:rgba(40,44,52,0.7);border-left-color:rgba(74,158,255,0.9);}
    .history-act-section.expanded{background:rgba(40,44,52,0.8);}
    .history-act-header{font-size:14px;font-weight:700;color:#4a9eff;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;}
    .history-act-title{display:flex;align-items:center;gap:6px;}
    .history-expand-icon{font-size:12px;color:#9ca3af;transition:transform 0.2s;}
    .history-act-section.expanded .history-expand-icon{transform:rotate(180deg);}
    .history-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-bottom:0;}
    .history-stat{padding:6px 8px;background:rgba(30,34,42,0.8);border-radius:4px;border:1px solid rgba(255,255,255,0.08);}
    .history-stat-label{font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:1px;}
    .history-stat-value{font-size:13px;font-weight:700;font-family:monospace;color:#fff;}
    .history-stat-value.best{color:#4ade80;}
    .history-stat-value.average{color:#9ca3af;}
    .history-runs-container{max-height:0;overflow:hidden;transition:max-height 0.3s ease-out,margin-top 0.3s ease-out;}
    .history-act-section.expanded .history-runs-container{max-height:500px;margin-top:10px;}
    .history-runs-header{font-size:11px;font-weight:600;color:#b8b8b8;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;}
    .history-run-item{padding:5px 8px;background:rgba(30,34,42,0.5);border-radius:3px;margin-bottom:3px;display:flex;justify-content:space-between;align-items:center;font-size:11px;border-left:2px solid transparent;}
    .history-run-item.is-best{border-left-color:#4ade80;background:rgba(74,222,128,0.1);}
    .history-run-time{font-family:monospace;font-weight:700;color:#fff;font-size:11px;}
    .history-run-date{color:#9ca3af;font-size:9px;}
    .history-run-date{color:#9ca3af;font-size:10px;}
    .history-empty{text-align:center;padding:40px 20px;color:#9ca3af;font-size:14px;}
    .history-empty-icon{font-size:48px;margin-bottom:12px;opacity:0.5;}
    
    ::-webkit-scrollbar{width:8px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:rgba(254,192,118,0.3);border-radius:4px;}::-webkit-scrollbar-thumb:hover{background:rgba(254,192,118,0.5);}
    .act-dropdown::-webkit-scrollbar{width:6px;}
    .act-dropdown::-webkit-scrollbar-track{background:rgba(0,0,0,0.2);border-radius:3px;}
    .act-dropdown::-webkit-scrollbar-thumb{background:rgba(254,192,118,0.4);border-radius:3px;}
    .act-dropdown::-webkit-scrollbar-thumb:hover{background:rgba(254,192,118,0.6);}
  </style>
</head>
<body>
<div class='window-frame' id='windowFrame'>
  <div class='window' id='mainWindow'>
  <div class='drag-handle' id='dragHandle'>
    <div class='ultra-drag-overlay' style='position:absolute;top:0;left:0;right:0;bottom:0;-webkit-app-region:drag;pointer-events:auto;z-index:1;'></div>
    <div id='minimalCharacterInfo' style='font-size:9px;color:rgba(255,255,255,0.85);font-weight:600;text-align:center;padding:2px 6px;background:rgba(0,0,0,0.3);border-radius:3px;margin-bottom:2px;display:none;user-select:none;-webkit-user-select:none;cursor:move;position:relative;z-index:2;'></div>
    <div class='drag-handle-row'>
      <span class='drag-handle-icon'>⋮⋮</span>
      <div class='minimal-nav'>
        <button class='minimal-btn' id='minimalPrevBtn'>◀ Prev</button>
        <button class='minimal-btn' id='minimalNextBtn'>Next ▶</button>
      </div>
      <button class='header-btn' id='goToUltraBtn' title='Go to Ultra Minimal'>⬇</button>
      <button class='header-btn' id='backToNormalBtn' title='Back to Normal'>⬆</button>
    </div>
    <div class='drag-handle-info'>
      <div class='drag-handle-timer' id='dragHandleTimer'>Act1 00:00</div>
      <div class='drag-handle-progress'>
        <div class='drag-handle-progress-bar'><div class='drag-handle-progress-fill' id='dragHandleProgressFill' style='width:0%'></div></div>
        <div class='drag-handle-progress-text' id='dragHandleProgressText'>0%</div>
      </div>
      <div class='timer-controls'>
        <button class='timer-btn' id='dragTimerStartPause' title='Start/Pause timer'>Start</button>
        <button class='timer-btn' id='dragTimerReset' title='Reset timer'>Reset</button>
      </div>
    </div>
  </div>
  <div class='header'>
    <span class='zone-icon'>⚡</span>
    <div class='header-content'>
      <div class='act-selector-wrapper' id='actSelectorWrapper'>
        <div class='act-selector-btn' id='actSelectorBtn'>
          <div class='act-selector-label'>
            <div class='act-selector-title'>
              <span id='actSelectorText'>Act 1</span>
              <span class='act-progress-mini' id='actProgressMini'>0/0</span>
            </div>
            <div class='act-selector-name' id='actSelectorName'>The Awakening</div>
          </div>
          <span class='act-dropdown-arrow'>▼</span>
        </div>
        <div class='act-dropdown' id='actDropdown'>
          <!-- Dropdown items will be dynamically inserted here -->
        </div>
      </div>
      <div class='subtitle' id='headerSubtitle'>Loading...</div>
    </div>
    <div class='header-buttons'>
      <button class='header-btn' id='minimalBtn' title='Minimize to compact view'>◧</button>
      <button class='header-btn' id='settingsBtn' title='Settings'>⚙️</button>
      <div class='close' onclick='window.close()'>×</div>
    </div>
  </div>
  <div class='controls'>
    <button class='control-btn' id='prevBtn' title='Previous step'>◀ Prev</button>
    <div class='progress-bar'><div class='progress-fill' id='progressFill' style='width:0%'></div></div>
    <div class='progress-text' id='progressText'>0%</div>
    <button class='control-btn' id='nextBtn' title='Next step'>Next ▶</button>
  </div>
  <div class='timer-row'>
    <div class='timer-display' id='timerDisplay'><span id='timerText'>Act1 00:00</span></div>
    <div id='characterInfo' style='font-size:11px;color:rgba(255,255,255,0.8);font-weight:600;margin-left:auto;margin-right:8px;display:none;'></div>
    <div class='timer-controls'>
      <button class='timer-btn' id='timerStartPause' title='Start/Pause timer'>Start</button>
      <button class='timer-btn' id='timerReset' title='Reset timer'>Reset</button>
    </div>
  </div>
  <div class='list' id='stepsList'></div>
  
  <!-- Footer with update badge -->
  <div class='footer' id='footer'>
    <div style='display:flex;align-items:center;gap:8px;'>
      <!-- Left side can hold tabs/labels later if needed -->
    </div>
    <div class='footer-actions'>
      <button id='updateBadge' title='New update available'>New Update</button>
    </div>
  </div>
  
  <!-- History Modal -->
  <div class='history-modal-overlay' id='historyModal'>
    <div class='history-modal'>
      <div class='history-modal-header'>
        <div class='history-modal-title'>📊 Run History</div>
        <button class='history-modal-close' id='closeHistoryModal'>×</button>
      </div>
      <div class='history-modal-content' id='historyModalContent'>
        <!-- Content will be populated dynamically -->
      </div>
    </div>
  </div>
</div>
</div>
<script>
const {ipcRenderer} = require('electron');

// Overlay version
const overlayVersion = '${overlayVersion}';

// Load gem database for colors and quest data for gem matching
let gemDatabase = null;
let questsDatabase = null;
let gemColours = null;
let questNameIndex = null;

// Injected JSON data from main process
const INJECTED_GEMS_DATA = ${gemsJSON};
const INJECTED_QUESTS_DATA = ${questsJSON};
const INJECTED_GEM_COLOURS = ${gemColoursJSON};

// Security: Escape HTML to prevent XSS attacks
function escapeHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

async function loadGemDatabase() {
  if (gemDatabase) return gemDatabase;
  try {
    gemDatabase = INJECTED_GEMS_DATA;
    console.log('[GemDB] Loaded', Object.keys(gemDatabase).length, 'gems');
  } catch (err) {
    console.error('[GemDB] Failed to load gem database:', err);
    gemDatabase = {};
  }
  return gemDatabase;
}

async function loadQuestsDatabase() {
  if (questsDatabase) return questsDatabase;
  try {
    questsDatabase = INJECTED_QUESTS_DATA;
    questNameIndex = null;
    console.log('[QuestsDB] Loaded', Object.keys(questsDatabase).length, 'quests');
  } catch (err) {
    console.error('[QuestsDB] Failed to load quests database:', err);
    questsDatabase = {};
    questNameIndex = null;
  }
  return questsDatabase;
}

async function loadGemColours() {
  if (gemColours) return gemColours;
  try {
    gemColours = INJECTED_GEM_COLOURS;
    console.log('[GemColours] Loaded gem color mapping:', gemColours);
  } catch (err) {
    console.error('[GemColours] Failed to load gem colours:', err);
    // Fallback colors
    gemColours = {
      'strength': '#ff3333',
      'dexterity': '#33ff33',
      'intelligence': '#3333ff',
      'none': '#ffffff'
    };
  }
  return gemColours;
}


// Initialize databases
Promise.all([loadGemDatabase(), loadQuestsDatabase(), loadGemColours()]);

let state = {
  mode: 'tall',
  showCompleted: false,
  groupByZone: true,
  showHints: true,
  showOptional: true,
  autoDetectZones: true,
  autoDetectMode: 'hybrid', // 'strict' | 'trust' | 'hybrid' (default: hybrid)
  showTreeNodeDetails: false,
  autoDetectLevelingSets: true,
  opacity: 96,
  fontSize: 12,
  zoom: 100,
  minimalMode: 'normal', // 'normal', 'minimal', 'ultra'
  visibleSteps: 99,
  completedSteps: new Set(),
  levelingData: null,
  pobBuild: null,
  currentActIndex: 0, // Currently selected act (0-based index)
  characterName: null,
  characterClass: null,
  characterLevel: null,
  timer: {
    isRunning: false,
    startTime: 0,
    elapsed: 0,
    currentAct: 1
  },
  actTimers: {}, // Store completion time for each act: { 1: 1234567, 2: 2345678, ... }
  globalTakenGems: new Set() // Track gem IDs that have been taken as quest rewards
};

let timerInterval = null;

const STEP_TYPES = {
  navigation: { icon: '➜', color: '#E0E0E0', label: 'Navigate' },
  waypoint: { icon: '⚑', color: '#00D4FF', label: 'Waypoint' },
  town: { icon: '🏛', color: '#FEC076', label: 'Town' },
  npc_quest: { icon: '💬', color: '#FFB84D', label: 'Quest Turn-in' },
  quest: { icon: '❗', color: '#FFEB3B', label: 'Quest Objective' },
  kill_boss: { icon: '☠', color: '#FF5252', label: 'Boss Fight' },
  trial: { icon: '⚗', color: '#4ADE80', label: 'Labyrinth Trial' },
  passive: { icon: '★', color: '#4ADE80', label: 'Passive Point' },
  optional: { icon: 'ℹ', color: '#9E9E9E', label: 'Optional' }
};

function escapeHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// Clean skill set title for display: extract "Act X" or "Level X" patterns, otherwise truncate
function cleanSkillSetTitle(title) {
  if (!title) return '';
  
  // Try to extract "Act X" pattern
  const actMatch = title.match(/Act\\s+(\\d+)/i);
  if (actMatch) return 'Act ' + actMatch[1];
  
  // Try to extract "Level X" or "Level X-Y" pattern
  const levelMatch = title.match(/Level\\s+(\\d+(?:-\\d+)?)/i);
  if (levelMatch) return 'Lvl ' + levelMatch[1];
  
  // Only truncate if there's no space in the title (single long word)
  if (!title.includes(' ')) {
    return title.substring(0, 5) + '...';
  }
  
  // Otherwise return as-is (will be truncated by CSS if needed)
  return title;
}

function cleanDescription(desc) {
  return (desc || '').replace(/^\\\[LEAGUE START\\\]\s*/i, '');
}

function getLeagueIcon(step) {
  if (!step.optionalNote || !step.optionalNote.toLowerCase().includes('league')) return '';
  return '<span class="league-icon">🏁<span class="tooltip">League Start Recommended</span></span>';
}

function getLayoutTipIcon(step) {
  if (!step.layoutTip) return '';
  return '<span class="layout-tip-icon"><span class="more-pill">...</span><span class="tooltip">'+escapeHtml(step.layoutTip)+'</span></span>';
}

function getHintIcon(hint) {
  if (!hint) return '💡';
  
  const lowerHint = hint.toLowerCase();
  
  // Check for specific directional keywords (most specific first)
  // Diagonal directions (8 directions)
  if (lowerHint.includes('north-east') || lowerHint.includes('northeast')) return '↗️';
  if (lowerHint.includes('north-west') || lowerHint.includes('northwest')) return '↖️';
  if (lowerHint.includes('south-east') || lowerHint.includes('southeast')) return '↘️';
  if (lowerHint.includes('south-west') || lowerHint.includes('southwest')) return '↙️';
  
  // Cardinal directions
  if (lowerHint.includes('north')) return '⬆️';
  if (lowerHint.includes('south')) return '⬇️';
  if (lowerHint.includes('east')) return '➡️';
  if (lowerHint.includes('west')) return '⬅️';
  
  // Clock positions (common in PoE guides)
  if (lowerHint.includes("1 o'clock") || lowerHint.includes("2 o'clock")) return '↗️';
  if (lowerHint.includes("4 o'clock") || lowerHint.includes("5 o'clock")) return '↘️';
  if (lowerHint.includes("7 o'clock") || lowerHint.includes("8 o'clock")) return '↙️';
  if (lowerHint.includes("10 o'clock") || lowerHint.includes("11 o'clock")) return '↖️';
  if (lowerHint.includes("12 o'clock")) return '⬆️';
  if (lowerHint.includes("3 o'clock")) return '➡️';
  if (lowerHint.includes("6 o'clock")) return '⬇️';
  if (lowerHint.includes("9 o'clock")) return '⬅️';
  
  // Movement/direction keywords
  if (lowerHint.includes('upward') || lowerHint.includes('going up')) return '⬆️';
  if (lowerHint.includes('downward') || lowerHint.includes('going down')) return '⬇️';
  if (lowerHint.includes('left')) return '⬅️';
  if (lowerHint.includes('right')) return '➡️';
  
  // Circular movements
  if (lowerHint.includes('clockwise') && lowerHint.includes('counter')) return '↺';
  if (lowerHint.includes('clockwise')) return '↻';
  
  // Generic movement (follow, head, move, etc.) without specific direction
  if (lowerHint.match(/follow|head|move|go|travel|navigate|enter/i)) return '➡️';
  
  // Default to lightbulb for tips, hints, and other information
  return '💡';
}

// Track which gems have been shown to avoid duplicates (used during seeding)
const shownGems = new Set();
// Cache gems per step (populated during seeding, used during render)
const stepGemCache = new Map(); // key: "actNum-stepIndex" -> value: array of gem objects

function normalizeNpcName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\\s]/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

function npcMatches(candidateNpc, stepNpc) {
  if (!stepNpc) return true;
  const filter = normalizeNpcName(stepNpc);
  if (!filter) return true;
  const candidate = normalizeNpcName(candidateNpc);
  if (!candidate) return false;
  return candidate === filter || candidate.includes(filter) || filter.includes(candidate);
}

function normalizeQuestKey(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\\(.*?\\)/g, '')
  .replace(/['’\`]/g, '')
    .replace(/[^a-z0-9\\s]/g, ' ')
    .replace(/\\b(act|part)\\s*\\d+\\b/g, '')
    .replace(/\\bquest\\b/g, '')
    .replace(/\\s+/g, ' ')
    .trim();
}

function getQuestKeyVariants(rawName) {
  const variants = new Set();
  const primary = normalizeQuestKey(rawName);
  if (primary) {
    variants.add(primary);
    if (primary.startsWith('the ')) {
      variants.add(primary.replace(/^the\\s+/, ''));
    }
  }
  return Array.from(variants);
}

function splitStepQuestNames(raw) {
  if (!raw) return [];
  const cleaned = raw
    .replace(/\\(.*?\\)/g, '')
    .replace(/Quest Reward:?/ig, '')
    .replace(/Rewards:?/ig, '')
    .replace(/Optional:?/ig, '');
  return cleaned
    .split(/\\s*(?:&|,|\\/|\\+| and )\\s*/i)
    .map(part => part.trim())
    .filter(Boolean);
}

function ensureQuestNameIndex() {
  if (questNameIndex) return questNameIndex;
  questNameIndex = {};
  if (!questsDatabase) return questNameIndex;
  Object.values(questsDatabase).forEach((quest) => {
    const variants = getQuestKeyVariants(quest.name);
    variants.forEach((key) => {
      if (!questNameIndex[key]) {
        questNameIndex[key] = [];
      }
      questNameIndex[key].push(quest.id);
    });
  });
  return questNameIndex;
}

function findQuestIdsForStep(step, actNumber, stepNpc) {
  if (!step || !step.quest) return [];
  const index = ensureQuestNameIndex();
  const questIds = new Set();
  const questNames = splitStepQuestNames(step.quest);

  questNames.forEach((rawName) => {
    const variants = getQuestKeyVariants(rawName);
    let matched = false;
    variants.forEach((variant) => {
      const matches = index[variant];
      if (matches) {
        matches.forEach((id) => questIds.add(id));
        matched = true;
      }
    });

    if (!matched) {
      const relaxed = variants
        .map(v => v.replace(/\\b(the|a|an)\\s+/g, '').trim())
        .filter(Boolean);
      relaxed.forEach((variant) => {
        const matches = index[variant];
        if (matches) {
          matches.forEach((id) => questIds.add(id));
        }
      });
    }
  });

  if (questIds.size === 0 && stepNpc) {
    Object.entries(questsDatabase || {}).forEach(([questId, quest]) => {
      if (actNumber && quest.act && parseInt(quest.act, 10) !== actNumber) {
        return;
      }
      const rewardOffers = Object.values(quest.reward_offers || {});
      const hasMatchingNpc = rewardOffers.some((offer) => {
        if (npcMatches(offer.quest_npc || '', stepNpc)) {
          return true;
        }
        if (!offer.vendor) {
          return false;
        }
        return Object.values(offer.vendor).some((vendorInfo) => npcMatches((vendorInfo && vendorInfo.npc) || '', stepNpc));
      });
      if (hasMatchingNpc) {
        questIds.add(questId);
      }
    });
  }

  return Array.from(questIds);
}

function isClassValid(classList, characterClass) {
  if (!Array.isArray(classList)) return false;
  if (classList.length === 0) return true;
  const normalizedClass = (characterClass || '').toLowerCase();
  return classList.some((c) => c.toLowerCase() === normalizedClass);
}

function isLastOccurrenceOfQuest(currentStep, questName, allSteps) {
  const normalizedQuestName = normalizeQuestKey(questName);
  const currentStepIndex = allSteps.findIndex(s => s.id === currentStep.id);
  
  // Look ahead to see if this quest appears in any later steps
  for (let i = currentStepIndex + 1; i < allSteps.length; i++) {
    const futureStep = allSteps[i];
    if (futureStep.quest) {
      const futureQuestNames = splitStepQuestNames(futureStep.quest);
      for (const fqName of futureQuestNames) {
        const variants = getQuestKeyVariants(fqName);
        if (variants.some(v => v === normalizedQuestName)) {
          return false; // Quest appears again later
        }
      }
    }
  }
  
  return true; // This is the last occurrence
}

function getPobGemsForStep(step, actNumber, allSteps = [], stepIndex = 0, isSeeding = false) {
  if (!state.pobBuild || !state.pobBuild.gems) {
    return [];
  }

  // Allow both 'npc_quest' and 'optional' types (optional includes vendor-only steps)
  if (step.type !== 'npc_quest' && step.type !== 'optional') return [];

  // Create cache key for this step
  const cacheKey = actNumber + '-' + stepIndex;
  
  // During rendering, return cached result if available
  if (!isSeeding && stepGemCache.has(cacheKey)) {
    return stepGemCache.get(cacheKey);
  }

  // ALWAYS use PoB class if available, fallback to saved character class, then default
  const characterClass = state.pobBuild?.className || state.characterClass || 'Marauder';

  function extractStepNpc(desc) {
    if (!desc || typeof desc !== 'string') return null;
    const stripped = desc.replace(/^\[[^\]]*\]\s*/, '').trim();
    const patterns = [
      /^(?:Talk|Speak)\s+to\s+([A-Za-z'\s-]+)/i,
      /^Turn in quests?\s+to\s+([A-Za-z'\s-]+)/i,
      /^Return to\s+([A-Za-z'\s-]+)/i,
      /^Visit\s+([A-Za-z'\s-]+)/i,
      /^Give\s+.+\s+to\s+([A-Za-z'\s-]+)/i,
      /(?:Get|Buy).*gems.*from\s+([A-Za-z'\s-]+)/i
    ];

    for (const pattern of patterns) {
      const match = stripped.match(pattern);
      if (match) {
        return match[1].split(/(?:,|\s+and\s+|\s*&\s*)/i)[0].trim();
      }
    }
    return null;
  }

  const stepNpc = extractStepNpc(step.description || '');
  let questIds = [];
  
  // Try to find quest IDs from the step's quest field
  if (step.quest) {
    questIds = findQuestIdsForStep(step, actNumber, stepNpc);
  }

  
  // If no quest or no quest IDs found, but we have an NPC, find vendor quests for this NPC
  if (questIds.length === 0 && stepNpc && questsDatabase) {
    const npcLower = stepNpc.toLowerCase();
    for (const [qId, qData] of Object.entries(questsDatabase)) {
      // FIX: act is a string, not a number!
      if (String(qData.act) !== String(actNumber)) continue;
      if (!qData.reward_offers) continue;
      
      for (const offer of Object.values(qData.reward_offers)) {
        // Check if this offer has vendor gems
        if (!offer.vendor || Object.keys(offer.vendor).length === 0) continue;
        
        // Check if ANY vendor gem has the matching NPC
        for (const gemData of Object.values(offer.vendor)) {
          const gemNpcLower = (gemData.npc || '').toLowerCase();
          if (gemNpcLower.includes(npcLower) || npcLower.includes(gemNpcLower)) {
            questIds.push(qId);
            break; // Found a match, move to next quest
          }
        }
      }
    }
  }

  if (questIds.length === 0) {
    if (isSeeding) stepGemCache.set(cacheKey, []);
    return [];
  }

  // Check if this is the last occurrence of the quest(s)
  const questNames = step.quest ? splitStepQuestNames(step.quest) : [];
  const isLastOccurrence = questNames.length > 0 
    ? questNames.every(qName => isLastOccurrenceOfQuest(step, qName, allSteps))
    : true; // For vendor-only steps (no quest), treat as last occurrence

  const takeGems = [];
  const buyGems = [];
  const takenGemIds = new Set();
  const takenQuestIds = new Set();
  const vendorGemIds = new Set();

  for (const questId of questIds) {
    const questData = questsDatabase[questId];
    if (!questData || !questData.reward_offers) {
      continue;
    }

    const rewardOffers = Object.values(questData.reward_offers || {});
    if (rewardOffers.length === 0) continue;

    // Iterate through POB gems (flat array)
    for (const pobGem of state.pobBuild.gems) {
      // Try exact match first, then try with " Support" suffix for support gems
      let gemEntry = Object.entries(gemDatabase).find(
        ([, gemData]) => gemData.name.toLowerCase() === pobGem.name.toLowerCase()
      );

      // If not found and gem doesn't already have "support" in name, try with " Support" suffix
      if (!gemEntry && !pobGem.name.toLowerCase().includes('support')) {
        const withSupport = pobGem.name + ' Support';
        gemEntry = Object.entries(gemDatabase).find(
          ([, gemData]) => gemData.name.toLowerCase() === withSupport.toLowerCase()
        );
      }

      if (!gemEntry) {
        continue;
      }

      const [gemId, gemData] = gemEntry;

      // ONLY show rewards on the LAST occurrence of the quest (when it's complete)
      if (!isLastOccurrence) {
        continue;
      }

      // FIRST PASS: Check ALL reward offers for quest rewards (TAKE)
      // This ensures we prioritize quest rewards over vendor rewards
      let foundAsQuestReward = false;
      
      if (!takenGemIds.has(gemId)) {
        for (const rewardOffer of rewardOffers) {
          const questRewards = rewardOffer.quest || {};
          const questReward = questRewards[gemId];
          if (questReward) {
            const classValid = isClassValid(questReward.classes || [], characterClass);
            if (classValid) {
              // Only actually add as TAKE if we haven't already taken a gem from this quest
              if (!takenQuestIds.has(questId)) {
                takeGems.push({
                  gemId,
                  name: gemData.name,
                  questId: questData.id || questId,
                  questName: questData.name,
                  questAct: questData.act,
                  rewardType: 'quest',
                  npc: rewardOffer.quest_npc,
                  isSupport: gemData.is_support,
                  skillSetTitle: pobGem.skillSetTitle,
                });
                takenGemIds.add(gemId);
                takenQuestIds.add(questId);
                state.globalTakenGems.add(gemId);
                foundAsQuestReward = true;
              }
              break;
            }
          }
        }
      }

      // SECOND PASS: Check vendor rewards (BUY)
      // Show as BUY if: not taken as quest reward AND (not already taken from another source)
      if (!foundAsQuestReward && !takenGemIds.has(gemId) && !state.globalTakenGems.has(gemId) && !vendorGemIds.has(gemId)) {
        for (const rewardOffer of rewardOffers) {
          const vendorRewards = rewardOffer.vendor || {};
          const vendorReward = vendorRewards[gemId];
          if (vendorReward && isClassValid(vendorReward.classes || [], characterClass)) {
            buyGems.push({
              gemId,
              name: gemData.name,
              questId: questData.id || questId,
              questName: questData.name,
              questAct: questData.act,
              rewardType: 'vendor',
              npc: vendorReward.npc || rewardOffer.quest_npc,
              isSupport: gemData.is_support,
              skillSetTitle: pobGem.skillSetTitle,
            });
            vendorGemIds.add(gemId);
            break;
          }
        }
      }
    }
  }

  const allGems = [...takeGems, ...buyGems];
  
  // During seeding: Filter by shownGems and cache the result
  if (isSeeding) {
    const filteredResults = allGems.filter((gem) => {
      const gemKey = gem.name.toLowerCase();
      if (shownGems.has(gemKey)) {
        return false; // Skip duplicates
      }
      shownGems.add(gemKey); // Mark as shown
      return true;
    });
    
    const results = filteredResults.map((gem) => ({
      name: gem.name,
      rewardType: gem.rewardType,
      act: parseInt(gem.questAct) || actNumber,
      quest: gem.questName,
      vendor: gem.npc,
      isSupport: gem.isSupport,
      skillSetTitle: gem.skillSetTitle
    }));
    
    stepGemCache.set(cacheKey, results); // Cache for later rendering
    return results;
  }
  
  // During rendering: This shouldn't happen as we return cached results above
  // But just in case, return empty
  return [];
}

function renderPobGemList(gems, currentActNumber) {
  if (!gems || gems.length === 0) return '';
  
  let html = '<div class="pob-gems-wrapper">';
  
  gems.forEach(gem => {
    const color = getGemColor(gem);
    const verb = gem.rewardType === 'vendor' ? 'Buy' : 'Take';
    const cost = gem.rewardType === 'vendor' ? getGemCost(gem) : '';
    const npcName = gem.vendor || 'NPC';
    
    // Get gem image path
    const imagePath = getGemImagePath(gem.name);
    const imageClass = overlayVersion === 'poe2' ? 'pob-gem-image poe2' : 'pob-gem-image';
    
    // Clean skillSet title for display
    const skillSetTag = gem.skillSetTitle ? cleanSkillSetTitle(gem.skillSetTitle) : '';
    const fullTitle = gem.skillSetTitle || '';
    const isTruncated = skillSetTag.endsWith('...');
    
    // Check if this gem is from the current act's skill set
    let isCurrentAct = false;
    if (gem.skillSetTitle && currentActNumber) {
      const skillSet = gem.skillSetTitle.toLowerCase();
      const actPattern = 'act ' + currentActNumber;
      isCurrentAct = skillSet.indexOf(actPattern) === 0;
    }

    
    // Apply extra saturation/brightness for current act gems - make it VERY obvious
    const gemPillStyle = isCurrentAct 
      ? 'border-left:3px solid ' + color + ';background:' + color + '50;' // Much brighter, thicker border
      : 'border-left:2px solid ' + color + ';background:' + color + '18;'; // Original subtle background
    
    html += '<div class="pob-gem-compact">';
    // Use subtle background colors with thin border for slick look
    html += '<span class="pob-gem-pill" style="' + gemPillStyle + '">';
    // Add gem image placeholder with data attribute (will be resolved after render)
    if (imagePath) {
      html += '<img data-gem-img="' + imagePath + '" class="' + imageClass + '" style="display:none;" />';
    }
    html += '<span class="pob-gem-verb">' + verb + '</span>';
    html += '<span class="pob-gem-name-inline">' + escapeHtml(gem.name) + '</span>';
    html += '<span class="pob-gem-vendor">' + escapeHtml(npcName) + '</span>';
    if (cost) {
      html += '<span class="pob-gem-cost">' + cost + '</span>';
    }
    // Add skill set tag if available, with tooltip for truncated names
    if (skillSetTag) {
      // Extra saturation for current act skill set tags too - make it VERY obvious
      const tagOpacity = isCurrentAct ? '30' : '08';
      const tagBorderOpacity = isCurrentAct ? '80' : '33';
      const tagFontWeight = isCurrentAct ? 'font-weight:700;' : '';
      const tagStyle = 'border-color:' + color + tagBorderOpacity + ';background:' + color + tagOpacity + ';' + tagFontWeight;
      if (isTruncated) {
        html += '<span class="pob-gem-set-tag pob-gem-set-tooltip" style="' + tagStyle + '" title="' + escapeHtml(fullTitle) + '">' + escapeHtml(skillSetTag) + '</span>';
      } else {
        html += '<span class="pob-gem-set-tag" style="' + tagStyle + '">' + escapeHtml(skillSetTag) + '</span>';
      }
    }
    html += '</span>';
    html += '</div>';
  });
  
  html += '</div>'; // Close pob-gems-wrapper
  
  return html;
}

// Helper to get gem image path - converts gem name to expected filename format
function getGemImagePath(gemName) {
  // Check if it's a support gem (has "Support: " prefix)
  const isSupport = gemName.startsWith('Support: ');
  
  // Remove "Support: " prefix
  const cleanName = gemName.replace(/^Support: /, '');
  
  // Convert to lowercase and replace spaces/special chars with underscores
  const slug = cleanName
    .toLowerCase()
    .replace(/[:']/g, '')  // Remove colons and apostrophes
    .replace(/\\s+/g, '_')  // Replace spaces with underscores
    .replace(/-/g, '_')    // Replace hyphens with underscores
    .replace(/[()]/g, '')  // Remove parentheses
    .trim();
  
  // Add _support suffix for support gems
  const filename = isSupport ? slug + '_support' : slug;
  
  // Determine game version folder
  const folder = overlayVersion === 'poe1' ? 'poe1/gems' : 'gems';
  
  // Return the bundled image path (relative, will be resolved via IPC)
  return folder + '/' + filename + '.webp';
}

// Async function to resolve gem image through IPC
async function resolveGemImageIpc(localPath) {
  if (!localPath) return null;
  try {
    const resolvedPath = await ipcRenderer.invoke('get-bundled-image-path', localPath);
    return resolvedPath;
  } catch (err) {
    console.error('[LevelingPopout] Error resolving image:', localPath, err);
    return null;
  }
}

function getGemColor(gem) {
  // Try to get color from gem database using gem-colours.json mapping
  if (gemDatabase && gemColours) {
    const gemEntry = Object.values(gemDatabase).find(
      (g) => g.name.toLowerCase() === gem.name.toLowerCase()
    );
    if (gemEntry) {
      // Use gem-colours.json mapping (loaded from leveling data)
      return gemColours[gemEntry.primary_attribute] || gemColours['none'] || '#9d7dff';
    }
  }
  
  // Fallback based on support gem status
  if (gem.isSupport) {
    return '#4a9eff'; // Blue for support
  }
  return '#4ade80'; // Green default
}

function getGemCost(gem) {
  // Disable inline cost icons (blue diamond etc.) per user request
  return '';
}

function groupStepsByZone(steps) {
  if (!state.groupByZone) return steps.map(s => ({zone:s.zone,zoneId:s.zoneId,steps:[s],allChecked:state.completedSteps.has(s.id),layoutTip:s.layoutTip}));
  
  const grouped = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    
    if (grouped.length > 0) {
      const lastGroup = grouped[grouped.length - 1];
      
      // Group by zoneId if available, otherwise fall back to zone name
      const sameZone = step.zoneId && lastGroup.zoneId 
        ? lastGroup.zoneId === step.zoneId
        : lastGroup.zone === step.zone;
      
      if (sameZone) {
        lastGroup.steps.push(step);
        lastGroup.allChecked = lastGroup.steps.every(s => state.completedSteps.has(s.id));
        continue;
      }
    }
    
    grouped.push({
      zone: step.zone,
      zoneId: step.zoneId,
      steps: [step],
      allChecked: state.completedSteps.has(step.id),
      layoutTip: step.layoutTip
    });
  }
  return grouped;
}

function saveState() {
  ipcRenderer.invoke('set-current-act-index', state.currentActIndex);
  ipcRenderer.invoke('save-act-timers', state.actTimers);
  // Save UI settings
  ipcRenderer.invoke('save-leveling-settings', {
    opacity: state.opacity,
    fontSize: state.fontSize,
    zoom: state.zoom,
    minimalMode: state.minimalMode,
    mode: state.mode,
    visibleSteps: state.visibleSteps,
    showHints: state.showHints,
    showOptional: state.showOptional,
    groupByZone: state.groupByZone,
    showTreeNodeDetails: state.showTreeNodeDetails,
    autoDetectLevelingSets: state.autoDetectLevelingSets,
    autoDetectMode: state.autoDetectMode
  });
}

function checkActCompletionAndAdvance() {
  if (!state.levelingData) return;
  
  const acts = state.levelingData.acts;
  const currentAct = acts[state.currentActIndex];
  
  if (!currentAct || !currentAct.steps) return;
  
  // Check if ALL required/visible steps in current act are completed
  // Apply same filtering as render: exclude optional and hidden steps when showOptional is false
  let allSteps = currentAct.steps;
  if (!state.showOptional) {
    allSteps = allSteps.filter(s => s.type !== 'optional' && s.hidden !== 'optional');
  }
  
  const completedCount = allSteps.filter(s => state.completedSteps.has(s.id)).length;
  const allCompleted = allSteps.length > 0 && completedCount === allSteps.length;
  
  console.log('[Act ' + currentAct.actNumber + '] Completion check: ' + (allCompleted ? 'COMPLETE' : 'INCOMPLETE') + ' (' + completedCount + '/' + allSteps.length + ')');
  
  if (allCompleted) {
    // Save completion time for this act
    const actNum = currentAct.actNumber;
    if (!state.actTimers[actNum]) {
      state.actTimers[actNum] = state.timer.elapsed;
      
      // Save this run to history database
      ipcRenderer.invoke('save-run', actNum, state.timer.elapsed).then(() => {
        console.log('Act ' + actNum + ' run saved to history: ' + formatTime(state.timer.elapsed));
        // Rebuild tooltip after saving to show updated comparison
        buildTimerTooltip(currentAct);
      });
      
      saveState();
      console.log('Act ' + actNum + ' completed in ' + formatTime(state.timer.elapsed));
    }
    
    // Auto-advance to next act if available
    if (state.currentActIndex < acts.length - 1) {
      const nextActIndex = state.currentActIndex + 1;
      console.log('Auto-advancing from Act ' + actNum + ' to Act ' + acts[nextActIndex].actNumber);
      
      state.currentActIndex = nextActIndex;
      state.timer.currentAct = state.currentActIndex + 1;
      
      // Reset timer for next act (start fresh)
      state.timer.startTime = Date.now();
      state.timer.elapsed = 0;
      
      saveState();
      render(); // Re-render to show new act
    } else {
      console.log('All acts completed!');
      render(); // Still need to re-render to update UI
    }
  } else {
    // Not complete, just re-render to update UI
    render();
  }
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return \`\${hours}h \${minutes}m \${seconds}s\`;
  } else if (minutes > 0) {
    return \`\${minutes}m \${seconds}s\`;
  } else {
    return \`\${seconds}s\`;
  }
}

// Optimized view mode update - only updates classes and mouse events WITHOUT re-rendering content
function updateViewMode() {
  const mainWindow = document.getElementById('mainWindow');
  const windowFrame = document.getElementById('windowFrame');
  const minimalBtn = document.getElementById('minimalBtn');
  const dragHandle = document.getElementById('dragHandle');
  
  if (!mainWindow || !minimalBtn) return;
  
  // Remove all mode classes
  mainWindow.classList.remove('minimal-mode', 'ultra-minimal-mode');
  minimalBtn.classList.remove('active', 'ultra');
  if (windowFrame) windowFrame.classList.remove('frame-minimal','frame-ultra');
  
  // Update background based on mode
  if (state.minimalMode === 'normal') {
    const opacityDecimal = (state.opacity / 100).toFixed(2);
    mainWindow.style.background = \`linear-gradient(135deg,rgba(20,20,28,\${opacityDecimal}),rgba(15,15,22,\${opacityDecimal}))\`;
  } else {
    mainWindow.style.background = 'transparent';
  }
  
  // Apply mode-specific settings
  if (state.minimalMode === 'minimal') {
    mainWindow.classList.add('minimal-mode');
    minimalBtn.classList.add('active');
    if (windowFrame) windowFrame.classList.add('frame-minimal');
  // Minimal mode is NOT click-through - window is fully interactable
    ipcRenderer.send('set-ignore-mouse-events', false);
  ipcRenderer.send('ultra-mode-change', { enabled: false });
    
    // Clean up ultra handlers if switching from ultra
    if (dragHandle && dragHandle._ultraMouseHandlers) {
      dragHandle.removeEventListener('mouseenter', dragHandle._ultraMouseHandlers.mouseEnterHandler);
      dragHandle.removeEventListener('mouseleave', dragHandle._ultraMouseHandlers.mouseLeaveHandler);
      delete dragHandle._ultraMouseHandlers;
      delete dragHandle.dataset.ultraHandlersSet;
    }
  } else if (state.minimalMode === 'ultra') {
  ipcRenderer.send('ultra-mode-change', { enabled: true });
    mainWindow.classList.add('ultra-minimal-mode');
    minimalBtn.classList.add('ultra');
    if (windowFrame) windowFrame.classList.add('frame-ultra');
    // In ultra mode we keep the window click-through by default and only enable input
    // while hovering the header so it can be dragged and buttons clicked.
    const enableWindowInput = () => ipcRenderer.send('set-ignore-mouse-events', false);
    const disableWindowInput = () => ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });

    // Setup mouse handlers only once
    if (dragHandle && !dragHandle.dataset.ultraHandlersSet) {
      dragHandle.dataset.ultraHandlersSet = 'true';
      let isOverHeader = false;
      const mouseEnterHandler = () => {
        isOverHeader = true;
        if (state.minimalMode === 'ultra') enableWindowInput();
      };

      const mouseLeaveHandler = () => {
        isOverHeader = false;
        setTimeout(() => {
          if (!isOverHeader && state.minimalMode === 'ultra') disableWindowInput();
        }, 50);
      };

      dragHandle.addEventListener('mouseenter', mouseEnterHandler);
      dragHandle.addEventListener('mouseleave', mouseLeaveHandler);
      // @ts-ignore - store handlers for cleanup
      dragHandle._ultraMouseHandlers = { mouseEnterHandler, mouseLeaveHandler };
    }

    // Default to click-through when switching into ultra (main also enforces)
    ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
  } else {
    // Normal mode
    ipcRenderer.send('set-ignore-mouse-events', false);
    ipcRenderer.send('ultra-mode-change', { enabled: false });
    if (windowFrame) windowFrame.classList.remove('frame-minimal','frame-ultra');
    
    if (dragHandle && dragHandle._ultraMouseHandlers) {
      dragHandle.removeEventListener('mouseenter', dragHandle._ultraMouseHandlers.mouseEnterHandler);
      dragHandle.removeEventListener('mouseleave', dragHandle._ultraMouseHandlers.mouseLeaveHandler);
      delete dragHandle._ultraMouseHandlers;
      delete dragHandle.dataset.ultraHandlersSet;
    }
  }
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return \`\${hours}h \${minutes}m \${seconds}s\`;
  } else if (minutes > 0) {
    return \`\${minutes}m \${seconds}s\`;
  } else {
    return \`\${seconds}s\`;
  }
}

function renderActSwitcher() {
  if (!state.levelingData) return;
  
  const actSelectorBtn = document.getElementById('actSelectorBtn');
  const actSelectorText = document.getElementById('actSelectorText');
  const actSelectorName = document.getElementById('actSelectorName');
  const actProgressMini = document.getElementById('actProgressMini');
  const actDropdown = document.getElementById('actDropdown');
  const actSelectorWrapper = document.getElementById('actSelectorWrapper');
  
  if (!actSelectorBtn || !actSelectorText || !actSelectorName || !actProgressMini || !actDropdown) return;
  
  const acts = state.levelingData.acts;
  const currentAct = acts[state.currentActIndex];
  
  // Update button to show current act
  if (currentAct) {
    const actSteps = currentAct.steps;
    const completedInAct = actSteps.filter(s => state.completedSteps.has(s.id)).length;
    const totalInAct = actSteps.length;
    
    actSelectorText.textContent = 'Act ' + currentAct.actNumber;
    actSelectorName.textContent = currentAct.actName;
    actProgressMini.textContent = completedInAct + '/' + totalInAct;
  }
  
  // Build dropdown items
  const dropdownItems = acts.map((act, index) => {
    const actSteps = act.steps;
    const completedInAct = actSteps.filter(s => state.completedSteps.has(s.id)).length;
    const totalInAct = actSteps.length;
    const progressPct = totalInAct > 0 ? Math.round((completedInAct / totalInAct) * 100) : 0;
    const isComplete = completedInAct === totalInAct && totalInAct > 0;
    const isActive = index === state.currentActIndex;
    
    const classes = ['act-dropdown-item'];
    if (isActive) classes.push('active');
    
    // Calculate time info for tooltip
    const actNum = act.actNumber;
    const actTime = state.actTimers[actNum];
    const timeStr = actTime ? formatTime(actTime) : 'Not completed';
    const totalTime = Object.values(state.actTimers).reduce((sum, t) => sum + t, 0);
    const totalTimeStr = totalTime > 0 ? formatTime(totalTime) : '0s';
    const tooltipTitle = \`Act \${actNum} Time: \${timeStr}\\nTotal Time: \${totalTimeStr}\`;
    
    return \`<div class="\${classes.join(' ')}" data-act-index="\${index}" title="\${escapeHtml(tooltipTitle)}">
      <div class="act-dropdown-num">Act \${act.actNumber}</div>
      <div class="act-dropdown-info">
        <div class="act-dropdown-name">\${escapeHtml(act.actName)}</div>
        <div class="act-dropdown-progress">
          <div class="act-progress-bar">
            <div class="act-progress-fill" style="width:\${progressPct}%"></div>
          </div>
          <div class="act-progress-text">\${completedInAct}/\${totalInAct}</div>
        </div>
      </div>
      \${isComplete ? '<div class="act-complete-badge">✓ Complete</div>' : ''}
    </div>\`;
  }).join('');
  
  actDropdown.innerHTML = dropdownItems;
  
  // Toggle dropdown on button click
  actSelectorBtn.onclick = (e) => {
    e.stopPropagation();
    const isOpen = actDropdown.classList.contains('open');
    if (isOpen) {
      actDropdown.classList.remove('open');
      actSelectorBtn.classList.remove('open');
    } else {
      actDropdown.classList.add('open');
      actSelectorBtn.classList.add('open');
    }
  };
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (actSelectorWrapper && !actSelectorWrapper.contains(e.target)) {
      actDropdown.classList.remove('open');
      actSelectorBtn.classList.remove('open');
    }
  });
  
  // Add click handlers to dropdown items
  actDropdown.querySelectorAll('.act-dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const actIndex = parseInt(item.getAttribute('data-act-index'), 10);
      if (!isNaN(actIndex) && actIndex !== state.currentActIndex) {
        state.currentActIndex = actIndex;
        state.timer.currentAct = actIndex + 1;
        saveState();
        actDropdown.classList.remove('open');
        actSelectorBtn.classList.remove('open');
        
        // Notify gems window of act change
        ipcRenderer.send('leveling-act-changed', actIndex + 1);
        
        render();
      }
    });
  });
}

// Build timer tooltip with run comparison data
async function buildTimerTooltip(act) {
  const timerDisplay = document.getElementById('timerDisplay');
  if (!timerDisplay) return;
  
  const currentActNum = act.actNumber;
  const currentActTime = state.actTimers[currentActNum];
  
  // Get current elapsed time for live comparison
  const currentElapsed = state.timer.elapsed;
  const isCurrentActRunning = state.timer.currentAct === currentActNum;
  
  // Use completed time if available, otherwise use current elapsed if this is the active act
  const displayTime = currentActTime || (isCurrentActRunning ? currentElapsed : null);
  const currentActTimeStr = displayTime ? formatTime(displayTime) : 'Not started';
  
  // Fetch comparison data from run history
  const comparison = await ipcRenderer.invoke('get-run-comparison', currentActNum);
  
  // Calculate total time
  const totalTime = Object.values(state.actTimers).reduce((sum, t) => sum + t, 0);
  const totalTimeStr = totalTime > 0 ? formatTime(totalTime) : '0s';
  
  // Build styled tooltip HTML
  const acts = state.levelingData.acts;
  let tooltipHTML = '<div class="timer-tooltip">';
  tooltipHTML += '<div class="timer-tooltip-header">⏱️ Act Timers</div>';
  
  // Current act (highlighted) with comparison
  tooltipHTML += '<div class="timer-tooltip-row current">';
  tooltipHTML += '<span class="timer-tooltip-label">▶ Act ' + currentActNum + '</span>';
  tooltipHTML += '<span class="timer-tooltip-value">' + currentActTimeStr;
  
  // Add live comparison even during run
  if (displayTime && comparison && comparison.totalRuns > 0) {
    const isBetter = comparison.best && displayTime <= comparison.best;
    const diffFromBest = comparison.best ? displayTime - comparison.best : 0;
    
    if (comparison.best && diffFromBest !== 0) {
      const sign = diffFromBest > 0 ? '+' : '';
      const color = diffFromBest > 0 ? '#ff6b6b' : '#4ade80';
      tooltipHTML += ' <span style="color:' + color + ';font-size:10px;margin-left:4px;">(' + sign + formatTime(Math.abs(diffFromBest)) + ' vs best)</span>';
    }
    
    if (isBetter && currentActTime) {
      tooltipHTML += ' <span style="color:#4ade80;font-size:10px;margin-left:4px;">🏆 NEW BEST!</span>';
    } else if (isBetter && isCurrentActRunning) {
      tooltipHTML += ' <span style="color:#4ade80;font-size:10px;margin-left:4px;">✨ On pace!</span>';
    }
  } else if (displayTime && comparison && comparison.totalRuns === 0) {
    tooltipHTML += ' <span style="color:#9ca3af;font-size:10px;margin-left:4px;">(First run!)</span>';
  }
  
  tooltipHTML += '</span>';
  tooltipHTML += '</div>';
  
  // Show comparison stats if available
  if (comparison && comparison.totalRuns > 0) {
    if (comparison.best) {
      tooltipHTML += '<div class="timer-tooltip-row">';
      tooltipHTML += '<span class="timer-tooltip-label">🏆 Personal Best</span>';
      tooltipHTML += '<span class="timer-tooltip-value" style="color:#4ade80;">' + formatTime(comparison.best) + '</span>';
      tooltipHTML += '</div>';
    }
    
    if (comparison.average) {
      tooltipHTML += '<div class="timer-tooltip-row">';
      tooltipHTML += '<span class="timer-tooltip-label">📊 Average (' + comparison.totalRuns + ' runs)</span>';
      tooltipHTML += '<span class="timer-tooltip-value" style="color:#9ca3af;">' + formatTime(comparison.average) + '</span>';
      tooltipHTML += '</div>';
    }
  }
  
  // Other completed acts
  acts.forEach((a, idx) => {
    const aNum = a.actNumber;
    if (aNum !== currentActNum) {
      const aTime = state.actTimers[aNum];
      if (aTime) {
        tooltipHTML += '<div class="timer-tooltip-row">';
        tooltipHTML += '<span class="timer-tooltip-label">Act ' + aNum + '</span>';
        tooltipHTML += '<span class="timer-tooltip-value">' + formatTime(aTime) + '</span>';
        tooltipHTML += '</div>';
      }
    }
  });
  
  // Total time (highlighted)
  tooltipHTML += '<div class="timer-tooltip-row total">';
  tooltipHTML += '<span class="timer-tooltip-label">📊 Total Time</span>';
  tooltipHTML += '<span class="timer-tooltip-value">' + totalTimeStr + '</span>';
  tooltipHTML += '</div>';
  
  tooltipHTML += '</div>';
  
  // Remove old tooltip if exists
  const oldTooltip = timerDisplay.querySelector('.timer-tooltip');
  if (oldTooltip) oldTooltip.remove();
  
  // Add new tooltip
  timerDisplay.insertAdjacentHTML('beforeend', tooltipHTML);
  
  // Position tooltip dynamically on hover
  const tooltip = timerDisplay.querySelector('.timer-tooltip');
  if (tooltip) {
    timerDisplay.addEventListener('mouseenter', function positionTooltip() {
      const rect = timerDisplay.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      
      // Position above the timer, centered
      const left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
      const bottom = window.innerHeight - rect.top + 10;
      
      tooltip.style.left = Math.max(10, left) + 'px';
      tooltip.style.bottom = bottom + 'px';
    });
  }
}

function render() {
  if (!state.levelingData) return;
  
  console.log('[render] Starting render, pobBuild:', !!state.pobBuild, 'gems:', state.pobBuild?.gems?.length || 0, 'shownGems size:', shownGems.size);
  
  // Don't clear shownGems here - it's populated once on PoB import and persists
  
  const list = document.getElementById('stepsList');
  const minimalBtn = document.getElementById('minimalBtn');
  const headerSubtitle = document.getElementById('headerSubtitle');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const progressFillFooter = document.getElementById('progressFillFooter');
  const progressTextFooter = document.getElementById('progressTextFooter');
  const mainWindow = document.getElementById('mainWindow');
  const windowFrame = document.getElementById('windowFrame');
  
  // Apply opacity - fix CSS gradient syntax (only if NOT in minimal mode)
  if (state.minimalMode === 'normal') {
    const opacityDecimal = (state.opacity / 100).toFixed(2);
    mainWindow.style.background = \`linear-gradient(135deg,rgba(20,20,28,\${opacityDecimal}),rgba(15,15,22,\${opacityDecimal}))\`;
  } else {
    mainWindow.style.background = 'transparent';
  }
  
  // Apply font size
  document.documentElement.style.setProperty('--font-size', state.fontSize + 'px');
  
  // Apply zoom level
  const zoomDecimal = (state.zoom / 100).toFixed(2);
  mainWindow.style.zoom = zoomDecimal;
  
  // Apply minimal mode classes
  mainWindow.classList.remove('minimal-mode', 'ultra-minimal-mode');
  minimalBtn.classList.remove('active', 'ultra');
  if (windowFrame) windowFrame.classList.remove('frame-minimal','frame-ultra');
  
  const dragHandle = document.getElementById('dragHandle');

  if (state.minimalMode === 'minimal') {
    mainWindow.classList.add('minimal-mode');
    minimalBtn.classList.add('active');
    if (windowFrame) windowFrame.classList.add('frame-minimal');
    // Immediately disable click-through
    ipcRenderer.send('set-ignore-mouse-events', false);
  } else if (state.minimalMode === 'ultra') {
    mainWindow.classList.add('ultra-minimal-mode');
    minimalBtn.classList.add('ultra');
    if (windowFrame) windowFrame.classList.add('frame-ultra');
    
    // Setup mouse handlers only once (check if not already set)
    if (dragHandle && !dragHandle.dataset.ultraHandlersSet) {
      dragHandle.dataset.ultraHandlersSet = 'true';
      let isOverHeader = false;
      
      const mouseEnterHandler = () => {
        isOverHeader = true;
        if (state.minimalMode === 'ultra') {
          ipcRenderer.send('set-ignore-mouse-events', false);
        }
      };
      
      const mouseLeaveHandler = () => {
        isOverHeader = false;
        // Small delay to prevent flicker when clicking buttons
        setTimeout(() => {
          if (!isOverHeader && state.minimalMode === 'ultra') {
            ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
          }
        }, 50);
      };
      
      dragHandle.addEventListener('mouseenter', mouseEnterHandler);
      dragHandle.addEventListener('mouseleave', mouseLeaveHandler);
      
      // Store handlers for cleanup
      dragHandle._ultraMouseHandlers = { mouseEnterHandler, mouseLeaveHandler };
      
      // Start with click-through enabled
      ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
    }
  } else {
    // Normal mode - immediately disable click-through and clean up handlers
    ipcRenderer.send('set-ignore-mouse-events', false);
    if (windowFrame) windowFrame.classList.remove('frame-minimal','frame-ultra');
    
    if (dragHandle) {
      // Remove event listeners if they exist
      if (dragHandle._ultraMouseHandlers) {
        dragHandle.removeEventListener('mouseenter', dragHandle._ultraMouseHandlers.mouseEnterHandler);
        dragHandle.removeEventListener('mouseleave', dragHandle._ultraMouseHandlers.mouseLeaveHandler);
        delete dragHandle._ultraMouseHandlers;
      }
      delete dragHandle.dataset.ultraHandlersSet;
    }
  }
  
  // Apply layout mode
  list.className = 'list ' + (state.mode === 'wide' ? 'wide' : '');
  
  // Render act switcher
  renderActSwitcher();
  
  // Get current act
  const act = state.levelingData.acts[state.currentActIndex];
  if (!act) return;
  
  let allSteps = act.steps;
  
  // Filter optional
  if (!state.showOptional) {
    allSteps = allSteps.filter(s => s.type !== 'optional' && s.hidden !== 'optional');
  }
  
  // Calculate progress
  const totalSteps = allSteps.length;
  const completedCount = allSteps.filter(s => state.completedSteps.has(s.id)).length;
  const progressPct = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;
  progressFill.style.width = progressPct + '%';
  progressText.textContent = progressPct + '%';
  if (progressFillFooter) {
    progressFillFooter.style.width = progressPct + '%';
    
    // Build timer tooltip with run comparisons
    buildTimerTooltip(act);
  }
  if (progressTextFooter) progressTextFooter.textContent = progressPct + '%';
  
  // Update drag-handle progress and timer (for ultra minimal mode)
  const dragHandleProgressFill = document.getElementById('dragHandleProgressFill');
  const dragHandleProgressText = document.getElementById('dragHandleProgressText');
  const dragHandleTimer = document.getElementById('dragHandleTimer');
  
  if (dragHandleProgressFill) dragHandleProgressFill.style.width = progressPct + '%';
  if (dragHandleProgressText) dragHandleProgressText.textContent = progressPct + '%';
  if (dragHandleTimer) {
    const currentActNum = act.actNumber;
    const currentActTime = state.actTimers[currentActNum] || 0;
    const timeStr = currentActTime > 0 ? formatTime(currentActTime) : '00:00';
    dragHandleTimer.textContent = 'Act' + currentActNum + ' ' + timeStr;
  }
  
  // Group steps
  const grouped = groupStepsByZone(allSteps);

  // Determine first incomplete group for header and apply visible limit
  const firstIncompleteGroup = grouped.find(g => !g.allChecked);
  const visibleLimit = state.visibleSteps && state.visibleSteps > 0 ? state.visibleSteps : Number.MAX_SAFE_INTEGER;

  // Update header
  if (firstIncompleteGroup) {
    const currentZone = firstIncompleteGroup.zone;
    headerSubtitle.textContent = currentZone + ' • ' + completedCount + '/' + totalSteps + ' completed';
  } else {
    headerSubtitle.textContent = act.actName + ' Complete! 🎉 (' + completedCount + '/' + totalSteps + ')';
  }

  // Build PoB Import Card (only show if no PoB build imported)
  const POB_IMPORT_TASK_ID = 'pob-import-task';
  const pobImportChecked = state.completedSteps.has(POB_IMPORT_TASK_ID);
  const showPobImportCard = !state.pobBuild || !state.pobBuild.gems || state.pobBuild.gems.length === 0;
  
  let pobImportCardHtml = '';
  if (showPobImportCard) {
    pobImportCardHtml = \`
      <div class="pob-import-card \${pobImportChecked ? 'checked' : ''}" data-task-id="\${POB_IMPORT_TASK_ID}">
        <input type="checkbox" class="step-checkbox" data-action="toggle-step" data-step-id="\${POB_IMPORT_TASK_ID}" \${pobImportChecked ? 'checked' : ''} />
        <div class="step-content">
          <div class="step-main">
            <div class="step-icon-wrap">
              <span class="step-icon">📋</span>
            </div>
            <div class="step-desc-wrap">
              <div class="step-desc">Import Your PoB Build</div>
              <div class="step-hint">Get personalized gem recommendations and passive tree tracking for your build</div>
              <button class="pob-import-btn" onclick="openPobImportSettings()">
                <span>⚙️</span>
                <span>Open PoB Import Settings</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    \`;
  }

  // Render ALL groups once; hide completed groups and any incomplete groups beyond the visible limit
  let incompleteCounter = 0;
  const stepsHtml = grouped.map((group) => {
    const isIncomplete = !group.allChecked;
    const currentIndex = isIncomplete ? (++incompleteCounter) : 0;
    const withinLimit = isIncomplete && currentIndex <= visibleLimit;
    const isCurrent = isIncomplete && currentIndex === 1;
    const baseDisplay = isIncomplete ? (withinLimit ? '' : 'display:none;') : 'display:none;'; // always hide completed groups
    const isMultiStep = group.steps.length > 1;
    
    if (isMultiStep) {
      const pos = isCurrent ? 1 : currentIndex;
      const groupOpacity = isCurrent ? 1 : Math.max(0.5, 1 - ((pos - 1) * 0.15));
      const currentClass = isCurrent ? ' current' : '';
      // Store the first step ID of this zone for skip-to functionality
      const firstStepId = group.steps[0]?.id || '';
      // Hide skip-to button on the first incomplete zone
      const skipToBtn = isCurrent ? '' : '<button class="skip-to-btn" data-action="skip-to" data-first-step-id="'+firstStepId+'" title="Skip to this zone (auto-complete all previous steps)">⏭️</button>';
  return '<div class="leveling-group'+currentClass+'" data-incomplete-index="'+currentIndex+'" data-visible="'+(withinLimit?'true':'false')+'" style="'+baseDisplay+'opacity:'+groupOpacity+';"><div class="zone-header" data-zone="'+escapeHtml(group.zone)+'"><input type="checkbox" class="zone-checkbox" data-action="toggle-zone" data-zone="'+escapeHtml(group.zone)+'" '+(group.allChecked?'checked':'')+' /><div class="zone-name">📍 '+escapeHtml(group.zone)+' ('+group.steps.length+' tasks)'+'</div>'+skipToBtn+'</div><div class="task-list">'+group.steps.map(step => {
        const stepIndex = act.steps.findIndex(s => s.id === step.id);
        const checked = state.completedSteps.has(step.id);
    const stepType = STEP_TYPES[step.type] || STEP_TYPES.navigation;
    const cleanDesc = cleanDescription(step.description);
        const leagueIcon = getLeagueIcon(step);
  const layoutTipIcon = step.layoutTip ? getLayoutTipIcon(step) : '';
        const hintIcon = getHintIcon(step.hint);
        const hintHtml = state.showHints && step.hint ? '<div class="task-hint">'+hintIcon+' '+escapeHtml(step.hint)+'</div>' : '';
        const rewardHtml = step.reward ? '<div class="task-reward">🎁 '+escapeHtml(step.reward)+'</div>' : '';
        
        // Get PoB gems for this step (never let errors break UI)
        let pobGems = [];
        try {
          pobGems = getPobGemsForStep(step, act.actNumber, act.steps, stepIndex, false);
        } catch (err) {
          console.error('[LevelingPopout] getPobGemsForStep failed for step', step.id, err);
          pobGems = [];
        }
        const pobGemsHtml = renderPobGemList(pobGems, act.actNumber);
        
  return '<div class="task-item"><div class="task-checkbox"><input type="checkbox" data-action="toggle-step" data-step-id="'+step.id+'" '+(checked?'checked':'')+' style="accent-color:'+stepType.color+';" /></div><div class="task-bullet" style="color:'+stepType.color+';">'+stepType.icon+'</div><div class="task-content"><div class="task-desc '+(checked?'checked':'')+'">'+escapeHtml(cleanDesc)+leagueIcon+layoutTipIcon+'</div>'+hintHtml+rewardHtml+pobGemsHtml+'</div></div>';
      }).join('')+'</div></div>';
    } else {
      // Single task - render exactly like multi-task groups
      const step = group.steps[0];
      const stepIndex = act.steps.findIndex(s => s.id === step.id);
      const checked = state.completedSteps.has(step.id);
      const stepType = STEP_TYPES[step.type] || STEP_TYPES.navigation;
      const pos = isCurrent ? 1 : currentIndex;
      const groupOpacity = isCurrent ? 1 : Math.max(0.5, 1 - ((pos - 1) * 0.15));
      const currentClass = isCurrent ? ' current' : '';
      const skipToBtn = isCurrent ? '' : '<button class="skip-to-btn" data-action="skip-to" data-first-step-id="'+step.id+'" title="Skip to this task (auto-complete all previous steps)">⏭️</button>';
      
      const cleanDesc = cleanDescription(step.description);
      const leagueIcon = getLeagueIcon(step);
      const layoutTipIcon = step.layoutTip ? getLayoutTipIcon(step) : '';
      const hintIcon = getHintIcon(step.hint);
      const hintHtml = state.showHints && step.hint ? '<div class="task-hint">'+hintIcon+' '+escapeHtml(step.hint)+'</div>' : '';
      const rewardHtml = step.reward ? '<div class="task-reward">🎁 '+escapeHtml(step.reward)+'</div>' : '';
      
      // Get PoB gems for this step
      let pobGems = [];
      try {
        pobGems = getPobGemsForStep(step, act.actNumber, act.steps, stepIndex, false);
      } catch (err) {
        console.error('[LevelingPopout] getPobGemsForStep failed for step', step.id, err);
        pobGems = [];
      }
      const pobGemsHtml = renderPobGemList(pobGems, act.actNumber);
      
      // Use exact same structure as multi-task: leveling-group → zone-header + task-list → task-item
      return '<div class="leveling-group'+currentClass+'" data-incomplete-index="'+currentIndex+'" data-visible="'+(withinLimit?'true':'false')+'" style="'+baseDisplay+'opacity:'+groupOpacity+';"><div class="zone-header" data-zone="'+escapeHtml(group.zone)+'"><div class="zone-name">📍 '+escapeHtml(group.zone)+'</div>'+skipToBtn+'</div><div class="task-list"><div class="task-item"><div class="task-checkbox"><input type="checkbox" data-action="toggle-step" data-step-id="'+step.id+'" '+(checked?'checked':'')+' style="accent-color:'+stepType.color+';" /></div><div class="task-bullet" style="color:'+stepType.color+';">'+stepType.icon+'</div><div class="task-content"><div class="task-desc '+(checked?'checked':'')+'">'+escapeHtml(cleanDesc)+leagueIcon+layoutTipIcon+'</div>'+hintHtml+rewardHtml+pobGemsHtml+'</div></div></div></div>';
    }
  }).join('');
  
  list.innerHTML = pobImportCardHtml + stepsHtml;
  
  // Resolve gem images for VISIBLE groups only
  resolveGemImagesIn(list);
  
  // Event listeners
  document.querySelectorAll('[data-action="toggle-step"]').forEach(el => {
    el.addEventListener('change', (e) => {
      e.stopPropagation(); // Prevent event bubbling
      const stepId = el.getAttribute('data-step-id');
      if (state.completedSteps.has(stepId)) {
        state.completedSteps.delete(stepId);
      } else {
        state.completedSteps.add(stepId);
      }
      ipcRenderer.invoke('save-leveling-progress', Array.from(state.completedSteps));
      
      // Check for act completion BEFORE re-rendering
      setTimeout(() => {
        checkActCompletionAndAdvance();
      }, 100);
    });
  });
  
  document.querySelectorAll('[data-action="toggle-zone"]').forEach(el => {
    el.addEventListener('change', (e) => {
      e.stopPropagation(); // Prevent event bubbling
      const zoneName = el.getAttribute('data-zone');
      const group = grouped.find(g => g.zone === zoneName);
      if (!group) return;
      
      const allChecked = group.steps.every(s => state.completedSteps.has(s.id));
      group.steps.forEach(step => {
        if (allChecked) {
          state.completedSteps.delete(step.id);
        } else {
          state.completedSteps.add(step.id);
        }
      });
      
      ipcRenderer.invoke('save-leveling-progress', Array.from(state.completedSteps));
      
      // Check for act completion BEFORE re-rendering
      setTimeout(() => {
        checkActCompletionAndAdvance();
      }, 100);
    });
  });
  
  // Skip-to button handlers
  document.querySelectorAll('[data-action="skip-to"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent triggering zone header click
      const firstStepId = el.getAttribute('data-first-step-id');
      
      if (!firstStepId) {
        console.warn('[Skip To] No first step ID found');
        return;
      }
      
      // Find the index of this step in allSteps
      const targetIndex = allSteps.findIndex(s => s.id === firstStepId);
      
      if (targetIndex === -1) {
        console.warn('[Skip To] Target step not found:', firstStepId);
        return;
      }
      
      // Complete all steps BEFORE the target step
      let completedCount = 0;
      for (let i = 0; i < targetIndex; i++) {
        if (!state.completedSteps.has(allSteps[i].id)) {
          state.completedSteps.add(allSteps[i].id);
          completedCount++;
        }
      }
      
      console.log('[Skip To] Auto-completed ' + completedCount + ' steps before step: ' + firstStepId);
      ipcRenderer.invoke('save-leveling-progress', Array.from(state.completedSteps));
      render();
    });
  });
  
  // Minimal mode button listeners (drag-handle buttons are always in DOM)
  const minimalPrevBtn = document.getElementById('minimalPrevBtn');
  const minimalNextBtn = document.getElementById('minimalNextBtn');
  const goToUltraBtn = document.getElementById('goToUltraBtn');
  const backToNormalBtn = document.getElementById('backToNormalBtn');
  
  if (minimalPrevBtn) minimalPrevBtn.addEventListener('click', handlePrevBtn);
  if (minimalNextBtn) minimalNextBtn.addEventListener('click', handleNextBtn);
  if (goToUltraBtn) goToUltraBtn.addEventListener('click', () => {
    state.minimalMode = 'ultra';
    updateViewMode(); // Use optimized update instead of full render
    saveState();
  });
  if (backToNormalBtn) backToNormalBtn.addEventListener('click', () => {
    state.minimalMode = 'normal';
    updateViewMode(); // Use optimized update instead of full render
    saveState();
  });
  
  // Position tooltips dynamically to prevent cutoff
  document.querySelectorAll('.layout-tip-icon').forEach(icon => {
    const tooltip = icon.querySelector('.tooltip');
    if (tooltip) {
      icon.addEventListener('mouseenter', () => {
        const iconRect = icon.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        
        // Center horizontally on the icon
        const centerX = iconRect.left + (iconRect.width / 2);
        tooltip.style.left = centerX + 'px';
        tooltip.style.transform = 'translateX(-50%)';
        
        // Position vertically - above the icon by default
        const spaceAbove = iconRect.top;
        const spaceBelow = window.innerHeight - iconRect.bottom;
        
        if (spaceAbove > tooltipRect.height + 10 || spaceAbove > spaceBelow) {
          // Show above
          tooltip.style.top = (iconRect.top - 8) + 'px';
          tooltip.style.transform = 'translateX(-50%) translateY(-100%)';
        } else {
          // Show below
          tooltip.style.top = (iconRect.bottom + 8) + 'px';
          tooltip.style.transform = 'translateX(-50%)';
        }
        
        // Ensure it doesn't go off-screen horizontally
        setTimeout(() => {
          const finalRect = tooltip.getBoundingClientRect();
          if (finalRect.left < 10) {
            tooltip.style.left = '10px';
            tooltip.style.transform = 'translateX(0)';
          } else if (finalRect.right > window.innerWidth - 10) {
            tooltip.style.left = (window.innerWidth - 10) + 'px';
            tooltip.style.transform = 'translateX(-100%)';
          }
        }, 0);
      });
    }
  });
  
  // Update timer display to reflect current act selection
  updateTimerDisplay();
}

// Lightweight style updates for smooth slider drags (no full render)
function applyBasicUiTuning(updates) {
  const mainWindow = document.getElementById('mainWindow');
  if (!mainWindow) return;

  if (updates.opacity !== undefined) {
    const opacityDecimal = (updates.opacity / 100).toFixed(2);
    if (state.minimalMode === 'normal') {
      mainWindow.style.background = 'linear-gradient(135deg,rgba(20,20,28,' + opacityDecimal + '),rgba(15,15,22,' + opacityDecimal + '))';
    } else {
      mainWindow.style.background = 'transparent';
    }
  }
  if (updates.fontSize !== undefined) {
    document.documentElement.style.setProperty('--font-size', updates.fontSize + 'px');
  }
  if (updates.zoomLevel !== undefined) {
    const zoomDecimal = (updates.zoomLevel / 100).toFixed(2);
    mainWindow.style.zoom = zoomDecimal;
  }
  if (updates.visibleSteps !== undefined) {
    applyVisibleStepsLimit(updates.visibleSteps);
  }
}

// Toggle visibility of groups cheaply based on visible step limit
function applyVisibleStepsLimit(limit) {
  const list = document.getElementById('stepsList');
  if (!list) return;
  const groups = list.querySelectorAll('.leveling-group[data-incomplete-index]');
  const visibleLimit = (limit && limit > 0) ? limit : Number.MAX_SAFE_INTEGER;
  groups.forEach((group) => {
    const idx = parseInt(group.getAttribute('data-incomplete-index') || '0', 10);
    if (!idx) {
      // Completed groups are always hidden
      group.style.display = 'none';
      group.setAttribute('data-visible', 'false');
      return;
    }
    const shouldShow = idx <= visibleLimit;
    const wasVisible = group.getAttribute('data-visible') === 'true';
    if (shouldShow) {
      group.style.display = '';
      group.setAttribute('data-visible', 'true');
      if (!wasVisible) {
        // Lazy-resolve images for newly shown groups only
        resolveGemImagesIn(group);
      }
    } else {
      group.style.display = 'none';
      group.setAttribute('data-visible', 'false');
    }
  });
}

// Resolve gem images within a scope (document or container)
function resolveGemImagesIn(root) {
  const scope = root || document;
  const selector = '.leveling-group[data-visible="true"] img[data-gem-img]';
  const gemImages = scope.querySelectorAll(selector);
  console.log('[LevelingPopout] Resolving', gemImages.length, 'gem images in scope');
  gemImages.forEach(async (img) => {
    const localPath = img.getAttribute('data-gem-img');
    if (localPath && !img.getAttribute('data-img-resolved')) {
      try {
        const resolvedPath = await resolveGemImageIpc(localPath);
        if (resolvedPath) {
          img.src = resolvedPath;
          img.style.display = '';
          img.setAttribute('data-img-resolved', 'true');
          console.log('[LevelingPopout] Image resolved:', localPath, '->', resolvedPath);
        } else {
          console.warn('[LevelingPopout] Image not found:', localPath);
        }
      } catch (err) {
        console.error('[LevelingPopout] Failed to resolve gem image:', localPath, err);
      }
    }
  });
}

// Load data and saved progress
ipcRenderer.invoke('get-leveling-data').then(result => {
  state.levelingData = result.data;
  
  // Debug: Log loaded acts
  if (state.levelingData && state.levelingData.acts) {
    console.log('=== LEVELING DATA LOADED ===');
    console.log('Total acts loaded:', state.levelingData.acts.length);
    state.levelingData.acts.forEach((a, idx) => {
      console.log('  [' + idx + '] Act ' + a.actNumber + ': ' + a.actName + ' (' + (a.steps ? a.steps.length : 0) + ' steps)');
    });
    console.log('===========================');
  }
  
  // Load saved progress
  if (result.progress && Array.isArray(result.progress)) {
    state.completedSteps = new Set(result.progress);
    console.log('Loaded saved progress:', result.progress.length, 'steps completed');
  }
  // Load saved act index
  if (result.currentActIndex !== undefined && result.currentActIndex !== null) {
    state.currentActIndex = result.currentActIndex;
    state.timer.currentAct = result.currentActIndex + 1;
  }
  // Load saved act timers
  if (result.actTimers) {
    state.actTimers = result.actTimers;
    console.log('Loaded act timers:', state.actTimers);
  }
  // Load saved UI settings
  if (result.settings) {
    if (result.settings.opacity !== undefined) state.opacity = result.settings.opacity;
    if (result.settings.fontSize !== undefined) state.fontSize = result.settings.fontSize;
    if (result.settings.zoom !== undefined) state.zoom = result.settings.zoom;
    if (result.settings.minimalMode !== undefined) state.minimalMode = result.settings.minimalMode;
    if (result.settings.mode !== undefined) state.mode = result.settings.mode;
    if (result.settings.visibleSteps !== undefined) state.visibleSteps = result.settings.visibleSteps;
    if (result.settings.showHints !== undefined) state.showHints = result.settings.showHints;
    if (result.settings.showOptional !== undefined) state.showOptional = result.settings.showOptional;
    if (result.settings.groupByZone !== undefined) state.groupByZone = result.settings.groupByZone;
    if (result.settings.showTreeNodeDetails !== undefined) state.showTreeNodeDetails = result.settings.showTreeNodeDetails;
    if (result.settings.autoDetectLevelingSets !== undefined) state.autoDetectLevelingSets = result.settings.autoDetectLevelingSets;
    if (result.settings.autoDetectMode !== undefined) state.autoDetectMode = result.settings.autoDetectMode;
    console.log('Loaded UI settings:', result.settings);
  }
  
  // Load saved character info
  if (result.characterName) state.characterName = result.characterName;
  if (result.characterClass) state.characterClass = result.characterClass;
  if (result.characterLevel !== undefined && result.characterLevel !== null) {
    state.characterLevel = result.characterLevel;
  }
  
  // Load PoB build after data is loaded
  loadPobBuild();
  
  // Update character display
  updateCharacterDisplay();
  
  // Listen for settings changes from the settings splash
  ipcRenderer.on('leveling-settings-changed', (event, updates) => {
    console.log('Settings updated from splash:', updates);
    
    // Update state with new settings
    if (updates.opacity !== undefined) state.opacity = updates.opacity;
    if (updates.fontSize !== undefined) state.fontSize = updates.fontSize;
    if (updates.zoomLevel !== undefined) state.zoom = updates.zoomLevel;
    if (updates.visibleSteps !== undefined) state.visibleSteps = updates.visibleSteps;
    if (updates.showHints !== undefined) state.showHints = updates.showHints;
    if (updates.showOptional !== undefined) state.showOptional = updates.showOptional;
    if (updates.groupByZone !== undefined) state.groupByZone = updates.groupByZone;
    if (updates.showTreeNodeDetails !== undefined) state.showTreeNodeDetails = updates.showTreeNodeDetails;
    if (updates.autoDetectLevelingSets !== undefined) state.autoDetectLevelingSets = updates.autoDetectLevelingSets;
    if (updates.autoDetectZones !== undefined) state.autoDetectZones = updates.autoDetectZones;
    if (updates.autoDetectMode !== undefined) state.autoDetectMode = updates.autoDetectMode;
    if (updates.wideMode !== undefined) {
      state.mode = updates.wideMode ? 'wide' : 'tall';
      ipcRenderer.send('leveling-set-layout', state.mode);
      
      // Request preset window size
      if (state.mode === 'wide') {
        ipcRenderer.send('leveling-resize-preset', { width: 1200, height: 400 });
      } else {
        ipcRenderer.send('leveling-resize-preset', { width: 400, height: 800 });
      }
    }

    // Fast path: only lightweight UI changes (opacity/fontSize/zoom/visibleSteps)
    const onlyLightweight = Object.keys(updates).every(k => (
      k === 'opacity' || k === 'fontSize' || k === 'zoomLevel' || k === 'visibleSteps'
    ));
    if (onlyLightweight) {
      applyBasicUiTuning(updates);
      // Intentionally skip saveState here to avoid disk churn during slider drags
      return;
    }
    
    // Disable transitions during settings-triggered render for instant feedback
    document.body.classList.add('no-transitions');
    render();
    // Re-enable transitions after render completes (next frame)
    requestAnimationFrame(() => {
      document.body.classList.remove('no-transitions');
    });
    
    saveState();
  });
  
  render();
}).catch(err => {
  console.error('Failed to load:', err);
  document.getElementById('stepsList').innerHTML = '<div style="padding:20px;text-align:center;color:#ff6b6b;">Failed to load data</div>';
});

// Function to open settings with PoB Import tab (global for onclick handler)
window.openPobImportSettings = function() {
  ipcRenderer.invoke('open-leveling-settings', 'pob');
};

// Button handlers
const settingsBtn = document.getElementById('settingsBtn');
if (settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    ipcRenderer.invoke('open-leveling-settings');
  });
}

// Attach event listener to all minimal buttons (header only)
document.querySelectorAll('#minimalBtn').forEach(btn => {
  btn.addEventListener('click', () => {
    // Header button: only works in normal mode (button is hidden in minimal/ultra)
    // Cycle: normal -> minimal
    if (state.minimalMode === 'normal') {
      state.minimalMode = 'minimal';
      updateViewMode(); // Use optimized update instead of full render
      saveState();
    }
  });
});

// View run history button handler
const viewHistoryBtn = document.getElementById('viewHistoryBtn');
if (viewHistoryBtn) {
  viewHistoryBtn.addEventListener('click', async () => {
  const allHistories = await ipcRenderer.invoke('get-all-run-histories');
  const modal = document.getElementById('historyModal');
  const content = document.getElementById('historyModalContent');
  
  if (!allHistories || Object.keys(allHistories).length === 0) {
    content.innerHTML = \`
      <div class="history-empty">
        <div class="history-empty-icon">📊</div>
        <div>No run history recorded yet.</div>
        <div style="margin-top:8px;font-size:12px;opacity:0.7;">Complete some acts to start building your history!</div>
      </div>
    \`;
    modal.classList.add('visible');
    return;
  }
  
  // Build formatted HTML for each act in a grid
  const actNumbers = Object.keys(allHistories).map(Number).sort((a, b) => a - b);
  let html = '<div class="history-acts-grid">';
  
  for (const actNum of actNumbers) {
    const runs = allHistories[actNum] || [];
    if (runs.length === 0) continue;
    
    // Calculate stats
    const times = runs.map(r => r.time);
    const best = Math.min(...times);
    const worst = Math.max(...times);
    const average = Math.round(times.reduce((sum, t) => sum + t, 0) / times.length);
    
    html += \`
      <div class="history-act-section" data-act="\${actNum}">
        <div class="history-act-header">
          <div class="history-act-title">⚡ Act \${actNum}</div>
          <div class="history-expand-icon">▼</div>
        </div>
        <div class="history-stats">
          <div class="history-stat">
            <div class="history-stat-label">🏆 Best</div>
            <div class="history-stat-value best">\${formatTime(best)}</div>
          </div>
          <div class="history-stat">
            <div class="history-stat-label">📊 Avg</div>
            <div class="history-stat-value average">\${formatTime(average)}</div>
          </div>
          <div class="history-stat">
            <div class="history-stat-label">Runs</div>
            <div class="history-stat-value">\${runs.length}</div>
          </div>
          <div class="history-stat">
            <div class="history-stat-label">📉 Worst</div>
            <div class="history-stat-value">\${formatTime(worst)}</div>
          </div>
        </div>
        <div class="history-runs-container">
          <div class="history-runs-header">Recent Runs</div>
    \`;
    
    // Show last 10 runs
    const recent = runs.slice(-10).reverse();
    recent.forEach((run) => {
      const date = new Date(run.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const timeStr = formatTime(run.time);
      const isBest = run.time === best;
      const bestClass = isBest ? ' is-best' : '';
      const bestIcon = isBest ? ' 🏆' : '';
      
      html += \`
        <div class="history-run-item\${bestClass}">
          <span class="history-run-time">\${timeStr}\${bestIcon}</span>
          <span class="history-run-date">\${date}</span>
        </div>
      \`;
    });
    
    html += '</div></div>';
  }
  
  html += '</div>';
  content.innerHTML = html;
  
  // Add click handlers for expand/collapse
  content.querySelectorAll('.history-act-section').forEach(section => {
    section.addEventListener('click', (e) => {
      // Don't toggle if clicking on a run item
      if (e.target.closest('.history-run-item')) return;
      section.classList.toggle('expanded');
    });
  });
  
  modal.classList.add('visible');
  });
}

// Close history modal
const closeHistoryModal = document.getElementById('closeHistoryModal');
if (closeHistoryModal) {
  closeHistoryModal.addEventListener('click', () => {
    const modal = document.getElementById('historyModal');
    modal.classList.remove('visible');
  });
}

// Close modal when clicking overlay
const historyModal = document.getElementById('historyModal');
if (historyModal) {
  historyModal.addEventListener('click', (e) => {
    if (e.target.id === 'historyModal') {
      e.target.classList.remove('visible');
    }
  });
}
// Reset run history button handler
const resetHistoryBtn = document.getElementById('resetHistoryBtn');
if (resetHistoryBtn) {
  resetHistoryBtn.addEventListener('click', async () => {
    const confirmed = confirm('⚠️ WARNING: This will delete ALL run history for ALL acts!\\n\\nAre you sure you want to continue?');
    if (!confirmed) return;
    
    const result = await ipcRenderer.invoke('clear-all-run-history');
    if (result) {
      alert('✅ All run history has been cleared successfully!');
      // Rebuild tooltip to reflect cleared history
      const acts = state.levelingData.acts;
      const currentAct = acts[state.currentActIndex];
      if (currentAct) {
        buildTimerTooltip(currentAct);
      }
    } else {
      alert('❌ Failed to clear run history.');
    }
  });
}

// Reset progress button handler
const resetProgressBtn = document.getElementById('resetProgressBtn');
if (resetProgressBtn) {
  resetProgressBtn.addEventListener('click', async () => {
  const confirmed = confirm('⚠️ WARNING: This will reset ALL act progress, completed steps, and timers!\\n\\nAre you sure you want to continue?');
  if (!confirmed) return;
  
  // Use pauseTimer to properly stop the timer
  pauseTimer();
  
  const result = await ipcRenderer.invoke('reset-leveling-progress');
  if (result) {
    // Reload all data from backend to get the fresh reset state
    const freshData = await ipcRenderer.invoke('get-leveling-data');
    
    // Reset frontend state with fresh backend data
    state.completedSteps.clear();
    if (freshData.progress && Array.isArray(freshData.progress)) {
      state.completedSteps = new Set(freshData.progress);
    }
    
    state.currentActIndex = freshData.currentActIndex || 0;
    state.actTimers = freshData.actTimers || {};
    
    // Reset timer state
    state.timer.isRunning = false;
    state.timer.startTime = 0;
    state.timer.elapsed = 0;
    state.timer.currentAct = state.currentActIndex + 1;
    
    // Reset character info
    state.characterName = freshData.characterName || null;
    state.characterClass = freshData.characterClass || null;
    state.characterLevel = freshData.characterLevel || null;
    
    // If we have a POB build, auto-set class from it
    if (state.pobBuild && state.pobBuild.className && !state.characterClass) {
      state.characterClass = state.pobBuild.className;
      console.log('[Reset] Auto-set character class from POB:', state.characterClass);
      // Save the auto-detected class
      ipcRenderer.invoke('set-character-info', {
        name: state.characterName,
        class: state.characterClass,
        level: state.characterLevel
      });
    }
    
    // Update character display
    updateCharacterDisplay();
    
    // Force re-render with the reset state
    render();
    
    // Rebuild tooltip to reflect reset state
    if (state.levelingData) {
      const acts = state.levelingData.acts;
      const currentAct = acts[state.currentActIndex];
      if (currentAct) {
        await buildTimerTooltip(currentAct);
      }
    }
    
    alert('✅ All progress has been reset!');
  } else {
    alert('❌ Failed to reset progress.');
  }
  });
}

// PoB Import handler
const importPobBtn = document.getElementById('importPobBtn');
if (importPobBtn) {
  importPobBtn.addEventListener('click', async () => {
  const input = document.getElementById('pobCodeInput');
  const status = document.getElementById('pobStatus');
  const buildInfo = document.getElementById('pobBuildInfo');
  const code = input.value.trim();
  
  if (!code) {
    status.textContent = '⚠️ Please paste a PoB code or URL';
    status.style.color = 'rgba(255,193,7,0.8)';
    status.style.display = 'block';
    return;
  }
  
  status.textContent = '⏳ Importing build...';
  status.style.color = 'rgba(74,158,255,0.8)';
  status.style.display = 'block';
  buildInfo.style.display = 'none';
  
  const result = await ipcRenderer.invoke('import-pob-code', code);
  
  if (result.success) {
    status.textContent = '✅ Build imported successfully!';
    status.style.color = 'rgba(74,222,128,0.8)';
    
    // Safely display build info with escaped HTML
    const className = escapeHtml(result.build.className);
    const ascendancyName = result.build.ascendancyName ? escapeHtml(result.build.ascendancyName) : '';
    const level = parseInt(result.build.level, 10) || 0;
    const totalNodes = parseInt(result.build.totalNodes, 10) || 0;
    const gemsFound = parseInt(result.build.gemsFound, 10) || 0;
    
    buildInfo.innerHTML = \`
      <strong>\${className}</strong> \${ascendancyName ? '(' + ascendancyName + ')' : ''}<br>
      Level \${level} | \${totalNodes} passive nodes | \${gemsFound} gems
    \`;
    buildInfo.style.display = 'block';
    
    // Clear input
    input.value = '';
    
    // Reload PoB build data and update UI
    loadPobBuild();
    
    // Re-render to hide the PoB import card
    setTimeout(() => {
      render();
    }, 100);
    
    setTimeout(() => {
      status.style.display = 'none';
    }, 3000);
  } else {
    status.textContent = '❌ Import failed: ' + (result.error || 'Unknown error');
    status.style.color = 'rgba(255,82,82,0.8)';
  }
  });
}

async function loadPobBuild() {
  const build = await ipcRenderer.invoke('get-pob-build');
  state.pobBuild = build;
  state.globalTakenGems.clear();
  shownGems.clear(); // Clear deduplication tracker
  stepGemCache.clear(); // Clear step gem cache
  
  if (build) {
    // Process ALL acts in order to populate cache with deduplicated gems
    if (state.levelingData && state.levelingData.acts) {
      for (const act of state.levelingData.acts) {
        for (let stepIndex = 0; stepIndex < act.steps.length; stepIndex++) {
          const step = act.steps[stepIndex];
          try {
            // Pass isSeeding=true - this will filter by shownGems and cache results
            getPobGemsForStep(step, act.actNumber, act.steps, stepIndex, true);
          } catch (err) {
            // Ignore errors, continue processing
          }
        }
      }
    }
    
    // Auto-set character class from POB if not already set
    if (build.className && !state.characterClass) {
      state.characterClass = build.className;
      // Save character info
      ipcRenderer.invoke('set-character-info', {
        name: state.characterName,
        class: state.characterClass,
        level: state.characterLevel
      });
      updateCharacterDisplay();
    }
    
    // Show tree icon
    const treeIcon = document.getElementById('treeIcon');
    if (treeIcon) {
      treeIcon.classList.add('visible');
      updateTreeTooltip();
    }
    
    // Update build info display if visible
    const buildInfo = document.getElementById('pobBuildInfo');
    if (buildInfo && buildInfo.style.display !== 'none') {
      const firstTreeSpec = build.treeSpecs[0];
      const className = escapeHtml(build.className);
      const ascendancyName = build.ascendancyName ? escapeHtml(build.ascendancyName) : '';
      const level = parseInt(build.level, 10) || 0;
      const nodeCount = Array.isArray(firstTreeSpec.allocatedNodes) ? firstTreeSpec.allocatedNodes.length : 0;
      const gemCount = Array.isArray(build.gems) ? build.gems.length : 0;
      
      buildInfo.innerHTML = \`
        <strong>\${className}</strong> \${ascendancyName ? '(' + ascendancyName + ')' : ''}<br>
        Level \${level} | \${nodeCount} passive nodes | \${gemCount} gems
      \`;
    }
    
    // Re-render the leveling steps to populate gem rewards with the new build
    render();
  }
}

// Listen for PoB import events
ipcRenderer.on('pob-build-imported', (event, build) => {
  console.log('PoB build imported:', build);
  loadPobBuild();
});

// Listen for PoB build removal
ipcRenderer.on('pob-build-removed', () => {
  console.log('[levelingPopout] PoB build removed - clearing gem recommendations');
  state.pobBuild = null;
  state.globalTakenGems.clear(); // Reset taken gems tracker
  
  // Hide tree icon
  const treeIcon = document.getElementById('treeIcon');
  if (treeIcon) {
    treeIcon.classList.remove('visible');
  }
  
  // Re-render to clear gem recommendations from tasks
  render();
});

// Listen for character level-up events
ipcRenderer.on('character-level-up', (event, data) => {
  console.log('Character level up:', data);
  
  // Update state with new character info (handle reset with null values)
  if (data.name !== undefined) state.characterName = data.name;
  if (data.class !== undefined) state.characterClass = data.class;
  if (data.level !== undefined) state.characterLevel = data.level;
  
  // Trigger UI update
  updateCharacterDisplay();

  // If main process uses this event to signal a full progress reset
  // it sends { name: null, class: null, level: null }. Treat that as a reset signal
  const isResetSignal = data && data.name === null && data.class === null && (data.level === null || data.level === undefined);
  if (isResetSignal) {
    console.log('[Reset] Received reset signal from main. Clearing local state and UI.');

    // Clear completed steps and act timers
    state.completedSteps.clear();
    state.actTimers = {};

    // Reset to Act 1
    state.currentActIndex = 0;

    // Stop and reset timer cleanly
    pauseTimer();
    state.timer.isRunning = false;
    state.timer.startTime = 0;
    state.timer.elapsed = 0;
    state.timer.currentAct = 1;

    // Persist and re-render
    saveState();
    render(); // render() will call updateTimerDisplay()
  }
});

// Timer functions
function updateTimerDisplay() {
  const totalSeconds = Math.floor(state.timer.elapsed / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const timeStr = minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');
  
  // Show the currently selected act if timer isn't running, otherwise show timer's tracked act
  const displayActNum = state.timer.isRunning ? state.timer.currentAct : (state.currentActIndex + 1);
  const displayText = 'Act' + displayActNum + ' ' + timeStr;
  
  // Update main timer display text only (not the entire element to preserve tooltip)
  const mainDisplayText = document.getElementById('timerText');
  if (mainDisplayText) mainDisplayText.textContent = displayText;
  
  // Update drag handle timer display (minimal/ultra modes)
  const dragDisplay = document.getElementById('dragHandleTimer');
  if (dragDisplay) dragDisplay.textContent = displayText;
}

function updateCharacterDisplay() {
  // Format: "Name (Class) Lv.XX" or just level if no name
  let displayText = '';
  
  if (state.characterName && state.characterClass && state.characterLevel !== null) {
    displayText = state.characterName + ' (' + state.characterClass + ') Lv.' + state.characterLevel;
  } else if (state.characterLevel !== null) {
    displayText = 'Level ' + state.characterLevel;
  }
  
  // Update all character display elements
  const normalDisplay = document.getElementById('characterInfo');
  const minimalDisplay = document.getElementById('minimalCharacterInfo');
  
  if (normalDisplay) {
    normalDisplay.textContent = displayText;
    normalDisplay.style.display = displayText ? 'block' : 'none';
  }
  if (minimalDisplay) {
    minimalDisplay.textContent = displayText;
    minimalDisplay.style.display = displayText ? 'block' : 'none';
  }
}


function startTimer() {
  if (!state.timer.isRunning) {
    state.timer.isRunning = true;
    state.timer.startTime = Date.now() - state.timer.elapsed;
    const mainBtn = document.getElementById('timerStartPause');
    const dragBtn = document.getElementById('dragTimerStartPause');
    if (mainBtn) {
      mainBtn.textContent = 'Pause';
      mainBtn.classList.add('active');
    }
    if (dragBtn) {
      dragBtn.textContent = 'Pause';
      dragBtn.classList.add('active');
    }
    
    timerInterval = setInterval(() => {
      state.timer.elapsed = Date.now() - state.timer.startTime;
      updateTimerDisplay();
    }, 100);
  } else {
    pauseTimer();
  }
}

function pauseTimer() {
  if (state.timer.isRunning) {
    state.timer.isRunning = false;
    clearInterval(timerInterval);
    const mainBtn = document.getElementById('timerStartPause');
    const dragBtn = document.getElementById('dragTimerStartPause');
    if (mainBtn) {
      mainBtn.textContent = 'Start';
      mainBtn.classList.remove('active');
    }
    if (dragBtn) {
      dragBtn.textContent = 'Start';
      dragBtn.classList.remove('active');
    }
  }
}

function resetTimer() {
  pauseTimer();
  state.timer.elapsed = 0;
  state.timer.startTime = 0;
  updateTimerDisplay();
}

const timerStartPause = document.getElementById('timerStartPause');
const timerReset = document.getElementById('timerReset');
if (timerStartPause) timerStartPause.addEventListener('click', startTimer);
if (timerReset) timerReset.addEventListener('click', resetTimer);

// Drag-handle timer buttons (same functionality as footer timer buttons)
const dragTimerStartPause = document.getElementById('dragTimerStartPause');
const dragTimerReset = document.getElementById('dragTimerReset');
if (dragTimerStartPause) dragTimerStartPause.addEventListener('click', startTimer);
if (dragTimerReset) dragTimerReset.addEventListener('click', resetTimer);

// Prev/Next button handlers
function handlePrevBtn() {
  if (!state.levelingData) return;
  const act = state.levelingData.acts[state.currentActIndex];
  if (!act) return;
  let allSteps = act.steps;
  if (!state.showOptional) {
    allSteps = allSteps.filter(s => s.type !== 'optional' && s.hidden !== 'optional');
  }
  
  const grouped = groupStepsByZone(allSteps);
  
  // Find the LAST fully completed zone
  let lastCompletedZone = null;
  for (let i = grouped.length - 1; i >= 0; i--) {
    if (grouped[i].allChecked) {
      lastCompletedZone = grouped[i];
      break;
    }
  }
  
  if (lastCompletedZone) {
    // Auto-uncheck all steps in that zone
    lastCompletedZone.steps.forEach(step => {
      state.completedSteps.delete(step.id);
    });
    console.log('[PREV] Auto-unchecked last completed zone: ' + lastCompletedZone.zone);
    ipcRenderer.invoke('save-leveling-progress', Array.from(state.completedSteps));
    render();
  } else {
    console.log('[PREV] No completed zones to show');
  }
}

function handleNextBtn() {
  if (!state.levelingData) return;
  
  // First, check if we should handle the PoB import task
  const POB_IMPORT_TASK_ID = 'pob-import-task';
  const showPobImportCard = !state.pobBuild || !state.pobBuild.gems || state.pobBuild.gems.length === 0;
  const pobImportNotChecked = !state.completedSteps.has(POB_IMPORT_TASK_ID);
  
  if (showPobImportCard && pobImportNotChecked) {
    // Check the PoB import task
    state.completedSteps.add(POB_IMPORT_TASK_ID);
    console.log('[NEXT] Auto-checked PoB import task');
    ipcRenderer.invoke('save-leveling-progress', Array.from(state.completedSteps));
    render();
    return;
  }
  
  const act = state.levelingData.acts[state.currentActIndex];
  if (!act) return;
  let allSteps = act.steps;
  if (!state.showOptional) {
    allSteps = allSteps.filter(s => s.type !== 'optional' && s.hidden !== 'optional');
  }
  
  const grouped = groupStepsByZone(allSteps);
  
  // Find the FIRST incomplete zone
  let firstIncompleteZone = null;
  for (let i = 0; i < grouped.length; i++) {
    if (!grouped[i].allChecked) {
      firstIncompleteZone = grouped[i];
      break;
    }
  }
  
  if (firstIncompleteZone) {
    // Auto-check all steps in that zone
    firstIncompleteZone.steps.forEach(step => {
      state.completedSteps.add(step.id);
    });
    console.log('[NEXT] Auto-checked first incomplete zone: ' + firstIncompleteZone.zone);
    ipcRenderer.invoke('save-leveling-progress', Array.from(state.completedSteps));
    // After updating progress, check if the act is now complete and advance if so
    setTimeout(() => { try { checkActCompletionAndAdvance(); } catch { render(); } }, 50);
  } else {
    console.log('[NEXT] All zones completed');
    // Nothing left to check in this act; trigger act completion handler to auto-advance
    setTimeout(() => { try { checkActCompletionAndAdvance(); } catch { render(); } }, 50);
  }
}

const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
if (prevBtn) prevBtn.addEventListener('click', handlePrevBtn);
if (nextBtn) nextBtn.addEventListener('click', handleNextBtn);

ipcRenderer.on('leveling-layout-mode', (event, mode) => {
  state.mode = mode;
  render();
});

// Listen for zone entry events from Client.txt watcher
ipcRenderer.on('zone-entered', (event, data) => {
  if (!state.levelingData || !state.autoDetectZones) return;
  
  const zoneId = data.zoneId;
  const zoneName = data.zoneName;
  const actNumber = data.actNumber;
  
  console.log('[Auto-Detect] Zone entered:', zoneId + ' (' + zoneName + ')', '| Mode:', state.autoDetectMode);
  
  const act = state.levelingData.acts[state.currentActIndex];
  if (!act) return;
  const allSteps = act.steps;
  
  // Determine progression anchor: first uncompleted step index
  let firstUncompletedIndex = allSteps.findIndex(s => !state.completedSteps.has(s.id));
  if (firstUncompletedIndex === -1) {
    console.log('[Auto-Detect] All steps completed in current act');
    return;
  }

  const firstUncompletedStep = allSteps[firstUncompletedIndex];
  const firstUncompletedZoneId = firstUncompletedStep.zoneId;
  
  // ============================================================================
  // MODE 1: STRICT - Validate both source zone AND destination zone
  // ============================================================================
  if (state.autoDetectMode === 'strict') {
    console.log('[Auto-Detect] STRICT MODE: Validating destination zone by ID');
    
    // Need to track where we came from
    if (firstUncompletedIndex === 0) {
      console.log('[Auto-Detect] First step - cannot validate source zone. Skipping.');
      return;
    }
    
    // Check if entered zone ID matches expected destination (first uncompleted step)
    if (zoneId !== firstUncompletedZoneId) {
      console.log('[Auto-Detect] Destination mismatch: entered "' + zoneId + '" but expected "' + firstUncompletedZoneId + '". Ignoring.');
      return;
    }
    
    // Find previous zone ID
    let prevEnd = firstUncompletedIndex - 1;
    const prevZoneId = allSteps[prevEnd].zoneId;
    
    // In strict mode, we would validate that we came FROM prevZoneId
    // Since we don't track last zone in Client.txt, we'll just validate destination
    // and complete previous zone (same as hybrid for now)
    // TODO: Track lastZone in state for full strict validation
    
    console.log('[Auto-Detect] Destination validated. Completing previous zone ID: "' + prevZoneId + '" (' + allSteps[prevEnd].zone + ')');
    
    let prevStart = prevEnd;
    for (let i = prevEnd - 1; i >= 0; i--) {
      if (allSteps[i].zoneId === prevZoneId) {
        prevStart = i;
      } else {
        break;
      }
    }
    
    let completedCount = 0;
    for (let i = prevStart; i <= prevEnd; i++) {
      const step = allSteps[i];
      if (!state.completedSteps.has(step.id)) {
        state.completedSteps.add(step.id);
        completedCount++;
        console.log('[Auto-Detect] Auto-completed:', step.description, 'in', step.zone);
      }
    }
    
    if (completedCount > 0) {
      ipcRenderer.invoke('save-leveling-progress', Array.from(state.completedSteps));
      console.log('[Auto-Detect] STRICT: Completed ' + completedCount + ' step(s) in previous zone');
      render();
    }
    return;
  }
  
  // ============================================================================
  // MODE 2: TRUST - Always complete previous zone when entering ANY new zone
  // ============================================================================
  if (state.autoDetectMode === 'trust') {
    console.log('[Auto-Detect] TRUST MODE: Auto-completing previous zone regardless of destination');
    
    if (firstUncompletedIndex === 0) {
      console.log('[Auto-Detect] No previous zone to complete.');
      return;
    }
    
    // Find previous zone WITHOUT validating destination (use zone ID)
    let prevEnd = firstUncompletedIndex - 1;
    const prevZoneId = allSteps[prevEnd].zoneId;
    
    let prevStart = prevEnd;
    for (let i = prevEnd - 1; i >= 0; i--) {
      if (allSteps[i].zoneId === prevZoneId) {
        prevStart = i;
      } else {
        break;
      }
    }
    
    let completedCount = 0;
    for (let i = prevStart; i <= prevEnd; i++) {
      const step = allSteps[i];
      if (!state.completedSteps.has(step.id)) {
        state.completedSteps.add(step.id);
        completedCount++;
        console.log('[Auto-Detect] Auto-completed:', step.description, 'in', step.zone);
      }
    }
    
    if (completedCount > 0) {
      ipcRenderer.invoke('save-leveling-progress', Array.from(state.completedSteps));
      console.log('[Auto-Detect] TRUST: Completed ' + completedCount + ' step(s) in "' + allSteps[prevEnd].zone + '"');
      render();
    } else {
      console.log('[Auto-Detect] Previous zone already completed');
    }
    return;
  }
  
  // ============================================================================
  // MODE 3: HYBRID (Default) - Only complete if destination matches next step
  // ============================================================================
  console.log('[Auto-Detect] HYBRID MODE: Validating destination zone by ID');
  
  // Verify entered zone ID matches the first uncompleted step's zone ID
  if (zoneId !== firstUncompletedZoneId) {
    console.log('[Auto-Detect] Entered zone ID "' + zoneId + '" does NOT match first uncompleted step zone ID "' + firstUncompletedZoneId + '". Ignoring.');
    return;
  }
  
  console.log('[Auto-Detect] Entered zone ID matches first uncompleted step! Zone:', zoneId, '(' + zoneName + ')');
  
  // Find the previous zone's contiguous range
  if (firstUncompletedIndex === 0) {
    console.log('[Auto-Detect] First uncompleted step is at index 0. No previous zone to complete.');
    return;
  }
  
  let prevEnd = firstUncompletedIndex - 1;
  const prevZoneId = allSteps[prevEnd].zoneId;
  
  let prevStart = prevEnd;
  for (let i = prevEnd - 1; i >= 0; i--) {
    if (allSteps[i].zoneId === prevZoneId) {
      prevStart = i;
    } else {
      break;
    }
  }
  
  // Mark only the previous zone group as completed
  let completedCount = 0;
  for (let i = prevStart; i <= prevEnd; i++) {
    const step = allSteps[i];
    if (!state.completedSteps.has(step.id)) {
      state.completedSteps.add(step.id);
      completedCount++;
      console.log('[Auto-Detect] Auto-completed previous zone step:', step.description, 'in', step.zone);
    }
  }

  if (completedCount > 0) {
    ipcRenderer.invoke('save-leveling-progress', Array.from(state.completedSteps));
    console.log('[Auto-Detect] HYBRID: Completed ' + completedCount + ' step(s) in previous zone "' + allSteps[prevEnd].zone + '" before entering "' + zoneName + '"');
    render();
  } else {
    console.log('[Auto-Detect] Previous zone already fully completed');
  }
});

// Listen for hotkey actions
ipcRenderer.on('hotkey-action', (event, action) => {
  console.log('[Hotkey] Action triggered:', action);
  
  if (action === 'prev') {
    // Find and click the prev button (works in all modes)
    const prevBtn = document.getElementById('prevBtn');
    const minimalPrevBtn = document.getElementById('minimalPrevBtn');
    
    if (prevBtn && prevBtn.offsetParent !== null) {
      prevBtn.click();
    } else if (minimalPrevBtn && minimalPrevBtn.offsetParent !== null) {
      minimalPrevBtn.click();
    }
  } else if (action === 'next') {
    // Find and click the next button (works in all modes)
    const nextBtn = document.getElementById('nextBtn');
    const minimalNextBtn = document.getElementById('minimalNextBtn');
    
    if (nextBtn && nextBtn.offsetParent !== null) {
      nextBtn.click();
    } else if (minimalNextBtn && minimalNextBtn.offsetParent !== null) {
      minimalNextBtn.click();
    }
  }
});

// --- Update badge wiring (mirrors main overlay) ---
try {
  const UPDATE_RELEASE_URL = 'https://github.com/XileHUD/poe_overlay/releases/latest';
  const updateBadgeBtn = document.getElementById('updateBadge');
  let startupUpdateCheckTriggered = false;

  function showUpdateBadge(info) {
    if (!updateBadgeBtn) return;
    updateBadgeBtn.style.display = 'inline-flex';
  if (updateBadgeBtn) updateBadgeBtn.dataset.version = info?.version ? String(info.version) : '';
    const normalized = info?.version ? String(info.version).replace(/^v/i, '') : '';
    const message = info?.message || 'A new update is available. Click to open the latest release.';
  if (updateBadgeBtn) updateBadgeBtn.title = normalized ? (message + "\\n(v" + normalized + ")") : message;
  }

  function hideUpdateBadge() {
    if (!updateBadgeBtn) return;
    updateBadgeBtn.style.display = 'none';
  try { delete updateBadgeBtn.dataset.version; } catch {}
  updateBadgeBtn.title = '';
  }

  async function triggerStartupUpdateCheck() {
    if (startupUpdateCheckTriggered) return;
    startupUpdateCheckTriggered = true;
    try {
      const result = await ipcRenderer.invoke('check-updates');
      if (result && typeof result === 'object' && result.available) {
        showUpdateBadge(result);
      } else {
        hideUpdateBadge();
      }
    } catch {
      hideUpdateBadge();
    }
  }

  if (updateBadgeBtn) {
    updateBadgeBtn.addEventListener('click', () => {
      try {
        ipcRenderer.send('open-releases-page');
      } catch {
        try { window.open(UPDATE_RELEASE_URL, '_blank', 'noopener'); } catch {}
      }
    });
  }

  // Delay the update check slightly after initial render
  setTimeout(() => { try { triggerStartupUpdateCheck(); } catch {} }, 1200);
} catch (e) {
  console.warn('[Leveling] Update badge wiring failed:', e);
}
</script>
</body>
</html>`;
}
