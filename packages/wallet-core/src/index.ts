import type { WalletProvider } from "./types";
import { FakeWalletProvider } from "./fake-provider";
import { PassKitProvider } from "./passkit-provider";

export * from "./types";
export { FakeWalletProvider } from "./fake-provider";
export { PassKitProvider } from "./passkit-provider";

/**
 * Resolve the wallet provider from config. Defaults to the in-memory fake so local dev,
 * CI, and tests run without vendor credentials. Set WALLET_PROVIDER=passkit in deployed envs.
 */
export function getWalletProvider(): WalletProvider {
  if (process.env.WALLET_PROVIDER === "passkit") return new PassKitProvider();
  return new FakeWalletProvider();
}
