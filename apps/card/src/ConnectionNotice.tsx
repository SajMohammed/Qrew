import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

/**
 * Why something isn't showing, and a way to try again. Qrew's own chrome — never the shop's colour.
 * Used on the landing, the wallet and the card screens alike. `warn` wears the warning tint, so the
 * colour and the words say the same thing.
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
    <div role="status" className="sf-card sf-card--compact flex-row items-start">
      <span
        className={cn(
          "sf-bubble sf-bubble--sm pointer-events-none",
          tone === "warn" && "bg-warning-soft text-warning-ink",
        )}
        aria-hidden
      >
        <Icon name={tone === "warn" ? "alert" : "info"} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="m-0 text-[15px] font-medium">{title}</p>
        <p className="text-ink-2 m-0 text-[13px]">{body}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="sf-btn sf-btn--soft mt-2 self-start px-4">
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
