// Utility to resolve a local bundled image path to a file:// URL at markup time.
// Falls back to original relative or remote URL if helper not available.
export function resolveLocalImage(imageLocal?: string, remote?: string): string {
  if (imageLocal) {
    try {
      const bi: any = (window as any).bundledImages;
      if (bi && typeof bi.toFileUrl === 'function') {
        return bi.toFileUrl(imageLocal);
      }
    } catch {}
    return imageLocal; // fallback to relative; imageFallback will attempt later
  }
  return remote || '';
}
