import type { WalletProvider, PassContent, PassRef } from "./types";

interface FakePass {
  content: PassContent;
  currentStamps: number;
  lastMessage?: string;
}

/**
 * In-memory wallet provider for local dev, CI, and tests. Lets the whole enrollment →
 * stamp → redeem loop be built and exercised end-to-end without vendor credentials.
 * The default provider unless WALLET_PROVIDER=passkit.
 */
export class FakeWalletProvider implements WalletProvider {
  private readonly passes = new Map<string, FakePass>();

  async issuePass(content: PassContent): Promise<PassRef> {
    this.passes.set(content.serial, { content, currentStamps: content.currentStamps });
    return {
      serial: content.serial,
      applePassId: `apple_${content.serial}`,
      googleObjectId: `google_${content.serial}`,
    };
  }

  async updateStamps(ref: PassRef, currentStamps: number): Promise<void> {
    const pass = this.passes.get(ref.serial);
    if (pass) pass.currentStamps = currentStamps;
  }

  async pushUpdate(ref: PassRef, message: string): Promise<void> {
    const pass = this.passes.get(ref.serial);
    if (pass) pass.lastMessage = message;
  }

  async revoke(ref: PassRef): Promise<void> {
    this.passes.delete(ref.serial);
  }

  // --- test-only introspection ---
  peek(serial: string): FakePass | undefined {
    return this.passes.get(serial);
  }
  lastMessage(serial: string): string | undefined {
    return this.passes.get(serial)?.lastMessage;
  }
}
