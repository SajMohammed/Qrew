import { useRef, useState, type ReactNode } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** The shared controls the card sections are built from. Nothing here knows about card types. */

/** Softform's field: a sunken rounded well that brightens on focus. */
export const FIELD = "sf-input";

export function Labelled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="sf-field__label block">{label}</span>
      {children}
      {hint && <span className="sf-field__hint mt-1.5 block leading-snug">{hint}</span>}
    </label>
  );
}

/**
 * The same heading and hint as Labelled, but a plain container.
 *
 * For a group of buttons — colours, layouts, emoji. A <label> is an association with one control;
 * wrapping several interactive elements in one makes clicks ambiguous and tells a screen reader
 * the whole group is a single field.
 */
export function Group({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <span className="sf-field__label block">{label}</span>
      {children}
      {hint && <span className="sf-field__hint mt-1.5 block leading-snug">{hint}</span>}
    </div>
  );
}

export function NumberField({
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  suffix?: string;
}) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className={FIELD}
      />
      {suffix && <span className="text-ink-2 shrink-0 text-[13px]">{suffix}</span>}
    </div>
  );
}

/** A slider with its value shown — a percentage nobody can read is not a control. */
export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.01,
  format,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (n: number) => string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="sf-field__label">{label}</span>
        <span className="text-ink-2 text-[12.5px] tabular-nums">
          {format ? format(value) : `${Math.round(value * 100)}%`}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-ink mt-1.5 w-full cursor-pointer"
      />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div className="sf-tabs mt-1.5 w-full">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className="sf-tabs__tab h-auto min-h-9 flex-1 px-3 py-1.5 text-[13px] leading-tight"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Pick an image, or paste a link to one you already host.
 *
 * Both, deliberately. Upload is what a café owner needs — they have a PNG on their laptop and
 * nowhere to put it. A link is what a chain with a CDN needs. PNG only, and the control says so
 * before the upload fails, because the strip is composited server-side and cannot read JPEG.
 */
export function ImageField({
  label,
  hint,
  value,
  onChange,
  onUpload,
}: {
  label: string;
  hint?: string;
  value: string | undefined;
  onChange: (url: string | undefined) => void;
  onUpload: (file: File) => Promise<string>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await onUpload(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = ""; // so the same file can be picked again
    }
  }

  return (
    <div>
      <span className="sf-field__label block">{label}</span>
      <div className="mt-1.5 flex items-center gap-3">
        <div className="bg-surface-sunken grid size-14 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-md)]">
          {value ? (
            <img src={value} alt="" className="size-full object-contain" />
          ) : (
            <span className="text-ink-3 text-[12px]">none</span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={busy}
              className="sf-btn sf-btn--soft px-4 text-[14px] disabled:cursor-wait"
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Upload className="size-3.5" aria-hidden />
              )}
              {busy ? "Uploading…" : "Upload PNG"}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange(undefined)}
                aria-label={`Remove ${label}`}
                className="sf-bubble"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
          <input
            ref={input}
            type="file"
            accept="image/png"
            onChange={(e) => void pick(e.target.files?.[0])}
            className="hidden"
          />
          <input
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || undefined)}
            placeholder="…or paste an https link"
            className={cn(FIELD, "h-10 text-[13px]")}
          />
        </div>
      </div>
      {error && <p className="sf-field__error mt-1.5 mb-0">{error}</p>}
      {hint && !error && <p className="sf-field__hint mt-1.5 mb-0 leading-snug">{hint}</p>}
    </div>
  );
}
