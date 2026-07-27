// Pick white or dark text for legibility on a merchant's brand colour (auto-contrast).
export function textOn(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length < 6) return "#fbfbf7";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#1c1a15" : "#fbfbf7";
}
