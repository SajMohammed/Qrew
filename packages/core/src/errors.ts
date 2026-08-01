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
