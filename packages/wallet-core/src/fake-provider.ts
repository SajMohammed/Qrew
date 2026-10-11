import type { WalletProvider, PassContent, PassMessage, PassRef, PassSyncOutcome, PassUpdate } from "./types";

interface FakePass {
  content: PassContent;
  currentStamps: number;
  lastUpdate?: PassUpdate;
  messages: PassMessage[];
}

/**
 * In-memory wallet provider for local dev, CI, and tests. Lets the whole enrollment →
 * stamp → redeem loop be built and exercised end-to-end without vendor credentials.
 * The default provider unless WALLET_PROVIDER=passkit.
 */
export class FakeWalletProvider implements WalletProvider {
  private readonly passes = new Map<string, FakePass>();
  private readonly templates = new Map<string, PassContent>();

  /** A recognisably fake link, so dev can exercise the button without Google credentials. */
  async getSaveUrl(content: PassContent): Promise<string | null> {
    return `https://example.invalid/fake-wallet/${encodeURIComponent(content.serial)}`;
  }

  async syncTemplate(content: PassContent): Promise<void> {
    this.templates.set(content.programId, content);
  }

  async issuePass(content: PassContent): Promise<PassRef> {
    if (!this.passes.has(content.serial)) {
      this.passes.set(content.serial, { content, currentStamps: content.currentStamps, messages: [] });
    }
    return {
      serial: content.serial,
      applePassId: `apple_${content.serial}`,
      googleObjectId: `google_${content.serial}`,
    };
  }

  async updateStamps(ref: PassRef, update: PassUpdate): Promise<PassSyncOutcome> {
    const pass = this.passes.get(ref.serial);
    if (!pass) return "absent";
    pass.currentStamps = update.currentStamps;
    pass.lastUpdate = update;
    return "in_wallet"; // the fake pretends every pass it holds was saved
  }

  async pushUpdate(ref: PassRef, message: PassMessage): Promise<void> {
    this.passes.get(ref.serial)?.messages.push(message);
  }

  async revoke(ref: PassRef): Promise<void> {
    this.passes.delete(ref.serial);
  }

  // --- test-only introspection ---
  peek(serial: string): FakePass | undefined {
    return this.passes.get(serial);
  }
  lastMessage(serial: string): string | undefined {
    return this.passes.get(serial)?.messages.at(-1)?.body;
  }
  messages(serial: string): PassMessage[] {
    return this.passes.get(serial)?.messages ?? [];
  }
  template(programId: string): PassContent | undefined {
    return this.templates.get(programId);
  }
}
