/** Base for domain-level errors the API maps to a 4xx response (rather than an unexpected 500). */
export class DomainError extends Error {}

/** A referenced entity doesn't exist within the caller's tenant → the API returns HTTP 404. */
export class NotFoundError extends DomainError {
  constructor(message = "not found") {
    super(message);
    this.name = "NotFoundError";
  }
}
