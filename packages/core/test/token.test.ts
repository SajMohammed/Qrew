import { describe, it, expect } from "vitest";
import { mintCardToken, verifyCardToken } from "../src/token";

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
