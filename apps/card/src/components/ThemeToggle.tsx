import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { buzz } from "@/lib/haptics";
import { Icon } from "./Icon";

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
      className={cn("sf-bubble sf-bubble--raised", className)}
    >
      <Icon name={toDark ? "moon" : "sun"} />
    </button>
  );
}
