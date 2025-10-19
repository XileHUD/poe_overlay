import { type ChipChrome } from "../utils";

export type RgbTuple = [number, number, number];

export function buildPoe2ChipChrome(rgb: RgbTuple, active: boolean): ChipChrome {
  const [r, g, b] = rgb;
  const background = active ? `rgba(${r},${g},${b},0.9)` : `rgba(${r},${g},${b},0.22)`;
  const border = `1px solid rgba(${r},${g},${b},0.6)`;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const color = active ? (luma > 180 ? "#000" : "#fff") : "var(--text-primary)";
  return { border, background, color };
}

export function buildPoe2ChipChromeFromPalette(tag: string, active: boolean, derive: (tag: string) => RgbTuple): ChipChrome {
  return buildPoe2ChipChrome(derive(tag), active);
}

export function buildPoe2ExcludeChrome(): ChipChrome {
  return { border: "1px solid rgba(180,40,40,0.8)", background: "rgba(200,60,60,0.85)", color: "#fff" };
}
