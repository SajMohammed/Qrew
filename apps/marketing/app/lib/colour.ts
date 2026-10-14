/** White or dark text on a brand colour — the same rule the customer app uses. */
export function textOn(hex: string): string {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
  return (0.299 * r! + 0.587 * g! + 0.114 * b!) / 255 > 0.62 ? "#1c1a15" : "#fbfbf7";
}
