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
    
    // Try to resolve local bundled image
    try {
      if (original && !original.startsWith('file://') && !original.startsWith('data:')) {
        const res = await (window as any).electronAPI?.resolveImage?.(original);
        if (res && res.local) {
          const localFileUrl = 'file:///' + res.local.replace(/\\/g,'/');
          img.src = localFileUrl;
          (img as any)._resolvedLocal = true;
          return; // Successfully resolved to local image
        }
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
            return;
          }
        }
      } catch {}
      // Fallback placeholder
      img.src = ph;
      img.style.opacity = String(dimOpacity);
      img.style.filter = 'grayscale(1)';
      return;
    }
    
    // Set up error handler to show placeholder on any failure
    const onError = () => {
      img.src = ph;
      img.style.opacity = String(dimOpacity);
      img.style.filter = 'grayscale(1)';
      img.removeEventListener('error', onError);
    };
    img.addEventListener('error', onError);
  });
}
