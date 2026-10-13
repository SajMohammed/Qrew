/*
 * Why the counter's camera didn't start, in words that tell staff what to do about it.
 *
 * html5-qrcode reports failures as strings that embed the browser's error name ("Error getting
 * userMedia, error = NotAllowedError: Permission denied"), so they are sorted by substring. A
 * version that words them differently falls through to the generic "failed", which still offers
 * Try again and the typed code.
 */

export type CameraProblem = "blocked" | "missing" | "busy" | "unsupported" | "failed";

/** Whether this page could open a camera at all — passed in so the tests needn't fake a browser. */
export interface CameraEnv {
  secure: boolean;
  hasMedia: boolean;
}

function browserEnv(): CameraEnv {
  return {
    secure: typeof window !== "undefined" && window.isSecureContext,
    hasMedia: typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia),
  };
}

export function cameraProblem(err: unknown, env: CameraEnv = browserEnv()): CameraProblem {
  if (!env.secure || !env.hasMedia) return "unsupported"; // cameras need https (or localhost)
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  if (/NotAllowedError|SecurityError|Permission/i.test(text)) return "blocked";
  if (/NotFoundError|OverconstrainedError|device not found/i.test(text)) return "missing";
  if (/NotReadableError|AbortError|TrackStartError|Could not start video/i.test(text)) return "busy";
  if (/not supported/i.test(text)) return "unsupported";
  return "failed";
}

export const CAMERA_COPY: Record<CameraProblem, string> = {
  blocked: "Camera access is blocked. Allow the camera for this site in the browser settings, then tap Try again.",
  missing: "No camera found on this device. Type the card code below instead.",
  busy: "Another app is using the camera. Close it, then tap Try again.",
  unsupported: "This browser can't open the camera here. Type the card code below instead.",
  failed: "The camera didn't start. Tap Try again, or type the card code below.",
};

/** The problems that trying again can fix. */
export const RETRYABLE: ReadonlySet<CameraProblem> = new Set(["blocked", "busy", "failed"]);

/** Which way the camera faces. A counter tablet often faces the customer, so it needs the front one. */
export type Facing = "environment" | "user";

const FACING_KEY = "qrew-counter-camera";

/** The camera this device used last. Storage can be unavailable (private mode), so default quietly. */
export function loadFacing(): Facing {
  try {
    return localStorage.getItem(FACING_KEY) === "user" ? "user" : "environment";
  } catch {
    return "environment";
  }
}

export function saveFacing(facing: Facing): void {
  try {
    localStorage.setItem(FACING_KEY, facing);
  } catch {
    /* not remembered — it still switches for this visit */
  }
}
