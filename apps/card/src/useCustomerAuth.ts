import { useCallback, useEffect, useRef, useState } from "react";
import { socialAuth, refreshAuth, logoutAuth, failureKind, ApiError, type AuthTokens, type FailureKind } from "./api";

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
  /**
   * The access token to send now — refreshed first if it has lapsed. Null when signed out. Throws when
   * signed in but the session can't be refreshed: sending a lapsed token would be read as no sign-in.
   */
  freshToken: () => Promise<string | null>;
  signInDev: (email: string) => Promise<void>;
  signInGoogle: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export function useCustomerAuth(): CustomerAuth {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<FailureKind | null>(null);
  const failureRef = useRef<FailureKind | null>(null);
  const failures = useRef(0);
  const inFlight = useRef<Promise<boolean> | null>(null);
  // Bumped whenever the session changes (sign-in, sign-out, a new token): a refresh that was already
  // on its way when that happened must not act on its answer.
  const epoch = useRef(0);
  const tokenRef = useRef<string | null>(null);
  const expiresAt = useRef(0);
  const refreshRef = useRef<string | null>(localStorage.getItem(REFRESH_KEY));
  const timer = useRef<number | undefined>(undefined);
  const restoreRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
  const lastRefresh = useRef(0);

  const fail = useCallback((kind: FailureKind | null) => {
    failureRef.current = kind;
    setFailure(kind);
  }, []);

  const apply = useCallback((t: AuthTokens) => {
    epoch.current++;
    tokenRef.current = t.accessToken;
    expiresAt.current = Date.now() + t.expiresInMs;
    setToken(t.accessToken);
    fail(null);
    failures.current = 0;
    refreshRef.current = t.refreshToken;
    lastRefresh.current = Date.now();
    localStorage.setItem(REFRESH_KEY, t.refreshToken);
    window.clearTimeout(timer.current);
    // refresh a minute before the access token expires so requests never hit a 401
    timer.current = window.setTimeout(() => void restoreRef.current(), Math.max(10_000, t.expiresInMs - 60_000));
  }, [fail]);

  /**
   * Signed out on this device. `refused`: the refresh token the server just turned down — the stored
   * one is dropped only if it is still that one, since another tab may have replaced it with a newer,
   * live session.
   */
  const clear = useCallback(
    (refused?: string) => {
      epoch.current++;
      tokenRef.current = null;
      setToken(null);
      fail(null);
      refreshRef.current = null;
      if (refused === undefined || localStorage.getItem(REFRESH_KEY) === refused) localStorage.removeItem(REFRESH_KEY);
      window.clearTimeout(timer.current);
    },
    [fail],
  );

  const restore = useCallback((): Promise<boolean> => {
    /*
     * One at a time. The refresh token rotates on use, so a second refresh racing the first would
     * present a spent token — which the server rightly refuses, and that would sign the person out.
     */
    inFlight.current ??= (async () => {
      const started = epoch.current;
      // Twice at most: once more if another tab rotated the token while this one was asking.
      for (let attempt = 0; attempt < 2; attempt++) {
        // From storage, not memory: every tab shares one refresh token, and it rotates on each use.
        const rt = localStorage.getItem(REFRESH_KEY);
        if (!rt) {
          refreshRef.current = null;
          fail(null);
          return false;
        }
        let t: AuthTokens | null;
        try {
          t = await refreshAuth(rt);
        } catch (e) {
          if (epoch.current !== started) return false; // signed in or out meanwhile — moot
          // No answer, or Qrew is having a moment — keep the session, and try again soon.
          fail(failureKind(e));
          // A lapsed access token is no use either: drop it, so nothing is sent as if signed out.
          if (Date.now() >= expiresAt.current) {
            tokenRef.current = null;
            setToken(null);
          }
          const wait = Math.min(RETRY_MAX_MS, RETRY_FIRST_MS * 2 ** failures.current++);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => void restoreRef.current(), wait);
          return false;
        }
        if (epoch.current !== started) return false;
        if (t) {
          apply(t);
          return true;
        }
        // Refused. If another tab rotated the token meanwhile, the newer one is the session — use it.
        if (localStorage.getItem(REFRESH_KEY) !== rt) continue;
        clear(rt); // the server rejected the refresh token (invalid/expired/revoked) — log out
        return false;
      }
      return false;
    })().finally(() => {
      inFlight.current = null;
    });
    return inFlight.current;
  }, [apply, clear, fail]);

  useEffect(() => {
    restoreRef.current = restore;
  }, [restore]);

  // Another tab rotated the refresh token (ours is spent now) or signed out (so are we).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== REFRESH_KEY) return;
      if (e.newValue) {
        refreshRef.current = e.newValue;
        return;
      }
      epoch.current++;
      tokenRef.current = null;
      refreshRef.current = null;
      setToken(null);
      fail(null);
      window.clearTimeout(timer.current);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [fail]);

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

  const freshToken = useCallback(async (): Promise<string | null> => {
    if (tokenRef.current && Date.now() < expiresAt.current - 10_000) return tokenRef.current;
    if (!localStorage.getItem(REFRESH_KEY)) return null; // signed out
    if (await restoreRef.current()) return tokenRef.current;
    if (!localStorage.getItem(REFRESH_KEY)) return null; // the server signed them out just now
    throw new ApiError(failureRef.current ?? "server", null, "session not refreshed");
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
    epoch.current++; // a refresh already on its way must not sign them back in
    const rt = localStorage.getItem(REFRESH_KEY);
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
    freshToken,
    signInDev,
    signInGoogle,
    signOut,
  };
}
