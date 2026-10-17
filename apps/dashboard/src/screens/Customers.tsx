import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search, Users, X } from "lucide-react";
import type { CustomerFilter, CustomerList, CustomerRow, CustomerStatus, Program } from "@/api";
import { useApi } from "@/useApi";
import { CardSwitcher } from "@/components/CardSwitcher";
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

export function Customers({
  initialFilter = "all",
  cards,
  initialCard = null,
}: {
  initialFilter?: CustomerFilter;
  /** The shop's cards that are on. With two or more, the list can be narrowed to one card's holders. */
  cards: Program[];
  initialCard?: string | null;
}) {
  const api = useApi();
  const [filter, setFilter] = useState<CustomerFilter>(initialFilter);
  const [card, setCard] = useState<string | null>(initialCard);
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
      const result = await api.getCustomers({ filter, program: card ?? undefined, search, limit: PAGE_SIZE, offset });
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
  }, [api, filter, card, search, offset]);

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
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="sf-display sf-twotone">
          <strong>Customers</strong>
        </h1>
        <p className="text-ink-3 mt-2 mb-0 text-[15px] sm:text-[17px]">Everyone who has taken a card at your shop.</p>
      </header>

      <div className="flex flex-col gap-3">
        {cards.length >= 2 && (
          <CardSwitcher
            cards={cards}
            value={card}
            onChange={(next) => {
              setCard(next);
              setOffset(0);
            }}
            all="All cards"
          />
        )}
        <label className="sf-search">
          <Search aria-hidden />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, email or phone…"
            aria-label="Search customers"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              aria-label="Clear search"
              className="sf-bubble sf-bubble--sm"
            >
              <X />
            </button>
          )}
        </label>

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
              className="sf-chip shrink-0"
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {err && (
        <div className="sf-card sf-card--compact bg-danger-soft shadow-none">
          <p className="text-danger-ink m-0 text-sm">{err}</p>
        </div>
      )}

      {loading && !data ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[68px] rounded-lg" />
          ))}
        </div>
      ) : !data || data.rows.length === 0 ? (
        <div className="sf-card">
          <div className="sf-empty">
            <span className="sf-bubble sf-bubble--lens sf-bubble--lg pointer-events-none" aria-hidden>
              <Users />
            </span>
            <p className="sf-title sf-twotone">
              <span className="sf-lead">Nobody</span> <strong>here</strong>
            </p>
            <p>
              {search
                ? `No customer matches “${search}”.`
                : filter === "all"
                  ? "No customers yet — print your Counter QR to get the first card out."
                  : "No customers in this segment right now."}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Phone/tablet: a table cannot honestly fit 375px, so each customer becomes a well row. */}
          <ul className="sf-rows sf-rows--wells lg:hidden">
            {data.rows.map((c) => (
              <li
                key={c.id}
                // On a sunken well, the avatar and a neutral pill lift to white or they vanish into it.
                className="sf-row sf-row--well gap-y-3 py-3 [&_.sf-avatar]:bg-surface [&_.sf-status:not([class*=sf-status--])]:bg-surface"
              >
                <Avatar row={c} />
                <div className="sf-row__main">
                  <p className="sf-row__title">{displayName(c)}</p>
                  <p className="sf-row__meta">{c.email ?? c.phone ?? "Walk-in"}</p>
                </div>
                <StatusPill status={c.status} />
                <dl className="col-span-full m-0 grid grid-cols-3 gap-2 text-[12.5px]">
                  <Facet term="Card" value={cardText(c)} />
                  <Facet term="Visits" value={String(c.visits)} />
                  <Facet term="Last seen" value={c.lastVisit ? relativeTime(c.lastVisit) : "Never"} />
                </dl>
              </li>
            ))}
          </ul>

          <div className="sf-card hidden p-3 lg:flex">
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
                      <div className="flex items-center gap-3">
                        <Avatar row={c} />
                        <div className="min-w-0">
                          <p className="m-0 truncate">{displayName(c)}</p>
                          <p className="text-ink-3 m-0 truncate text-[12.5px]">{c.email ?? c.phone ?? "Walk-in"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="tabular text-right">{cardText(c)}</TableCell>
                    <TableCell className="tabular text-right">{c.visits}</TableCell>
                    <TableCell className="tabular text-right">{c.redemptions}</TableCell>
                    <TableCell className="text-ink-2">{c.lastVisit ? relativeTime(c.lastVisit) : "Never"}</TableCell>
                    <TableCell>
                      <StatusPill status={c.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-ink-3 m-0 text-[12.5px]">{showing}</p>
            {pages > 1 && (
              <div className="sf-pager">
                <PageButton
                  disabled={offset === 0 || loading}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  label="Previous page"
                >
                  <ChevronLeft />
                </PageButton>
                <span className="sf-pager__count">
                  {page}
                  <span className="sf-pager__total">/{pages}</span>
                </span>
                <PageButton
                  disabled={page >= pages || loading}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  label="Next page"
                >
                  <ChevronRight />
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
    <span className="sf-avatar">{initial(displayName(row))}</span>
  );
}

function Facet({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-3">{term}</dt>
      <dd className="tabular text-ink m-0 mt-0.5">{value}</dd>
    </div>
  );
}

/**
 * State is carried by text as well as colour, so it survives a colour-blind read. One fixed mapping:
 * ready is lime (the positive state), at risk is warning, regulars teal, new lavender, active neutral.
 */
const STATUS_TONE: Record<CustomerStatus, string> = {
  reward_ready: "sf-status--positive",
  at_risk: "sf-status--warning",
  regular: "sf-status--shared",
  new: "sf-status--info",
  active: "",
};

function StatusPill({ status }: { status: CustomerStatus }) {
  return <span className={cn("sf-status shrink-0", STATUS_TONE[status])}>{statusLabel(status)}</span>;
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
      className="sf-bubble sf-bubble--raised disabled:opacity-40"
    >
      {children}
    </button>
  );
}
