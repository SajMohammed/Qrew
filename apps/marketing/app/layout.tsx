import type { Metadata, Viewport } from "next";
import { Anton, Archivo, Doto } from "next/font/google";
// Softform, copied verbatim from the design system (~/.claude/skills/softform): re-copy to update,
// never edit. The system first, then the Qrew theme, then this page's own styles.
import "./styles/softform.css";
import "./styles/qrew.css";
import "./globals.css";

// Self-hosted at build time by next/font — no external request, no layout shift. Archivo carries the
// UI, Doto the dot-matrix numbers (with its round-dot axis), Anton only the wordmark.
const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton", display: "swap" });
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap" });
const doto = Doto({ subsets: ["latin"], axes: ["ROND"], variable: "--font-doto", display: "swap" });

export const metadata: Metadata = {
  title: "Qrew — Loyalty that sticks",
  description:
    "The wallet-native digital stamp card for the UAE's best cafés, salons & shops. No app — a beautiful card in Apple & Google Wallet, set up in minutes.",
  openGraph: {
    title: "Qrew — Loyalty that sticks",
    description: "The wallet-native stamp card for UAE cafés, salons & shops. No app to download.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eceeea" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0f0d" },
  ],
};

// Softform's dark tokens apply under `.dark` on <html>. The page has no theme switch, so it follows
// the visitor's OS — set before first paint, or a dark-mode visit flashes light.
const followTheme = `(function(){try{var m=window.matchMedia("(prefers-color-scheme: dark)");var s=function(){document.documentElement.classList.toggle("dark",m.matches)};s();m.addEventListener("change",s)}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${anton.variable} ${archivo.variable} ${doto.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: followTheme }} />
      </head>
      <body className="sf-app sf-canvas">{children}</body>
    </html>
  );
}
