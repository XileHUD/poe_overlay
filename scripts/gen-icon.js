#!/usr/bin/env node
/*
  Converts xilehudico.png in the overlay root into build/icon.ico with required sizes.
  Requires png-to-ico (installed as devDependency).
*/
const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico');

async function main(){
  const root = process.cwd();
  const pngNameCandidates = ['xilehudico.png', 'xilehudICO.png', 'icon.png'];
  let pngPath = null;
  for (const cand of pngNameCandidates){
    const p = path.join(root, cand);
    if (fs.existsSync(p)) { pngPath = p; break; }
  }
  if(!pngPath){
    console.warn('[gen-icon] No PNG source (xilehudico.png) found; skipping icon generation.');
    return;
  }
  const outDir = path.join(root, 'build');
  if(!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'icon.ico');
  try {
    const buf = await pngToIco(pngPath); // png-to-ico internally generates multiple sizes
    fs.writeFileSync(outFile, buf);
    const kb = (buf.length/1024).toFixed(1);
    console.log(`[gen-icon] Generated ${outFile} (${kb} KB)`);
  } catch (e){
    console.error('[gen-icon] Failed to convert PNG to ICO:', e.message || e);
    process.exitCode = 0; // do not fail entire build; warn only
  }
}
main();
