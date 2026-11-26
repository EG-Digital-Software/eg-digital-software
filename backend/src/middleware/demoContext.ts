import type { NextFunction, Request, Response } from 'express';
import { demoEnabled, runInDemo } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/tokens.js';

/**
 * Demo-portal requests touch the outside world in ways sample data must not:
 * connecting a real social account, or anything that hands a token to a third
 * party. Those routes answer with a friendly "not in the demo" instead.
 */
const BLOCKED_IN_DEMO: RegExp[] = [/\/social\/connect\//, /\/social\/oauth\//];

/**
 * Routes a request to the demo database when its access token is a demo-portal
 * token (`demo: true`). Every other request — including any without a token or
 * with an invalid one — stays on the live database, exactly as before.
 *
 * The token is only peeked at here; the route's own `authenticate` still
 * verifies it and decides access as usual.
 */
export function demoContext(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  let isDemo = false;
  try {
    isDemo = verifyAccessToken(header.slice(7)).demo === true;
  } catch {
    return next(); // invalid/expired → authenticate() will reject it normally
  }
  if (!isDemo) return next();

  if (!demoEnabled) return next(new ApiError(503, 'The demo portal is not available right now'));
  if (BLOCKED_IN_DEMO.some((re) => re.test(req.path))) {
    return next(ApiError.forbidden('This action is turned off in the demo portal'));
  }
  runInDemo(() => next());
}
