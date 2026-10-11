import { useCallback, useEffect, useRef, useState } from "react";
import { socialAuth, refreshAuth, logoutAuth, failureKind, type AuthTokens, type FailureKind } from "./api";

// Our own consumer session (not Clerk): a short access token kept in memory + a rotating refresh
// token persisted in localStorage. We restore on load and silently refresh before expiry.
const REFRESH_KEY = "qrew.customer.refresh";
/** Waits between tries at a session that couldn't be restored: 5 s, doubling to a minute. */
const RETRY_FIRST_MS = 5_000;
const RETRY_MAX_MS = 60_000;

export interface CustomerAuth {
  ready: boolean; // the initial restore attempt has completed
  signedIn: boolean;
  token: string | null; // access token (Bearer)
  /**
   * Signed in on this device, but the session couldn't be restored — no connection, or Qrew didn't
   * answer. Not the same as signed out: their cards are on their account, not this phone. Retried
   * on its own; `retry` tries now.
   */
  stalled: FailureKind | null;
  retry: () => void;
  signInDev: (email: string) => Promise<void>;
  signInGoogle: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export function useCustomerAuth(): CustomerAuth {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<FailureKind | null>(null);
  const failures = useRef(0);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const refreshRef = useRef<string | null>(localStorage.getItem(REFRESH_KEY));
  const timer = useRef<number | undefined>(undefined);
  const restoreRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
  const lastRefresh = useRef(0);

  const apply = useCallback((t: AuthTokens) => {
    setToken(t.accessToken);
    setFailure(null);
    failures.current = 0;
    refreshRef.current = t.refreshToken;
    lastRefresh.current = Date.now();
    localStorage.setItem(REFRESH_KEY, t.refreshToken);
    window.clearTimeout(timer.current);
    // refresh a minute before the access token expires so requests never hit a 401
    timer.current = window.setTimeout(() => void restoreRef.current(), Math.max(10_000, t.expiresInMs - 60_000));
  }, []);

  const clear = useCallback(() => {
    setToken(null);
    setFailure(null);
    refreshRef.current = null;
    localStorage.removeItem(REFRESH_KEY);
    window.clearTimeout(timer.current);
  }, []);

  const restore = useCallback((): Promise<boolean> => {
    /*
     * One at a time. The refresh token rotates on use, so a second refresh racing the first would
     * present a spent token — which the server rightly refuses, and that would sign the person out.
     */
    inFlight.current ??= (async () => {
      const rt = refreshRef.current;
      if (!rt) return false;
      let t: AuthTokens | null;
      try {
        t = await refreshAuth(rt);
      } catch (e) {
        // No answer, or Qrew is having a moment — keep the session, and try again soon.
        setFailure(failureKind(e));
        const wait = Math.min(RETRY_MAX_MS, RETRY_FIRST_MS * 2 ** failures.current++);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void restoreRef.current(), wait);
        return false;
      }
      if (!t) {
        clear(); // the server rejected the refresh token (invalid/expired/revoked) — log out
        return false;
      }
      apply(t);
      return true;
    })().finally(() => {
      inFlight.current = null;
    });
    return inFlight.current;
  }, [apply, clear]);

  useEffect(() => {
    restoreRef.current = restore;
  }, [restore]);

  useEffect(() => {
    void restore().finally(() => setReady(true));
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh on resume: background/PWA timers get throttled, so the scheduled refresh may fire late or
  // not at all. Throttled to 5 min so a routine tab-focus doesn't rotate the token needlessly.
  useEffect(() => {
    const onVisible = () => {
      if (
        document.visibilityState === "visible" &&
        refreshRef.current &&
        Date.now() - lastRefresh.current > 5 * 60 * 1000
      ) {
        void restoreRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Back online with a session still to restore: don't wait for the backoff.
  useEffect(() => {
    if (!failure) return;
    const onOnline = () => void restoreRef.current();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [failure]);

  const retry = useCallback(() => void restoreRef.current(), []);

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

  return {
    ready,
    signedIn: Boolean(token),
    token,
    // Only while there's no session to use: a refresh that fails mid-session leaves the current
    // access token working until it lapses, and the retry usually lands before then.
    stalled: token ? null : failure,
    retry,
    signInDev,
    signInGoogle,
    signOut,
  };
}
