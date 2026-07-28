import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import { NotFoundError } from "@qrew/core";
import type { Response } from "express";

// Maps domain not-found errors (thrown by the core layer, e.g. an unknown enrollment/program) to a
// clean 404 — otherwise they'd bypass the filters and hit Nest's default handler as a 500.
@Catch(NotFoundError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(error: NotFoundError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(HttpStatus.NOT_FOUND).json({ statusCode: 404, error: "Not Found", message: error.message });
  }
}
