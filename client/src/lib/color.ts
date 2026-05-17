export function colorFromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

// Per-position hue spaced evenly around the wheel, salted by meeting id so
// the same position in two different meetings doesn't yield the same colour.
export function colorByPosition(idx: number, total: number, salt = ""): string {
  if (total <= 0) total = 1;
  let off = 0;
  for (let i = 0; i < salt.length; i++) off = (off * 31 + salt.charCodeAt(i)) >>> 0;
  const baseHue = (off % 360) + (idx * 360) / total;
  const hue = ((baseHue % 360) + 360) % 360;
  // Alternate saturation/lightness slightly per index for extra distinction
  // when participant count is high.
  const sat = 65 + ((idx % 2) * 10);
  const light = 48 + ((idx % 3) * 4);
  return `hsl(${hue.toFixed(0)}, ${sat}%, ${light}%)`;
}
