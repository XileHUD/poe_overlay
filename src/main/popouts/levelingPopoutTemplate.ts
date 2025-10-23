// Leveling popout HTML with all logic embedded inline
export function buildLevelingPopoutHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset='utf-8'/>
  <title>PoE1 Leveling Guide</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    :root{--font-size:12px;}
    html,body{font-family:'Segoe UI',Arial,sans-serif;font-size:var(--font-size);color:#ddd;background:transparent;-webkit-user-select:none;overflow:hidden;width:100%;height:100%;}
    .window{display:flex;flex-direction:column;height:100vh;border:2px solid rgba(254,192,118,0.4);border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,0.9);}
    /* Minimal Mode - slim drag header */
    .window.minimal-mode{border:none!important;border-radius:0!important;box-shadow:none!important;background:transparent!important;}
    .window.minimal-mode .header{-webkit-app-region:no-drag;pointer-events:none!important;padding:0!important;background:transparent!important;border:none!important;min-height:0!important;height:0!important;overflow:visible!important;}
    .window.minimal-mode .drag-handle{display:flex!important;flex-direction:column;position:absolute;top:0;left:0;right:0;height:24px;background:rgba(32,36,44,0.85);backdrop-filter:blur(4px);border-bottom:1px solid rgba(74,222,128,0.2);padding:4px 6px;gap:0px;z-index:100;pointer-events:auto!important;-webkit-app-region:drag;}
    .window.minimal-mode .drag-handle-row{display:flex;align-items:center;gap:4px;width:100%;-webkit-app-region:drag;}
    .window.minimal-mode .drag-handle-icon{font-size:10px;color:rgba(255,255,255,0.3);cursor:move;-webkit-app-region:drag;}
    .window.minimal-mode .drag-handle .minimal-nav{display:flex!important;gap:4px;margin-right:auto;-webkit-app-region:no-drag;}
    .window.minimal-mode .drag-handle .minimal-btn{width:auto!important;height:16px!important;font-size:9px!important;padding:0 6px!important;display:flex!important;align-items:center;justify-content:center;pointer-events:auto!important;-webkit-app-region:no-drag;opacity:0.7;transition:opacity 0.2s;background:rgba(74,222,128,0.2);border:1px solid rgba(74,222,128,0.3);color:rgba(255,255,255,0.9);border-radius:3px;}
    .window.minimal-mode .drag-handle .minimal-btn:hover{opacity:1!important;background:rgba(74,222,128,0.3);}
    .window.minimal-mode .drag-handle .header-btn{width:20px!important;height:16px!important;font-size:10px!important;display:flex!important;align-items:center;justify-content:center;pointer-events:auto!important;-webkit-app-region:no-drag;opacity:0.5;transition:opacity 0.2s;}
    .window.minimal-mode .drag-handle .header-btn:hover{opacity:1!important;}
    .window.minimal-mode .drag-handle-info{display:none!important;}
    .window.minimal-mode #backToNormalBtn{display:none!important;}
    .window.minimal-mode #goToUltraBtn{display:flex!important;}
    .window.minimal-mode .header-content,
    .window.minimal-mode .header-buttons,
    .window.minimal-mode .zone-icon,
    .window.minimal-mode .close,
    .window.minimal-mode .controls,
    .window.minimal-mode .settings-panel,
    .window.minimal-mode .minimal-controls{display:none!important;}
    .window.minimal-mode .footer{background:transparent!important;border:none!important;padding:4px 8px;}
    .window.minimal-mode .list{padding:28px 4px 4px 4px!important;}
    
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
    .window.ultra-minimal-mode .drag-handle-info{display:flex!important;flex-direction:row;gap:6px;align-items:center;padding-left:14px;-webkit-app-region:no-drag;pointer-events:auto!important;}
    .window.ultra-minimal-mode .drag-handle-timer{font-size:9px;color:rgba(255,255,255,0.8);font-weight:600;white-space:nowrap;cursor:default;}
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
    .window.ultra-minimal-mode .settings-panel,
    .window.ultra-minimal-mode .footer,
    .window.ultra-minimal-mode .minimal-controls{display:none!important;}
    .window.ultra-minimal-mode .step-checkbox,
    .window.ultra-minimal-mode .zone-checkbox,
    .window.ultra-minimal-mode .task-checkbox{display:none!important;}
    .window.ultra-minimal-mode .leveling-step{background:rgba(32,36,44,0.85)!important;border:1px solid rgba(74,158,255,0.15)!important;}
    .window.ultra-minimal-mode .leveling-step.current{background:rgba(50,54,64,0.9)!important;border-color:rgba(74,158,255,0.3)!important;}
    .window.ultra-minimal-mode .leveling-group{background:rgba(32,36,44,0.85)!important;border:1px solid rgba(74,222,128,0.15)!important;}
    .window.ultra-minimal-mode .leveling-group.current{background:rgba(40,50,44,0.9)!important;border-color:rgba(74,222,128,0.3)!important;}
    .window.ultra-minimal-mode .list{padding:40px 4px 4px 4px!important;}
    .window.ultra-minimal-mode .list::-webkit-scrollbar{display:none!important;}
    .window.ultra-minimal-mode .list{scrollbar-width:none!important;-ms-overflow-style:none!important;}
    .drag-handle{display:none;}
    .drag-handle-row{display:none;}
    .drag-handle-info{display:none;}
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
    .header{padding:10px 14px;background:linear-gradient(135deg,rgba(40,44,52,0.98),rgba(30,34,42,0.98));cursor:default;-webkit-app-region:drag;display:flex;align-items:center;gap:10px;border-bottom:2px solid rgba(254,192,118,0.3);border-radius:10px 10px 0 0;}
    .zone-icon{font-size:18px;line-height:1;text-shadow:0 2px 4px rgba(0,0,0,0.5);}
    .header-content{flex:1;display:flex;flex-direction:column;gap:6px;}
    .act-selector-wrapper{position:relative;-webkit-app-region:no-drag;}
    .act-selector-btn{display:flex;align-items:center;gap:8px;padding:6px 12px;background:linear-gradient(135deg,rgba(60,64,72,0.9),rgba(50,54,62,0.9));border:1px solid rgba(254,192,118,0.4);border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;color:#FEC076;transition:all 0.15s;min-width:180px;box-shadow:0 2px 6px rgba(0,0,0,0.3);}
    .act-selector-btn:hover{background:linear-gradient(135deg,rgba(70,74,82,1),rgba(60,64,72,1));border-color:rgba(254,192,118,0.6);box-shadow:0 3px 8px rgba(0,0,0,0.4);}
    .act-selector-btn.open{border-color:rgba(254,192,118,0.8);box-shadow:0 0 12px rgba(254,192,118,0.3);}
    .act-selector-label{flex:1;display:flex;flex-direction:column;gap:1px;}
    .act-selector-title{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:#FEC076;}
    .act-selector-name{font-size:10px;color:rgba(255,255,255,0.6);font-weight:500;font-style:italic;}
    .act-progress-mini{font-size:9px;color:rgba(255,255,255,0.5);font-weight:600;margin-left:auto;}
    .act-dropdown-arrow{font-size:10px;color:rgba(255,255,255,0.6);transition:transform 0.2s;}
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
    .title{font-size:14px;font-weight:700;color:#FEC076;text-shadow:0 1px 2px rgba(0,0,0,0.5);}
    .subtitle{font-size:10px;color:rgba(255,255,255,0.6);font-weight:500;}
    .header-buttons{display:flex;gap:6px;-webkit-app-region:no-drag;}
    .header-btn{width:28px;height:28px;border:1px solid rgba(255,255,255,0.2);border-radius:6px;background:rgba(60,64,72,0.75);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:all 0.15s;color:rgba(255,255,255,0.8);padding:0;line-height:1;}
    .header-btn:hover{background:rgba(74,158,255,0.8);border-color:rgba(74,158,255,1);color:#fff;transform:scale(1.05);}
    .header-btn.active{background:rgba(74,222,128,0.3);border-color:rgba(74,222,128,0.8);color:#4ade80;}
    .close{background:rgba(192,57,43,0.75);width:28px;height:28px;border:1px solid rgba(255,255,255,0.2);border-radius:6px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;transition:all 0.15s;-webkit-app-region:no-drag;}
    .close:hover{background:rgba(231,76,60,0.9);border-color:rgba(231,76,60,1);color:#fff;}
    .controls{padding:8px 12px;background:rgba(30,34,40,0.85);border-bottom:1px solid rgba(255,255,255,0.1);display:flex;gap:8px;align-items:center;-webkit-app-region:no-drag;}
    .control-btn{padding:6px 12px;background:rgba(60,64,72,0.8);border:1px solid rgba(255,255,255,0.2);border-radius:6px;cursor:pointer;font-size:11px;color:rgba(255,255,255,0.9);transition:all 0.15s;font-weight:600;}
    .control-btn:hover{background:rgba(74,158,255,0.7);border-color:rgba(74,158,255,1);color:#fff;transform:translateY(-1px);}
    .progress-bar{flex:1;height:8px;background:rgba(0,0,0,0.4);border-radius:4px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);}
    .progress-fill{height:100%;background:linear-gradient(90deg,#4ade80,#22c55e);transition:width 0.3s;box-shadow:0 0 10px rgba(74,222,128,0.5);}
    .progress-text{font-size:10px;color:rgba(255,255,255,0.7);font-weight:600;min-width:60px;text-align:right;}
    .list{flex:1;overflow-y:auto;overflow-x:hidden;padding:12px;display:flex;flex-direction:column;box-sizing:border-box;}
    .list.wide{flex-direction:row;overflow-x:auto;overflow-y:hidden;gap:12px;align-items:stretch;}
    .list.wide .leveling-group{margin-bottom:0;min-width:320px;max-width:320px;flex-shrink:0;display:flex;flex-direction:column;}
    .list.wide .leveling-step{margin-bottom:0;min-width:320px;max-width:320px;flex-shrink:0;}
    .settings-panel{background:rgba(20,24,30,0.95);border-top:1px solid rgba(255,255,255,0.1);padding:12px;display:none;flex-direction:column;gap:10px;}
    .settings-panel.visible{display:flex;}
    .setting-row{display:flex;align-items:center;gap:10px;}
    .setting-label{flex:1;font-size:11px;color:rgba(255,255,255,0.8);font-weight:500;}
    .setting-checkbox{width:16px;height:16px;cursor:pointer;}
    .setting-slider{flex:1;height:6px;-webkit-appearance:none;background:rgba(255,255,255,0.1);border-radius:3px;outline:none;}
    .setting-slider::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:#4ade80;cursor:pointer;}
    .setting-value{min-width:40px;text-align:right;font-size:11px;color:rgba(255,255,255,0.7);font-weight:600;}
    .info-btn{width:20px;height:20px;border-radius:50%;background:rgba(74,158,255,0.3);border:1px solid rgba(74,158,255,0.6);color:rgba(74,158,255,1);font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative;}
    .info-btn:hover{background:rgba(74,158,255,0.5);border-color:rgba(74,158,255,0.9);}
    .info-btn:active{background:rgba(74,158,255,0.7);transform:scale(0.95);}
    .info-tooltip{visibility:hidden;position:absolute;bottom:100%;right:0;margin-bottom:8px;padding:10px;background:rgba(30,34,40,0.98);border:1px solid rgba(74,158,255,0.6);border-radius:6px;font-size:10px;color:rgba(255,255,255,0.9);width:280px;z-index:1000;box-shadow:0 4px 12px rgba(0,0,0,0.5);line-height:1.4;}
    .info-btn:hover .info-tooltip{visibility:visible;}
    .info-tooltip a{color:#4a9eff;text-decoration:none;font-weight:600;}
    .info-tooltip a:hover{text-decoration:underline;}
  .footer{padding:8px 12px;background:rgba(30,34,40,0.85);border-top:1px solid rgba(255,255,255,0.1);display:flex;gap:12px;align-items:center;justify-content:space-between;-webkit-app-region:no-drag;overflow:visible;position:relative;}
  .footer-progress{display:none;flex-direction:column;gap:4px;flex:1;}
  .footer-row{display:flex;align-items:center;gap:10px;width:100%;}
  .footer-progress .progress-bar{height:6px;}
  .footer-progress .progress-text{font-size:10px;text-align:left;min-width:0;}
    .timer-display{font-size:12px;color:#4ade80;font-weight:700;font-family:monospace;min-width:90px;}
    .timer-controls{display:flex;gap:6px;margin-left:auto;}
    .timer-btn{padding:4px 10px;background:rgba(60,64,72,0.8);border:1px solid rgba(255,255,255,0.2);border-radius:4px;cursor:pointer;font-size:10px;color:rgba(255,255,255,0.9);transition:all 0.15s;font-weight:600;}
    .timer-btn:hover{background:rgba(74,158,255,0.7);border-color:rgba(74,158,255,1);color:#fff;}
    .timer-btn.active{background:rgba(74,222,128,0.3);border-color:rgba(74,222,128,0.8);color:#4ade80;}
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
    <button class='control-btn' id='nextBtn' title='Next step'>Next ▶</button>
    <div class='progress-bar'><div class='progress-fill' id='progressFill' style='width:0%'></div></div>
    <div class='progress-text' id='progressText'>0%</div>
  </div>
  <div class='settings-panel' id='settingsPanel'>
    <div class='setting-row'>
      <span class='setting-label'>Overlay Opacity</span>
      <input type='range' class='setting-slider' id='opacitySlider' min='20' max='100' value='96' />
      <span class='setting-value' id='opacityValue'>96%</span>
    </div>
    <div class='setting-row'>
      <span class='setting-label'>Font Size</span>
      <input type='range' class='setting-slider' id='fontSizeSlider' min='10' max='18' value='12' />
      <span class='setting-value' id='fontSizeValue'>12px</span>
    </div>
    <div class='setting-row'>
      <span class='setting-label'>Visible Steps</span>
      <input type='range' class='setting-slider' id='visibleStepsSlider' min='1' max='99' value='99' />
      <span class='setting-value' id='visibleStepsValue'>All</span>
    </div>
    <div class='setting-row'>
      <span class='setting-label'>Show Hints</span>
      <input type='checkbox' class='setting-checkbox' id='showHints' checked />
    </div>
    <div class='setting-row'>
      <span class='setting-label'>Show Optional Steps</span>
      <input type='checkbox' class='setting-checkbox' id='showOptional' checked />
    </div>
    <div class='setting-row'>
      <span class='setting-label'>Group by Zone</span>
      <input type='checkbox' class='setting-checkbox' id='groupByZone' checked />
    </div>
    <div class='setting-row'>
      <span class='setting-label'>Wide Layout Mode</span>
      <input type='checkbox' class='setting-checkbox' id='wideLayoutToggle' />
    </div>
    <div class='setting-row'>
      <span class='setting-label'>Auto-detect Zone Changes</span>
      <input type='checkbox' class='setting-checkbox' id='autoDetectZones' checked />
    </div>
    <div class='setting-row' style='flex-direction:column;gap:6px;align-items:stretch;'>
      <div style='display:flex;align-items:center;gap:6px;'>
        <span class='setting-label'>Client.txt Path (for auto zone detection)</span>
        <div class='info-btn' id='gggPolicyBtn' title='Click to view GGG Developer Policy'>
          ℹ️
          <div class='info-tooltip'>
            Reading the client.txt is <strong>officially allowed by GGG</strong>:<br><br>
            "Reading the game's log files is okay as long as the user is aware of what you are doing with that data."<br><br>
            Click the button to view the official policy →
          </div>
        </div>
      </div>
      <div style='display:flex;gap:6px;'>
        <button class='control-btn' id='autoDetectPath' style='flex:1;font-size:10px;padding:4px 8px;'>Auto Detect</button>
        <button class='control-btn' id='selectPath' style='flex:1;font-size:10px;padding:4px 8px;'>Select File</button>
      </div>
      <div style='font-size:9px;color:rgba(255,255,255,0.5);word-break:break-all;' id='clientPathDisplay'>Not configured</div>
      <button class='control-btn' id='cleanLogBtn' style='font-size:10px;padding:4px 8px;background:rgba(192,57,43,0.5);' title='Clear all content from Client.txt (helps with performance)'>🗑️ Clean Log File</button>
    </div>
    <div class='setting-row' style='flex-direction:column;gap:6px;align-items:stretch;'>
      <span class='setting-label'>⚠️ Danger Zone</span>
      <button class='control-btn' id='resetProgressBtn' style='font-size:10px;padding:4px 8px;background:rgba(192,57,43,0.7);border-color:rgba(192,57,43,0.9);' title='Reset all leveling progress to start over'>🔄 Reset All Progress</button>
    </div>
  </div>
  <div class='list' id='stepsList'></div>
  <div class='footer'>
    <div class='footer-progress' id='footerProgress'>
      <div class='progress-bar'><div class='progress-fill' id='progressFillFooter' style='width:0%'></div></div>
      <div class='progress-text' id='progressTextFooter'>0%</div>
    </div>
    <div class='footer-row'>
      <div class='timer-display' id='timerDisplay'>Act1 00:00</div>
      <div class='timer-controls'>
        <button class='timer-btn' id='timerStartPause' title='Start/Pause timer'>Start</button>
        <button class='timer-btn' id='timerReset' title='Reset timer'>Reset</button>
      </div>
    </div>
  </div>
</div>
<script>
const {ipcRenderer} = require('electron');
let state = {
  mode: 'tall',
  showCompleted: false,
  groupByZone: true,
  showHints: true,
  showOptional: true,
  autoDetectZones: true,
  opacity: 96,
  fontSize: 12,
  minimalMode: 'normal', // 'normal', 'minimal', 'ultra'
  visibleSteps: 99,
  completedSteps: new Set(),
  levelingData: null,
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
  ipcRenderer.invoke('save-current-act-index', state.currentActIndex);
  ipcRenderer.invoke('save-act-timers', state.actTimers);
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
        render();
      }
    });
  });
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
  
  // Apply minimal mode classes
  mainWindow.classList.remove('minimal-mode', 'ultra-minimal-mode');
  minimalBtn.classList.remove('active', 'ultra');
  
  const dragHandle = document.getElementById('dragHandle');

  if (state.minimalMode === 'minimal') {
    mainWindow.classList.add('minimal-mode');
    minimalBtn.classList.add('active');
    ipcRenderer.send('set-ignore-mouse-events', false);
  } else if (state.minimalMode === 'ultra') {
    mainWindow.classList.add('ultra-minimal-mode');
    minimalBtn.classList.add('ultra');
    
    // Setup mouse handlers only once (check if not already set)
    if (dragHandle && !dragHandle.dataset.ultraHandlersSet) {
      dragHandle.dataset.ultraHandlersSet = 'true';
      let isOverHeader = false;
      
      dragHandle.addEventListener('mouseenter', () => {
        isOverHeader = true;
        ipcRenderer.send('set-ignore-mouse-events', false);
      });
      
      dragHandle.addEventListener('mouseleave', () => {
        isOverHeader = false;
        // Small delay to prevent flicker when clicking buttons
        setTimeout(() => {
          if (!isOverHeader && state.minimalMode === 'ultra') {
            ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
          }
        }, 50);
      });
      
      // Start with click-through enabled
      ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
    }
  } else {
    // Normal mode - ensure click-through is OFF and clean up handlers flag
    if (dragHandle) {
      delete dragHandle.dataset.ultraHandlersSet;
    }
    ipcRenderer.send('set-ignore-mouse-events', false);
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
    
    // Add timer tooltip to footer progress bar
    const totalTime = Object.values(state.actTimers).reduce((sum, t) => sum + t, 0);
    const totalTimeStr = totalTime > 0 ? formatTime(totalTime) : '0s';
    const currentActNum = act.actNumber;
    const currentActTime = state.actTimers[currentActNum];
    const currentActTimeStr = currentActTime ? formatTime(currentActTime) : 'In progress';
    
    // Build styled tooltip HTML
    const acts = state.levelingData.acts;
    let tooltipHTML = '<div class="timer-tooltip">';
    tooltipHTML += '<div class="timer-tooltip-header">⏱️ Act Timers</div>';
    
    // Current act (highlighted)
    tooltipHTML += '<div class="timer-tooltip-row current">';
    tooltipHTML += '<span class="timer-tooltip-label">▶ Act ' + currentActNum + '</span>';
    tooltipHTML += '<span class="timer-tooltip-value">' + currentActTimeStr + '</span>';
    tooltipHTML += '</div>';
    
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
    
    // Add tooltip to timer display
    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) {
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
  return '<div class="leveling-group'+currentClass+'" style="opacity:'+groupOpacity+';"><div class="zone-header" data-zone="'+escapeHtml(group.zone)+'"><input type="checkbox" class="zone-checkbox" data-action="toggle-zone" data-zone="'+escapeHtml(group.zone)+'" '+(group.allChecked?'checked':'')+' /><div class="zone-name">📍 '+escapeHtml(group.zone)+' ('+group.steps.length+' tasks)</div><button class="skip-to-btn" data-action="skip-to" data-first-step-id="'+firstStepId+'" title="Skip to this zone (auto-complete all previous steps)">⏭️</button></div><div class="task-list">'+group.steps.map(step => {
        const checked = state.completedSteps.has(step.id);
    const stepType = STEP_TYPES[step.type] || STEP_TYPES.navigation;
    const cleanDesc = cleanDescription(step.description);
        const leagueIcon = getLeagueIcon(step);
  const layoutTipIcon = step.layoutTip ? getLayoutTipIcon(step) : '';
        const hintHtml = state.showHints && step.hint ? '<div class="task-hint">💡 '+escapeHtml(step.hint)+'</div>' : '';
        const rewardHtml = step.reward ? '<div class="task-reward">🎁 '+escapeHtml(step.reward)+'</div>' : '';
        
  return '<div class="task-item"><div class="task-checkbox"><input type="checkbox" data-action="toggle-step" data-step-id="'+step.id+'" '+(checked?'checked':'')+' style="accent-color:'+stepType.color+';" /></div><div class="task-bullet" style="color:'+stepType.color+';">'+stepType.icon+'</div><div class="task-content"><div class="task-desc '+(checked?'checked':'')+'">'+escapeHtml(cleanDesc)+leagueIcon+layoutTipIcon+'</div>'+hintHtml+rewardHtml+'</div></div>';
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
      
  const borderColor = isCurrent ? '#fdd68a' : stepType.color;
  return '<div class="leveling-step '+(isCurrent?'current':'')+' '+(isHighPriority?'priority':'')+'" style="opacity:'+opacity+';background:'+bgColor+';padding:'+padding+';border-left-color:'+borderColor+';"><input type="checkbox" class="step-checkbox" data-action="toggle-step" data-step-id="'+step.id+'" '+(checked?'checked':'')+' style="accent-color:'+stepType.color+';" /><div class="step-content"><div class="step-main"><div class="step-icon-wrap" style="background:'+stepType.color+'22;border-color:'+stepType.color+'44;"><span class="step-icon" style="color:'+stepType.color+';">'+stepType.icon+'</span></div><div class="step-desc-wrap">'+(isCurrent&&step.zone?'<div class="zone-label">'+escapeHtml(step.zone)+'</div>':'')+'<div class="step-desc '+(checked?'checked':'')+'">'+stepTextHtml+leagueIcon+layoutTipIcon+'</div></div></div>'+metaHtml+hintHtml+'</div></div>';
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
    render();
  });
  if (backToNormalBtn) backToNormalBtn.addEventListener('click', () => {
    state.minimalMode = 'normal';
    render();
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
  // Initialize slider values to match state
  document.getElementById('fontSizeSlider').value = state.fontSize;
  document.getElementById('fontSizeValue').textContent = state.fontSize + 'px';
  document.getElementById('opacitySlider').value = state.opacity;
  document.getElementById('opacityValue').textContent = state.opacity + '%';
  document.getElementById('visibleStepsSlider').value = state.visibleSteps;
  document.getElementById('visibleStepsValue').textContent = state.visibleSteps >= 99 ? 'All' : state.visibleSteps.toString();
  document.getElementById('wideLayoutToggle').checked = state.mode === 'wide';
  
  render();
}).catch(err => {
  console.error('Failed to load:', err);
  document.getElementById('stepsList').innerHTML = '<div style="padding:20px;text-align:center;color:#ff6b6b;">Failed to load data</div>';
});

// Button handlers
document.getElementById('settingsBtn').addEventListener('click', () => {
  const panel = document.getElementById('settingsPanel');
  const btn = document.getElementById('settingsBtn');
  if (panel.classList.contains('visible')) {
    panel.classList.remove('visible');
    btn.classList.remove('active');
  } else {
    panel.classList.add('visible');
    btn.classList.add('active');
  }
});

// Attach event listener to all minimal buttons (header only)
document.querySelectorAll('#minimalBtn').forEach(btn => {
  btn.addEventListener('click', () => {
    // Header button: only works in normal mode (button is hidden in minimal/ultra)
    // Cycle: normal -> minimal
    if (state.minimalMode === 'normal') {
      state.minimalMode = 'minimal';
      render();
    }
  });
});

document.getElementById('opacitySlider').addEventListener('input', (e) => {
  state.opacity = parseInt(e.target.value);
  document.getElementById('opacityValue').textContent = state.opacity + '%';
  render();
});

document.getElementById('fontSizeSlider').addEventListener('input', (e) => {
  state.fontSize = parseInt(e.target.value);
  document.getElementById('fontSizeValue').textContent = state.fontSize + 'px';
  render();
});

document.getElementById('visibleStepsSlider').addEventListener('input', (e) => {
  state.visibleSteps = parseInt(e.target.value);
  const valueText = state.visibleSteps >= 99 ? 'All' : state.visibleSteps.toString();
  document.getElementById('visibleStepsValue').textContent = valueText;
  render();
});

document.getElementById('showHints').addEventListener('change', (e) => {
  state.showHints = e.target.checked;
  render();
});

document.getElementById('showOptional').addEventListener('change', (e) => {
  state.showOptional = e.target.checked;
  render();
});

document.getElementById('groupByZone').addEventListener('change', (e) => {
  state.groupByZone = e.target.checked;
  render();
});

document.getElementById('wideLayoutToggle').addEventListener('change', (e) => {
  state.mode = e.target.checked ? 'wide' : 'tall';
  ipcRenderer.send('leveling-set-layout', state.mode);
  
  // Request preset window size
  if (state.mode === 'wide') {
    ipcRenderer.send('leveling-resize-preset', { width: 1200, height: 400 });
  } else {
    ipcRenderer.send('leveling-resize-preset', { width: 400, height: 800 });
  }
  
  render();
});

document.getElementById('autoDetectZones').addEventListener('change', (e) => {
  state.autoDetectZones = e.target.checked;
  // Notify backend to start/stop watching
  ipcRenderer.invoke('toggle-auto-detect-zones', e.target.checked);
});

// Client.txt path handlers
document.getElementById('autoDetectPath').addEventListener('click', async () => {
  const result = await ipcRenderer.invoke('auto-detect-client-txt');
  if (result.success) {
    document.getElementById('clientPathDisplay').textContent = result.path;
    document.getElementById('clientPathDisplay').style.color = 'rgba(74,222,128,0.8)';
  } else {
    document.getElementById('clientPathDisplay').textContent = 'Not found - please select manually';
    document.getElementById('clientPathDisplay').style.color = 'rgba(255,82,82,0.8)';
  }
});

document.getElementById('selectPath').addEventListener('click', async () => {
  const result = await ipcRenderer.invoke('select-client-txt');
  if (result.success) {
    document.getElementById('clientPathDisplay').textContent = result.path;
    document.getElementById('clientPathDisplay').style.color = 'rgba(74,222,128,0.8)';
  }
});

// Load saved client.txt path on startup
ipcRenderer.invoke('get-client-txt-path').then(result => {
  if (result.path) {
    document.getElementById('clientPathDisplay').textContent = result.path;
    document.getElementById('clientPathDisplay').style.color = result.autoDetected 
      ? 'rgba(74,158,255,0.8)' 
      : 'rgba(74,222,128,0.8)';
  }
});

// GGG Policy info button handler
document.getElementById('gggPolicyBtn').addEventListener('click', () => {
  require('electron').shell.openExternal('https://www.pathofexile.com/developer/docs#policy');
});

// Clean log button handler
document.getElementById('cleanLogBtn').addEventListener('click', async () => {
  const confirmed = confirm('This will clear all content from Client.txt. The game will continue writing new logs. Are you sure?');
  if (!confirmed) return;
  
  const result = await ipcRenderer.invoke('clean-client-txt');
  if (result.success) {
    alert('✅ Client.txt has been cleaned successfully!');
  } else {
    alert('❌ Failed to clean Client.txt: ' + (result.error || 'Unknown error'));
  }
});

// Reset progress button handler
document.getElementById('resetProgressBtn').addEventListener('click', async () => {
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
    
    // Update UI
    render();
    
    // Update timer display
    const timerDisplay = document.querySelector('.timer-display');
    if (timerDisplay) {
      timerDisplay.textContent = '⏱️ 00:00';
    }
  }
});

// Timer functions
function updateTimerDisplay() {
  const totalSeconds = Math.floor(state.timer.elapsed / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const timeStr = minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');
  const displayText = 'Act' + state.timer.currentAct + ' ' + timeStr;
  
  // Update main timer display (footer)
  const mainDisplay = document.getElementById('timerDisplay');
  if (mainDisplay) mainDisplay.textContent = displayText;
  
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

document.getElementById('timerStartPause').addEventListener('click', startTimer);
document.getElementById('timerReset').addEventListener('click', resetTimer);

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
  
  // Find first uncompleted step and check it
  const nextStep = allSteps.find(s => !state.completedSteps.has(s.id));
  if (nextStep) {
    state.completedSteps.add(nextStep.id);
    ipcRenderer.invoke('save-leveling-progress', Array.from(state.completedSteps));
    render();
  }
}

document.getElementById('prevBtn').addEventListener('click', handlePrevBtn);
document.getElementById('nextBtn').addEventListener('click', handleNextBtn);

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
</script>
</body>
</html>`;
}
