// Shared image fallback helper - only shows bundled images or placeholder
export function bindImageFallback(root: ParentNode, selector: string, placeholderSvg: string, dimOpacity = 0.55) {
  const ph = `data:image/svg+xml;utf8,${encodeURIComponent(placeholderSvg)}`;
  
  root.querySelectorAll<HTMLImageElement>(selector).forEach(async img => {
    if ((img as any)._fallbackBound) return;
    (img as any)._fallbackBound = true;
    
    img.loading = 'eager'; // Load all images immediately
    img.decoding = 'async';
    
    const original = img.getAttribute('data-orig-src') || img.src;
    img.setAttribute('data-orig-src', original);
    
    // DEBUG: log initial image state for troubleshooting (only once)
    try {
      if(!(img as any)._dbgLogged){
        (img as any)._dbgLogged = true;
        console.debug('[ImgFallback] mount', { orig: original });
      }
    } catch {}

    // NEW: Direct local resolution path (avoid invalid relative resolution inside app.asar)
    try {
      if (original && !/^https?:/i.test(original) && !/^file:/i.test(original) && !/^data:/i.test(original)) {
        // Attempt direct file construction first (no IPC)
        const bi = (window as any).bundledImages;
        if (bi && typeof bi.toFileUrl === 'function') {
          const directUrl = bi.toFileUrl(original);
          // Test by creating a temporary Image object (async) or rely on main path check via IPC second
          // We'll still request IPC to confirm existence; if IPC returns null we'll fallback further.
          const ipcUrl = await (window as any).electronAPI?.getBundledImagePath?.(original);
          if (ipcUrl) {
            img.src = ipcUrl;
            (img as any)._resolvedLocal = true;
            try { console.debug('[ImgFallback] resolved (ipc verified)', { orig: original, to: ipcUrl }); } catch {}
            return;
          } else {
            // Use direct guess; browser will error if not present triggering fallback.
            img.src = directUrl;
            try { console.debug('[ImgFallback] direct guess (ipc miss)', { orig: original, to: directUrl }); } catch {}
            // Do not return; allow onError to apply placeholder if nonexistent.
          }
        }
      }
    } catch (e) { try { console.debug('[ImgFallback] direct resolution exception', (e as any)?.message); } catch {} }

    // Legacy: Try to resolve previously bundled (base64‑named) image via main-process index if original looked like a remote URL
    try {
      if (original && /^https?:/i.test(original)) {
        const res = await (window as any).electronAPI?.resolveImage?.(original);
        if (res && res.local) {
          const localFileUrl = 'file:///' + res.local.replace(/\\/g,'/');
          img.src = localFileUrl;
          (img as any)._resolvedLocal = true;
          try { console.debug('[ImgFallback] legacy resolved', { orig: original, to: localFileUrl }); } catch {}
          return; // Successfully resolved to local image
        } else { try { console.debug('[ImgFallback] legacy miss', { orig: original }); } catch {} }
      }
    } catch {}
    
    // If original empty, attempt heuristic resolution using nearby data attributes (name / slug)
    if (!original || original === '') {
      try {
        const parent = img.closest('[data-slug],[data-name]') as HTMLElement | null;
        const slug = parent?.getAttribute('data-slug') || parent?.getAttribute('data-name');
        if (slug) {
          const h = await (window as any).electronAPI?.resolveImageByName?.(slug);
          if (h && h.local) {
            img.src = 'file:///' + h.local.replace(/\\/g,'/');
            (img as any)._resolvedLocal = true;
            try { console.debug('[ImgFallback] heuristic resolved', { slug, to: img.src }); } catch {}
            return;
          }
          else { try { console.debug('[ImgFallback] heuristic miss', { slug }); } catch {} }
        }
      } catch {}
      // Fallback placeholder
      img.src = ph;
      img.style.opacity = String(dimOpacity);
      img.style.filter = 'grayscale(1)';
      try { console.debug('[ImgFallback] placeholder (empty original)'); } catch {}
      return;
    }
    
    // Set up error handler to show placeholder on any failure
    const onError = () => {
      try { console.debug('[ImgFallback] error -> placeholder', { orig: original }); } catch {}
      img.src = ph;
      img.style.opacity = String(dimOpacity);
      img.style.filter = 'grayscale(1)';
      img.removeEventListener('error', onError);
    };
    img.addEventListener('error', onError);
    // Restore color/opacity when a real image successfully loads
    img.addEventListener('load', () => {
      // If we've transitioned from placeholder -> real image, restore style
      if (img.src === ph) return; // placeholder load, keep dim styling
      img.style.opacity = '1';
      img.style.filter = 'none';
    });
  });
}
