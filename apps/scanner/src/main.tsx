import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// No StrictMode here: the camera scanner doesn't like the dev double-mount.
createRoot(document.getElementById("root")!).render(<App />);
