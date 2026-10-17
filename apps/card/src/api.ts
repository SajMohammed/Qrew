const BASE = import.meta.env.VITE_API_BASE ?? "/api";

/** Why a call failed — the customer is told something different for each. */
export type FailureKind = "offline" | "not_found" | "server";

export class ApiError extends Error {
  constructor(
    readonly kind: FailureKind,
    readonly status: number | null,
    message: string,
    /** What to tell the customer, when there is something more useful than the general line. */
    readonly say?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function failureKind(e: unknown): FailureKind {
  return e instanceof ApiError ? e.kind : "server";
}

const FRIENDLY: Record<FailureKind, string> = {
  offline: "No connection — check your signal and try again.",
  not_found: "That's no longer available.",
  server: "Something went wrong — please try again.",
};

/** A failure in words for the customer — never "Failed to fetch". */
export function friendlyError(e: unknown): string {
  return (e instanceof ApiError && e.say) || FRIENDLY[failureKind(e)];
}

/** A status that says the thing asked for isn't there: 404, or 400 for ids that can never exist. */
function kindOf(status: number): FailureKind {
  return status === 404 || status === 400 ? "not_found" : "server";
}

const GET_TIMEOUT_MS = 10_000;

/**
 * One GET, with a deadline: on a weak signal a request can hang for minutes, and the card would sit
 * on "Live" all the while. No answer in time counts as offline.
 *
 * Built on AbortController and a timer rather than AbortSignal.timeout, which Safari only gained in
 * 16 — an iPhone still on iOS 15 would otherwise fail every request.
 */
async function getJson<T>(path: string, headers?: HeadersInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GET_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, { headers, signal: ctrl.signal });
    } catch {
      throw new ApiError("offline", null, `GET ${path}: no answer`);
    }
    if (!res.ok) throw new ApiError(kindOf(res.status), res.status, `GET ${path} failed (${res.status})`);
    try {
      return (await res.json()) as T;
    } catch {
      // Cut off mid-body by the deadline, or not JSON at all (a misrouted page).
      throw new ApiError(ctrl.signal.aborted ? "offline" : "server", res.status, `GET ${path}: unreadable answer`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One POST. No deadline: a POST that times out here may still have landed, and the customer trying
 * again could then make a second card. The browser's own limit applies.
 */
async function post(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  try {
    return await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("offline", null, `POST ${path}: no answer`);
  }
}

export interface CardView {
  serial: string;
  /** The programme — how the app spots it already holds this shop's card when its code is scanned again. */
  programId: string;
  qrToken: string;
  /** How long qrToken stays valid, in ms. */
  qrTtlMs: number;
  /** What a cashier types when the QR won't scan, formatted: "K7M 4QX". */
  shortCode: string;
  merchantName: string;
  programName: string;
  rewardText: string;
  currentStamps: number;
  stampsRequired: number;
  bonusStamps: number;
  rewardReady: boolean;
  /** The shop turned this card off: it collects nothing more, but what it holds can still be used. */
  frozen?: boolean;
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

export function getShopPreview(m: string, p: string): Promise<ShopPreview> {
  return getJson(`/enroll/preview?m=${encodeURIComponent(m)}&p=${encodeURIComponent(p)}`);
}

// The lightweight per-card summary from GET /me/cards (the grid). cardDesign is the program's
// jsonb; we normalize it into a tile below.
export interface MyCard {
  serial: string;
  programId: string;
  merchantName: string;
  programName: string;
  rewardText: string;
  currentStamps: number;
  stampsRequired: number;
  cardDesign: { brandColor?: string; stampIcon?: string } | null;
  status: string;
  frozen?: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInMs: number;
}

// A uniform tile shape the grid renders, from either /me/cards (signed in) or getCard (anonymous).
export interface CardTile {
  serial: string;
  programId: string;
  merchantName: string;
  /** Which of the shop's cards — a shop can run more than one, and each is its own card. */
  programName: string;
  /** No longer collecting: the shop turned this card off. What it holds can still be used. */
  frozen: boolean;
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
    programId: c.programId,
    merchantName: c.merchantName,
    programName: c.programName,
    frozen: c.frozen ?? false,
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
    programId: c.programId,
    merchantName: c.merchantName,
    programName: c.programName,
    frozen: c.frozen ?? false,
    currentStamps: c.currentStamps,
    stampsRequired: c.stampsRequired,
    brandColor: c.brandColor,
    stampIcon: c.stampIcon,
    rewardReady: c.rewardReady,
  };
}

/**
 * The card this device already holds for a programme, if any. Every card the app knows is active —
 * /me/cards returns only active ones, and nothing yet makes a card anything else. If that changes
 * (a lapsed membership, say), a non-active card must not count here, or its shop could never be
 * joined again. A FROZEN card does count: it is still the customer's, and its programme takes no
 * one new, so scanning its old poster should open it.
 */
export function heldCardFor(tiles: CardTile[], programId: string): CardTile | undefined {
  return tiles.find((t) => t.programId === programId);
}

function rnd(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── public / opportunistically-authed ────────────────────────────────────────────
// A Bearer (when signed in) links the new card to the account; omitted → anonymous walk-in.
export async function enroll(
  input: { merchantId: string; programId: string; name?: string },
  token?: string | null,
): Promise<EnrollResult> {
  const res = await post("/enroll", input, token ? { authorization: `Bearer ${token}` } : {});
  // Rate-limited per connection: on a busy café's Wi-Fi this is the shop's network, not this person.
  if (res.status === 429) {
    throw new ApiError("server", 429, "enroll rate-limited", "Lots of sign-ups from this connection just now — please try again in a minute.");
  }
  if (res.status === 409) {
    // The shop turned this card off between the preview and the tap: like a code that isn't active.
    const body = (await res.json().catch(() => null)) as { code?: string } | null;
    if (body?.code === "card_frozen") throw new ApiError("not_found", 409, "card frozen");
  }
  if (!res.ok) throw new ApiError(kindOf(res.status), res.status, `Enroll failed (${res.status})`);
  return res.json();
}

export function getCard(serial: string): Promise<CardView> {
  return getJson(`/card/${encodeURIComponent(serial)}`);
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
  const res = await post("/auth/social", { provider: "google", idToken, device });
  if (res.status === 400 || res.status === 401) {
    throw new ApiError("server", res.status, "sign-in refused", "Sign-in didn't go through — please try again.");
  }
  if (!res.ok) throw new ApiError("server", res.status, `Sign-in failed (${res.status})`);
  return res.json();
}

/**
 * Swap the refresh token for a new session. Null means the server REFUSED it (400/401 — invalid,
 * expired or revoked), and only that signs the customer out. Anything else throws: a 502 during a
 * deploy, or no signal, must not cost someone their session.
 */
export async function refreshAuth(refreshToken: string): Promise<AuthTokens | null> {
  const res = await post("/auth/refresh", { refreshToken });
  if (res.status === 400 || res.status === 401) return null;
  if (!res.ok) throw new ApiError("server", res.status, `Refresh failed (${res.status})`);
  return res.json();
}

export async function logoutAuth(refreshToken: string): Promise<void> {
  await fetch(`${BASE}/auth/logout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => {});
}

export function getMyCards(token: string): Promise<MyCard[]> {
  return getJson("/me/cards", { authorization: `Bearer ${token}` });
}

// Fold an anonymous card into the account. Returns true when the serial is DONE and safe to drop from
// the device: claimed, or refused for good (409 — gone or someone else's; 400 — can never be valid).
// Anything else keeps it, to try again at the next sign-in — never losing a card. That includes a 404
// (this route never answers one, so it means a misrouted deploy) and a 200 that isn't the card list
// (a fallback page). Also kept: a card the account can't take because it has its own at that shop.
export async function claimCard(token: string, serial: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/me/claim`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ serial }),
    });
    if (res.ok) return Array.isArray(await res.json().catch(() => null));
    if (res.status === 409) {
      const body = (await res.json().catch(() => null)) as { code?: string } | null;
      return body?.code !== "has_own_card";
    }
    return res.status === 400;
  } catch {
    return false; // network error → keep and retry
  }
}
