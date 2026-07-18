import type { Metadata, Viewport } from "next";
import { Anton, Archivo } from "next/font/google";
import "./globals.css";

// Self-hosted at build time by next/font — no external request, no layout shift.
const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton", display: "swap" });
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap" });

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

export const viewport: Viewport = { themeColor: "#146A2E" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${anton.variable} ${archivo.variable}`}>
      <body>{children}</body>
    </html>
  );
}
