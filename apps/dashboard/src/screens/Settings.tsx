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
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="sf-display sf-twotone">
          <strong>Settings</strong>
        </h1>
        <p className="text-ink-3 mt-2 mb-0 text-[15px] sm:text-[17px]">How your shop appears to customers.</p>
      </header>
      {/* One column of fields in a card, max ~560px; nothing vivid but the Save button. */}
      <Card className="max-w-[560px] gap-3">
        <h2 className="sf-heading m-0">Shop name</h2>
        <p className="text-ink-2 m-0 text-sm">
          Shown on your customers' cards, the sign-up page, Google Wallet passes and your counter poster.
          Cards already saved in Google Wallet update too. If you've printed your counter poster, print
          it again.
        </p>
        {/* Not keyed on the name: a remount after saving would wipe the "Saved" confirmation. */}
        {merchantName === undefined ? (
          <Skeleton className="h-14 rounded-[var(--radius-md)]" />
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
