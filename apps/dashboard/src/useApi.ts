import { useAuth } from "@clerk/react";
import { useCallback, useMemo } from "react";
import type { Dashboard, Program, ProgramPatch, ScanResult, RedeemResult, VerifiedCashier } from "./api";

const rnd = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const BASE = import.meta.env.VITE_API_BASE ?? "/api";

/** The signed-in user has no merchant yet — the guard answered 409 needs_onboarding. */
export class NeedsOnboarding extends Error {}

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
    }),
    [call],
  );
}

export type Api = ReturnType<typeof useApi>;
