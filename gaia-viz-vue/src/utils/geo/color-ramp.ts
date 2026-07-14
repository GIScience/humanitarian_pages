type RgbaColor = [number, number, number, number];

/** A category can be given as a hex string, an RGBA tuple, or a { color, label } object. */
type CategoryStyle = string | RgbaColor | { color: string; label?: string };

// A handful of sequential Brewer/Carto-style ramps, enough to color single-band rasters.
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

// export const createColorRamp = ({
//   colorScheme,
//   min,
//   max,
//   continuous = false,
//   reverse = false,
// }: {
//   colorScheme?: string;
//   min: number;
//   max: number;
//   continuous?: boolean;
//   reverse?: boolean;
// }) => {
//   const hexColors = (colorScheme && COLOR_SCHEMES[colorScheme]) || COLOR_SCHEMES.Blues;
//   const stops = (reverse ? [...hexColors].reverse() : hexColors).map(hexToRgb);
//   const span = max - min || 1;
//   const n = stops.length;

//   return (value: number): Rgb => {
//     const t = Math.min(1, Math.max(0, (value - min) / span));

//     if (!continuous) {
//       return stops[Math.min(n - 1, Math.floor(t * n))];
//     }

//     const scaled = t * (n - 1);
//     const i = Math.min(n - 2, Math.floor(scaled));
//     const localT = scaled - i;
//     const [r0, g0, b0] = stops[i];
//     const [r1, g1, b1] = stops[i + 1];
//     return [
//       Math.round(r0 + (r1 - r0) * localT),
//       Math.round(g0 + (g1 - g0) * localT),
//       Math.round(b0 + (b1 - b0) * localT),
//     ];
//   };
// };
