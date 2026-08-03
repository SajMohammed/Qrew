const BASE = import.meta.env.VITE_API_BASE ?? "/api";

export interface CardView {
  serial: string;
  qrToken: string;
  merchantName: string;
  programName: string;
  rewardText: string;
  currentStamps: number;
  stampsRequired: number;
  bonusStamps: number;
  rewardReady: boolean;
  brandColor: string;
  stampIcon: string;
  /** The shop's artwork, when set. Drawn instead of the emoji. */
  stampImageUrl?: string;
  emptyStampImageUrl?: string;
  wallet: { apple: string | null; google: string | null };
}

export interface EnrollResult {
  enrollmentId: string;
  serial: string;
  currentStamps: number;
  alreadyEnrolled: boolean;
}

// Public pre-enrollment preview of a shop's card, for the enroll landing.
export interface ShopPreview {
  merchantName: string;
  programName: string;
  rewardText: string;
  stampsRequired: number;
  bonusStamps: number;
  brandColor: string;
  stampIcon: string;
}

export async function getShopPreview(m: string, p: string): Promise<ShopPreview> {
  const res = await fetch(`${BASE}/enroll/preview?m=${encodeURIComponent(m)}&p=${encodeURIComponent(p)}`);
  if (!res.ok) throw new Error(`Preview failed (${res.status})`);
  return res.json();
}

// The lightweight per-card summary from GET /me/cards (the grid). cardDesign is the program's
// jsonb; we normalize it into a tile below.
export interface MyCard {
  serial: string;
  merchantName: string;
  programName: string;
  rewardText: string;
  currentStamps: number;
  stampsRequired: number;
  cardDesign: { brandColor?: string; stampIcon?: string } | null;
  status: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInMs: number;
}

// A uniform tile shape the grid renders, from either /me/cards (signed in) or getCard (anonymous).
export interface CardTile {
  serial: string;
  merchantName: string;
  currentStamps: number;
  stampsRequired: number;
  brandColor: string;
  stampIcon: string;
  rewardReady: boolean;
}

const DEFAULT_BRAND = "#146a2e";
const DEFAULT_ICON = "★";

export function tileFromMyCard(c: MyCard): CardTile {
  return {
    serial: c.serial,
    merchantName: c.merchantName,
    currentStamps: c.currentStamps,
    stampsRequired: c.stampsRequired,
    brandColor: c.cardDesign?.brandColor ?? DEFAULT_BRAND,
    stampIcon: c.cardDesign?.stampIcon ?? DEFAULT_ICON,
    rewardReady: c.currentStamps >= c.stampsRequired,
  };
}

export function tileFromCardView(c: CardView): CardTile {
  return {
    serial: c.serial,
    merchantName: c.merchantName,
    currentStamps: c.currentStamps,
    stampsRequired: c.stampsRequired,
    brandColor: c.brandColor,
    stampIcon: c.stampIcon,
    rewardReady: c.rewardReady,
  };
}

function rnd(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── public / opportunistically-authed ────────────────────────────────────────────
// A Bearer (when signed in) links the new card to the account; omitted → anonymous walk-in.
export async function enroll(
  input: { merchantId: string; programId: string; phone?: string; name?: string },
  token?: string | null,
): Promise<EnrollResult> {
  const res = await fetch(`${BASE}/enroll`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Enroll failed (${res.status})`);
  return res.json();
}

export async function getCard(serial: string): Promise<CardView> {
  const res = await fetch(`${BASE}/card/${serial}`);
  if (!res.ok) throw new Error(`Card not found (${res.status})`);
  return res.json();
}

// DEV: stands in for the staff scanner while self-testing the loop.
export async function simulateStamp(merchantId: string, enrollmentId: string): Promise<void> {
  const res = await fetch(`${BASE}/loyalty/stamp`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-merchant-id": merchantId },
    body: JSON.stringify({ enrollmentId, idempotencyKey: `sim-${rnd()}` }),
  });
  if (!res.ok) throw new Error(`Stamp failed (${res.status})`);
}

export async function redeemReward(merchantId: string, enrollmentId: string): Promise<void> {
  const res = await fetch(`${BASE}/loyalty/redeem`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-merchant-id": merchantId },
    body: JSON.stringify({ enrollmentId, idempotencyKey: `rdm-${rnd()}` }),
  });
  if (!res.ok) throw new Error(`Redeem failed (${res.status})`);
}

// ── customer auth (own session) ──────────────────────────────────────────────────
export async function socialAuth(idToken: string, device?: string): Promise<AuthTokens> {
  const res = await fetch(`${BASE}/auth/social`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "google", idToken, device }),
  });
  if (!res.ok) throw new Error(`Sign-in failed (${res.status})`);
  return res.json();
}

export async function refreshAuth(refreshToken: string): Promise<AuthTokens | null> {
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function logoutAuth(refreshToken: string): Promise<void> {
  await fetch(`${BASE}/auth/logout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => {});
}

export async function getMyCards(token: string): Promise<MyCard[]> {
  const res = await fetch(`${BASE}/me/cards`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Could not load cards (${res.status})`);
  return res.json();
}

// Fold an anonymous card into the account. Returns true when the serial is DONE and safe to drop from
// the device — claimed, or definitively gone / not ours (404/409). Returns false on a TRANSIENT failure
// (network, or a just-expired token → 401/5xx) so the caller keeps it and retries, never losing a card.
export async function claimCard(token: string, serial: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/me/claim`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ serial }),
    });
    if (res.ok) return true;
    return res.status === 404 || res.status === 409; // definitive → drop; else transient → keep
  } catch {
    return false; // network error → keep and retry
  }
}
