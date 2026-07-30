import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { buzz } from "@/lib/haptics";

/** Light ⇄ dark. Shows the destination, not the current state — that's what a switch means. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const toDark = resolved !== "dark";

  return (
    <button
      type="button"
      onClick={() => {
        buzz(8);
        toggle();
      }}
      aria-label={toDark ? "Switch to dark theme" : "Switch to light theme"}
      className={cn(
        "border-border bg-surface text-muted-foreground active:text-foreground grid size-10 shrink-0 place-items-center rounded-full border transition active:scale-95",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="size-[18px]"
        aria-hidden
      >
        {toDark ? (
          <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
          </>
        )}
      </svg>
    </button>
  );
}
