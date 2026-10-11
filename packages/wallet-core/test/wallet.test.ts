import { describe, it, expect } from "vitest";
import { FakeWalletProvider, getWalletProvider } from "../src/index";
import type { PassContent } from "../src/index";

const content: PassContent = {
  serial: "card-1",
  programId: "program-1",
  merchantName: "Nadia's Coffee",
  programName: "Coffee Card",
  rewardText: "1 free coffee",
  currentStamps: 2,
  stampsRequired: 10,
  qrToken: "tok-abc",
  locale: "en",
};

const update = { serial: "card-1", currentStamps: 5, stampsRequired: 10 };

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
    await expect(provider.updateStamps(ref, update)).resolves.toBe("in_wallet");
    expect(provider.peek("card-1")?.currentStamps).toBe(5);
  });

  it("reports a pass that doesn't exist as absent, so the caller can create it", async () => {
    const provider = new FakeWalletProvider();
    await expect(provider.updateStamps({ serial: "nobody" }, { ...update, serial: "nobody" })).resolves.toBe("absent");
  });

  it("records a lock-screen notification", async () => {
    const provider = new FakeWalletProvider();
    const ref = await provider.issuePass(content);
    await provider.pushUpdate(ref, { id: "m1", header: "Nadia's Coffee", body: "Your reward is ready" });
    expect(provider.messages("card-1")).toHaveLength(1);
    expect(provider.lastMessage("card-1")).toBe("Your reward is ready");
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
