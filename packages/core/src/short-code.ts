/*
 * A card's short code: what a cashier types when the QR won't scan. Six characters from an alphabet
 * with no look-alikes, unique within the shop, drawn by the database (migration 0014).
 */

// Keep in step with qrew_short_code() and enrollments_short_code_format (migration 0014).
const SHORT_CODE = /^[2-9A-HJKMNP-TV-Z]{6}$/;

/**
 * A typed code in canonical form, or null if it can't be one. Forgiving of how people type: case,
 * and the space or hyphen they copy from "K7M 4QX".
 */
export function normalizeShortCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return SHORT_CODE.test(code) ? code : null;
}

/** How a code is shown: two groups of three, "K7M 4QX", easier to read out across a till. */
export function formatShortCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}
