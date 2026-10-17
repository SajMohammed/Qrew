import { randomUUID } from "node:crypto";
import { createClerkClient } from "@clerk/backend";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { CARDS, SHOP } from "../servers";

let ownerId: string | undefined;

const SHOP_NAME = "E2E Two Cards";
const CODE = /^[2-9A-HJKMNP-TV-Z]{3} [2-9A-HJKMNP-TV-Z]{3}$/;

test.afterAll(async () => {
  if (ownerId) await createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY }).users.deleteUser(ownerId);
});

/** The counter code link the Counter QR screen shows for the card on screen. */
async function counterLink(page: Page): Promise<URL> {
  return new URL(await page.locator("code").filter({ hasText: "?m=" }).innerText());
}

test("a shop turns on a second card, customers join it by its own code, and turning it off freezes it", async ({
  page,
  browser,
}) => {
  await test.step("a new owner signs up and names their shop", async () => {
    await setupClerkTestingToken({ page });
    await page.goto(SHOP);
    await clerk.loaded({ page });
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
    await expect(page.getByRole("heading", { name: "Name your shop" })).toBeVisible({ timeout: 30_000 });
    await page.getByLabel("Shop name").fill(SHOP_NAME);
    await page.getByRole("button", { name: "Create my shop" }).click();
    await expect(page.getByText(SHOP_NAME, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  });

  const stampLink = await test.step("with one card there is no card switcher", async () => {
    await page.getByRole("button", { name: "Counter QR", exact: true }).first().click();
    await expect(page.locator(".print-poster")).toBeVisible();
    await expect(page.getByRole("group", { name: "Card" })).toHaveCount(0);
    return counterLink(page);
  });

  await test.step("they turn on a points card in Settings", async () => {
    await page.getByRole("button", { name: "Settings", exact: true }).first().click();
    const stamp = page.getByRole("switch", { name: "Stamp card" });
    const points = page.getByRole("switch", { name: "Points card" });
    await expect(stamp).toBeChecked();
    await expect(stamp).toBeDisabled(); // the shop's only card stays on
    await expect(points).not.toBeChecked();
    await points.check();
    await expect(points).toBeChecked();
    await expect(stamp).toBeEnabled();
  });

  const pointsLink = await test.step("the counter code screen has a poster for each card", async () => {
    await page.getByRole("button", { name: "Counter QR", exact: true }).first().click();
    const switcher = page.getByRole("group", { name: "Card" });
    await expect(switcher.getByRole("button")).toHaveText(["Loyalty Card", "Points card"]);
    expect((await counterLink(page)).search).toBe(stampLink.search);
    await switcher.getByRole("button", { name: "Points card" }).click();
    await expect(page.locator(".print-poster").getByText("Points card")).toBeVisible();
    const link = await counterLink(page);
    expect(link.searchParams.get("m")).toBe(stampLink.searchParams.get("m"));
    expect(link.searchParams.get("p")).not.toBe(stampLink.searchParams.get("p"));
    return link;
  });

  const phone = await (await browser.newContext()).newPage();

  const pointsCode = await test.step("a customer joins each card through its own code", async () => {
    await phone.goto(`${CARDS}/${pointsLink.search}`);
    await phone.getByRole("button", { name: /Get this shop's card/ }).click();
    await expect(phone).toHaveURL(/\?card=/);
    const code = await phone.getByText(CODE).innerText();

    await phone.goto(`${CARDS}/${stampLink.search}`);
    await phone.getByRole("button", { name: /Get this shop's card/ }).click();
    await expect(phone).toHaveURL(/\?card=/);
    expect(await phone.getByText(CODE).innerText()).not.toBe(code);

    // The wallet holds both, each its own card, each saying which of the shop's cards it is.
    await phone.getByRole("button", { name: "‹ All cards" }).click();
    await expect(phone.getByRole("button", { name: /Points card/ })).toHaveCount(1);
    await expect(phone.getByRole("button", { name: /Loyalty Card/ })).toHaveCount(1);
    return code;
  });

  // The counter on its own tab, so the owner's tab stays free for Settings.
  const counter = await page.context().newPage();
  await setupClerkTestingToken({ page: counter });
  await counter.goto(SHOP);
  await counter.getByRole("button", { name: "Counter mode" }).first().click();
  const box = counter.getByLabel(/^Card code/);
  const stampButton = counter.getByRole("button", { name: "+ Stamp" });

  await test.step("a scan acts on the scanned card, and says which card it was", async () => {
    await box.fill(pointsCode);
    await stampButton.click();
    await expect(counter.getByText("✓ Stamp added · 10/500")).toBeVisible();
    await expect(counter.getByText(`Points card · Card ${pointsCode}`)).toBeVisible();
  });

  await test.step("they turn the points card off, which freezes it", async () => {
    await page.getByRole("button", { name: "Settings", exact: true }).first().click();
    const points = page.getByRole("switch", { name: "Points card" });
    await points.uncheck();
    await expect(points).not.toBeChecked();
    await expect(page.getByText(/^Off since/)).toBeVisible();

    // Its poster is gone: one card on again, so no switcher, and the code is the stamp card's.
    await page.getByRole("button", { name: "Counter QR", exact: true }).first().click();
    await expect(page.locator(".print-poster")).toBeVisible();
    await expect(page.getByRole("group", { name: "Card" })).toHaveCount(0);
    expect((await counterLink(page)).search).toBe(stampLink.search);
  });

  await test.step("nobody new can join the frozen card", async () => {
    const newcomer = await (await browser.newContext()).newPage();
    await newcomer.goto(`${CARDS}/${pointsLink.search}`);
    await expect(newcomer.getByText("This code isn't active")).toBeVisible();
    await expect(newcomer.getByRole("button", { name: /Get this shop's card/ })).toHaveCount(0);
  });

  await test.step("a frozen card scans as frozen and collects nothing", async () => {
    await box.fill(pointsCode);
    await stampButton.click();
    await expect(counter.getByText("Card no longer collecting — nothing added · 10/500")).toBeVisible();
    await expect(counter.getByText(`Points card · Card ${pointsCode}`)).toBeVisible();
    await expect(counter.getByRole("button", { name: "+ Add another stamp" })).toHaveCount(0);
  });

  await test.step("the customer keeps the card, marked as no longer collecting", async () => {
    await phone.getByRole("button", { name: /Points card/ }).click();
    await expect(phone.getByText("No longer collecting").first()).toBeVisible({ timeout: 15_000 });
    await expect(phone.getByText("10/500", { exact: true })).toBeVisible();
  });
});
