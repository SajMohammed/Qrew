import { describe, it, expect } from "vitest";
import { isIos, isIosSafari } from "./platform";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_MODE =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1";
const IPHONE_INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.3.23.54 (iPhone14,5; iOS 17_5; en_US)";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

describe("platform", () => {
  it("knows an iPhone in Safari", () => {
    expect(isIos(IPHONE_SAFARI, 5)).toBe(true);
    expect(isIosSafari(IPHONE_SAFARI, 5)).toBe(true);
  });

  it("knows an iPad asking for the desktop site by its touch screen, and a Mac by its lack of one", () => {
    expect(isIos(IPAD_DESKTOP_MODE, 5)).toBe(true);
    expect(isIos(IPAD_DESKTOP_MODE, 0)).toBe(false);
  });

  it("knows other iOS browsers and in-app ones aren't Safari", () => {
    expect(isIos(IPHONE_CHROME, 5)).toBe(true);
    expect(isIosSafari(IPHONE_CHROME, 5)).toBe(false);
    expect(isIosSafari(IPHONE_INSTAGRAM, 5)).toBe(false);
  });

  it("knows Android isn't iOS", () => {
    expect(isIos(ANDROID_CHROME, 5)).toBe(false);
  });
});
