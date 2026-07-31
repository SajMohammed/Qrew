import { useCallback, useEffect, useState } from "react";
import { KeyRound, Trash2, UserPlus, ShieldCheck } from "lucide-react";
import type { StaffMember } from "@/api";
import { useApi } from "@/useApi";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { initial } from "@/lib/format";

const FIELD =
  "border-border bg-card placeholder:text-faint focus-visible:ring-ring w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2";

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
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Team</h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-[15px]">
          Who works your counter, and the PINs they use to unlock it.
        </p>
      </header>

      {team && withPin === 0 && (
        <Card className="border-warning/40 bg-warning/8 flex-row items-start gap-3 p-4">
          <ShieldCheck className="text-warning mt-0.5 size-5 shrink-0" aria-hidden />
          <p className="text-sm">
            <b>No counter PINs yet.</b>{" "}
            <span className="text-muted-foreground">
              Until someone has one, leaving counter mode means signing out. Add a manager below and
              that becomes a PIN instead.
            </span>
          </p>
        </Card>
      )}

      {err && (
        <Card className="border-destructive/40 p-4">
          <p className="text-destructive text-sm">{err}</p>
        </Card>
      )}

      <Card className="gap-3 p-4">
        <h2 className="text-base font-bold">Add someone</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_140px_150px_auto] sm:items-end">
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="e.g. Aya"
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
            Counter PIN
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="4–6 digits"
              className={cn(FIELD, "font-mono tracking-[0.2em]")}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
            Role
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
            className="bg-primary text-primary-foreground inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition hover:brightness-110 disabled:opacity-40"
          >
            <UserPlus className="size-4" aria-hidden />
            Add
          </button>
        </div>
        <p className="text-faint text-xs">
          Only a manager's PIN can leave counter mode. A cashier's PIN attributes their scans but
          keeps them at the till.
        </p>
      </Card>

      {!team ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : (
        <Card className="gap-0 p-0">
          <ul className="divide-border divide-y">
            {team.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 p-4">
                <span className="bg-muted text-primary grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold">
                  {initial(s.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{s.name}</p>
                  <p className="text-faint text-[11.5px] capitalize">
                    {s.role}
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
                      className={cn(FIELD, "font-mono tracking-[0.2em] sm:w-32")}
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
                      className="bg-primary text-primary-foreground min-h-10 rounded-lg px-3 text-[13px] font-bold disabled:opacity-40"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setResetting(null);
                        setNewPin("");
                      }}
                      className="text-muted-foreground min-h-10 px-2 text-[13px] font-semibold"
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
                      className="border-border text-muted-foreground hover:text-foreground inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-semibold"
                    >
                      <KeyRound className="size-3.5" aria-hidden />
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
                        className="border-border text-muted-foreground hover:text-destructive grid size-9 place-items-center rounded-lg border disabled:opacity-40"
                      >
                        <Trash2 className="size-3.5" />
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
