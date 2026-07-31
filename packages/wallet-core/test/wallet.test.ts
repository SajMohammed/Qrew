import { describe, it, expect } from "vitest";
import { FakeWalletProvider, getWalletProvider } from "../src/index";
import type { PassContent } from "../src/index";

const content: PassContent = {
  serial: "card-1",
  merchantName: "Nadia's Coffee",
  programName: "Coffee Card",
  rewardText: "1 free coffee",
  currentStamps: 2,
  stampsRequired: 10,
  qrToken: "tok-abc",
  locale: "en",
};

describe("WalletProvider contract (fake adapter)", () => {
  it("issues a pass and returns both platform ids", async () => {
    const provider = new FakeWalletProvider();
    const ref = await provider.issuePass(content);
    expect(ref.serial).toBe("card-1");
    expect(ref.applePassId).toBeTruthy();
    expect(ref.googleObjectId).toBeTruthy();
  });

  it("updates the stamp count on an existing pass", async () => {
    const provider = new FakeWalletProvider();
    const ref = await provider.issuePass(content);
    await provider.updateStamps(ref, { currentStamps: 5 });
    expect(provider.peek("card-1")?.currentStamps).toBe(5);
  });

  it("records a lock-screen push message", async () => {
    const provider = new FakeWalletProvider();
    const ref = await provider.issuePass(content);
    await provider.pushUpdate(ref, "1 stamp to go");
    expect(provider.lastMessage("card-1")).toBe("1 stamp to go");
  });

  it("revokes a pass", async () => {
    const provider = new FakeWalletProvider();
    const ref = await provider.issuePass(content);
    await provider.revoke(ref);
    expect(provider.peek("card-1")).toBeUndefined();
  });

  it("defaults to the fake provider when WALLET_PROVIDER is unset", () => {
    expect(getWalletProvider()).toBeInstanceOf(FakeWalletProvider);
  });
});
