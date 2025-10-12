/**
 * Shared image placeholder to prevent broken image flash while loading
 * Using a transparent 1x1 SVG as initial src prevents browser from showing broken image icon
 */
export const TRANSPARENT_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/%3E";

/**
 * Generate a visible placeholder SVG with optional text/icon
 */
export function createPlaceholderSvg(width: number, height: number, text = '?'): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'>` +
    `<rect width='${width}' height='${height}' rx='8' fill='#222'/>` +
    `<text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#555' font-size='${Math.floor(width / 8)}' font-family='sans-serif'>${text}</text>` +
    `</svg>`
  )}`;
}
