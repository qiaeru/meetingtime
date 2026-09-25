// White initials (and the white remote-cursor label) sit on these colors, so
// each one is darkened until white clears 4.5:1 against it. HSL lightness is
// not perceived lightness: yellow or cyan at L=42 is far brighter than blue at
// L=42, hence a luminance check per hue rather than a fixed hue band.
const MAX_LUMINANCE = 0.18; // (1.05 / 4.5) - 0.05, rounded down

function relativeLuminance(h: number, s: number, l: number): number {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const channel = (n: number): number => {
    const k = (n + h / 30) % 12;
    const c = light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(8) + 0.0722 * channel(4);
}

function legibleHsl(hue: number, sat: number, light: number): string {
  while (light > 20 && relativeLuminance(hue, sat, light) > MAX_LUMINANCE) light--;
  return `hsl(${hue.toFixed(0)}, ${sat}%, ${light}%)`;
}

export function colorFromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return legibleHsl(hash % 360, 70, 50);
}

// Per-position hue spaced evenly around the wheel, salted by meeting id so
// the same position in two different meetings doesn't yield the same color.
export function colorByPosition(idx: number, total: number, salt = ""): string {
  if (total <= 0) total = 1;
  let off = 0;
  for (let i = 0; i < salt.length; i++) off = (off * 31 + salt.charCodeAt(i)) >>> 0;
  const baseHue = (off % 360) + (idx * 360) / total;
  const hue = ((baseHue % 360) + 360) % 360;
  // Alternate saturation/lightness slightly per index for extra distinction
  // when participant count is high.
  const sat = 65 + (idx % 2) * 10;
  return legibleHsl(hue, sat, 44 + (idx % 3) * 3);
}
