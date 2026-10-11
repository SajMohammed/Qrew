import { describe, it, expect } from "vitest";
import { ShopName, OnboardingRequest } from "../src/index";

const issue = (input: unknown) => ShopName.safeParse(input).error?.issues[0]?.message;

describe("ShopName", () => {
  it("accepts a normal name, trimmed", () => {
    expect(ShopName.parse("  Nomad Coffee  ")).toBe("Nomad Coffee");
  });

  it("accepts any script, including Arabic with a zero-width joiner", () => {
    expect(ShopName.parse("مقهى البن")).toBe("مقهى البن");
    expect(ShopName.parse("ب‍ن")).toBe("ب‍ن");
  });

  it("refuses names too short to be a name, or too long for a pass header", () => {
    expect(issue("A")).toBe("Shop name must be at least 2 characters");
    expect(issue("   ")).toBe("Shop name must be at least 2 characters");
    expect(issue("x".repeat(41))).toBe("Shop name must be 40 characters or fewer");
  });

  it("refuses line breaks, control characters and bidi overrides", () => {
    expect(issue("Nomad\nCoffee")).toMatch(/line breaks/);
    expect(issue("Nomad\u0007Coffee")).toMatch(/control characters/);
    // U+202E would render the rest of the name reversed on a customer's pass.
    expect(issue("Nomad ‮eeffoc")).toMatch(/control characters/);
  });

  it("is required at onboarding — there is no default shop name any more", () => {
    expect(OnboardingRequest.safeParse({}).success).toBe(false);
  });
});
