// Import JSON data to inject into template
import gemsData from '../../data/leveling-data/gems.json';
import questsData from '../../data/leveling-data/quests.json';
import gemColoursData from '../../data/leveling-data/gem-colours.json';

// Leveling popout HTML with all logic embedded inline
export function buildLevelingPopoutHtml(): string {
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
    html,body{font-family:'Segoe UI',Arial,sans-serif;font-size:var(--font-size);color:#ddd;background:transparent;-webkit-user-select:none;overflow:hidden;width:100%;height:100%;}
    
    /* Disable all transitions when applying settings */
    .no-transitions,
    .no-transitions * {
      transition: none !important;
    }
    
    .window{display:flex;flex-direction:column;height:100vh;border:2px solid rgba(254,192,118,0.4);border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,0.9);}
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
    .window.minimal-mode .list{padding:48px 4px 4px 4px!important;pointer-events:auto!important;}
    .window.minimal-mode .list::-webkit-scrollbar{display:none!important;}
    .window.minimal-mode .list{scrollbar-width:none!important;-ms-overflow-style:none!important;}
    .window.minimal-mode .leveling-step,
    .window.minimal-mode .leveling-group{pointer-events:auto!important;}
    
    /* Ultra Minimal Mode - click-through with no interactivity */
    .window.ultra-minimal-mode{border:none!important;border-radius:0!important;box-shadow:none!important;background:transparent!important;}
    .window.ultra-minimal-mode .header{-webkit-app-region:no-drag;pointer-events:none!important;padding:0!important;background:transparent!important;border:none!important;min-height:0!important;height:0!important;overflow:visible!important;}
    .window.ultra-minimal-mode .drag-handle{display:flex!important;flex-direction:column;position:absolute;top:0;left:0;right:0;height:auto;background:rgba(32,36,44,0.85);backdrop-filter:blur(4px);border-bottom:1px solid rgba(74,158,255,0.2);padding:4px 6px;gap:2px;z-index:100;pointer-events:auto!important;-webkit-app-region:drag;}
    .window.ultra-minimal-mode .drag-handle-row{display:flex;align-items:center;gap:4px;width:100%;-webkit-app-region:drag;}
    .window.ultra-minimal-mode .drag-handle-icon{font-size:10px;color:rgba(255,255,255,0.3);cursor:move;-webkit-app-region:drag;}
    .window.ultra-minimal-mode .drag-handle .minimal-nav{display:flex!important;gap:4px;margin-right:auto;-webkit-app-region:no-drag;}
    .window.ultra-minimal-mode .drag-handle .minimal-btn{width:auto!important;height:16px!important;font-size:9px!important;padding:0 6px!important;display:flex!important;align-items:center;justify-content:center;pointer-events:auto!important;-webkit-app-region:no-drag;opacity:0.7;transition:opacity 0.2s;background:rgba(74,158,255,0.2);border:1px solid rgba(74,158,255,0.3);color:rgba(255,255,255,0.9);border-radius:3px;}
    .window.ultra-minimal-mode .drag-handle .minimal-btn:hover{opacity:1!important;background:rgba(74,158,255,0.3);}
    .window.ultra-minimal-mode .drag-handle .header-btn{width:20px!important;height:16px!important;font-size:10px!important;display:flex!important;align-items:center;justify-content:center;pointer-events:auto!important;-webkit-app-region:no-drag;opacity:0.5;transition:opacity 0.2s;}
    .window.ultra-minimal-mode .drag-handle .header-btn:hover{opacity:1!important;}
    .window.ultra-minimal-mode .drag-handle-info{display:flex!important;flex-direction:row;gap:6px;align-items:center;padding:4px 14px;-webkit-app-region:no-drag;pointer-events:auto!important;}
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
    .window.ultra-minimal-mode .list{padding:44px 4px 4px 4px!important;}
    .window.ultra-minimal-mode .list::-webkit-scrollbar{display:none!important;}
    .window.ultra-minimal-mode .list{scrollbar-width:none!important;-ms-overflow-style:none!important;}
    .drag-handle{display:none;}
    .drag-handle-row{display:none;}
    .drag-handle-info{display:none;}
    
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
  .footer{display:none!important;}
  .leveling-group{margin-bottom:12px;background:rgba(74,222,128,0.03);border:1px solid rgba(74,222,128,0.15);border-left:3px solid rgba(74,222,128,0.4);border-radius:8px;padding:12px;transition:all 0.2s;overflow:visible;box-sizing:border-box;position:relative;}
    .leveling-group.current{background:rgba(74,222,128,0.08);border-color:rgba(74,222,128,0.3);border-left-color:rgba(74,222,128,0.8);}
    .leveling-group:hover{background:rgba(74,222,128,0.05);border-color:rgba(74,222,128,0.2);}
    .zone-header{display:flex;align-items:center;gap:10px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid rgba(74,222,128,0.2);cursor:pointer;}
    .zone-checkbox{width:18px;height:18px;cursor:pointer;accent-color:#4ade80;}
    .skip-to-btn{margin-left:auto;background:transparent;border:none;color:#888;padding:2px 4px;cursor:pointer;font-size:calc(var(--font-size) - 1px);opacity:0.5;transition:opacity 0.2s;}
    .skip-to-btn:hover{opacity:1;color:#aaa;}
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
    .pob-gem-compact{display:flex;align-items:center;gap:4px;padding:1px 0;font-size:calc(var(--font-size) - 1px);line-height:1.3;}
    .pob-gem-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:3px;transition:all 0.12s;border:none;font-size:calc(var(--font-size) - 1px);}
    .pob-gem-pill:hover{background:rgba(255,255,255,0.05);transform:translateX(1px);}
    .pob-gem-icon{font-size:9px;line-height:1;}
    .pob-gem-verb{font-weight:500;color:rgba(255,255,255,0.85);font-size:calc(var(--font-size) - 2px);text-transform:uppercase;letter-spacing:0.3px;min-width:28px;}
    .pob-gem-name-inline{font-weight:500;flex:1;font-size:calc(var(--font-size) - 1px);}
    .pob-gem-vendor{font-size:calc(var(--font-size) - 2px);color:rgba(255,255,255,0.4);font-style:italic;margin-left:auto;}
    .pob-gem-cost{font-size:10px;opacity:0.6;margin-left:4px;}
    
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
<div class='window' id='mainWindow'>
  <div class='drag-handle' id='dragHandle'>
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
    <div class='timer-controls'>
      <button class='timer-btn' id='timerStartPause' title='Start/Pause timer'>Start</button>
      <button class='timer-btn' id='timerReset' title='Reset timer'>Reset</button>
    </div>
  </div>
  <div class='list' id='stepsList'></div>
  
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
<script>
const {ipcRenderer} = require('electron');

// Load gem database for colors and quest data for gem matching
let gemDatabase = null;
let questsDatabase = null;
let gemColours = null;

// Injected JSON data from main process
const INJECTED_GEMS_DATA = ${gemsJSON};
const INJECTED_QUESTS_DATA = ${questsJSON};
const INJECTED_GEM_COLOURS = ${gemColoursJSON};

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
    console.log('[QuestsDB] Loaded', Object.keys(questsDatabase).length, 'quests');
  } catch (err) {
    console.error('[QuestsDB] Failed to load quests database:', err);
    questsDatabase = {};
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
  opacity: 96,
  fontSize: 12,
  zoom: 100,
  minimalMode: 'normal', // 'normal', 'minimal', 'ultra'
  visibleSteps: 99,
  completedSteps: new Set(),
  levelingData: null,
  pobBuild: null,
  currentActIndex: 0, // Currently selected act (0-based index)
  timer: {
    isRunning: false,
    startTime: 0,
    elapsed: 0,
    currentAct: 1
  },
  actTimers: {} // Store completion time for each act: { 1: 1234567, 2: 2345678, ... }
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

function getPobGemsForStep(step, actNumber) {
  if (!state.pobBuild || !state.pobBuild.gems) {
    console.log('[getPobGemsForStep] No PoB build or gems available');
    return [];
  }
  
  // Only show gems for quest hand-in steps (npc_quest type)
  if (step.type !== 'npc_quest') return [];
  if (!step.quest) return [];
  
  console.log('[getPobGemsForStep] Checking step:', step.quest, 'Act:', actNumber);
  console.log('[getPobGemsForStep] Total gems in PoB build:', state.pobBuild.gems.length);
  console.log('[getPobGemsForStep] Gems with act', actNumber + ':', state.pobBuild.gems.filter(g => g.act === actNumber).length);
  console.log('[getPobGemsForStep] All gem acts:', state.pobBuild.gems.map(g => 'Act ' + g.act + ': ' + g.name).join(', '));
  
  // Filter gems that could come from this quest
  const candidateGems = state.pobBuild.gems.filter(gem => {
    if (gem.act !== actNumber) return false;
    if (!gem.quest) return false;
    
    const stepQuest = step.quest.toLowerCase();
    const gemQuest = gem.quest.toLowerCase();
    
    return stepQuest === gemQuest || 
           stepQuest.includes(gemQuest) || 
           gemQuest.includes(stepQuest);
  });
  
  console.log('[getPobGemsForStep] Candidate gems:', candidateGems.map(g => g.name + ' (quest: ' + g.quest + ')'));
  
  if (candidateGems.length === 0) return [];
  
  // Use the rewardType already set by gemMatcher - it knows quest vs vendor correctly
  const results = candidateGems.map((gem) => {
    return {
      name: gem.name,
      rewardType: gem.rewardType, // Respect the actual quest/vendor designation
      act: gem.act,
      quest: gem.quest,
      vendor: gem.vendor,
      isSupport: gem.isSupport
    };
  });
  
  if (results.length > 0) {
    console.log('[getPobGemsForStep] Found', results.length, 'gems for', step.quest, ':', 
                results.map(function(g) { return g.name + ' (' + g.rewardType + ')'; }).join(', '));
  }
  
  return results;
}

function renderPobGemList(gems) {
  if (!gems || gems.length === 0) return '';
  
  let html = '';
  
  gems.forEach(gem => {
    const color = getGemColor(gem);
    const verb = gem.rewardType === 'vendor' ? 'Buy' : 'Take';
    const cost = gem.rewardType === 'vendor' ? getGemCost(gem) : '';
    const npcName = gem.vendor || 'NPC';
    
    html += '<div class="pob-gem-compact">';
    // Use subtle background colors with thin border for slick look
    html += '<span class="pob-gem-pill" style="border-left:2px solid ' + color + ';background:' + color + '18;">';
    html += '<span class="pob-gem-verb">' + verb + '</span>';
    html += '<span class="pob-gem-name-inline">' + escapeHtml(gem.name) + '</span>';
    html += '<span class="pob-gem-vendor">from ' + escapeHtml(npcName) + '</span>';
    if (cost) {
      html += '<span class="pob-gem-cost">' + cost + '</span>';
    }
    html += '</span>';
    html += '</div>';
  });
  
  return html;
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
  // Cost based on required level
  const level = gem.level || 1;
  if (level < 8) return '🔷'; // Wisdom scroll
  if (level < 16) return '🔸'; // Transmutation
  if (level < 28) return '🔶'; // Alteration
  if (level < 38) return '🟡'; // Chance
  return '🟠'; // Alchemy
}

function groupStepsByZone(steps) {
  if (!state.groupByZone) return steps.map(s => ({zone:s.zone,steps:[s],allChecked:state.completedSteps.has(s.id),layoutTip:s.layoutTip}));
  
  const grouped = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    
    if (grouped.length > 0) {
      const lastGroup = grouped[grouped.length - 1];
      
      // Group ALL steps with the same zone together, regardless of type
      if (lastGroup.zone === step.zone) {
        lastGroup.steps.push(step);
        lastGroup.allChecked = lastGroup.steps.every(s => state.completedSteps.has(s.id));
        continue;
      }
    }
    
    grouped.push({
      zone: step.zone,
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
    groupByZone: state.groupByZone
  });
}

function checkActCompletionAndAdvance() {
  if (!state.levelingData) return;
  
  const acts = state.levelingData.acts;
  const currentAct = acts[state.currentActIndex];
  
  if (!currentAct || !currentAct.steps) return;
  
  // Check if ALL steps in current act are completed
  const allSteps = currentAct.steps;
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
  const minimalBtn = document.getElementById('minimalBtn');
  const dragHandle = document.getElementById('dragHandle');
  
  if (!mainWindow || !minimalBtn) return;
  
  // Remove all mode classes
  mainWindow.classList.remove('minimal-mode', 'ultra-minimal-mode');
  minimalBtn.classList.remove('active', 'ultra');
  
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
    // Minimal mode is NOT click-through - window is fully interactable
    ipcRenderer.send('set-ignore-mouse-events', false);
    
    // Clean up ultra handlers if switching from ultra
    if (dragHandle && dragHandle._ultraMouseHandlers) {
      dragHandle.removeEventListener('mouseenter', dragHandle._ultraMouseHandlers.mouseEnterHandler);
      dragHandle.removeEventListener('mouseleave', dragHandle._ultraMouseHandlers.mouseLeaveHandler);
      delete dragHandle._ultraMouseHandlers;
      delete dragHandle.dataset.ultraHandlersSet;
    }
  } else if (state.minimalMode === 'ultra') {
    mainWindow.classList.add('ultra-minimal-mode');
    minimalBtn.classList.add('ultra');
    
    // Setup mouse handlers only once
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
        setTimeout(() => {
          if (!isOverHeader && state.minimalMode === 'ultra') {
            ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
          }
        }, 50);
      };
      
      dragHandle.addEventListener('mouseenter', mouseEnterHandler);
      dragHandle.addEventListener('mouseleave', mouseLeaveHandler);
      dragHandle._ultraMouseHandlers = { mouseEnterHandler, mouseLeaveHandler };
      
      ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
    }
  } else {
    // Normal mode
    ipcRenderer.send('set-ignore-mouse-events', false);
    
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
  
  const list = document.getElementById('stepsList');
  const minimalBtn = document.getElementById('minimalBtn');
  const headerSubtitle = document.getElementById('headerSubtitle');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const progressFillFooter = document.getElementById('progressFillFooter');
  const progressTextFooter = document.getElementById('progressTextFooter');
  const mainWindow = document.getElementById('mainWindow');
  
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
  
  const dragHandle = document.getElementById('dragHandle');

  if (state.minimalMode === 'minimal') {
    mainWindow.classList.add('minimal-mode');
    minimalBtn.classList.add('active');
    // Immediately disable click-through
    ipcRenderer.send('set-ignore-mouse-events', false);
  } else if (state.minimalMode === 'ultra') {
    mainWindow.classList.add('ultra-minimal-mode');
    minimalBtn.classList.add('ultra');
    
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
    allSteps = allSteps.filter(s => s.type !== 'optional');
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
  
  // Filter completed zones - always hide fully completed zones
  let visible = grouped.filter(g => !g.allChecked);
  
  // Limit to visible steps
  if (state.visibleSteps > 0 && state.visibleSteps < visible.length) {
    visible = visible.slice(0, state.visibleSteps);
  }
  
  // Update header
  if (visible.length > 0) {
    const currentZone = visible[0].zone;
    headerSubtitle.textContent = currentZone + ' • ' + completedCount + '/' + totalSteps + ' completed';
  } else {
    headerSubtitle.textContent = act.actName + ' Complete! 🎉 (' + completedCount + '/' + totalSteps + ')';
  }
  
  const stepsHtml = visible.map((group, groupIdx) => {
    const isCurrent = groupIdx === 0;
    const isMultiStep = group.steps.length > 1;
    
    if (isMultiStep) {
      const groupOpacity = isCurrent ? 1 : Math.max(0.5, 1 - (groupIdx * 0.15));
      const currentClass = isCurrent ? ' current' : '';
      // Store the first step ID of this zone for skip-to functionality
      const firstStepId = group.steps[0]?.id || '';
      // Hide skip-to button on the first incomplete zone (groupIdx === 0)
      const skipToBtn = groupIdx === 0 ? '' : '<button class="skip-to-btn" data-action="skip-to" data-first-step-id="'+firstStepId+'" title="Skip to this zone (auto-complete all previous steps)">⏭️</button>';
  return '<div class="leveling-group'+currentClass+'" style="opacity:'+groupOpacity+';"><div class="zone-header" data-zone="'+escapeHtml(group.zone)+'"><input type="checkbox" class="zone-checkbox" data-action="toggle-zone" data-zone="'+escapeHtml(group.zone)+'" '+(group.allChecked?'checked':'')+' /><div class="zone-name">📍 '+escapeHtml(group.zone)+' ('+group.steps.length+' tasks)'+'</div>'+skipToBtn+'</div><div class="task-list">'+group.steps.map(step => {
        const checked = state.completedSteps.has(step.id);
    const stepType = STEP_TYPES[step.type] || STEP_TYPES.navigation;
    const cleanDesc = cleanDescription(step.description);
        const leagueIcon = getLeagueIcon(step);
  const layoutTipIcon = step.layoutTip ? getLayoutTipIcon(step) : '';
        const hintHtml = state.showHints && step.hint ? '<div class="task-hint">💡 '+escapeHtml(step.hint)+'</div>' : '';
        const rewardHtml = step.reward ? '<div class="task-reward">🎁 '+escapeHtml(step.reward)+'</div>' : '';
        
        // Get PoB gems for this step
        const pobGems = getPobGemsForStep(step, act.actNumber);
        const pobGemsHtml = renderPobGemList(pobGems);
        
  return '<div class="task-item"><div class="task-checkbox"><input type="checkbox" data-action="toggle-step" data-step-id="'+step.id+'" '+(checked?'checked':'')+' style="accent-color:'+stepType.color+';" /></div><div class="task-bullet" style="color:'+stepType.color+';">'+stepType.icon+'</div><div class="task-content"><div class="task-desc '+(checked?'checked':'')+'">'+escapeHtml(cleanDesc)+leagueIcon+layoutTipIcon+'</div>'+hintHtml+rewardHtml+pobGemsHtml+'</div></div>';
      }).join('')+'</div></div>';
    } else {
      const step = group.steps[0];
      const checked = state.completedSteps.has(step.id);
      const stepType = STEP_TYPES[step.type] || STEP_TYPES.navigation;
      const isHighPriority = ['passive','kill_boss','trial'].includes(step.type);
      const opacity = isCurrent ? 1 : Math.max(0.5, 1 - (groupIdx * 0.15));
  const bgColor = isCurrent ? (isHighPriority ? 'rgba(254,192,118,0.20)' : 'rgba(255,255,255,0.16)') : 'rgba(255,255,255,0.03)';
      const padding = isCurrent ? '16px 14px' : '14px 12px';
      
      const cleanDesc = cleanDescription(step.description);
      const leagueIcon = getLeagueIcon(step);
  const layoutTipIcon = step.layoutTip ? getLayoutTipIcon(step) : '';
  const stepTextHtml = '<span class="step-desc-text">'+escapeHtml(cleanDesc)+'</span>';
      const hintHtml = state.showHints && step.hint ? '<div class="step-hint">💡 '+escapeHtml(step.hint)+'</div>' : '';
      
      const metaItems = [];
      if (step.quest) metaItems.push('<div class="badge" style="background:#fec07615;border-color:#fec07640;color:#fec076;">📜 '+escapeHtml(step.quest)+'</div>');
      if (step.reward) metaItems.push('<div class="badge" style="background:#4ade8015;border-color:#4ade8040;color:#4ade80;">🎁 '+escapeHtml(step.reward)+'</div>');
      if (step.recommendedLevel) metaItems.push('<div class="badge" style="background:#ffd70015;border-color:#ffd70040;color:#ffd700;">Level '+step.recommendedLevel+'</div>');
      const metaHtml = metaItems.length > 0 ? '<div class="step-meta">'+metaItems.join('')+'</div>' : '';
      
      // Get PoB gems for this step
      const pobGems = getPobGemsForStep(step, act.actNumber);
      const pobGemsHtml = renderPobGemList(pobGems);
      
  const borderColor = isCurrent ? '#fdd68a' : stepType.color;
  return '<div class="leveling-step '+(isCurrent?'current':'')+' '+(isHighPriority?'priority':'')+'" style="opacity:'+opacity+';background:'+bgColor+';padding:'+padding+';border-left-color:'+borderColor+';"><input type="checkbox" class="step-checkbox" data-action="toggle-step" data-step-id="'+step.id+'" '+(checked?'checked':'')+' style="accent-color:'+stepType.color+';" /><div class="step-content"><div class="step-main"><div class="step-icon-wrap" style="background:'+stepType.color+'22;border-color:'+stepType.color+'44;"><span class="step-icon" style="color:'+stepType.color+';">'+stepType.icon+'</span></div><div class="step-desc-wrap">'+(isCurrent&&step.zone?'<div class="zone-label">'+escapeHtml(step.zone)+'</div>':'')+'<div class="step-desc '+(checked?'checked':'')+'">'+stepTextHtml+leagueIcon+layoutTipIcon+'</div></div></div>'+metaHtml+hintHtml+pobGemsHtml+'</div></div>';
    }
  }).join('');
  
  list.innerHTML = stepsHtml;
  
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
    console.log('Loaded UI settings:', result.settings);
  }
  
  // Load PoB build after data is loaded
  loadPobBuild();
  
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
    if (updates.autoDetectZones !== undefined) state.autoDetectZones = updates.autoDetectZones;
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
  
  const result = await ipcRenderer.invoke('reset-leveling-progress');
  if (result) {
    // Reset frontend state
    state.completedSteps.clear();
    state.showCompleted = false;
    state.timer.elapsed = 0;
    state.timer.display = '00:00';
    state.currentActIndex = 0;
    
    // Reset act timers
    state.actTimers = {};
    
    // Update UI
    render();
    
    // Update timer display
    const timerText = document.getElementById('timerText');
    if (timerText) {
      timerText.textContent = 'Act1 00:00';
    }
    
    // Rebuild tooltip to reflect reset state
    const acts = state.levelingData.acts;
    const currentAct = acts[state.currentActIndex];
    if (currentAct) {
      buildTimerTooltip(currentAct);
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
    
    buildInfo.innerHTML = \`
      <strong>\${result.build.className}</strong> \${result.build.ascendancyName ? '(' + result.build.ascendancyName + ')' : ''}<br>
      Level \${result.build.level} | \${result.build.totalNodes} passive nodes | \${result.build.gemsFound} gems
    \`;
    buildInfo.style.display = 'block';
    
    // Clear input
    input.value = '';
    
    // Reload PoB build data and update UI
    loadPobBuild();
    
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
  
  if (build) {
    console.log('[loadPobBuild] Build loaded with', build.gems?.length || 0, 'gems');
    
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
      buildInfo.innerHTML = \`
        <strong>\${build.className}</strong> \${build.ascendancyName ? '(' + build.ascendancyName + ')' : ''}<br>
        Level \${build.level} | \${firstTreeSpec.allocatedNodes.length} passive nodes | \${build.gems.length} gems
      \`;
    }
    
    // Re-render the leveling steps to show gems
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
});

// Timer functions
function updateTimerDisplay() {
  const totalSeconds = Math.floor(state.timer.elapsed / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const timeStr = minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');
  const displayText = 'Act' + state.timer.currentAct + ' ' + timeStr;
  
  // Update main timer display text only (not the entire element to preserve tooltip)
  const mainDisplayText = document.getElementById('timerText');
  if (mainDisplayText) mainDisplayText.textContent = displayText;
  
  // Update drag handle timer display (minimal/ultra modes)
  const dragDisplay = document.getElementById('dragHandleTimer');
  if (dragDisplay) dragDisplay.textContent = displayText;
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
    allSteps = allSteps.filter(s => s.type !== 'optional');
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
  const act = state.levelingData.acts[state.currentActIndex];
  if (!act) return;
  let allSteps = act.steps;
  if (!state.showOptional) {
    allSteps = allSteps.filter(s => s.type !== 'optional');
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
    render();
  } else {
    console.log('[NEXT] All zones completed');
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
ipcRenderer.on('zone-entered', (event, zoneName) => {
  if (!state.levelingData || !state.autoDetectZones) return;
  
  console.log('Zone entered from Client.txt:', zoneName);
  
  const act = state.levelingData.acts[state.currentActIndex];
  if (!act) return;
  const allSteps = act.steps;
  
  // Find the first step in the zone we just entered
  const enteredZoneStepIndex = allSteps.findIndex(step => {
    const stepZone = step.zone.toLowerCase().replace(/[⚡🗺️📍]/g, '').trim();
    const enteredZone = zoneName.toLowerCase().trim();
    return stepZone === enteredZone;
  });
  
  if (enteredZoneStepIndex === -1) {
    console.log('Zone not found in leveling guide:', zoneName);
    return;
  }
  
  console.log('Found zone at step index:', enteredZoneStepIndex);
  
  // Auto-complete all uncompleted steps BEFORE this zone (only move forward)
  let completedCount = 0;
  for (let i = 0; i < enteredZoneStepIndex; i++) {
    const step = allSteps[i];
    if (!state.completedSteps.has(step.id)) {
      state.completedSteps.add(step.id);
      completedCount++;
      console.log('Auto-completed previous step:', step.description, 'in', step.zone);
    }
  }
  
  if (completedCount > 0) {
    ipcRenderer.invoke('save-leveling-progress', Array.from(state.completedSteps));
    console.log('Auto-completed ' + completedCount + ' previous step(s) before entering ' + zoneName);
    render();
  } else {
    console.log('No previous steps to complete - already up to date');
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
</script>
</body>
</html>`;
}
