import { useCallback, useState, type CSSProperties, type ReactNode } from "react";
import { UserButton } from "@clerk/react";
import {
  LayoutGrid,
  Users,
  CreditCard,
  QrCode,
  ConciergeBell,
  UsersRound,
  Lock,
  Moon,
  Sun,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";

/** The management surface. Counter mode is deliberately not one of these — it replaces the shell. */
export type ManageView = "dashboard" | "customers" | "designer" | "counterqr" | "team";

const NAV: { id: ManageView; label: string; short: string; icon: typeof LayoutGrid }[] = [
  { id: "dashboard", label: "Dashboard", short: "Home", icon: LayoutGrid },
  { id: "customers", label: "Customers", short: "People", icon: Users },
  { id: "designer", label: "Card designer", short: "Card", icon: CreditCard },
  { id: "counterqr", label: "Counter QR", short: "QR", icon: QrCode },
  { id: "team", label: "Team", short: "Team", icon: UsersRound },
];

const RAIL_KEY = "qrew-rail-collapsed";
const RAIL_OPEN = "244px";
const RAIL_SHUT = "76px";

interface Props {
  view: ManageView;
  onNavigate: (view: ManageView) => void;
  onEnterCounter: () => void;
  shopName?: string;
  children: ReactNode;
}

export function AppShell({ view, onNavigate, onEnterCounter, shopName, children }: Props) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(RAIL_KEY) === "1");

  const toggleRail = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(RAIL_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  return (
    <div
      className="rail-shell min-h-dvh lg:grid lg:[grid-template-columns:var(--rail)_1fr]"
      style={{ "--rail": collapsed ? RAIL_SHUT : RAIL_OPEN } as CSSProperties}
    >
      {/* Desktop rail. Hidden below lg, where the bottom bar takes over. */}
      <aside
        className={cn(
          "bg-sidebar border-sidebar-border sticky top-0 hidden h-dvh flex-col gap-1 overflow-hidden border-r transition-[padding] duration-300 lg:flex",
          collapsed ? "items-center p-3" : "p-4",
        )}
      >
        <div className={cn("flex w-full items-center pb-3", collapsed && "justify-center")}>
          <Wordmark compact={collapsed} labelsHidden={collapsed} />
        </div>

        {/* Collapsed, this heading would still claim its vertical padding and open a gap above the
            icons — so it goes entirely rather than folding to zero width. */}
        {!collapsed && (
          <p className="text-faint w-full px-2 pb-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
            Manage
          </p>
        )}

        {NAV.map((item) => (
          <NavButton
            key={item.id}
            active={view === item.id}
            collapsed={collapsed}
            icon={<item.icon className="size-[18px] shrink-0" aria-hidden />}
            label={item.label}
            onClick={() => onNavigate(item.id)}
          />
        ))}

        <button
          type="button"
          onClick={onEnterCounter}
          title="Counter mode — PIN required to exit"
          className={cn(
            "mt-3 flex w-full items-center rounded-xl border border-[#12662c] bg-linear-[150deg,#26a04a,#12662c] py-3 text-sm font-bold text-[#f4fbe9] shadow-sm transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            // The gap has to go with the label, or it keeps padding the icon off-centre.
            collapsed ? "justify-center gap-0 px-0" : "gap-2.5 px-3",
          )}
        >
          <ConciergeBell className="size-[18px] shrink-0" aria-hidden />
          <span data-collapsed={collapsed} className="rail-label">
            Counter mode
          </span>
          {!collapsed && <Lock className="ml-auto size-3.5 shrink-0 opacity-75" aria-hidden />}
        </button>

        <div className="mt-auto flex w-full flex-col gap-2">
          <button
            type="button"
            onClick={toggleRail}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className={cn(
              "text-muted-foreground hover:bg-accent hover:text-foreground flex w-full items-center rounded-lg py-2.5 text-sm font-medium transition",
              collapsed ? "justify-center gap-0 px-0" : "gap-2.5 px-3",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-[18px] shrink-0" />
            ) : (
              <PanelLeftClose className="size-[18px] shrink-0" />
            )}
            <span data-collapsed={collapsed} className="rail-label">
              Collapse
            </span>
          </button>

          {/* Theme lives here, not in a screen header — otherwise it vanishes on the tool screens. */}
          <div
            className={cn(
              "border-sidebar-border flex w-full items-center border-t pt-3",
              collapsed ? "flex-col gap-2" : "gap-2.5",
            )}
          >
            <UserButton />
            {!collapsed && (
              <div className="min-w-0 flex-1 text-[13px] leading-tight">
                <p className="truncate font-bold">{shopName ?? "Your shop"}</p>
                <p className="text-faint text-[11px]">Owner</p>
              </div>
            )}
            <ThemeButton />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Compact bar for phone/tablet — the desktop rail already carries this identity. */}
        <header className="bg-sidebar/95 border-sidebar-border sticky top-0 z-20 flex items-center gap-3 border-b px-4 py-3 backdrop-blur lg:hidden">
          <Wordmark compact />
          <div className="ml-auto flex items-center gap-2">
            <ThemeButton />
            <UserButton />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 pt-4 pb-24 sm:px-6 lg:px-8 lg:pt-6 lg:pb-12">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>

        {/* Thumb-reachable nav, clear of the home indicator on iOS. */}
        <nav
          className="bg-sidebar/95 border-sidebar-border fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t backdrop-blur lg:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={view === item.id ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors",
                view === item.id ? "text-primary" : "text-faint",
              )}
            >
              <item.icon
                className={cn(
                  "size-5 transition-transform duration-200",
                  view === item.id && "-translate-y-0.5 scale-110",
                )}
                aria-hidden
              />
              {item.short}
            </button>
          ))}
          <button
            type="button"
            onClick={onEnterCounter}
            className="text-primary flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-semibold"
          >
            <ConciergeBell className="size-5" aria-hidden />
            Counter
          </button>
        </nav>
      </div>
    </div>
  );
}

