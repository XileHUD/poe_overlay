// Shared image fallback helper
export function bindImageFallback(root: ParentNode, selector: string, placeholderSvg: string, dimOpacity = 0.55) {
  const ph = `data:image/svg+xml;utf8,${encodeURIComponent(placeholderSvg)}`;
  const globalAny: any = (typeof window !== 'undefined') ? (window as any) : {};
  if (!globalAny.__imageErrorEvents) globalAny.__imageErrorEvents = [];
  root.querySelectorAll<HTMLImageElement>(selector).forEach(img => {
    if ((img as any)._fallbackBound) return;
    (img as any)._fallbackBound = true;
    img.loading = 'eager'; // Load all images immediately for caching
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
          // Already cached; just store the path, don't swap src (image already loaded successfully)
          (img as any)._cachedPath = cached.path;
          return;
        }
        const res = await (window as any).electronAPI?.cacheImage?.(url);
        if (res && res.ok && res.cached) {
          (img as any)._cachedPath = res.cached;
          // Don't swap src - image already loaded successfully from bundled/network source
          // Swapping to file:// can cause CORS issues or unnecessary re-renders
        }
      } catch {}
    }, { once: true });
  });
}