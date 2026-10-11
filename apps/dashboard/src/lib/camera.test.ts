import { describe, it, expect } from "vitest";
import { cameraProblem } from "./camera";

const ok = { secure: true, hasMedia: true };

describe("cameraProblem", () => {
  it("reads html5-qrcode's wrapped errors", () => {
    expect(cameraProblem("Error getting userMedia, error = NotAllowedError: Permission denied", ok)).toBe("blocked");
    expect(cameraProblem("Error getting userMedia, error = NotFoundError: Requested device not found", ok)).toBe("missing");
    expect(cameraProblem("Error getting userMedia, error = OverconstrainedError: ", ok)).toBe("missing");
    expect(cameraProblem("Error getting userMedia, error = NotReadableError: Could not start video source", ok)).toBe("busy");
  });

  it("reads a thrown DOMException-like error by its name", () => {
    const err = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    expect(cameraProblem(err, ok)).toBe("blocked");
  });

  it("calls a page that can't open a camera at all unsupported", () => {
    expect(cameraProblem("anything", { secure: false, hasMedia: true })).toBe("unsupported");
    expect(cameraProblem("anything", { secure: true, hasMedia: false })).toBe("unsupported");
  });

  it("falls back to failed for anything it doesn't recognise", () => {
    expect(cameraProblem("something new went wrong", ok)).toBe("failed");
  });
});
