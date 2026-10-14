import type { Metadata, Viewport } from "next";
import { Anton, Archivo, Doto } from "next/font/google";
// Softform, copied verbatim from the design system (~/.claude/skills/softform): re-copy to update,
// never edit. The system first, then the Qrew theme, then this page's own styles.
import "./styles/softform.css";
import "./styles/qrew.css";
import "./globals.css";
import { THEME_COLOR } from "./lib/theme";

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
  themeColor: THEME_COLOR.light,
};

// Light is the default; the nav's theme switch remembers a visitor's choice. Softform's dark tokens apply
// under `.dark` on <html>, so a remembered dark choice is applied before first paint, or the page flashes light.
const rememberedTheme = `(function(){try{if(localStorage.getItem("qrew-theme")==="dark"){document.documentElement.classList.add("dark");var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content","${THEME_COLOR.dark}")}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${anton.variable} ${archivo.variable} ${doto.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: rememberedTheme }} />
      </head>
      <body className="sf-app sf-canvas">{children}</body>
    </html>
  );
}
