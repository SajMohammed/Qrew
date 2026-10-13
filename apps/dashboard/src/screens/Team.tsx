import { useCallback, useEffect, useState } from "react";
import { KeyRound, Trash2, UserPlus, ShieldCheck } from "lucide-react";
import type { StaffMember } from "@/api";
import { useApi } from "@/useApi";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { initial } from "@/lib/format";

/** Softform's field: a sunken rounded well that brightens on focus. */
const FIELD = "sf-input";

/**
 * The team screen. A shop's counter PIN is created here — without one, counter mode can only be
 * left by signing out, which is safe but not how it's meant to work day to day.
 */
export function Team() {
  const api = useApi();
  const [team, setTeam] = useState<StaffMember[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState("cashier");
  const [resetting, setResetting] = useState<string | null>(null);
  const [newPin, setNewPin] = useState("");

  const load = useCallback(async () => {
    try {
      setTeam(await api.getStaff());
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const canAdd = name.trim().length > 0 && /^\d{4,6}$/.test(pin);
  const withPin = team?.filter((s) => s.hasPin).length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="sf-display sf-twotone">
          <strong>Team</strong>
        </h1>
        <p className="text-ink-3 mt-2 mb-0 text-[15px] sm:text-[17px]">
          Who works your counter, and the PINs they use to unlock it.
        </p>
      </header>

      {team && withPin === 0 && (
        <Card className="sf-card--compact bg-warning-soft flex-row items-start gap-3 shadow-none">
          <span className="sf-bubble sf-bubble--sm bg-surface text-warning-ink pointer-events-none" aria-hidden>
            <ShieldCheck />
          </span>
          <p className="text-warning-ink m-0 text-sm">
            <b className="font-medium">No counter PINs yet.</b>{" "}
            <span>
              Until someone has one, leaving counter mode means signing out. Add a manager below and
              that becomes a PIN instead.
            </span>
          </p>
        </Card>
      )}

      {err && (
        <Card className="sf-card--compact bg-danger-soft shadow-none">
          <p className="text-danger-ink m-0 text-sm">{err}</p>
        </Card>
      )}

      <Card className="gap-4">
        <h2 className="sf-heading m-0">Add someone</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_150px_160px_auto] sm:items-end">
          <label className="sf-field">
            <span className="sf-field__label">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="e.g. Aya"
              className={FIELD}
            />
          </label>
          <label className="sf-field">
            <span className="sf-field__label">Counter PIN</span>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="4–6 digits"
              className={cn(FIELD, "tracking-[0.2em]")}
            />
          </label>
          <label className="sf-field">
            <span className="sf-field__label">Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={FIELD}>
              <option value="cashier">Cashier</option>
              <option value="manager">Manager</option>
            </select>
          </label>
          <button
            type="button"
            disabled={!canAdd || busy}
            onClick={() =>
              void act(async () => {
                await api.addStaff({ name: name.trim(), pin, role });
                setName("");
                setPin("");
                setRole("cashier");
              })
            }
            className="sf-btn sf-btn--primary sf-btn--lg"
          >
            <UserPlus aria-hidden />
            Add
          </button>
        </div>
        <p className="text-ink-3 m-0 text-[12.5px]">
          Only a manager's PIN can leave counter mode. A cashier's PIN attributes their scans but
          keeps them at the till.
        </p>
      </Card>

      {!team ? (
        <Skeleton className="h-48 rounded-lg" />
      ) : (
        // A list in a card: no rules between rows, just space.
        <Card className="gap-0 py-3">
          <ul className="sf-rows">
            {team.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
                <span className="sf-avatar">{initial(s.name)}</span>
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[15px]">{s.name}</p>
                  <p className="text-ink-3 m-0 text-[12.5px]">
                    <span className="capitalize">{s.role}</span>
                    {s.linkedAccount
                      ? " · signs in with their own account"
                      : s.hasPin
                        ? " · counter PIN set"
                        : " · no PIN yet"}
                  </p>
                </div>

                {resetting === s.id ? (
                  <div className="flex w-full items-center gap-2 sm:w-auto">
                    <input
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      inputMode="numeric"
                      autoFocus
                      placeholder="New PIN"
                      className={cn(FIELD, "h-11 tracking-[0.2em] sm:w-32")}
                    />
                    <button
                      type="button"
                      disabled={!/^\d{4,6}$/.test(newPin) || busy}
                      onClick={() =>
                        void act(async () => {
                          await api.resetStaffPin(s.id, newPin);
                          setResetting(null);
                          setNewPin("");
                        })
                      }
                      className="sf-btn sf-btn--ink px-4"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setResetting(null);
                        setNewPin("");
                      }}
                      className="sf-btn sf-btn--ghost px-3"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setResetting(s.id);
                        setNewPin("");
                      }}
                      className="sf-btn sf-btn--soft px-4"
                    >
                      <KeyRound className="size-4" aria-hidden />
                      {s.hasPin ? "Change PIN" : "Set PIN"}
                    </button>
                    {/* Someone with their own login is the mapping from that account to this shop —
                        removing it here would lock them out, so the API refuses and so do we. */}
                    {!s.linkedAccount && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act(() => api.removeStaff(s.id))}
                        aria-label={`Remove ${s.name}`}
                        className="sf-bubble hover:text-danger-ink disabled:opacity-40"
                      >
                        <Trash2 />
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
