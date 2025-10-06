// Modifier popout HTML template extracted from main.ts for clarity
// Accepts base64 JSON payload string (b64) which is decoded in the renderer script

export function buildModPopoutHtml(b64: string): string {
  return `<!DOCTYPE html><html><head><meta charset='utf-8'/><title>Mods</title>
<style>
html,body{margin:0;padding:0;font-family:Segoe UI,Arial,sans-serif;font-size:12px;color:#ddd;background:rgba(20,22,26,0.92);-webkit-user-select:none;}
.window{display:flex;flex-direction:column;height:100%;}
.header{font-weight:600;padding:4px 8px;background:rgba(40,44,52,0.9);cursor:default;-webkit-app-region:drag;display:flex;align-items:center;gap:6px;}
.title{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px;}
.close{width:18px;height:18px;line-height:16px;text-align:center;border:1px solid #555;border-radius:4px;background:rgba(60,64,72,0.75);cursor:pointer;-webkit-app-region:no-drag;}
.close:hover{background:#c0392b;border-color:#e74c3c;color:#fff;}
.content{padding:6px 8px;overflow:auto;flex:1;}
.mod{margin-bottom:6px;border:1px solid #333;border-radius:4px;padding:4px 6px;background:rgba(30,34,40,0.6);} 
.mod:last-child{margin-bottom:0;}
.mod-text{font-size:11px;line-height:1.25;margin-bottom:4px;color:#fafafa;}
.tiers{display:flex;flex-direction:column;gap:3px;}
.tier{display:flex;align-items:center;gap:6px;font-size:10px;background:rgba(55,60,70,0.55);padding:2px 4px;border-radius:3px;}
.badge{background:#444;padding:1px 6px;border-radius:4px;font-size:10px;color:#eee;line-height:1.2;}
.badge-tier{background:#b71c1c;font-weight:600;}
.badge-ilvl{background:#455a64;}
.badge-weight{background:#3949ab;}
::-webkit-scrollbar{width:8px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:#444;border-radius:4px;}::-webkit-scrollbar-thumb:hover{background:#555;}
</style>
</head><body><div class='window'><div class='header'><div class='title'></div><div class='close' onclick='window.close()'>×</div></div><div class='content'></div></div>
<script>
// Safe UTF-8 base64 decode to avoid mojibake
function decodeUtf8(b64){const bin=atob(b64);const len=bin.length;const bytes=new Uint8Array(len);for(let i=0;i<len;i++)bytes[i]=bin.charCodeAt(i);try{return new TextDecoder('utf-8').decode(bytes);}catch{return bin;}}
try{const raw=decodeUtf8('${b64}');const data=JSON.parse(raw);document.querySelector('.title').textContent=data.title||'Mods';const cont=document.querySelector('.content');
const normalize=(s)=>String(s||'').replace(/[\uFFFD]/g,'').replace(/\s+/g,' ').trim();
if(Array.isArray(data.mods)&&data.mods.length){data.mods.forEach(m=>{const wrap=document.createElement('div');wrap.className='mod';const mt=document.createElement('div');mt.className='mod-text';mt.textContent=m.text||'';wrap.appendChild(mt);if(Array.isArray(m.tiers)&&m.tiers.length){const tl=document.createElement('div');tl.className='tiers';m.tiers.forEach(tr=>{const line=document.createElement('div');line.className='tier';const tierSpan=document.createElement('span');tierSpan.className='badge badge-tier';tierSpan.textContent='T'+(tr.tier||'');line.appendChild(tierSpan);const textSpan=document.createElement('span');textSpan.style.flex='1';textSpan.textContent=normalize(tr.text||'');line.appendChild(textSpan);if(tr.ilvl){const il=document.createElement('span');il.className='badge badge-ilvl';il.textContent='iLvl '+tr.ilvl;line.appendChild(il);} if(tr.weight){const w=document.createElement('span');w.className='badge badge-weight';w.textContent=String(tr.weight);line.appendChild(w);} tl.appendChild(line);});wrap.appendChild(tl);}cont.appendChild(wrap);});} else { cont.textContent='No mods'; }}
catch(err){console.error(err);document.querySelector('.content').textContent='Failed to load';}
</script></body></html>`;
}
