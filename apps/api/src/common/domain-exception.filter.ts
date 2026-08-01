import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import { NotFoundError, InvalidInputError } from "@qrew/core";
import type { Response } from "express";

// Maps domain errors (thrown by the core layer, e.g. an unknown enrollment or an unreadable upload)
// to a clean 4xx — otherwise they'd bypass the filters and hit Nest's default handler as a 500.
@Catch(NotFoundError, InvalidInputError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(error: NotFoundError | InvalidInputError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status = error instanceof NotFoundError ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
    const label = error instanceof NotFoundError ? "Not Found" : "Bad Request";
    res.status(status).json({ statusCode: status, error: label, message: error.message });
  }
}
