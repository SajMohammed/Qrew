import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShopNameForm } from "@/components/ShopNameForm";
import { useApi } from "@/useApi";

/** How the shop appears to customers. Today that is its name; this is where more will go. */
export function Settings({
  merchantName,
  onRenamed,
}: {
  merchantName?: string;
  onRenamed: (name: string) => void;
}) {
  const api = useApi();
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-[15px]">How your shop appears to customers.</p>
      </header>
      <Card className="gap-3 p-4">
        <h2 className="text-base font-bold">Shop name</h2>
        <p className="text-muted-foreground text-[13px]">
          Shown on your customers' cards, the sign-up page, Google Wallet passes and your counter poster.
          Cards already saved in Google Wallet update too. If you've printed your counter poster, print
          it again.
        </p>
        {/* Not keyed on the name: a remount after saving would wipe the "Saved" confirmation. */}
        {merchantName === undefined ? (
          <Skeleton className="h-11 rounded-xl" />
        ) : (
          <ShopNameForm
            initial={merchantName}
            submitLabel="Save"
            busyLabel="Saving…"
            onSubmit={async (name) => {
              const renamed = await api.renameShop(name);
              onRenamed(renamed.name);
            }}
          />
        )}
      </Card>
    </div>
  );
}
