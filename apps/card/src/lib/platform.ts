/** An iPhone or iPod — or an iPad, which since iPadOS 13 asks for the desktop site and only gives itself away by touch. */
export function isIos(ua = navigator.userAgent, touchPoints = navigator.maxTouchPoints ?? 0): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
}

/** Safari itself. Other iOS browsers and in-app ones (Instagram, Facebook, Google) can't add to the Home Screen the same way. */
export function isIosSafari(ua = navigator.userAgent, touchPoints = navigator.maxTouchPoints ?? 0): boolean {
  return (
    isIos(ua, touchPoints) &&
    /Safari\//.test(ua) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Instagram|Line\//.test(ua)
  );
}

/** Running from the Home Screen rather than in the browser. */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}
