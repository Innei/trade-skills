import type { ArgumentsHost, ExceptionFilter } from "@tsuki-hono/common";
import { ClientError } from "../errors.js";

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, _host: ArgumentsHost): Response {
    if (exception instanceof ClientError) {
      return jsonResponse(exception.status, { ok: false, error: exception.message, hint: exception.hint });
    }
    const error = exception instanceof Error ? exception : new Error(String(exception));
    console.error(error);
    return jsonResponse(500, { ok: false, error: error.message });
  }
}
