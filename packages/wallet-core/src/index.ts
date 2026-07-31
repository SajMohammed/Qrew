import type { WalletProvider } from "./types";
import { FakeWalletProvider } from "./fake-provider";
import { PassKitProvider } from "./passkit-provider";
import { GoogleWalletProvider } from "./google/provider";

export * from "./types";
export { renderStampStrip, encodePng, stripUrlFor, STRIP_WIDTH, STRIP_HEIGHT } from "./strip";
export { decodePng, loadIcon, type DecodedImage } from "./png-decode";
export { FakeWalletProvider } from "./fake-provider";
export { PassKitProvider } from "./passkit-provider";
export { GoogleWalletProvider } from "./google/provider";
export { signJwtRs256, serviceAccountFromEnv, ServiceAccountTokens } from "./google/auth";

let cached: WalletProvider | null = null;

/**
 * Resolve the wallet provider from config. Defaults to the in-memory fake so local dev,
 * CI, and tests run without vendor credentials. Set WALLET_PROVIDER=google once the issuer
 * account and service-account key exist (see .env.example).
 *
 * Memoised on purpose. Providers hold caches that only pay off when reused — the Google adapter
 * keeps its access token and its "this class already exists" set — and this is called from the card
 * read, which a customer's open card polls every few seconds. A fresh instance per call would turn
 * each poll into a token exchange and a class lookup against Google.
 */
export function getWalletProvider(): WalletProvider {
  if (cached) return cached;
  if (process.env.WALLET_PROVIDER === "google") cached = new GoogleWalletProvider();
  else if (process.env.WALLET_PROVIDER === "passkit") cached = new PassKitProvider();
  else cached = new FakeWalletProvider();
  return cached;
}

/** Drop the memoised provider — for tests that switch WALLET_PROVIDER between cases. */
export function resetWalletProvider(): void {
  cached = null;
}
