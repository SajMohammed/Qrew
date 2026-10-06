import { randomUUID } from "node:crypto";
import { createClerkClient } from "@clerk/backend";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { CARDS, SHOP } from "../servers";

let ownerId: string | undefined;

// The owner is a real user in the Clerk development instance; don't leave one behind per run.
test.afterAll(async () => {
  if (ownerId) await createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY }).users.deleteUser(ownerId);
});

test("a new owner sets up a stamp card, and a customer earns and redeems the reward", async ({ page, browser }) => {
  await test.step("a brand-new owner signs up", async () => {
    await setupClerkTestingToken({ page });
    await page.goto(SHOP);
    await clerk.loaded({ page });
    // Clerk's own client calls, the ones its sign-up form makes. A +clerk_test address is verified
    // with the fixed code 424242 in a development instance, so no inbox is involved.
    ownerId = await page.evaluate(
      async ({ email, password }) => {
        const c = (window as unknown as { Clerk: any }).Clerk;
        const signUp = await c.client.signUp.create({ emailAddress: email, password });
        await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
        const done = await signUp.attemptEmailAddressVerification({ code: "424242" });
        await c.setActive({ session: done.createdSessionId });
        return done.createdUserId as string;
      },
      { email: `owner+clerk_test_${Date.now()}@example.com`, password: `E2e-${randomUUID()}` },
    );
  });

  await test.step("the first sign-in provisions their shop", async () => {
    // Lazy onboarding: the dashboard's first call 409s, it provisions a shop, then loads.
    await expect(page.getByText("My Shop").first()).toBeVisible({ timeout: 30_000 });
  });

  await test.step("they design a three-stamp card with no head start", async () => {
    await page.getByRole("button", { name: "Cards", exact: true }).first().click();
    await page.getByLabel(/^Reward/).fill("Free flat white");
    await page.getByLabel(/^Stamps to reward/).fill("3");
    await page.getByLabel(/^Head start on signup/).fill("0");
    await page.getByRole("button", { name: "Save card" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  });

  const enroll = await test.step("their counter code links to the shop's card", async () => {
    await page.getByRole("button", { name: "Counter QR", exact: true }).first().click();
    const link = await page.locator("code").filter({ hasText: "?m=" }).innerText();
    return new URL(link);
  });

  // The customer is a separate device: its own storage, no Clerk session.
  const phone = await (await browser.newContext()).newPage();

  const serial = await test.step("a customer scans it and gets the card", async () => {
    await phone.goto(`${CARDS}/${enroll.search}`);
    await phone.getByRole("button", { name: /Get this shop's card/ }).click();
    await expect(phone).toHaveURL(/\?card=/);
    await expect(phone.getByText("0/3", { exact: true })).toBeVisible();
    return new URL(phone.url()).searchParams.get("card")!;
  });

  await test.step("the counter stamps the card three times", async () => {
    await page.getByRole("button", { name: "Counter mode" }).first().click();
    const serialBox = page.getByPlaceholder("paste the card serial");
    const stamp = page.getByRole("button", { name: "+ Stamp" });
    for (const expected of ["✓ Stamp added · 1/3", "✓ Stamp added · 2/3", "🎉 Reward ready! · 3/3"]) {
      await serialBox.fill(serial);
      await stamp.click();
      await expect(page.getByText(expected)).toBeVisible();
      // The scanner ignores input for 1.2s after each scan, its guard against a double read.
      await page.waitForTimeout(1300);
    }
    // The card polls the API every few seconds, so the customer watches it fill.
    await expect(phone.getByText("3/3", { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  await test.step("the reward is redeemed at the counter", async () => {
    await page.getByRole("button", { name: "🎁 Redeem reward" }).click();
    await expect(page.getByText("✓ Reward redeemed — Free flat white")).toBeVisible();
  });

  await test.step("the customer's card starts again", async () => {
    await expect(phone.getByText("0/3", { exact: true })).toBeVisible({ timeout: 15_000 });
  });
});
