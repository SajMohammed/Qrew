/** Base for domain-level errors the API maps to a 4xx response (rather than an unexpected 500). */
export class DomainError extends Error {}

/** A referenced entity doesn't exist within the caller's tenant → the API returns HTTP 404. */
export class NotFoundError extends DomainError {
  constructor(message = "not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * The request was well-formed but the content isn't usable → the API returns HTTP 400.
 *
 * For rejections zod can't express, because judging them means looking at the bytes: an upload
 * that isn't a decodable PNG, an image past its size limit. The message is written to be shown
 * to the shop as-is.
 */
export class InvalidInputError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}

/**
 * The request contradicts one already recorded → the API returns HTTP 409. For example an
 * idempotency key reused for a different card: answering as if it were a replay would report a
 * stamp or reward that never happened to that card.
 */
export class ConflictError extends DomainError {
  constructor(
    message: string,
    /** A machine-readable reason, for a client that answers this conflict in its own words. */
    readonly code?: string,
  ) {
    super(message);
    this.name = "ConflictError";
  }
}

/** Too many tries at something guessable → the API returns HTTP 429 with Retry-After. */
export class TooManyAttemptsError extends DomainError {
  constructor(
    readonly code: string,
    readonly retryAfterSeconds: number,
    message: string,
  ) {
    super(message);
    this.name = "TooManyAttemptsError";
  }
}
