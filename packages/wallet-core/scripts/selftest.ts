/**
 * Google Wallet self-test — proves the pass pipeline without an Android device.
 *
 * A pass is just a record in Google's Wallet Objects API. Everything that matters to us — that a
 * class exists, that an object is created with the right fields, that a stamp PATCHes the balance,
 * that a nudge is delivered, that revoking expires it — is observable over the REST API. The phone
 * only renders what these calls produce.
 *
 * Runs against a throwaway object id so it never touches a real customer's pass, and expires it at
 * the end to leave the issuer account clean.
 *
 *   pnpm wallet:selftest
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { ServiceAccountTokens, serviceAccountFromEnv } from "../src/google/auth";
import { GoogleWalletProvider } from "../src/google/provider";
import type { PassContent } from "../src/types";

config({ path: resolve(import.meta.dirname, "../../../.env") });

const ok = (m: string) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const step = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

const API = "https://walletobjects.googleapis.com/walletobjects/v1";

async function main() {
  const provider = new GoogleWalletProvider();
  const tokens = new ServiceAccountTokens(serviceAccountFromEnv());

  // A synthetic serial: this must never collide with a real card.
  const serial = `selftest-${Date.now()}`;
  const content: PassContent = {
    serial,
    merchantName: "Qrew Self Test",
    programName: "Self Test Card",
    rewardText: "1 free item",
    currentStamps: 3,
    stampsRequired: 10,
    qrToken: "selftest.token",
    brandColor: "#146A2E",
  };

  const read = async (id: string) => {
    const res = await fetch(`${API}/loyaltyObject/${encodeURIComponent(id)}`, {
      headers: { authorization: `Bearer ${await tokens.get()}` },
    });
    if (!res.ok) throw new Error(`read ${id} -> ${res.status} ${await res.text()}`);
    return (await res.json()) as Record<string, any>;
  };

  console.log("\nGoogle Wallet pass pipeline self-test");

  step("1. Issue a pass (creates the class if needed, then the object)");
  const ref = await provider.issuePass(content);
  ok(`object created: ${ref.googleObjectId}`);

  step("2. Read it back from Google");
  let obj = await read(ref.googleObjectId!);
  ok(`state=${obj.state}  balance=${obj.loyaltyPoints?.balance?.int}  barcode=${obj.barcode?.value}`);

  step("3. Stamp it — this is exactly what the worker does on every scan");
  await provider.updateStamps(ref, 7);
  obj = await read(ref.googleObjectId!);
  ok(`balance is now ${obj.loyaltyPoints?.balance?.int} (was 3)`);
  if (obj.loyaltyPoints?.balance?.int !== 7) throw new Error("balance did not update");

  step("4. Push a lock-screen nudge");
  await provider.pushUpdate(ref, "You're 3 stamps from a free coffee");
  obj = await read(ref.googleObjectId!);
  const messages = (obj.messages ?? []) as { body?: string }[];
  ok(`${messages.length} message(s) on the pass: "${messages.at(-1)?.body ?? ""}"`);

  step("5. Revoke it (Google has no delete — a pass leaves the wallet by expiring)");
  await provider.revoke(ref);
  obj = await read(ref.googleObjectId!);
  ok(`state=${obj.state}`);
  // Google accepts state uppercase on write but echoes it back lowercase on read.
  if (String(obj.state).toUpperCase() !== "EXPIRED") throw new Error("revoke did not expire the pass");

  step("Result");
  ok("the full pass lifecycle works against your live issuer");
  console.log(
    "\n  A phone only renders what these calls produce. Open a save link in any browser to\n" +
      "  see the rendered pass; no Android device is needed to verify the pipeline itself.\n",
  );
}

main().catch((err) => {
  console.error(`\n  \x1b[31m✗\x1b[0m ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
