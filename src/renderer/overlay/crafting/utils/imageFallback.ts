// Shared image fallback helper - only shows bundled images or placeholder
export function bindImageFallback(root: ParentNode, selector: string, placeholderSvg: string, dimOpacity = 0.55) {
  const ph = placeholderSvg.startsWith('data:')
    ? placeholderSvg
    : `data:image/svg+xml;utf8,${encodeURIComponent(placeholderSvg)}`;
  
  root.querySelectorAll<HTMLImageElement>(selector).forEach(async img => {
    if ((img as any)._fallbackBound) return;
    (img as any)._fallbackBound = true;
    
    img.loading = 'eager';
    img.decoding = 'async';
    
    const original = img.getAttribute('data-orig-src') || img.src;
    img.setAttribute('data-orig-src', original);
    
    // Set up load handler FIRST to catch initial load (prevents broken image flash)
    const onLoad = () => {
      if (img.src === ph) {
        // Placeholder loaded - show it dimmed
        img.style.opacity = String(dimOpacity);
        img.style.filter = 'grayscale(1)';
      } else {
        // Real image loaded - show it fully
        img.style.opacity = '1';
        img.style.filter = 'none';
      }
    };
    img.addEventListener('load', onLoad);
    
    // Set up error handler to show placeholder on any failure
    const onError = () => {
      img.src = ph;
      img.style.opacity = String(dimOpacity);
      img.style.filter = 'grayscale(1)';
      img.removeEventListener('error', onError);
    };
    img.addEventListener('error', onError);
    
    // Hide initially to prevent flash (will show via load event)
    img.style.opacity = '0';
    img.style.transition = 'opacity 0.15s ease';
    
    // Try local bundled path first for relative paths
    try {
      if (original && !/^https?:/i.test(original) && !/^file:/i.test(original) && !/^data:/i.test(original)) {
        const ipcUrl = await (window as any).electronAPI?.getBundledImagePath?.(original);
        if (ipcUrl) {
          img.src = ipcUrl;
          return;
        }
      }
    } catch {}
    
    // Legacy: Try to resolve remote URLs via cache
    try {
      if (original && /^https?:/i.test(original)) {
        const res = await (window as any).electronAPI?.resolveImage?.(original);
        if (res && res.local) {
          img.src = 'file:///' + res.local.replace(/\\/g,'/');
          return;
        }
      }
    } catch {}
    
    // Fallback: try original path directly
    if (original && original !== img.src) {
      img.src = original;
    }
  });
}
