import { useAuth } from "@clerk/react";
import { useCallback, useMemo } from "react";
import type {
  Dashboard,
  Program,
  ProgramPatch,
  ScanResult,
  RedeemResult,
  StampOutcome,
  VerifiedCashier,
  Analytics,
  AnalyticsRange,
  CustomerList,
  CustomersParams,
  StaffMember,
  CardType,
} from "./api";

/**
 * Prefer the server's own explanation over a bare status code. Validation failures carry a field
 * message ("PIN must be 4-6 digits") that is far more use to the reader than "(400)".
 */
async function describe(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { issues?: { message: string }[]; message?: string };
    const issue = body.issues?.[0]?.message;
    if (issue) return issue;
    if (typeof body.message === "string" && body.message) return body.message;
  } catch {
    /* not JSON — fall through to the generic message */
  }
  return `${fallback} (${res.status})`;
}

const BASE = import.meta.env.VITE_API_BASE ?? "/api";

/** The signed-in user has no merchant yet — the guard answered 409 needs_onboarding. */
export class NeedsOnboarding extends Error {
  constructor() {
    super("Setting up your shop…"); // a non-empty message so a retry-lag doesn't blank the overview
    this.name = "NeedsOnboarding";
  }
}

/**
 * Signed in, but this staff member's role can't read the management screens — the API restricts
 * analytics and the customer book to owners and managers. Distinct from a generic failure so the
 * UI can say so plainly instead of showing a broken dashboard.
 */
export class Forbidden extends Error {
  constructor() {
    super("Your account doesn't have access to this shop's management screens.");
    this.name = "Forbidden";
  }
}

/** Too many wrong PINs on this shop: PIN entry is paused. The message says for how long. */
export class PinLocked extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PinLocked";
  }
}

/** Why a counter action failed — each calls for something different from the person at the till. */
export type CounterFailure = "offline" | "server" | "signed_out" | "cashier_expired" | "rejected";

const COUNTER_COPY: Record<Exclude<CounterFailure, "rejected">, string> = {
  offline: "Can't reach Qrew — check the internet connection, then scan again.",
  server: "Something went wrong on our side. Scan again in a moment.",
  signed_out: "This device has been signed out. Ask the owner to sign in again.",
  cashier_expired: "The cashier sign-in has expired. Enter the PIN again.",
};

export class CounterError extends Error {
  constructor(
    readonly kind: CounterFailure,
    message: string = kind === "rejected" ? "That didn't work." : COUNTER_COPY[kind],
  ) {
    super(message);
    this.name = "CounterError";
  }
}

/**
 * Sort a refused counter request. A 401 is either the device's own sign-in (nothing the cashier can
 * fix) or the cashier's shift token — which the server marks, so the counter can drop the cashier
 * and carry on rather than stall every scan.
 */
async function counterFailure(res: Response, fallback: string): Promise<CounterError> {
  if (res.status >= 500) return new CounterError("server");
  if (res.status === 401) {
    const body = (await res.json().catch(() => null)) as { code?: string } | null;
    return new CounterError(body?.code === "staff_token_invalid" ? "cashier_expired" : "signed_out");
  }
  return new CounterError("rejected", await describe(res, fallback));
}

/** How long a counter request may take. Retrying is safe — it reuses the same idempotency key. */
const COUNTER_TIMEOUT_MS = 8_000;

/** A counter answer's body. Cut off on the way (a dropped connection, the deadline) counts as no answer. */
async function counterJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new CounterError("offline");
  }
}

