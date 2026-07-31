import { useAuth } from "@clerk/react";
import { useCallback, useMemo } from "react";
import type {
  Dashboard,
  Program,
  ProgramPatch,
  ScanResult,
  RedeemResult,
  VerifiedCashier,
  Analytics,
  AnalyticsRange,
  CustomerList,
  CustomersParams,
  StaffMember,
} from "./api";

const rnd = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

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

  return useMemo(
    () => ({
      async getDashboard(): Promise<Dashboard> {
        const res = await call("/dashboard");
        if (res.status === 409) throw new NeedsOnboarding();
        if (!res.ok) throw new Error(`Dashboard failed (${res.status})`);
        return res.json();
      },
      async onboard(businessName?: string): Promise<void> {
        const res = await call("/onboarding", {
          method: "POST",
          body: JSON.stringify(businessName ? { businessName } : {}),
        });
        if (!res.ok) throw new Error(`Onboarding failed (${res.status})`);
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
      async getProgram(): Promise<Program> {
        const res = await call("/program");
        if (!res.ok) throw new Error(`Program failed (${res.status})`);
        return res.json();
      },
      async updateProgram(id: string, patch: ProgramPatch): Promise<Program> {
        const res = await call(`/program/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
        return res.json();
      },
      // ── Scan tab ──
      async scan(serial: string, staffToken?: string): Promise<ScanResult> {
        const res = await call("/loyalty/scan", {
          method: "POST",
          body: JSON.stringify({ serial, idempotencyKey: `scan-${rnd()}`, staffToken }),
        });
        if (res.status === 404) return { found: false };
        if (!res.ok) throw new Error(`Scan failed (${res.status})`);
        return res.json();
      },
      async redeem(enrollmentId: string, staffToken?: string): Promise<RedeemResult> {
        const res = await call("/loyalty/redeem", {
          method: "POST",
          body: JSON.stringify({ enrollmentId, idempotencyKey: `redeem-${rnd()}`, staffToken }),
        });
        if (!res.ok) throw new Error(`Redeem failed (${res.status})`);
        return res.json();
      },
      async verifyPin(pin: string): Promise<VerifiedCashier> {
        const res = await call("/staff/verify-pin", { method: "POST", body: JSON.stringify({ pin }) });
        if (!res.ok) throw new Error(`PIN failed (${res.status})`);
        return res.json();
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
    [call],
  );
}

export type Api = ReturnType<typeof useApi>;
