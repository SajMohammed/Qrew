import type { WalletProvider } from "./types";
import { FakeWalletProvider } from "./fake-provider";
import { PassKitProvider } from "./passkit-provider";
import { GoogleWalletProvider } from "./google/provider";

export * from "./types";
export { FakeWalletProvider } from "./fake-provider";
export { PassKitProvider } from "./passkit-provider";
export { GoogleWalletProvider } from "./google/provider";
export { signJwtRs256, serviceAccountFromEnv, ServiceAccountTokens } from "./google/auth";

/**
 * Resolve the wallet provider from config. Defaults to the in-memory fake so local dev,
 * CI, and tests run without vendor credentials. Set WALLET_PROVIDER=google once the issuer
 * account and service-account key exist (see .env.example).
 */
export function getWalletProvider(): WalletProvider {
  if (process.env.WALLET_PROVIDER === "google") return new GoogleWalletProvider();
  if (process.env.WALLET_PROVIDER === "passkit") return new PassKitProvider();
  return new FakeWalletProvider();
}
