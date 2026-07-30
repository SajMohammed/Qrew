import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import { App } from "./App";
import { ThemeProvider } from "@/lib/theme";
import "./index.css";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

// No StrictMode: the counter camera (html5-qrcode) can't survive the dev double-mount.
createRoot(document.getElementById("root")!).render(
  <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </ClerkProvider>,
);
