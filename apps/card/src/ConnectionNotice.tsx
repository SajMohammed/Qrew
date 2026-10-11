import { cn } from "@/lib/utils";

/**
 * Why something isn't showing, and a way to try again. Qrew's own chrome — never the shop's colour.
 * Used on the landing, the wallet and the card screens alike.
 */
export function ConnectionNotice({
  title,
  body,
  onRetry,
  tone = "warn",
}: {
  title: string;
  body: string;
  onRetry?: () => void;
  tone?: "warn" | "neutral";
}) {
  return (
    <div role="status" className="border-border bg-surface flex items-start gap-3 rounded-2xl border p-4">
      <span
        className={cn("mt-1.5 inline-block size-2 shrink-0 rounded-full", tone === "warn" ? "bg-destructive" : "bg-faint")}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-muted-foreground text-[13px]">{body}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-primary -my-2 min-h-11 shrink-0 px-1 text-[13px] font-semibold"
        >
          Try again
        </button>
      )}
    </div>
  );
}
