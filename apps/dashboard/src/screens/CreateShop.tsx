import { useClerk } from "@clerk/react";
import { Card } from "@/components/ui/card";
import { Wordmark } from "@/components/AppShell";
import { ShopNameForm } from "@/components/ShopNameForm";

/**
 * First sign-in: the owner names their shop before anything is created. The name is on every
 * customer's card, pass and poster, so it is asked for rather than defaulted.
 *
 * Signing out stays one tap away: someone who signed in with the wrong account would otherwise
 * have no way off this screen but creating a shop they didn't mean to.
 */
export function CreateShop({ onCreate }: { onCreate: (name: string) => Promise<void> }) {
  const { signOut } = useClerk();
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <Card className="w-full max-w-sm gap-3 p-8">
        <Wordmark />
        <h1 className="mt-2 text-lg font-bold">Name your shop</h1>
        <p className="text-muted-foreground text-sm">
          Customers see this on their card, in Google Wallet and on your counter poster. You can change
          it later in Settings.
        </p>
        <ShopNameForm submitLabel="Create my shop" busyLabel="Setting up your shop…" onSubmit={onCreate} />
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-muted-foreground hover:text-foreground self-start text-[13px] font-semibold underline-offset-2 hover:underline"
        >
          Not your shop? Sign out
        </button>
      </Card>
    </div>
  );
}
