import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';
import { isProd } from '../config/env.js';

type BodyParserError = Error & { type: string; status?: number; statusCode?: number };

function isBodyParserError(err: unknown): err is BodyParserError {
  if (!(err instanceof Error) || !('type' in err)) return false;
  const { type } = err as { type: unknown };
  return typeof type === 'string' && type.startsWith('entity.');
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ success: false, message: 'Route not found' });
}

 
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res
      .status(err.status)
      .json({ success: false, message: err.message, errors: err.errors });
  }

  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of err.issues) {
      fieldErrors[issue.path.join('.') || '_'] = issue.message;
    }
    return res
      .status(400)
      .json({ success: false, message: 'Validation failed', errors: fieldErrors });
  }

  /**
   * body-parser rejects malformed or oversized payloads with its own tagged
   * error. Without this branch a stray character in a request body surfaces as
   * a 500 "Internal server error" even though the fault is entirely the
   * client's, which masks real server faults in the logs.
   */
  if (isBodyParserError(err)) {
    const status = err.status ?? err.statusCode ?? 400;
    const message =
      err.type === 'entity.too.large'
        ? 'Request body too large'
        : err.type === 'entity.parse.failed'
          ? 'Malformed JSON body'
          : 'Bad request';
    return res.status(status).json({ success: false, message });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
      return res
        .status(409)
        .json({ success: false, message: `A record with this ${target} already exists` });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }
  }

  logger.error({ err }, 'Unhandled error');
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
    ...(isProd ? {} : { detail: (err as Error)?.message }),
  });
}
