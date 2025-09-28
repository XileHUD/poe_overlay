// Shared image fallback helper
export function bindImageFallback(root: ParentNode, selector: string, placeholderSvg: string, dimOpacity = 0.55) {
  const ph = `data:image/svg+xml;utf8,${encodeURIComponent(placeholderSvg)}`;
  const globalAny: any = (typeof window !== 'undefined') ? (window as any) : {};
  if (!globalAny.__imageErrorEvents) globalAny.__imageErrorEvents = [];
  root.querySelectorAll<HTMLImageElement>(selector).forEach(img => {
    if ((img as any)._fallbackBound) return;
    (img as any)._fallbackBound = true;
    img.loading = img.loading || 'lazy';
    img.decoding = 'async';
    const original = img.getAttribute('data-orig-src') || img.src;
    img.setAttribute('data-orig-src', original);
    const onError = () => {
      // First failure: try one retry with cache-bust, don't swap to placeholder yet
      if (!(img as any)._retried) {
        (img as any)._retried = true;
        const bust = original + (original.includes('?') ? '&' : '?') + 'r=' + Date.now();
        // log retry attempt
        try { globalAny.__imageErrorEvents.push({ ts: Date.now(), phase: 'retry', src: original, bust }); } catch {}
        img.src = bust;
        return;
      }
      // Second failure: fallback placeholder
      try { img.src = ph; } catch {}
      img.style.opacity = String(dimOpacity);
      img.style.filter = 'grayscale(1)';
      try { globalAny.__imageErrorEvents.push({ ts: Date.now(), phase: 'failed', src: original }); } catch {}
      img.removeEventListener('error', onError);
    };
    img.addEventListener('error', onError);
    img.addEventListener('load', async () => {
      try {
        const url = img.getAttribute('data-orig-src') || img.src;
        if(!url || url.startsWith('file://') || url.startsWith('data:')) return;
        // Ask main for cached file first
        const cached = await (window as any).electronAPI?.getCachedImage?.(url);
        if (cached && cached.path) {
          // Already cached; ensure using it if network version ever fails later
          (img as any)._cachedPath = cached.path;
          return;
        }
        const res = await (window as any).electronAPI?.cacheImage?.(url);
        if (res && res.ok && res.cached) {
          (img as any)._cachedPath = res.cached;
          // Optionally swap to file path on next paint (keep original for cache bust chain if needed)
          setTimeout(()=>{
            try {
              if(img.complete && (img as any)._cachedPath && img.naturalWidth>0){
                // Keep original in data-orig-src; only swap displayed source if not already placeholder
                if(!img.src.startsWith('file://')){
                  img.src = 'file://'+ (img as any)._cachedPath.replace(/\\/g,'/');
                }
              }
            } catch {}
          }, 30);
        }
      } catch {}
    }, { once: true });
  });
}