// Threads the Clerk session token onto every API call (the api.ts functions are plain modules and
// can't call the useAuth hook themselves). The server derives the merchant from the token — no
// more x-merchant-id.
export function useApi() {
  const { getToken } = useAuth();

  const call = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      const token = await getToken();
      const headers = new Headers(init.headers);
      if (token) headers.set("authorization", `Bearer ${token}`);
      if (init.body) headers.set("content-type", "application/json");
      return fetch(`${BASE}${path}`, { ...init, headers });
    },
    [getToken],
  );

  /**
   * A counter POST. No answer at all — offline, the sign-in couldn't refresh, or nothing back within
   * the deadline — is "offline". A request held open by a half-dead Wi-Fi would otherwise freeze the
   * counter for minutes with no sign of why.
   */
  const counterPost = useCallback(
    async (path: string, body: unknown): Promise<Response> => {
      const ctrl = new AbortController();
      // Never cleared: aborting a finished request does nothing, and reading its answer stays under
      // the same deadline.
      window.setTimeout(() => ctrl.abort(), COUNTER_TIMEOUT_MS);
      try {
        return await call(path, { method: "POST", body: JSON.stringify(body), signal: ctrl.signal });
      } catch {
        throw new CounterError("offline");
      }
    },
    [call],
  );

  return useMemo(
    () => ({
      async getDashboard(): Promise<Dashboard> {
        const res = await call("/dashboard");
        if (res.status === 409) throw new NeedsOnboarding();
        if (!res.ok) throw new Error(`Dashboard failed (${res.status})`);
        return res.json();
      },
      async onboard(businessName: string): Promise<void> {
        const res = await call("/onboarding", { method: "POST", body: JSON.stringify({ businessName }) });
        if (!res.ok) throw new Error(await describe(res, "Could not create your shop"));
      },
      async renameShop(name: string): Promise<{ merchantId: string; name: string }> {
        const res = await call("/merchant", { method: "PATCH", body: JSON.stringify({ name }) });
        if (res.status === 403) throw new Error("Only the shop's owner can rename it.");
        if (!res.ok) throw new Error(await describe(res, "Could not rename the shop"));
        return res.json();
      },
      // ── Owner console ──
      async getAnalytics(range: AnalyticsRange): Promise<Analytics> {
        const res = await call(`/analytics?range=${range}`);
        if (res.status === 409) throw new NeedsOnboarding();
        if (res.status === 403) throw new Forbidden();
        if (!res.ok) throw new Error(`Analytics failed (${res.status})`);
        return res.json();
      },
      async getCustomers(params: CustomersParams = {}): Promise<CustomerList> {
        const qs = new URLSearchParams();
        if (params.filter && params.filter !== "all") qs.set("filter", params.filter);
        if (params.search) qs.set("search", params.search);
        if (params.limit !== undefined) qs.set("limit", String(params.limit));
        if (params.offset) qs.set("offset", String(params.offset));
        const res = await call(`/customers${qs.size ? `?${qs}` : ""}`);
        if (res.status === 409) throw new NeedsOnboarding();
        if (res.status === 403) throw new Forbidden();
        if (!res.ok) throw new Error(`Customers failed (${res.status})`);
        return res.json();
      },
      /** The card types this deployment can issue — the picker must not offer any others. */
      async getCardTypes(): Promise<
        {
          type: CardType;
          label: string;
          blurb: string;
          accrues: boolean;
          defaultTarget: number;
          drawsStampStrip: boolean;
          issuable: boolean;
        }[]
      > {
        const res = await call("/program/types");
        if (!res.ok) throw new Error(`Card types failed (${res.status})`);
        return res.json();
      },
      async getProgram(): Promise<Program> {
        const res = await call("/program");
        if (!res.ok) throw new Error(`Program failed (${res.status})`);
        return res.json();
      },
      async updateProgram(id: string, patch: ProgramPatch): Promise<Program> {
        const res = await call(`/program/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
        // The domain refuses a type change on a programme customers already hold passes for, and
        // says why. Surfacing its message beats "Save failed (400)".
        if (!res.ok) throw new Error(await describe(res, "Save failed"));
        return res.json();
      },

      /**
       * Upload a design image and get back the public URL a wallet can fetch.
       *
       * The file goes as the raw body — the API takes one file per request, so multipart would be
       * ceremony. Content-type is set explicitly because `call` assumes JSON for anything with one.
       */
      async uploadAsset(kind: "stamp" | "logo", file: File): Promise<{ url: string; width: number; height: number }> {
        const token = await getToken();
        const headers = new Headers({ "content-type": "image/png" });
        if (token) headers.set("authorization", `Bearer ${token}`);
        const res = await fetch(`${BASE}/asset?kind=${kind}`, { method: "POST", headers, body: file });
        if (!res.ok) throw new Error(await describe(res, "Upload failed"));
        return res.json();
      },

      /**
       * Render an unsaved design, exactly as a wallet will fetch it.
       *
       * Returns an object URL the caller must revoke. Drawing the pass in CSS instead would be a
       * guess at what the wallet does, and the two drifted before — light artwork looked blank in
       * the old preview and correct on the phone.
       */
      async previewStrip(body: {
        cardDesign: unknown;
        stampsRequired: number;
        currentStamps: number;
        platform: "google" | "apple";
      }): Promise<string> {
        const res = await call("/card/strip/preview", { method: "POST", body: JSON.stringify(body) });
        if (!res.ok) throw new Error(await describe(res, "Preview failed"));
        return URL.createObjectURL(await res.blob());
      },
      // ── Counter ──
      // The caller owns each idempotency key: a retry must reuse it, or it could stamp twice.
      async scan(value: string, idempotencyKey: string, staffToken?: string): Promise<ScanResult> {
        const res = await counterPost("/loyalty/scan", { serial: value, idempotencyKey, staffToken });
        if (res.status === 404) return { found: false };
        if (!res.ok) throw await counterFailure(res, "Scan failed");
        return counterJson(res);
      },
      /** A deliberate extra stamp on a card already scanned — a second purchase on the same visit. */
      async stampAgain(enrollmentId: string, idempotencyKey: string, staffToken?: string): Promise<StampOutcome> {
        const res = await counterPost("/loyalty/stamp", { enrollmentId, idempotencyKey, staffToken });
        if (!res.ok) throw await counterFailure(res, "Stamp failed");
        return counterJson(res);
      },
      async redeem(enrollmentId: string, idempotencyKey: string, staffToken?: string): Promise<RedeemResult> {
        const res = await counterPost("/loyalty/redeem", { enrollmentId, idempotencyKey, staffToken });
        if (!res.ok) throw await counterFailure(res, "Redeem failed");
        return counterJson(res);
      },
      async verifyPin(pin: string): Promise<VerifiedCashier> {
        const res = await counterPost("/staff/verify-pin", { pin });
        if (res.status === 429) throw new PinLocked(await describe(res, "Too many wrong PINs. Try again later."));
        if (!res.ok) throw new Error(`PIN failed (${res.status})`);
        return counterJson(res);
      },
      // ── Team ──
      async getStaff(): Promise<StaffMember[]> {
        const res = await call("/staff");
        if (res.status === 403) throw new Forbidden();
        if (!res.ok) throw new Error(`Team failed (${res.status})`);
        return res.json();
      },
      async addStaff(input: { name: string; pin: string; role: string }): Promise<void> {
        const res = await call("/staff", { method: "POST", body: JSON.stringify(input) });
        if (!res.ok) throw new Error(await describe(res, "Could not add them"));
      },
      async resetStaffPin(id: string, pin: string): Promise<void> {
        const res = await call(`/staff/${id}/pin`, { method: "PATCH", body: JSON.stringify({ pin }) });
        if (!res.ok) throw new Error(await describe(res, "Could not change the PIN"));
      },
      async removeStaff(id: string): Promise<void> {
        const res = await call(`/staff/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await describe(res, "Could not remove them"));
      },
    }),
    [call, counterPost],
  );
}

export type Api = ReturnType<typeof useApi>;
