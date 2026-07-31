import { createSign } from "node:crypto";

/**
 * Google service-account auth, hand-rolled.
 *
 * This is the JWT-bearer grant: sign an assertion with the service account's private key, trade it
 * at Google's token endpoint for an access token. It's ~50 lines and no dependency, which matches
 * how the rest of Qrew mints tokens — and it keeps a Google SDK (and its transitive tree) out of
 * the API image for what is fundamentally one signed POST.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";
/** Refresh a minute early so an in-flight request never races the expiry. */
const EXPIRY_SKEW_MS = 60_000;

export interface ServiceAccount {
  clientEmail: string;
  privateKey: string;
}

/** base64url without padding — what JWT requires. */
export function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

/** Sign a JWT with the service account key (RS256). Also used for the save-to-wallet link. */
export function signJwtRs256(payload: Record<string, unknown>, sa: ServiceAccount): string {
  const header = { alg: "RS256", typ: "JWT" };
  const body = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(body);
  signer.end();
  return `${body}.${signer.sign(sa.privateKey, "base64url")}`;
}

/**
 * Access tokens for the Wallet Objects API, cached until they are nearly expired.
 * One instance per provider, so a burst of stamp syncs shares a single token.
 */
export class ServiceAccountTokens {
  private token: string | null = null;
  private expiresAt = 0;
  private inFlight: Promise<string> | null = null;

  constructor(private readonly sa: ServiceAccount) {}

  async get(): Promise<string> {
    if (this.token && Date.now() < this.expiresAt - EXPIRY_SKEW_MS) return this.token;
    // Collapse concurrent misses onto one request rather than stampeding the token endpoint.
    this.inFlight ??= this.fetchToken().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async fetchToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const assertion = signJwtRs256(
      {
        iss: this.sa.clientEmail,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
      },
      this.sa,
    );

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // The message names the likely cause: this fails almost exclusively on a malformed key or a
      // service account that was never granted access to the issuer.
      throw new Error(
        `Google token exchange failed (${res.status}). Check GOOGLE_WALLET_SA_EMAIL / ` +
          `GOOGLE_WALLET_SA_PRIVATE_KEY and that the service account has access to the issuer. ${detail.slice(0, 200)}`,
      );
    }

    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = body.access_token;
    this.expiresAt = Date.now() + body.expires_in * 1000;
    return this.token;
  }
}

/**
 * Read the service account from env.
 *
 * The private key is a PEM with real newlines, which no .env file survives — so the conventional
 * "\n" escaping is accepted and unescaped here rather than making every deploy target handle it.
 */
export function serviceAccountFromEnv(): ServiceAccount {
  const clientEmail = process.env.GOOGLE_WALLET_SA_EMAIL;
  const rawKey = process.env.GOOGLE_WALLET_SA_PRIVATE_KEY;
  if (!clientEmail || !rawKey) {
    throw new Error(
      "GOOGLE_WALLET_SA_EMAIL and GOOGLE_WALLET_SA_PRIVATE_KEY are required for the Google wallet provider",
    );
  }
  return { clientEmail, privateKey: rawKey.replace(/\\n/g, "\n") };
}
