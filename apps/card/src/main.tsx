import React from "react";
import { createRoot } from "react-dom/client";
import { LazyMotion, domAnimation } from "motion/react";
import { App } from "./App";
import { ThemeProvider } from "@/lib/theme";
import "./index.css";

// LazyMotion + the `m` component keep Motion's runtime to a few KB, which matters on a card that
// has to open fast at a counter. `strict` fails the build if a heavyweight `motion.*` sneaks in.
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <LazyMotion features={domAnimation} strict>
        <App />
      </LazyMotion>
    </ThemeProvider>
  </React.StrictMode>,
);

// Register the service worker only in production builds (keeps dev clean).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
