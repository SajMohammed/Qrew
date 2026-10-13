import { useState } from "react";
import { Check } from "lucide-react";
import { FIELD } from "@/screens/card/controls";

// Mirror ShopName in @qrew/contracts, only to enable the button. The server is authoritative, and
// its message is what's shown when it refuses a name.
const SHOP_NAME_MIN = 2;
const SHOP_NAME_MAX = 40;

/** One field and a button — naming the shop at first sign-in, and renaming it in Settings. */
export function ShopNameForm({
  initial = "",
  submitLabel,
  busyLabel,
  onSubmit,
}: {
  initial?: string;
  submitLabel: string;
  busyLabel: string;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [err, setErr] = useState<string | null>(null);
  const trimmed = value.trim();
  const valid = trimmed.length >= SHOP_NAME_MIN && trimmed.length <= SHOP_NAME_MAX;
  const changed = trimmed !== initial.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || !changed || status === "saving") return;
    setStatus("saving");
    setErr(null);
    try {
      await onSubmit(trimmed);
      setStatus("saved");
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
        Shop name
        <input
          value={value}
          maxLength={SHOP_NAME_MAX}
          autoFocus={!initial}
          autoComplete="organization"
          placeholder="e.g. Nadia's Coffee"
          className={FIELD}
          onChange={(e) => {
            setValue(e.target.value);
            setStatus("idle");
          }}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!valid || !changed || status === "saving"}
          className="bg-primary text-primary-foreground inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-bold transition hover:brightness-110 disabled:opacity-40"
        >
          {status === "saving" ? busyLabel : submitLabel}
        </button>
        {status === "saved" && (
          <span className="text-primary inline-flex items-center gap-1 text-[13px] font-semibold">
            <Check className="size-4" aria-hidden /> Saved
          </span>
        )}
      </div>
      {err && (
        <p role="alert" className="text-destructive text-[13px]">
          {err}
        </p>
      )}
    </form>
  );
}
