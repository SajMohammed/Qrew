import { clsx, type ClassValue } from "clsx";

/**
 * Join conditional class lists.
 *
 * Deliberately clsx alone, without tailwind-merge: this app owns every class it renders, so there
 * are no conflicting utilities to reconcile, and tailwind-merge costs ~7KB gzip on a bundle a
 * customer downloads while standing at a till. The shop console keeps twMerge — it composes
 * third-party shadcn components whose classes genuinely need overriding.
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
