import { describe, it, expect, afterEach } from "vitest";
import { mintCardToken, verifyCardToken, assertTokenSecretsConfigured } from "../src/token";

describe("card tokens", () => {
  it("mints and verifies a token back to its serial", () => {
    const token = mintCardToken("card-abc-123");
    expect(verifyCardToken(token)).toBe("card-abc-123");
  });

  it("rejects a tampered signature", () => {
    const [payload] = mintCardToken("card-abc-123").split(".");
    expect(verifyCardToken(`${payload}.invalidsignature`)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = mintCardToken("card-abc-123", -1000); // already expired
    expect(verifyCardToken(token)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifyCardToken("not-a-token")).toBeNull();
    expect(verifyCardToken("a.b.c")).toBeNull();
    expect(verifyCardToken("")).toBeNull();
  });
});

describe("assertTokenSecretsConfigured (fail-closed)", () => {
  const KEYS = ["CARD_TOKEN_SECRET", "STAFF_TOKEN_SECRET", "CUSTOMER_TOKEN_SECRET"] as const;
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("passes when every secret is set to a non-default value", () => {
    for (const k of KEYS) process.env[k] = `strong-${k}`;
    expect(() => assertTokenSecretsConfigured()).not.toThrow();
  });

  it("throws when a secret is unset", () => {
    for (const k of KEYS) process.env[k] = `strong-${k}`;
    delete process.env.STAFF_TOKEN_SECRET;
    expect(() => assertTokenSecretsConfigured()).toThrow(/STAFF_TOKEN_SECRET/);
  });

  it("throws when a secret still equals its public dev default", () => {
    for (const k of KEYS) process.env[k] = `strong-${k}`;
    process.env.CUSTOMER_TOKEN_SECRET = "dev-customer-token-secret-change-me";
    expect(() => assertTokenSecretsConfigured()).toThrow(/CUSTOMER_TOKEN_SECRET/);
  });
});
