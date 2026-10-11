import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import { NotFoundError, InvalidInputError, TooManyAttemptsError } from "@qrew/core";
import type { Response } from "express";

// Maps domain errors (thrown by the core layer, e.g. an unknown enrollment or an unreadable upload)
// to a clean 4xx — otherwise they'd bypass the filters and hit Nest's default handler as a 500.
@Catch(NotFoundError, InvalidInputError, TooManyAttemptsError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(error: NotFoundError | InvalidInputError | TooManyAttemptsError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (error instanceof TooManyAttemptsError) {
      res.setHeader("retry-after", String(error.retryAfterSeconds));
      res.status(HttpStatus.TOO_MANY_REQUESTS).json({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: "Too Many Requests",
        code: error.code,
        message: error.message,
        retryAfterSeconds: error.retryAfterSeconds,
      });
      return;
    }
    const status = error instanceof NotFoundError ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
    const label = error instanceof NotFoundError ? "Not Found" : "Bad Request";
    res.status(status).json({ statusCode: status, error: label, message: error.message });
  }
}
