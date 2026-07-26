import { useAuth } from "@clerk/react";
import { useCallback, useMemo } from "react";
import type { Dashboard, Program, ProgramPatch } from "./api";

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
    }),
    [call],
  );
}

export type Api = ReturnType<typeof useApi>;
