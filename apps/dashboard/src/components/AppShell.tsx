import type { ReactNode } from "react";
import { UserButton } from "@clerk/react";
import {
  LayoutGrid,
  Users,
  CreditCard,
  QrCode,
  ConciergeBell,
  UsersRound,
  Settings as SettingsIcon,
  Lock,
  Moon,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";

/** The management surface. Counter mode is deliberately not one of these — it replaces the shell. */
export type ManageView = "dashboard" | "customers" | "card" | "counterqr" | "team" | "settings";

const NAV: { id: ManageView; label: string; short: string; icon: typeof LayoutGrid }[] = [
  { id: "dashboard", label: "Dashboard", short: "Home", icon: LayoutGrid },
  { id: "customers", label: "Customers", short: "People", icon: Users },
  { id: "card", label: "Cards", short: "Cards", icon: CreditCard },
  { id: "counterqr", label: "Counter QR", short: "QR", icon: QrCode },
  { id: "team", label: "Team", short: "Team", icon: UsersRound },
  { id: "settings", label: "Settings", short: "Settings", icon: SettingsIcon },
];

interface Props {
  view: ManageView;
  onNavigate: (view: ManageView) => void;
  onEnterCounter: () => void;
  shopName?: string;
  children: ReactNode;
}

/**
 * Softform's shell: floating pills on the canvas rather than a framed sidebar. On a desktop the brand
 * and the tools share a row with the pill nav beneath (one row from 1536px); on a phone
 * the nav moves into a glass dock at the bottom, with counter mode as its one big button.
 */
export function AppShell({ view, onNavigate, onEnterCounter, shopName, children }: Props) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center gap-x-4 gap-y-4 px-4 pt-4 sm:px-6 lg:px-12 lg:pt-6">
        <Wordmark />

        {/* Desktop nav: text pills, as in Softform's shell. First in the DOM, so it is also what a
            keyboard reaches first; it shares the brand's row only where there is room (2xl). */}
        <nav
          aria-label="Manage"
          className="sf-nav order-3 hidden w-full lg:flex 2xl:order-2 2xl:w-auto 2xl:flex-1 2xl:justify-center"
        >
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={view === item.id ? "page" : undefined}
              className="sf-nav__item"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="order-2 ml-auto flex items-center gap-2 2xl:order-3 2xl:ml-0">
          <button
            type="button"
            onClick={onEnterCounter}
            title="Counter mode — PIN required to exit"
            className="sf-btn sf-btn--ink hidden lg:inline-flex"
          >
            <ConciergeBell aria-hidden />
            Counter mode
            <Lock className="size-3.5 opacity-70" aria-hidden />
          </button>
          {/* Theme lives in the shell, not in a screen header — otherwise it vanishes on the tool screens. */}
          <ThemeButton />
          <UserButton />
          <div className="hidden min-w-0 leading-tight lg:block">
            <p className="max-w-[160px] truncate text-sm font-medium">{shopName ?? "Your shop"}</p>
            <p className="text-ink-3 text-[12px]">Owner</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1320px] px-4 pt-6 pb-32 sm:px-6 lg:px-12 lg:pt-8 lg:pb-16">
        {children}
      </main>

      {/* Thumb-reachable nav on phones and tablets, floating clear of the home indicator on iOS. */}
      <nav
        aria-label="Manage"
        className="sf-glass sf-glass--strong fixed left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full p-1.5 lg:hidden"
        style={{ bottom: "calc(12px + env(safe-area-inset-bottom))" }}
      >
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            aria-current={view === item.id ? "page" : undefined}
            aria-label={item.short}
            title={item.label}
            className="sf-bubble sf-bubble--plain"
          >
            <item.icon aria-hidden />
          </button>
        ))}
        <button
          type="button"
          onClick={onEnterCounter}
          aria-label="Counter"
          title="Counter mode — PIN required to exit"
          className="sf-bubble sf-bubble--primary sf-bubble--lg ml-0.5"
        >
          <ConciergeBell aria-hidden />
        </button>
      </nav>
    </div>
  );
}

/** Qrew's wordmark — the only place Anton appears. `labelsHidden` leaves just the compact Q mark. */
export function Wordmark({
  compact = false,
  labelsHidden = false,
}: {
  compact?: boolean;
  labelsHidden?: boolean;
}) {
  if (labelsHidden) return <span className="qrew-mark">Q</span>;
  return (
    <div className={cn("flex items-center gap-2", !compact && "px-1")}>
      <span className="qrew-wordmark">Qrew</span>
      <span className="sf-tag">Shop</span>
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
      className={cn("sf-bubble sf-bubble--raised", className)}
    >
      {resolved === "dark" ? <Sun /> : <Moon />}
    </button>
  );
}
