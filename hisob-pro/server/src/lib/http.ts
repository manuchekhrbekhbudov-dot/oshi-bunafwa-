import type { NextFunction, Request, Response, RequestHandler } from 'express';
import type { z, ZodTypeAny } from 'zod';
import { badRequest } from './errors.js';

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const fields: Record<string, string> = {};
    for (const issue of r.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    throw badRequest('VALIDATION_ERROR', 'Маълумоти воридшуда нодуруст аст', { fields });
  }
  return r.data;
}

/** req.userId — баъди middleware-и auth ҳамеша мавҷуд аст */
export function uid(req: Request): string {
  const id = req.userId;
  if (!id) throw new Error('userId missing — requireAuth not applied');
  return id;
}
