import { InvalidInputError } from "../errors";
import type { CardType, CardTypeModule } from "./types";
import { CARD_TYPES } from "./types";
import { stampCard } from "./stamp";

/**
 * Every card type the system knows, keyed by its discriminator.
 *
 * Registering a module here is the whole cost of adding a product. Nothing branches on card type
 * outside these files — scan, redeem, the wallet adapters and the designer all ask the registry.
 */
const MODULES: Partial<Record<CardType, CardTypeModule<never>>> = {
  stamp: stampCard as CardTypeModule<never>,
};

/** The types a shop can actually pick today — not every type the column will accept. */
export function availableCardTypes(): CardTypeModule<never>[] {
  return CARD_TYPES.map((t) => MODULES[t]).filter((m): m is CardTypeModule<never> => m !== undefined);
}

export function isCardType(value: unknown): value is CardType {
  return typeof value === "string" && (CARD_TYPES as readonly string[]).includes(value);
}

/**
 * The module for a type, or a loud failure.
 *
 * Throws rather than falling back to stamps. A programme whose type has no module is a deployment
 * that shipped a database migration without the code to serve it — silently treating a membership
 * card as a stamp card would issue real passes against the wrong wallet class, which cannot be
 * undone without every customer re-saving.
 */
export function cardTypeModule(type: string): CardTypeModule<never> {
  const found = isCardType(type) ? MODULES[type] : undefined;
  if (!found) throw new InvalidInputError(`unsupported card type "${type}"`);
  return found;
}

/** Validate a programme's type-specific settings, filling in that type's defaults. */
export function normalizeMechanics(type: string, raw: unknown): unknown {
  return cardTypeModule(type).normalize(raw ?? {});
}
