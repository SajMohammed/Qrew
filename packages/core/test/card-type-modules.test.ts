import { describe, it, expect } from "vitest";
import {
  availableCardTypes,
  cardTypeModule,
  stampCard,
  pointsCard,
  discountCard,
  membershipCard,
  CARD_TYPES,
} from "../src/card-types";

describe("the registry now covers every card type", () => {
  it("offers all four, each resolvable", () => {
    expect(availableCardTypes().map((m) => m.type).sort()).toEqual([...CARD_TYPES].sort());
    for (const t of CARD_TYPES) expect(cardTypeModule(t).type).toBe(t);
  });

  it("gives every type copy a shop can read", () => {
    for (const m of availableCardTypes()) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.blurb.length).toBeGreaterThan(0);
    }
  });

  /*
   * The wallet mapping is not a free choice — it follows from what each platform can render, and a
   * wrong one cannot be corrected after issuance because an object is welded to its class type.
   */
  it("maps each type to the wallet template that can actually render it", () => {
    // Only Apple's storeCard and coupon have a strip image, the only way to draw stamps at all.
    expect(stampCard.wallet).toEqual({ google: "loyalty", apple: "storeCard" });
    // Google renders a points balance natively, but only on a loyalty object.
    expect(pointsCard.wallet).toEqual({ google: "loyalty", apple: "storeCard" });
    // A discount is an offer, the vertical whose class carries redemption terms.
    expect(discountCard.wallet).toEqual({ google: "offer", apple: "coupon" });
    // Deliberately NOT generic: a generic class carries no branding, so a rebrand would become a
    // write per customer instead of one class update.
    expect(membershipCard.wallet).toEqual({ google: "loyalty", apple: "storeCard" });
    expect(membershipCard.wallet.google).not.toBe("generic");
  });
});

describe("the reward threshold each type allows", () => {
  it("bounds a stamp card by what a strip can legibly draw", () => {
    // The renderer clamps at 20, so accepting more would let the saved number and the drawn card
    // disagree — a shop setting 50 would see 20 and be told they had 50.
    expect(stampCard.maxTarget).toBe(20);
  });

  it("does not impose a stamp card's ceiling on a points card", () => {
    // A reward at 500 points is ordinary; capping every type at 20 made it unconfigurable.
    expect(pointsCard.maxTarget).toBeGreaterThan(1000);
    expect(membershipCard.maxTarget).toBeGreaterThan(1000);
  });
});

describe("stamp card", () => {
  it("stops taking stamps when the card is full", () => {
    expect(stampCard.acceptsMore(9, 10, {})).toBe(true);
    expect(stampCard.acceptsMore(10, 10, {})).toBe(false);
    expect(stampCard.redeemable(10, 10, {})).toBe(true);
  });
});

describe("points card", () => {
  const m = pointsCard.normalize({});

  it("awards the per-visit rate when the counter recorded no spend", () => {
    expect(pointsCard.earn(m, {})).toBe(10);
  });

  it("uses the spend rate once an amount is available", () => {
    const rate = pointsCard.normalize({ perCurrency: 2, perVisit: 10 });
    expect(pointsCard.earn(rate, { amount: 37.5 })).toBe(75);
    // A shop that rewards visits rather than spend ignores the amount entirely.
    expect(pointsCard.earn(pointsCard.normalize({ perCurrency: 0 }), { amount: 100 })).toBe(10);
  });

  /*
   * The bug this exists to prevent: reusing "is it redeemable" as "should it keep earning" caps a
   * points balance at its first reward, stranding everyone who earns past it before redeeming.
   */
  it("keeps earning past the reward threshold", () => {
    expect(pointsCard.acceptsMore(999, 100, m)).toBe(true);
    expect(pointsCard.redeemable(999, 100, m)).toBe(true);
    expect(pointsCard.redeemable(99, 100, m)).toBe(false);
  });

  it("speaks the shop's own word for its points", () => {
    expect(pointsCard.describe(1240, 100, pointsCard.normalize({ unitLabel: "beans" }))).toBe("1,240 beans");
  });

  it("falls back to sane settings when the stored ones are junk", () => {
    const junk = pointsCard.normalize({ unitLabel: "   ", perVisit: -5, perCurrency: "lots" });
    expect(junk).toEqual({ unitLabel: "points", perVisit: 10, perCurrency: 0 });
  });
});

describe("discount card", () => {
  const m = discountCard.normalize({});

  it("collects nothing and redeems nothing — it is an entitlement", () => {
    expect(discountCard.accrues).toBe(false);
    expect(discountCard.earn(m, {})).toBe(0);
    expect(discountCard.acceptsMore(0, 0, m)).toBe(false);
    expect(discountCard.redeemable(0, 0, m)).toBe(false);
  });

  it("reads as the offer it is", () => {
    expect(discountCard.describe(0, 0, discountCard.normalize({ amount: 20, unit: "percent" }))).toBe("20% off");
    expect(
      discountCard.describe(0, 0, discountCard.normalize({ amount: 25, unit: "currency", currency: "AED" })),
    ).toBe("AED 25 off");
  });

  it("refuses a percentage above 100", () => {
    expect(discountCard.normalize({ amount: 250, unit: "percent" }).amount).toBe(10);
    // The same number is fine as a fixed amount.
    expect(discountCard.normalize({ amount: 250, unit: "currency" }).amount).toBe(250);
  });
});

describe("membership card", () => {
  const m = membershipCard.normalize({});

  it("climbs without ever being spent", () => {
    expect(membershipCard.acceptsMore(9999, 10, m)).toBe(true);
    expect(membershipCard.redeemable(9999, 10, m)).toBe(false);
  });

  it("names the highest tier reached", () => {
    expect(membershipCard.describe(0, 0, m)).toBe("Member · 0");
    expect(membershipCard.describe(12, 0, m)).toBe("Silver · 12");
    expect(membershipCard.describe(30, 0, m)).toBe("Gold · 30");
  });

  it("sorts tiers by threshold rather than trusting stored order", () => {
    const jumbled = membershipCard.normalize({
      tiers: [
        { name: "Gold", at: 25 },
        { name: "Member", at: 0 },
        { name: "Silver", at: 10 },
      ],
    });
    expect(jumbled.tiers.map((t) => t.name)).toEqual(["Member", "Silver", "Gold"]);
    expect(membershipCard.describe(12, 0, jumbled)).toBe("Silver · 12");
  });

  it("keeps its defaults when the stored tiers are unusable", () => {
    expect(membershipCard.normalize({ tiers: [{ name: "", at: -1 }] }).tiers).toEqual(m.tiers);
  });
});
