import { describe, it, expect } from "vitest";
import { formatShortCode, normalizeShortCode } from "../src/short-code";

describe("short codes", () => {
  it("reads a code however it was typed", () => {
    for (const typed of ["K7M4QX", "k7m4qx", "K7M 4QX", "k7m-4qx", "  K7M 4QX "]) {
      expect(normalizeShortCode(typed)).toBe("K7M4QX");
    }
  });

  it("refuses anything that cannot be a code", () => {
    // look-alikes (0 O 1 I L U), the wrong length, a serial, a card token
    for (const typed of ["K7M4Q0", "K7M4QO", "K7M4Q1", "K7M4QI", "K7M4QL", "K7M4QU", "K7M4Q", "K7M4QXA", "bc5da23a-b964-4dfe-b461-c455d26ac019", "abc.def"]) {
      expect(normalizeShortCode(typed)).toBeNull();
    }
  });

  it("shows a code as two groups of three", () => {
    expect(formatShortCode("K7M4QX")).toBe("K7M 4QX");
  });
});
