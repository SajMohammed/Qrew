import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import type { CustomerFilter, CustomerList, CustomerRow, CustomerStatus } from "@/api";
import { useApi } from "@/useApi";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { displayName, formatCount, initial, relativeTime, statusLabel } from "@/lib/format";

const FILTERS: { id: CustomerFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "reward_ready", label: "Reward ready" },
  { id: "at_risk", label: "At risk" },
  { id: "regulars", label: "Regulars" },
];

const PAGE_SIZE = 25;

export function Customers({ initialFilter = "all" }: { initialFilter?: CustomerFilter }) {
  const api = useApi();
  const [filter, setFilter] = useState<CustomerFilter>(initialFilter);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<CustomerList | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Typing shouldn't fire a query per keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setOffset(0);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  // A slow response for an abandoned query must never overwrite a newer one.
  const requestId = useRef(0);
  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setErr(null);
    try {
      const result = await api.getCustomers({ filter, search, limit: PAGE_SIZE, offset });
      if (id !== requestId.current) return;
      // Landing past the end (the segment shrank, or a filter narrowed it) returns no rows and no
      // total, which would strand the reader on a blank page. Fall back to the first one.
      if (result.rows.length === 0 && offset > 0) {
        setOffset(0);
        return;
      }
      setData(result);
    } catch (e) {
      if (id === requestId.current) setErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [api, filter, search, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const showing = useMemo(() => {
    if (!data || data.total === 0) return null;
    return `${offset + 1}–${offset + data.rows.length} of ${formatCount(data.total)}`;
  }, [data, offset]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Customers</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-[15px]">
            Everyone who has taken a card at your shop.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-3">
        <div className="border-border bg-card flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5">
          <Search className="text-faint size-4 shrink-0" aria-hidden />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, email or phone…"
            aria-label="Search customers"
            className="placeholder:text-faint min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              aria-label="Clear search"
              className="text-faint hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setFilter(f.id);
                setOffset(0);
              }}
              aria-pressed={filter === f.id}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition",
                filter === f.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {err && (
        <Card className="border-destructive/40 p-4">
          <p className="text-destructive text-sm">{err}</p>
        </Card>
      )}

      {loading && !data ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : !data || data.rows.length === 0 ? (
        <Card className="items-center gap-1.5 p-10 text-center">
          <p className="font-bold">Nobody here</p>
          <p className="text-muted-foreground text-sm">
            {search
              ? `No customer matches “${search}”.`
              : filter === "all"
                ? "No customers yet — print your Counter QR to get the first card out."
                : "No customers in this segment right now."}
          </p>
        </Card>
      ) : (
        <>
          {/* Phone/tablet: a table cannot honestly fit 375px, so each customer becomes a card. */}
          <ul className="flex flex-col gap-2.5 lg:hidden">
            {data.rows.map((c) => (
              <li key={c.id}>
                <Card className="gap-2 p-3.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar row={c} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{displayName(c)}</p>
                      <p className="text-faint truncate text-[11.5px]">
                        {c.email ?? c.phone ?? "Walk-in"}
                      </p>
                    </div>
                    <StatusPill status={c.status} />
                  </div>
                  <dl className="text-muted-foreground grid grid-cols-3 gap-2 text-[12px]">
                    <Facet term="Card" value={cardText(c)} />
                    <Facet term="Visits" value={String(c.visits)} />
                    <Facet term="Last seen" value={c.lastVisit ? relativeTime(c.lastVisit) : "Never"} />
                  </dl>
                </Card>
              </li>
            ))}
          </ul>

          <Card className="hidden overflow-hidden p-0 lg:block">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Card</TableHead>
                    <TableHead className="text-right">Visits</TableHead>
                    <TableHead className="text-right">Rewards</TableHead>
                    <TableHead>Last seen</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar row={c} />
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{displayName(c)}</p>
                            <p className="text-faint truncate text-[11.5px]">
                              {c.email ?? c.phone ?? "Walk-in"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="tabular text-right font-mono">{cardText(c)}</TableCell>
                      <TableCell className="tabular text-right font-mono">{c.visits}</TableCell>
                      <TableCell className="tabular text-right font-mono">{c.redemptions}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.lastVisit ? relativeTime(c.lastVisit) : "Never"}
                      </TableCell>
                      <TableCell>
                        <StatusPill status={c.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          <div className="flex items-center justify-between gap-3">
            <p className="text-faint text-xs">{showing}</p>
            {pages > 1 && (
              <div className="flex items-center gap-2">
                <PageButton
                  disabled={offset === 0 || loading}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  label="Previous page"
                >
                  <ChevronLeft className="size-4" />
                </PageButton>
                <span className="text-muted-foreground tabular text-xs font-semibold">
                  {page} / {pages}
                </span>
                <PageButton
                  disabled={page >= pages || loading}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  label="Next page"
                >
                  <ChevronRight className="size-4" />
                </PageButton>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function cardText(c: CustomerRow): string {
  if (c.currentStamps === null || c.stampsRequired === null) return "—";
  return `${c.currentStamps}/${c.stampsRequired}`;
}

function Avatar({ row }: { row: CustomerRow }) {
  return (
    <span className="bg-muted text-primary grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold">
      {initial(displayName(row))}
    </span>
  );
}

function Facet({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-faint font-mono text-[9.5px] tracking-[0.08em] uppercase">{term}</dt>
      <dd className="tabular text-foreground mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}

/** State is carried by shape and text as well as colour, so it survives a colour-blind read. */
function StatusPill({ status }: { status: CustomerStatus }) {
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap",
        status === "reward_ready" && "bg-lime/25 text-primary",
        status === "at_risk" && "bg-warning/15 text-warning",
        status === "regular" && "bg-success/13 text-success",
        status === "new" && "bg-muted text-muted-foreground",
        status === "active" && "bg-muted text-muted-foreground",
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

function PageButton({
  disabled,
  onClick,
  label,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="border-border bg-card text-muted-foreground hover:text-foreground grid size-9 place-items-center rounded-lg border transition disabled:opacity-40"
    >
      {children}
    </button>
  );
}
