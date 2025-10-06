// Splash screen HTML template extracted from main.ts for maintainability.
// buildSplashHtml(initialStatus, isFirstLaunch)
//  - initialStatus: initial status message string
//  - isFirstLaunch: whether to show first-launch note about extraction delay

export function buildSplashHtml(initialStatus: string, isFirstLaunch: boolean): string {
  const noteText = isFirstLaunch
    ? 'First launch requires Windows to extract application files<br>Subsequent launches will be instant'
    : 'Loading overlay components...';

  return `<!DOCTYPE html><html><head><meta charset='utf-8'/><title>XileHUD</title>
  <style>
  :root { color-scheme: dark; }
  html, body { overflow:hidden; }
  body { margin:0; font-family: system-ui, Arial, sans-serif; background: rgba(0,0,0,0); color:#d6d6dc; width:100%; height:100%; }
  .wrap { position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:100%; max-width:360px; padding:18px 24px 22px; box-sizing:border-box; display:flex; flex-direction:column; align-items:center; gap:11px; background:rgba(18,18,22,0.96); border:1px solid #2e2e35; border-radius:16px; box-shadow:0 8px 26px -8px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.02); backdrop-filter:blur(8px); }
  .title { font-size:24px; font-weight:650; letter-spacing:1.2px; background:linear-gradient(90deg,#cdb8ff,#a98eff 55%,#7b5fff); -webkit-background-clip:text; color:transparent; filter:drop-shadow(0 1px 2px rgba(0,0,0,0.55)); text-align:center; margin-bottom:2px; }
  .subtitle { font-size:11px; opacity:0.65; letter-spacing:0.7px; margin-top:-6px; text-transform:uppercase; text-align:center; }
  .status { font-size:13px; opacity:0.92; min-height:20px; text-align:center; max-width:320px; line-height:1.45; padding-top:4px; color:#d8d8e2; }
  .spinner { width:24px; height:24px; border:3px solid #3f3f47; border-top-color:#b190ff; border-radius:50%; animation:spin 0.85s linear infinite; filter:drop-shadow(0 0 4px rgba(111,84,255,0.4)); }
  @keyframes spin { to { transform:rotate(360deg);} }
  .ready { color:#92ff9d; font-weight:540; }
  .fade-in { animation:fadeIn .4s ease-out; }
  @keyframes fadeIn { from { opacity:0; transform:translateY(6px);} to { opacity:1; transform:translateY(0);} }
  .note { font-size:10px; opacity:0.55; margin-top:6px; font-style:italic; max-width:320px; text-align:center; line-height:1.40; color:#b8b8c8; transition:opacity 0.3s ease; }
  </style></head><body>
  <div class='wrap fade-in'>
      <div class='title'>XILEHUD</div>
      <div class='subtitle'>Starting overlay…</div>
      <div class='spinner' id='sp'></div>
      <div class='status' id='st'></div>
      <div class='note' id='note'>${noteText}</div>
  </div>
  <script>document.getElementById('st').textContent=${JSON.stringify(initialStatus)};</script>
  </body></html>`;
}

export default buildSplashHtml;
