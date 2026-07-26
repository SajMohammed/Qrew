import { useAuth } from "@clerk/react";
import { useCallback, useMemo } from "react";
import type { ScanResult } from "./api";

const BASE = import.meta.env.VITE_API_BASE ?? "/api";

export interface VerifiedCashier {
  staffToken: string;
  name: string;
  role: string;
}

// The scanner device holds the merchant's Clerk session; the token identifies the merchant.
// A cashier's PIN is exchanged for a short-lived staff token that attributes their scans.
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
      async scan(serial: string, staffToken?: string): Promise<ScanResult> {
        const idempotencyKey = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const res = await call("/loyalty/scan", {
          method: "POST",
          body: JSON.stringify({ serial, idempotencyKey, staffToken }),
        });
        if (res.status === 404) return { found: false };
        if (!res.ok) throw new Error(`Scan failed (${res.status})`);
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
