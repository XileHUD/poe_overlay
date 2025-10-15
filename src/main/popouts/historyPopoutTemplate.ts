// History popout HTML skeleton (payload delivered later via IPC)
// Separated from main.ts for cleanliness. Keep this file free of large dynamic JSON strings.

export function buildHistoryPopoutHtml(): string {
  return `<!DOCTYPE html><html><head><meta charset='utf-8'/><title>Merchant History</title>
  <script>(function(){
    function flush(t){try{require('electron').ipcRenderer.invoke('history-popout-debug-log',t);}catch{}}
    const L=console.log,E=console.error;console.log=function(...a){L.apply(this,a);flush('[log] '+a.join(' '));};
    console.error=function(...a){E.apply(this,a);flush('[error] '+a.join(' '));};
    window.addEventListener('error',e=>flush('[window-error] '+e.message));
  })();</script>
  <style>
  html,body{margin:0;padding:0;font-family:Segoe UI,Arial,sans-serif;font-size:12px;color:#ddd;background:rgba(20,22,26,0.60);backdrop-filter:blur(6px) saturate(130%);-webkit-user-select:none;overflow:hidden;}
    .window{display:flex;flex-direction:column;height:100vh;}
    .header{font-weight:600;padding:6px 10px;background:rgba(40,44,52,0.95);cursor:default;-webkit-app-region:drag;display:flex;align-items:center;gap:8px;border-bottom:1px solid #404040;}
    .title{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:#fff;}
    .refresh-btn{width:20px;height:20px;line-height:18px;text-align:center;border:1px solid #555;border-radius:4px;background:rgba(60,64,72,0.75);cursor:pointer;-webkit-app-region:no-drag;font-size:14px;padding:0;display:flex;align-items:center;justify-content:center;}
    .refresh-btn:hover:not(.disabled){background:#4a9eff;border-color:#4a9eff;color:#fff;}
    .refresh-btn.disabled{opacity:0.4;cursor:not-allowed;}
    .close{width:20px;height:20px;line-height:18px;text-align:center;border:1px solid #555;border-radius:4px;background:rgba(60,64,72,0.75);cursor:pointer;-webkit-app-region:no-drag;}
    .close:hover{background:#c0392b;border-color:#e74c3c;color:#fff;}
    .info-bar{padding:4px 10px;background:rgba(30,34,40,0.8);font-size:10px;color:#999;display:flex;gap:8px;align-items:center;border-bottom:1px solid #333;}
    .list{flex:1;overflow-y:auto;overflow-x:hidden;}
    .history-row{padding:8px 10px;border-bottom:1px solid #2d2d2d;cursor:pointer;transition:background 0.15s;}
    .history-row:hover{background:rgba(74,158,255,0.15);}
    .history-row.selected{background:rgba(74,158,255,0.25);}
    .row-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;}
    .item-name{font-weight:600;font-size:11px;color:#fafafa;}
    .price{font-size:11px;color:#f0ad4e;}
    .row-meta{display:flex;gap:8px;font-size:10px;color:#888;}
    .detail{padding:10px;border-top:1px solid #404040;max-height:40%;overflow-y:auto;background:rgba(25,28,32,0.9);}
    .detail-item{font-size:11px;line-height:1.4;color:#ddd;}
    ::-webkit-scrollbar{width:6px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:#444;border-radius:3px;}::-webkit-scrollbar-thumb:hover{background:#555;}
    .price-badge{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:999px;background:var(--bg-tertiary);border:1px solid var(--border-color);font-size:11px;font-weight:700;color:var(--text-primary);line-height:1;white-space:nowrap;text-shadow:1px 1px rgba(0,0,0,0.6);}
    .price-badge .amount{font-weight:800;}
    .currency-exalted{background:#1f375a;color:#d6e8ff;border-color:#3f6aa1;}
    .currency-divine{background:radial-gradient(#675c39, #7e6f41);color:#fffef5;border-color:#d4af37;}
    .currency-annul{background:radial-gradient(#5a2a84, #4a266a);color:#f0e6ff;border-color:#7b40b3;}
    .currency-chaos{background:#24331b;color:#cfe9b8;border-color:#4a6a35;}
    .currency-regal{background:#3d2817;color:#f4d8a6;border-color:#6b4a28;}
    .rarity-unique{color:#af6025;}.rarity-rare{color:#ffff77;}.rarity-magic{color:#8888ff;}.rarity-normal{color:#c8c8c8;}
  </style>
  </head><body><div class='window'>
  <div class='header'><div class='title'>Merchant History</div><button class='refresh-btn' id='refreshBtn' title='Refresh (5m global cooldown)'>↻</button><div class='close' onclick='window.close()'>×</div></div>
    <div class='info-bar'><span id='infoText'>Waiting for data...</span></div>
    <div class='list' id='historyList'></div>
    <div class='detail' id='detailPanel' style='display:none;'><div class='detail-item' id='detailContent'></div></div>
  </div>
  <script>
    let state={items:[],selectedIndex:-1,lastRefreshAt:0,nextRefreshAt:0};
    function escapeHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
    function normalizeCurrency(c){const s=String(c||'').toLowerCase();if(s.includes('divine'))return'divine';if(s.includes('exalt'))return'exalted';if(s.includes('annul'))return'annul';if(s.includes('chaos'))return'chaos';if(s.includes('regal'))return'regal';return c;}
    function toRelativeTime(ts){
      let n = Number(ts);
      if(isFinite(n) && n < 2e10) { // likely seconds epoch
        if(n>1e9 && n<2e10) n = n*1000; // convert seconds to ms
      }
      if(!isFinite(n) || n<=0) return '?';
      const now = Date.now();
      let diff = now - n;
      if(diff < 0) diff = 0;
      if(diff < 60000) return '<1m';
      if(diff < 3600000) return Math.floor(diff/60000)+'m';
      if(diff < 86400000) return Math.floor(diff/3600000)+'h';
      return Math.floor(diff/86400000)+'d';
    }
    function render(){
      const list=document.getElementById('historyList');
      const info=document.getElementById('infoText');
      if(!state.items||state.items.length===0){
        list.innerHTML='<div style="padding:20px;text-align:center;color:#666;">No history</div>';
        info.textContent='0 trades';
        return;
      }
      info.textContent=state.items.length+' trades';
      list.innerHTML=state.items.map(function(it,idx){
        const name=(it&&it.item&& (it.item.name||it.item.typeLine||it.item.baseType))||'Item';
        const amount=(it&& (it.price&&it.price.amount || it.amount)) ?? '?';
        const currency=normalizeCurrency((it&& (it.price&&it.price.currency || it.currency))||'');
        const curClass=currency?('currency-'+currency):'';
        const currencyDisplay=currency?(currency.charAt(0).toUpperCase()+currency.slice(1)):'';
        const time=toRelativeTime(it && it.ts ? it.ts : (it && (it.time||it.listedAt||it.date||0))); // canonical ts provided by renderer
        const rarity=(it&&it.item&&it.item.rarity||'').toLowerCase();
        const rarityClass=rarity?('rarity-'+rarity):'';
        const hasPrice = amount !== '?' && currency;
        return '<div class="history-row '+(idx===state.selectedIndex?'selected':'')+'" data-idx="'+idx+'">'
          +'<div class="row-header">'
            +'<div class="item-name '+rarityClass+'">'+escapeHtml(name)+'</div>'
            +(hasPrice ? '<span class="price-badge '+curClass+'"><span class="amount">'+amount+'</span>'+currencyDisplay+'</span>' : '')
          +'</div>'
          +'<div class="row-meta"><span>'+time+' ago</span></div>'
        +'</div>';
      }).join('');
      Array.prototype.forEach.call(document.querySelectorAll('.history-row'), function(r){
        r.addEventListener('click', function(){
          const i=parseInt(r.getAttribute('data-idx')||'0',10);
          state.selectedIndex=i;
          render();
          showDetail(i);
        });
      });
    }
    function showDetail(i){
      const d=document.getElementById('detailPanel');
      const c=document.getElementById('detailContent');
      if(i<0||i>=state.items.length){d.style.display='none';return;}
      const it=state.items[i];
      const item=(it&&it.item)||{};
      const name=item.name||item.typeLine||item.baseType||'Item';
      const rarity=(item.rarity||'normal').toLowerCase();
      const rarityClass='rarity-'+rarity;
      let html="<div style='font-weight:600;font-size:12px;margin-bottom:6px;' class='"+rarityClass+"'>"+escapeHtml(name)+"</div>";
      if(item.baseType && item.baseType!==name) html+="<div style='color:#999;font-size:10px;margin-bottom:4px;'>"+escapeHtml(item.baseType)+"</div>";
      if(item.ilvl) html+="<div style='font-size:10px;color:#888;'>Item Level: "+item.ilvl+"</div>";
      if(Array.isArray(item.implicitMods) && item.implicitMods.length){
        html+="<div style='margin-top:6px;font-size:10px;color:#88f;'>"+item.implicitMods.map(m=>escapeHtml(m)).join('<br>')+"</div>";
      }
      if(Array.isArray(item.explicitMods) && item.explicitMods.length){
        html+="<div style='margin-top:6px;font-size:10px;color:#8af;'>"+item.explicitMods.map(m=>escapeHtml(m)).join('<br>')+"</div>";
      }
      c.innerHTML=html;
      d.style.display='block';
    }
  function updateRefreshButton(){const b=document.getElementById('refreshBtn');const now=Date.now();if(now<state.nextRefreshAt){b.classList.add('disabled');const s=Math.ceil((state.nextRefreshAt-now)/1000);b.title='Refresh available in '+s+'s (5m global)';setTimeout(updateRefreshButton,1000);}else{b.classList.remove('disabled');b.title='Refresh (5m global cooldown)';}}
    let autoRefreshTimer=null;let autoRefreshStarted=false;function scheduleAutoRefresh(){if(autoRefreshTimer)clearTimeout(autoRefreshTimer);autoRefreshTimer=setTimeout(()=>{const now=Date.now();if(now>=state.nextRefreshAt){window.electronAPI?.refreshHistoryPopout?.();}scheduleAutoRefresh();},300000);} // 5m
    document.getElementById('refreshBtn')?.addEventListener('click',()=>{const now=Date.now();if(now<state.nextRefreshAt)return;window.electronAPI?.refreshHistoryPopout?.();});
  if(window.electronAPI?.onUpdateHistoryPopout){window.electronAPI.onUpdateHistoryPopout((data)=>{console.log('Received update event items='+(data?.items?.length||0));state.items=data.items||[];state.lastRefreshAt=data.lastRefreshAt||Date.now();state.nextRefreshAt=data.nextRefreshAt||0;render();updateRefreshButton();if(!autoRefreshStarted){scheduleAutoRefresh();autoRefreshStarted=true;}});}else{console.error('electronAPI.onUpdateHistoryPopout missing');}
    console.log('History skeleton loaded');
  </script></body></html>`;
}
