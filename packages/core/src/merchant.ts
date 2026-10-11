import { eq } from "drizzle-orm";
import { withTenant, merchants, loyaltyPrograms } from "@qrew/db";
import { NotFoundError } from "./errors";
import { isWalletIssuable } from "./wallet-pass";
import { markTemplateSyncRequested, queueTemplateSyncs } from "./wallet-sync";

export interface MerchantView {
  merchantId: string;
  name: string;
}

/**
 * Rename the shop.
 *
 * Every surface of ours reads the name live — the customer's card, the sign-up page, the poster,
 * the console — so the row IS the change. Google is the exception: the shop's name is the issuer on
 * each programme's template, which every saved pass shows. So every pass-bearing programme is marked
 * for a template push in the same transaction as the rename, and the pushes run on the wallet worker:
 * the owner's Save never waits on Google, and the Card screen reports when the passes caught up.
 * Inactive programmes are included — their passes are still in wallets.
 */
export async function renameMerchant(merchantId: string, name: string): Promise<MerchantView> {
  const { renamed, programIds } = await withTenant(merchantId, async (db) => {
    const [m] = await db
      .update(merchants)
      .set({ name })
      .where(eq(merchants.id, merchantId))
      .returning({ id: merchants.id, name: merchants.name });
    if (!m) throw new NotFoundError("merchant not found");
    const programs = await db.select({ id: loyaltyPrograms.id, type: loyaltyPrograms.type }).from(loyaltyPrograms);
    const ids = programs.filter((p) => isWalletIssuable(p.type)).map((p) => p.id);
    await markTemplateSyncRequested(db, ids);
    return { renamed: m, programIds: ids };
  });
  await queueTemplateSyncs(merchantId, programIds);
  return { merchantId: renamed.id, name: renamed.name };
}
