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
  });
}