function NavButton({
  active,
  collapsed,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  collapsed: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        "flex w-full items-center rounded-xl py-2.5 text-left text-sm transition-[background-color,color,transform] duration-200",
        // Drop the gap with the label, otherwise the icon sits left of centre in the rail.
        collapsed ? "justify-center gap-0 px-0" : "gap-2.5 px-3",
        active
          ? "bg-primary/12 text-foreground font-bold"
          : "text-muted-foreground hover:bg-accent hover:text-foreground font-medium",
        !collapsed && !active && "hover:translate-x-0.5",
      )}
    >
      <span className={cn("shrink-0 transition-colors", active && "text-primary")}>{icon}</span>
      <span data-collapsed={collapsed} className="rail-label">
        {label}
      </span>
    </button>
  );
}

export function Wordmark({
  compact = false,
  labelsHidden = false,
}: {
  compact?: boolean;
  labelsHidden?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2", compact ? "px-0" : "px-2")}>
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[linear-gradient(150deg,var(--lime),var(--forest))] font-mono text-sm font-extrabold text-[#0c2712]">
        Q
      </span>
      {!labelsHidden && (
        <>
          <span className="text-xl font-extrabold tracking-tight">Qrew</span>
          <span className="text-primary bg-primary/12 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.16em] uppercase">
            Shop
          </span>
        </>
      )}
    </div>
  );
}

/** Light ⇄ dark. Shows the destination, not the current state — that's what a switch means. */
export function ThemeButton({ className }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      title={resolved === "dark" ? "Switch to light" : "Switch to dark"}
      aria-label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className={cn(
        "border-border bg-card text-muted-foreground hover:text-foreground grid size-10 shrink-0 place-items-center rounded-xl border transition hover:rotate-12",
        className,
      )}
    >
      {resolved === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}
