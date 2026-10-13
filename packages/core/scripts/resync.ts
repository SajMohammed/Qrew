/**
 * Push every existing pass back into line with the current code and design.
 *
 * A wallet pass is a stored object: it only changes when we write it. So whenever the SHAPE of a
 * pass changes — a new field, a corrected barcode, a redrawn strip — passes already in customers'
 * wallets keep whatever they were built with until something touches them. Ordinarily the next scan
 * or design save does that, but a card nobody visits could sit wrong for months.
 *
 * This rewrites each programme's template, then pushes current state onto each card, using the same
 * builders the wallet worker uses. Safe to re-run: it writes the values the worker would, and changes
 * no data in Qrew's own database.
 *
 *   pnpm wallet:resync
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import type { PassSyncOutcome } from "@qrew/wallet-core";
// Pure — no database — so safe to import before the env file is loaded.
import { isWalletIssuable, passUpdateFor, templateContentFor } from "../src/wallet-pass";

config({ path: resolve(__dirname, "../../../.env") });

async function main(): Promise<void> {
  // Imported AFTER config(): @qrew/db opens its pool at import time and would throw on a missing
  // DATABASE_URL, because static imports are hoisted above the dotenv call above.
  const { adminDb, enrollments, loyaltyPrograms, merchants, customers, closeDb } = await import("@qrew/db");
  const { getWalletProvider } = await import("@qrew/wallet-core");

  if (process.env.WALLET_PROVIDER !== "google") {
    console.log("\n  WALLET_PROVIDER is not 'google' — nothing to resync.\n");
    return;
  }
  const provider = getWalletProvider();

  // adminDb rather than withTenant: this is a deliberate cross-tenant maintenance job, exactly the
  // case the admin connection exists for. Every active card, not only those with a stored pass id —
  // a pass's id derives from its serial, so a card can have a pass without one being stored.
  const rows = await adminDb
    .select({
      serial: enrollments.cardSerial,
      shortCode: enrollments.shortCode,
      programId: enrollments.programId,
      googleObjectId: enrollments.googleObjectId,
      customerName: customers.name,
      merchantName: merchants.name,
      programName: loyaltyPrograms.name,
      rewardText: loyaltyPrograms.rewardText,
      currentProgress: enrollments.currentProgress,
      stampsRequired: loyaltyPrograms.stampsRequired,
      type: loyaltyPrograms.type,
      mechanics: loyaltyPrograms.mechanics,
      cardDesign: loyaltyPrograms.cardDesign,
    })
    .from(enrollments)
    .innerJoin(loyaltyPrograms, eq(loyaltyPrograms.id, enrollments.programId))
    .innerJoin(merchants, eq(merchants.id, enrollments.merchantId))
    .innerJoin(customers, eq(customers.id, enrollments.customerId))
    .where(eq(enrollments.status, "active"));
  const issuable = rows.filter((r) => isWalletIssuable(r.type));

  // 1 ─ each programme's template, once.
  const programs = new Map(issuable.map((r) => [r.programId, r]));
  console.log(`\nRewriting ${programs.size} template(s)`);
  for (const r of programs.values()) {
    await provider.syncTemplate(
      templateContentFor(
        { id: r.programId, name: r.programName, rewardText: r.rewardText, stampsRequired: r.stampsRequired, type: r.type, mechanics: r.mechanics, cardDesign: r.cardDesign },
        r.merchantName,
      ),
    );
    console.log(`  ✓ ${r.programId.slice(0, 8)} ${r.merchantName}`);
  }

  // 2 ─ each card, one at a time (gentle on the API).
  console.log(`\nResyncing ${issuable.length} card(s) to the current pass shape\n`);
  const tally: Record<PassSyncOutcome | "failed", number> = { in_wallet: 0, not_saved: 0, absent: 0, failed: 0 };
  for (const r of issuable) {
    try {
      const outcome = await provider.updateStamps(
        { serial: r.serial, googleObjectId: r.googleObjectId ?? undefined },
        passUpdateFor(r),
      );
      tally[outcome]++;
      console.log(`  ${outcome === "absent" ? "·" : "✓"} ${r.serial.slice(0, 8)} ${r.merchantName} → ${r.currentProgress}/${r.stampsRequired} (${outcome})`);
    } catch (err) {
      tally.failed++;
      console.log(`  ✗ ${r.serial.slice(0, 8)} ${r.merchantName}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(
    `\n  ${tally.in_wallet} in a wallet, ${tally.not_saved} issued but not saved, ` +
      `${tally.absent} with no pass yet, ${tally.failed} failed\n`,
  );
  if (tally.failed > 0) process.exitCode = 1;
  await closeDb();
}

main().catch((err) => {
  console.error("\n  resync failed:", err instanceof Error ? err.message : err, "\n");
  process.exit(1);
});
