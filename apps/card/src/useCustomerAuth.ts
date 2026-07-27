import { useCallback, useEffect, useRef, useState } from "react";
import { socialAuth, refreshAuth, logoutAuth, type AuthTokens } from "./api";

// Our own consumer session (not Clerk): a short access token kept in memory + a rotating refresh
// token persisted in localStorage. We restore on load and silently refresh before expiry.
const REFRESH_KEY = "qrew.customer.refresh";

export interface CustomerAuth {
  ready: boolean; // the initial restore attempt has completed
  signedIn: boolean;
  token: string | null; // access token (Bearer)
  signInDev: (email: string) => Promise<void>;
  signInGoogle: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export function useCustomerAuth(): CustomerAuth {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const refreshRef = useRef<string | null>(localStorage.getItem(REFRESH_KEY));
  const timer = useRef<number | undefined>(undefined);
  const restoreRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));

  const apply = useCallback((t: AuthTokens) => {
    setToken(t.accessToken);
    refreshRef.current = t.refreshToken;
    localStorage.setItem(REFRESH_KEY, t.refreshToken);
    window.clearTimeout(timer.current);
    // refresh a minute before the access token expires so requests never hit a 401
    timer.current = window.setTimeout(() => void restoreRef.current(), Math.max(10_000, t.expiresInMs - 60_000));
  }, []);

  const clear = useCallback(() => {
    setToken(null);
    refreshRef.current = null;
    localStorage.removeItem(REFRESH_KEY);
    window.clearTimeout(timer.current);
  }, []);

  const restore = useCallback(async (): Promise<boolean> => {
    const rt = refreshRef.current;
    if (!rt) return false;
    const t = await refreshAuth(rt);
    if (!t) {
      clear();
      return false;
    }
    apply(t);
    return true;
  }, [apply, clear]);

  useEffect(() => {
    restoreRef.current = restore;
  }, [restore]);

  useEffect(() => {
    void restore().finally(() => setReady(true));
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (idToken: string) => apply(await socialAuth(idToken, navigator.userAgent.slice(0, 80))),
    [apply],
  );

  const signInDev = useCallback(
    async (email: string) => {
      const sub = email.replace(/[^a-z0-9]/gi, "").toLowerCase() || "dev";
      await login(`dev.${sub}.${email}`); // the API's dev bypass accepts dev.<sub>.<email>
    },
    [login],
  );

  const signInGoogle = useCallback((idToken: string) => login(idToken), [login]);

  const signOut = useCallback(async () => {
    const rt = refreshRef.current;
    if (rt) await logoutAuth(rt);
    clear();
  }, [clear]);

  return { ready, signedIn: Boolean(token), token, signInDev, signInGoogle, signOut };
}
