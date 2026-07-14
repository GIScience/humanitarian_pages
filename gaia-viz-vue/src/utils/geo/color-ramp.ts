export type RgbaColor = [number, number, number, number];

export type CategoryStyle = string | RgbaColor | { color: string; label?: string };

export const COLOR_SCHEMES: Record<string, string[]> = {
  Blues: ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"],
  Reds: ["#fff5f0", "#fcbba1", "#fb6a4a", "#cb181d", "#67000d"],
  YlOrRd: ["#ffffb2", "#fecc5c", "#fd8d3c", "#f03b20", "#bd0026"],
  Greens: ["#f7fcf5", "#c7e9c0", "#74c476", "#238b45", "#00441b"],
  Viridis: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
};


function hexToRgba(hex: string): RgbaColor {
  let h = hex.replace(/^#/, "");
  // Expand shorthand (#abc -> #aabbcc)
  if (h.length === 3 || h.length === 4) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255;
  return [r, g, b, a];
}

export function toRgba(style: CategoryStyle): RgbaColor {
  if (typeof style === "string") return hexToRgba(style);
  if (Array.isArray(style)) return style;
  return hexToRgba(style.color);
}
