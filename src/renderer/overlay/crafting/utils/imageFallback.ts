// Shared image fallback helper
export function bindImageFallback(root: ParentNode, selector: string, placeholderSvg: string, dimOpacity = 0.55) {
  const ph = `data:image/svg+xml;utf8,${encodeURIComponent(placeholderSvg)}`;
  root.querySelectorAll<HTMLImageElement>(selector).forEach(img => {
    if ((img as any)._fallbackBound) return;
    (img as any)._fallbackBound = true;
    img.loading = img.loading || 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => {
      try { img.src = ph; } catch {}
      img.style.opacity = String(dimOpacity);
      img.style.filter = 'grayscale(1)';
    }, { once: true });
  });
}